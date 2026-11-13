import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { verifyMessage, isAddress } from 'ethers';
import { q, now, sha, getSettings, setSettings, getChains, getTokens, hashPassword, checkPassword } from './db.js';
import { fetchBalances, fetchMarkets, rpcCall } from './chaindata.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 4000);
const DAY = 86_400_000;

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY ? 1 : false);
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; script-src 'self'; frame-ancestors 'none'",
  });
  next();
});
app.use(express.json({ limit: '64kb' }));

// ---------- helpers ----------
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error(req.method, req.path, e.message);
  if (!res.headersSent) res.status(e.status || 500).json({ error: e.expose ? e.message : 'Something went wrong on the server.' });
});
const fail = (status, message) => Object.assign(new Error(message), { status, expose: true });
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const hits = new Map();
function limit(name, max, windowMs) {
  return (req, res, next) => {
    const key = `${name}:${req.ip}`;
    const t = now();
    const list = (hits.get(key) || []).filter((x) => t - x < windowMs);
    if (list.length >= max) return res.status(429).json({ error: 'Too many attempts. Wait a minute and try again.' });
    list.push(t); hits.set(key, list); next();
  };
}
setInterval(() => { const t = now(); for (const [k, v] of hits) if (!v.some((x) => t - x < 900_000)) hits.delete(k); }, 300_000).unref();

const cookie = (req, name) => (req.headers.cookie || '').split(';').map((s) => s.trim().split('=')).find(([k]) => k === name)?.[1];
const logEvent = (walletId, type, detail = '') => q('INSERT INTO events (wallet_id, type, detail, created_at) VALUES (?, ?, ?, ?)').run(walletId, type, detail, now());
const audit = (req, action, detail = '') => q('INSERT INTO audit (admin, action, detail, created_at) VALUES (?, ?, ?, ?)').run(req.admin.username, action, detail, now());

// ---------- public ----------
app.get('/api/config', wrap((req, res) => {
  const s = getSettings();
  res.json({
    settings: { maintenance: s.maintenance, maintenanceMessage: s.maintenanceMessage, allowNewWallets: s.allowNewWallets, sendEnabled: s.sendEnabled, supportEmail: s.supportEmail },
    chains: getChains(true).map(({ rpc, enabled, ...c }) => c),
    tokens: getTokens(true).map(({ enabled, ...t }) => t),
    announcements: q('SELECT id, title, body, level, created_at FROM announcements WHERE active = 1 ORDER BY id DESC').all(),
  });
}));

app.get('/api/markets', wrap(async (req, res) => res.json(await fetchMarkets())));

// ---------- wallet sign-in (prove control of the EVM key by signing a nonce) ----------
const challenges = new Map();
const signInText = (address, nonce) => `Latch sign-in\nAddress: ${address}\nNonce: ${nonce}`;

app.post('/api/wallet/challenge', limit('challenge', 30, 60_000), wrap((req, res) => {
  const address = str(req.body.address).toLowerCase();
  if (!isAddress(address)) throw fail(400, 'That is not a valid wallet address.');
  const nonce = randomBytes(16).toString('hex');
  challenges.set(address, { nonce, exp: now() + 120_000 });
  if (challenges.size > 20_000) challenges.delete(challenges.keys().next().value);
  res.json({ message: signInText(address, nonce) });
}));

const ADDRESS_KEYS = ['evm', 'bitcoin', 'litecoin', 'dogecoin', 'solana', 'tron', 'ripple', 'cosmos'];

