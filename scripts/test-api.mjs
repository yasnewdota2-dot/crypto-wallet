// End-to-end check of the API against a running server: node scripts/test-api.mjs <admin-password>
import { Wallet } from 'ethers';

const base = process.env.BASE || 'http://localhost:4000/api';
const adminPw = process.argv[2];
let cookie = '';
const call = async (path, { method = 'GET', body, token, admin } = {}) => {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (admin) headers.cookie = cookie;
  const res = await fetch(base + path, { method, headers, body: body && JSON.stringify(body) });
  const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
let failed = 0;
const check = (name, ok, extra = '') => { if (!ok) failed++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const w = Wallet.createRandom();
const address = w.address.toLowerCase();
const signInOnce = async () => {
  const ch = await call('/wallet/challenge', { method: 'POST', body: { address } });
  return call('/wallet/session', { method: 'POST', body: { address, signature: await w.signMessage(ch.data.message), addresses: {}, origin: 'created' } });
};

const bad = await call('/wallet/challenge', { method: 'POST', body: { address } });
const forged = await call('/wallet/session', { method: 'POST', body: { address, signature: await Wallet.createRandom().signMessage(bad.data.message) } });
check('forged signature rejected', forged.status === 401);

const s = await signInOnce();
check('wallet sign-in', s.status === 200 && !!s.data.token);
const token = s.data.token;
check('balances need a session', (await call('/wallet/balances')).status === 401);
const bal = await call('/wallet/balances', { token });
check('balances', bal.status === 200 && bal.data.balances.length > 10, `${bal.data.balances?.filter((b) => b.raw != null).length}/${bal.data.balances?.length} networks answered`);
const rpc = await call('/rpc/sepolia', { method: 'POST', token, body: { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] } });
check('rpc relay (sepolia chain id)', rpc.data.result === '0xaa36a7', JSON.stringify(rpc.data).slice(0, 80));
const deny = await call('/rpc/ethereum', { method: 'POST', token, body: { jsonrpc: '2.0', id: 1, method: 'debug_traceTransaction', params: [] } });
check('rpc relay blocks unlisted methods', deny.data.error?.code === -32601);

if (!adminPw) { console.log('(pass the admin password to test the admin API)'); process.exit(failed ? 1 : 0); }
check('admin needs sign-in', (await call('/admin/overview')).status === 401);
check('admin wrong password', (await call('/admin/login', { method: 'POST', body: { username: 'admin', password: 'nope' } })).status === 401);
check('admin login', (await call('/admin/login', { method: 'POST', body: { username: 'admin', password: adminPw } })).status === 200);
const ov = await call('/admin/overview', { admin: true });
check('overview', ov.status === 200 && ov.data.totals.wallets >= 1, JSON.stringify(ov.data.totals));
check('wallet search', (await call(`/admin/wallets?q=${address.slice(0, 12)}`, { admin: true })).data.wallets?.length === 1);
check('wallet detail', (await call(`/admin/wallets/${address}`, { admin: true })).data.wallet?.id === address);

check('suspend', (await call(`/admin/wallets/${address}`, { method: 'PATCH', admin: true, body: { status: 'frozen' } })).data.wallet?.status === 'frozen');
check('suspended session is dead', (await call('/wallet/balances', { token })).status === 401);
check('suspended wallet cannot sign in', (await signInOnce()).status === 403);
await call(`/admin/wallets/${address}`, { method: 'PATCH', admin: true, body: { status: 'active' } });
const s2 = await signInOnce();
check('reinstated wallet signs in', s2.status === 200);

await call('/admin/settings', { method: 'PUT', admin: true, body: { sendEnabled: false } });
const blocked = await call('/rpc/sepolia', { method: 'POST', token: s2.data.token, body: { jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: ['0x00'] } });
check('send switch blocks broadcast', /paused/.test(blocked.data.error?.message || ''));
await call('/admin/settings', { method: 'PUT', admin: true, body: { sendEnabled: true, maintenance: true } });
check('maintenance blocks wallets', (await call('/wallet/balances', { token: s2.data.token })).status === 503);
await call('/admin/settings', { method: 'PUT', admin: true, body: { maintenance: false } });

const ann = await call('/admin/announcements', { method: 'POST', admin: true, body: { title: 'API test', body: 'temporary', level: 'info' } });
const annId = ann.data.announcements?.[0]?.id;
check('announcement reaches wallets', (await call('/config')).data.announcements.some((a) => a.id === annId));
await call(`/admin/announcements/${annId}`, { method: 'DELETE', admin: true, body: {} });

await call('/admin/chains/dogecoin', { method: 'PATCH', admin: true, body: { enabled: false } });
check('disabled network is hidden', !(await call('/config')).data.chains.some((c) => c.id === 'dogecoin'));
await call('/admin/chains/dogecoin', { method: 'PATCH', admin: true, body: { enabled: true } });
const tok = await call('/admin/tokens', { method: 'POST', admin: true, body: { chain: 'ethereum', contract: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', symbol: 'pepe', name: 'Pepe', decimals: 18, cg: 'pepe' } });
const pepe = tok.data.tokens?.find((t) => t.symbol === 'PEPE');
check('token listing', !!pepe);
if (pepe) await call(`/admin/tokens/${pepe.id}`, { method: 'DELETE', admin: true, body: {} });
check('bad token rejected', (await call('/admin/tokens', { method: 'POST', admin: true, body: { chain: 'bitcoin', contract: '0x1', symbol: 'X', decimals: 18 } })).status === 400);

check('delete wallet record', (await call(`/admin/wallets/${address}`, { method: 'DELETE', admin: true, body: {} })).status === 200);
check('audit log filled', (await call('/admin/audit', { admin: true })).data.audit.length > 8);
await call('/admin/logout', { method: 'POST', admin: true, body: {} });
check('logout ends admin session', (await call('/admin/overview', { admin: true })).status === 401);
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
