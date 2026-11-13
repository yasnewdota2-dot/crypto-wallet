import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CHAINS, DEFAULT_TOKENS } from './registry.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.LATCH_DATA_DIR || path.join(here, 'data');
mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'latch.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, hash TEXT NOT NULL, salt TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS admin_sessions (token TEXT PRIMARY KEY, admin_id INTEGER NOT NULL, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY, addresses TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', note TEXT NOT NULL DEFAULT '',
    origin TEXT NOT NULL DEFAULT 'created', user_agent TEXT, ip TEXT, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS wallet_sessions (token TEXT PRIMARY KEY, wallet_id TEXT NOT NULL, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS chains (id TEXT PRIMARY KEY, data TEXT NOT NULL, rpc TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY, chain TEXT NOT NULL, contract TEXT NOT NULL, symbol TEXT NOT NULL, name TEXT NOT NULL,
    decimals INTEGER NOT NULL, cg TEXT, enabled INTEGER NOT NULL DEFAULT 1, UNIQUE(chain, contract));
  CREATE TABLE IF NOT EXISTS announcements (id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'info', active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS txs (id INTEGER PRIMARY KEY, wallet_id TEXT NOT NULL, chain TEXT NOT NULL, symbol TEXT NOT NULL, hash TEXT NOT NULL, to_addr TEXT NOT NULL, amount TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, wallet_id TEXT, type TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, admin TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_events_wallet ON events(wallet_id);
  CREATE INDEX IF NOT EXISTS idx_txs_wallet ON txs(wallet_id);
`);

export const q = (sql) => db.prepare(sql);
export const now = () => Date.now();
export const sha = (s) => createHash('sha256').update(s).digest('hex');

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}
export function checkPassword(password, salt, hash) {
  const a = scryptSync(password, salt, 64);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

const SETTING_DEFAULTS = {
  maintenance: false,
  maintenanceMessage: 'Latch is down for maintenance. Your coins are safe on-chain and your backup phrase still works in any BIP39 wallet.',
  allowNewWallets: true,
  sendEnabled: true,
  supportEmail: 'support@example.com',
};
export function getSettings() {
  const out = { ...SETTING_DEFAULTS };
  for (const r of q('SELECT key, value FROM settings').all()) {
    if (r.key in out) out[r.key] = JSON.parse(r.value);
  }
  return out;
}
export function setSettings(patch) {
  const up = q('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(patch)) {
    if (k in SETTING_DEFAULTS && typeof v === typeof SETTING_DEFAULTS[k]) up.run(k, JSON.stringify(v));
  }
}

export function getChains(onlyEnabled = false) {
  return q('SELECT * FROM chains ORDER BY sort').all()
    .filter((r) => !onlyEnabled || r.enabled)
    .map((r) => ({ ...JSON.parse(r.data), rpc: r.rpc, enabled: !!r.enabled }));
}
export function getTokens(onlyEnabled = false) {
  return q('SELECT * FROM tokens ORDER BY id').all()
    .filter((r) => !onlyEnabled || r.enabled)
    .map((r) => ({ ...r, enabled: !!r.enabled }));
}

// ---- first-run seeding ----
if (q('SELECT COUNT(*) AS n FROM chains').get().n === 0) {
  const ins = q('INSERT INTO chains (id, data, rpc, enabled, sort) VALUES (?, ?, ?, 1, ?)');
  DEFAULT_CHAINS.forEach((c, i) => { const { rpc, ...data } = c; ins.run(c.id, JSON.stringify(data), rpc, i); });
  const tok = q('INSERT INTO tokens (chain, contract, symbol, name, decimals, cg) VALUES (?, ?, ?, ?, ?, ?)');
  DEFAULT_TOKENS.forEach((t) => tok.run(t.chain, t.contract, t.symbol, t.name, t.decimals, t.cg));
}

if (q('SELECT COUNT(*) AS n FROM admins').get().n === 0) {
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD || randomBytes(12).toString('base64url');
  const { salt, hash } = hashPassword(password);
  q('INSERT INTO admins (username, hash, salt, created_at) VALUES (?, ?, ?, ?)').run(username, hash, salt, now());
  const file = path.join(DATA_DIR, 'admin-credentials.txt');
  if (!process.env.ADMIN_PASSWORD) {
    writeFileSync(file, `Latch admin panel\nURL: /#/admin\nUsername: ${username}\nPassword: ${password}\n\nChange the password in Admin > Settings, then delete this file.\n`);
  }
  console.log(`\n  Admin account created.\n  Username: ${username}\n  Password: ${process.env.ADMIN_PASSWORD ? '(from ADMIN_PASSWORD)' : password}\n  ${existsSync(file) ? 'Also saved to ' + file : ''}\n`);
}