app.post('/api/wallet/session', limit('session', 30, 60_000), wrap((req, res) => {
  const address = str(req.body.address).toLowerCase();
  const ch = challenges.get(address);
  challenges.delete(address);
  if (!ch || ch.exp < now()) throw fail(400, 'Sign-in expired. Try again.');
  let signer = '';
  try { signer = verifyMessage(signInText(address, ch.nonce), str(req.body.signature, 300)).toLowerCase(); } catch { /* invalid */ }
  if (signer !== address) throw fail(401, 'Signature did not match this wallet.');

  const settings = getSettings();
  let wallet = q('SELECT * FROM wallets WHERE id = ?').get(address);
  if (!wallet) {
    if (!settings.allowNewWallets) throw fail(403, 'New wallets are paused right now. Try again later.');
    const addresses = { evm: address };
    for (const k of ADDRESS_KEYS) if (k !== 'evm') { const v = str(req.body.addresses?.[k], 120); if (/^[A-Za-z0-9]{20,120}$/.test(v)) addresses[k] = v; }
    const origin = req.body.origin === 'imported' ? 'imported' : 'created';
    q('INSERT INTO wallets (id, addresses, origin, user_agent, ip, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(address, JSON.stringify(addresses), origin, str(req.headers['user-agent'], 300), req.ip, now(), now());
    logEvent(address, origin === 'imported' ? 'wallet_imported' : 'wallet_created');
    wallet = q('SELECT * FROM wallets WHERE id = ?').get(address);
  }
  if (wallet.status === 'frozen') { logEvent(address, 'blocked_sign_in'); throw fail(403, `This wallet is suspended on Latch. Contact ${settings.supportEmail}. Your backup phrase still works in other wallets.`); }

  const token = randomBytes(32).toString('hex');
  q('INSERT INTO wallet_sessions (token, wallet_id, expires) VALUES (?, ?, ?)').run(sha(token), address, now() + DAY);
  q('UPDATE wallets SET last_seen = ?, ip = ?, user_agent = ? WHERE id = ?').run(now(), req.ip, str(req.headers['user-agent'], 300), address);
  logEvent(address, 'sign_in');
  res.json({ token, created_at: wallet.created_at });
}));

function walletAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const s = token && q('SELECT * FROM wallet_sessions WHERE token = ? AND expires > ?').get(sha(token), now());
  const wallet = s && q('SELECT * FROM wallets WHERE id = ?').get(s.wallet_id);
  if (!wallet) return res.status(401).json({ error: 'Session ended. Unlock your wallet again.' });
  if (wallet.status === 'frozen') return res.status(403).json({ error: 'This wallet is suspended on Latch.' });
  const settings = getSettings();
  if (settings.maintenance) return res.status(503).json({ error: settings.maintenanceMessage, maintenance: true });
  req.wallet = { ...wallet, addresses: JSON.parse(wallet.addresses) };
  req.settings = settings;
  next();
}

app.get('/api/wallet/balances', walletAuth, wrap(async (req, res) => {
  res.json({ balances: await fetchBalances(req.wallet.addresses, getChains(true), getTokens(true)) });
}));

app.get('/api/wallet/txs', walletAuth, wrap((req, res) => {
  res.json({ txs: q('SELECT chain, symbol, hash, to_addr, amount, created_at FROM txs WHERE wallet_id = ? ORDER BY id DESC LIMIT 100').all(req.wallet.id) });
}));

app.post('/api/wallet/tx', walletAuth, wrap((req, res) => {
  const chain = str(req.body.chain, 40), hash = str(req.body.hash, 100);
  if (!getChains().some((c) => c.id === chain) || !/^0x[0-9a-f]{64}$/i.test(hash)) throw fail(400, 'Invalid transaction record.');
  q('INSERT INTO txs (wallet_id, chain, symbol, hash, to_addr, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.wallet.id, chain, str(req.body.symbol, 20), hash, str(req.body.to, 120), str(req.body.amount, 60), now());
  logEvent(req.wallet.id, 'sent', `${str(req.body.amount, 60)} ${str(req.body.symbol, 20)} on ${chain}`);
  res.json({ ok: true });
}));

// JSON-RPC relay for EVM networks so the browser signs locally and broadcasts through admin-configured nodes.
const RPC_READ = new Set(['eth_chainId', 'eth_blockNumber', 'eth_getBalance', 'eth_getTransactionCount', 'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory', 'eth_estimateGas', 'eth_call', 'eth_getBlockByNumber', 'eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_getCode', 'net_version']);
app.post('/api/rpc/:chain', walletAuth, limit('rpc', 240, 60_000), wrap(async (req, res) => {
  const chain = getChains(true).find((c) => c.id === req.params.chain && c.family === 'evm');
  if (!chain) throw fail(404, 'Network is not available.');
  const one = async (call) => {
    const base = { jsonrpc: '2.0', id: call?.id ?? null };
    const method = call?.method;
    if (method === 'eth_sendRawTransaction') {
      if (!req.settings.sendEnabled) return { ...base, error: { code: -32000, message: 'Sending is paused by the Latch team.' } };
    } else if (!RPC_READ.has(method)) return { ...base, error: { code: -32601, message: 'Method not allowed.' } };
    try { return { ...base, result: await rpcCall(chain.rpc, method, call.params || []) }; }
    catch (e) { return { ...base, error: { code: -32000, message: e.message } }; }
  };
  const body = req.body;
  res.json(Array.isArray(body) ? await Promise.all(body.slice(0, 20).map(one)) : await one(body));
}));

// ---------- admin ----------
const admin = express.Router();
app.use('/api/admin', admin);

admin.post('/login', limit('admin-login', 8, 600_000), wrap((req, res) => {
  const user = q('SELECT * FROM admins WHERE username = ?').get(str(req.body.username, 60));
  const ok = user && checkPassword(str(req.body.password, 200), user.salt, user.hash);
  if (!ok) throw fail(401, 'Wrong username or password.');
  const token = randomBytes(32).toString('hex');
  q('INSERT INTO admin_sessions (token, admin_id, expires) VALUES (?, ?, ?)').run(sha(token), user.id, now() + DAY / 2);
  res.set('Set-Cookie', `latch_admin=${token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=43200${req.secure ? '; Secure' : ''}`);
  req.admin = user; audit(req, 'login', req.ip);
  res.json({ username: user.username });
}));

admin.use((req, res, next) => {
  const token = cookie(req, 'latch_admin');
  const s = token && q('SELECT * FROM admin_sessions WHERE token = ? AND expires > ?').get(sha(token), now());
  const user = s && q('SELECT * FROM admins WHERE id = ?').get(s.admin_id);
  if (!user) return res.status(401).json({ error: 'Sign in to the admin panel.' });
  // Cookie is SameSite=Strict; requiring JSON on writes blocks plain cross-site form posts as a second layer.
  if (req.method !== 'GET' && !req.is('application/json')) return res.status(415).json({ error: 'JSON required.' });
  req.admin = user; req.adminToken = sha(token);
  next();
});

admin.get('/me', (req, res) => res.json({ username: req.admin.username }));
admin.post('/logout', (req, res) => {
  q('DELETE FROM admin_sessions WHERE token = ?').run(req.adminToken);
  res.set('Set-Cookie', 'latch_admin=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0');
  res.json({ ok: true });
});

admin.get('/overview', wrap((req, res) => {
  const t = now();
  const n = (sql, ...a) => q(sql).get(...a).n;
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const start = new Date(t - i * DAY); start.setHours(0, 0, 0, 0);
    const s = start.getTime();
    days.push({ day: s, wallets: n('SELECT COUNT(*) AS n FROM wallets WHERE created_at >= ? AND created_at < ?', s, s + DAY), sends: n('SELECT COUNT(*) AS n FROM txs WHERE created_at >= ? AND created_at < ?', s, s + DAY) });
  }
  res.json({
    totals: {
      wallets: n('SELECT COUNT(*) AS n FROM wallets'),
      active24h: n('SELECT COUNT(*) AS n FROM wallets WHERE last_seen > ?', t - DAY),
      new7d: n('SELECT COUNT(*) AS n FROM wallets WHERE created_at > ?', t - 7 * DAY),
      frozen: n("SELECT COUNT(*) AS n FROM wallets WHERE status = 'frozen'"),
      imported: n("SELECT COUNT(*) AS n FROM wallets WHERE origin = 'imported'"),
      sends: n('SELECT COUNT(*) AS n FROM txs'),
      chains: n('SELECT COUNT(*) AS n FROM chains WHERE enabled = 1'),
      tokens: n('SELECT COUNT(*) AS n FROM tokens WHERE enabled = 1'),
    },
    days,
    events: q('SELECT * FROM events ORDER BY id DESC LIMIT 14').all(),
    settings: getSettings(),
  });
}));

admin.get('/wallets', wrap((req, res) => {
  const search = `%${str(req.query.q, 120).toLowerCase()}%`;
  const status = str(req.query.status, 20);
  const rows = q(`SELECT w.*, (SELECT COUNT(*) FROM txs t WHERE t.wallet_id = w.id) AS sends FROM wallets w
    WHERE (LOWER(w.addresses) LIKE ? OR LOWER(w.note) LIKE ?) AND (? = '' OR w.status = ?) ORDER BY w.created_at DESC LIMIT 200`).all(search, search, status, status);
  res.json({ wallets: rows.map((w) => ({ ...w, addresses: JSON.parse(w.addresses) })) });
}));

const findWallet = (id) => { const w = q('SELECT * FROM wallets WHERE id = ?').get(str(id).toLowerCase()); if (!w) throw fail(404, 'Wallet not found.'); return { ...w, addresses: JSON.parse(w.addresses) }; };

admin.get('/wallets/:id', wrap(async (req, res) => {
  const wallet = findWallet(req.params.id);
  const [balances, markets] = await Promise.all([fetchBalances(wallet.addresses, getChains(true), getTokens(true)), fetchMarkets()]);
  res.json({
    wallet, balances,
    prices: Object.fromEntries(markets.coins.map((c) => [c.id, c.price])),
    events: q('SELECT * FROM events WHERE wallet_id = ? ORDER BY id DESC LIMIT 60').all(wallet.id),
    txs: q('SELECT * FROM txs WHERE wallet_id = ? ORDER BY id DESC LIMIT 60').all(wallet.id),
  });
}));

admin.patch('/wallets/:id', wrap((req, res) => {
  const wallet = findWallet(req.params.id);
  if (['active', 'frozen'].includes(req.body.status) && req.body.status !== wallet.status) {
    q('UPDATE wallets SET status = ? WHERE id = ?').run(req.body.status, wallet.id);
    if (req.body.status === 'frozen') q('DELETE FROM wallet_sessions WHERE wallet_id = ?').run(wallet.id);
    logEvent(wallet.id, req.body.status === 'frozen' ? 'suspended' : 'reinstated', `by ${req.admin.username}`);
    audit(req, req.body.status === 'frozen' ? 'wallet.suspend' : 'wallet.reinstate', wallet.id);
  }
  if (typeof req.body.note === 'string') { q('UPDATE wallets SET note = ? WHERE id = ?').run(str(req.body.note, 1000), wallet.id); audit(req, 'wallet.note', wallet.id); }
  res.json({ wallet: findWallet(wallet.id) });
}));

admin.post('/wallets/:id/sign-out', wrap((req, res) => {
  const wallet = findWallet(req.params.id);
  q('DELETE FROM wallet_sessions WHERE wallet_id = ?').run(wallet.id);
  logEvent(wallet.id, 'signed_out', `by ${req.admin.username}`); audit(req, 'wallet.sign_out', wallet.id);
  res.json({ ok: true });
}));

admin.delete('/wallets/:id', wrap((req, res) => {
  const wallet = findWallet(req.params.id);
  for (const t of ['wallet_sessions', 'txs', 'events']) q(`DELETE FROM ${t} WHERE wallet_id = ?`).run(wallet.id);
  q('DELETE FROM wallets WHERE id = ?').run(wallet.id);
  audit(req, 'wallet.delete_record', wallet.id);
  res.json({ ok: true });
}));

admin.get('/assets', wrap((req, res) => res.json({ chains: getChains(), tokens: getTokens() })));

admin.patch('/chains/:id', wrap((req, res) => {
  const chain = getChains().find((c) => c.id === req.params.id);
  if (!chain) throw fail(404, 'Network not found.');
  if (typeof req.body.enabled === 'boolean') { q('UPDATE chains SET enabled = ? WHERE id = ?').run(req.body.enabled ? 1 : 0, chain.id); audit(req, req.body.enabled ? 'network.enable' : 'network.disable', chain.id); }
  if (typeof req.body.rpc === 'string') {
    let url; try { url = new URL(req.body.rpc.trim()); } catch { throw fail(400, 'Enter a full https:// URL for the node.'); }
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw fail(400, 'Node URL must use https.');
    q('UPDATE chains SET rpc = ? WHERE id = ?').run(url.toString().replace(/\/$/, ''), chain.id); audit(req, 'network.rpc', `${chain.id} -> ${url.host}`);
  }
  res.json({ chains: getChains() });
}));

admin.post('/tokens', wrap((req, res) => {
  const chain = getChains().find((c) => c.id === req.body.chain && c.family === 'evm');
  const contract = str(req.body.contract).toLowerCase(), symbol = str(req.body.symbol, 12).toUpperCase(), name = str(req.body.name, 40) || symbol;
  const decimals = Number(req.body.decimals);
  if (!chain) throw fail(400, 'Choose an EVM network for this token.');
  if (!isAddress(contract)) throw fail(400, 'Contract address is not valid.');
  if (!symbol || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw fail(400, 'Symbol and decimals (0 to 36) are required.');
  try { q('INSERT INTO tokens (chain, contract, symbol, name, decimals, cg) VALUES (?, ?, ?, ?, ?, ?)').run(chain.id, contract, symbol, name, decimals, str(req.body.cg, 80) || null); }
  catch { throw fail(409, 'That token is already listed on this network.'); }
  audit(req, 'token.add', `${symbol} on ${chain.id}`);
  res.json({ tokens: getTokens() });
}));

admin.patch('/tokens/:id', wrap((req, res) => {
  if (typeof req.body.enabled === 'boolean') { q('UPDATE tokens SET enabled = ? WHERE id = ?').run(req.body.enabled ? 1 : 0, Number(req.params.id)); audit(req, req.body.enabled ? 'token.enable' : 'token.disable', req.params.id); }
  res.json({ tokens: getTokens() });
}));
admin.delete('/tokens/:id', wrap((req, res) => {
  q('DELETE FROM tokens WHERE id = ?').run(Number(req.params.id)); audit(req, 'token.remove', req.params.id);
  res.json({ tokens: getTokens() });
}));

const allAnnouncements = () => q('SELECT * FROM announcements ORDER BY id DESC').all();
admin.get('/announcements', wrap((req, res) => res.json({ announcements: allAnnouncements() })));
admin.post('/announcements', wrap((req, res) => {
  const title = str(req.body.title, 120), body = str(req.body.body, 600);
  const level = ['info', 'warning'].includes(req.body.level) ? req.body.level : 'info';
  if (!title) throw fail(400, 'Give the announcement a title.');
  q('INSERT INTO announcements (title, body, level, created_at) VALUES (?, ?, ?, ?)').run(title, body, level, now());
  audit(req, 'announcement.publish', title);
  res.json({ announcements: allAnnouncements() });
}));
admin.patch('/announcements/:id', wrap((req, res) => {
  if (typeof req.body.active === 'boolean') { q('UPDATE announcements SET active = ? WHERE id = ?').run(req.body.active ? 1 : 0, Number(req.params.id)); audit(req, req.body.active ? 'announcement.show' : 'announcement.hide', req.params.id); }
  res.json({ announcements: allAnnouncements() });
}));
admin.delete('/announcements/:id', wrap((req, res) => {
  q('DELETE FROM announcements WHERE id = ?').run(Number(req.params.id)); audit(req, 'announcement.delete', req.params.id);
  res.json({ announcements: allAnnouncements() });
}));

admin.get('/settings', wrap((req, res) => res.json({ settings: getSettings() })));
admin.put('/settings', wrap((req, res) => {
  setSettings(req.body || {}); audit(req, 'settings.update', Object.keys(req.body || {}).join(', '));
  res.json({ settings: getSettings() });
}));
admin.post('/sign-out-everyone', wrap((req, res) => {
  q('DELETE FROM wallet_sessions').run(); audit(req, 'wallets.sign_out_all');
  res.json({ ok: true });
}));
admin.post('/password', wrap((req, res) => {
  const next = str(req.body.next, 200);
  if (!checkPassword(str(req.body.current, 200), req.admin.salt, req.admin.hash)) throw fail(400, 'Current password is wrong.');
  if (next.length < 10) throw fail(400, 'Use at least 10 characters for the new password.');
  const { salt, hash } = hashPassword(next);
  q('UPDATE admins SET hash = ?, salt = ? WHERE id = ?').run(hash, salt, req.admin.id);
  q('DELETE FROM admin_sessions WHERE admin_id = ? AND token != ?').run(req.admin.id, req.adminToken);
  audit(req, 'admin.password_change');
  res.json({ ok: true });
}));

admin.get('/txs', wrap((req, res) => res.json({ txs: q('SELECT * FROM txs ORDER BY id DESC LIMIT 300').all() })));
admin.get('/audit', wrap((req, res) => res.json({ audit: q('SELECT * FROM audit ORDER BY id DESC LIMIT 300').all() })));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// ---------- static client ----------
const dist = path.join(here, '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', setHeaders: (res, p) => { if (p.endsWith('index.html')) res.set('Cache-Control', 'no-store'); } }));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (req, res) => res.type('text').send('Client is not built yet. Run "npm run build", or "npm run dev" and open http://localhost:5173'));
}

setInterval(() => { q('DELETE FROM wallet_sessions WHERE expires < ?').run(now()); q('DELETE FROM admin_sessions WHERE expires < ?').run(now()); }, 3_600_000).unref();

app.listen(PORT, () => console.log(`Latch running at http://localhost:${PORT}  (admin: http://localhost:${PORT}/#/admin)`));
