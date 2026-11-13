import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../App.jsx';
import { Wordmark, Notice, Copy, Modal, usd, amount as fmtAmount, when, ago } from '../ui.jsx';
import { shortAddr } from '../lib/wallet.js';
import { formatUnits } from 'ethers';

const adm = (path, opts) => api(`/admin${path}`, opts);
const SECTIONS = [['overview', 'Overview'], ['wallets', 'Wallets'], ['assets', 'Networks and tokens'], ['announcements', 'Announcements'], ['txs', 'Transfers'], ['settings', 'Settings'], ['audit', 'Audit log']];
const EVENT_LABEL = { wallet_created: 'Wallet created', wallet_imported: 'Wallet restored', sign_in: 'Signed in', sent: 'Sent', suspended: 'Suspended', reinstated: 'Reinstated', signed_out: 'Signed out by staff', blocked_sign_in: 'Sign-in blocked' };

export default function Admin() {
  const [me, setMe] = useState(undefined);
  const [section, setSection] = useState('overview');
  const [flash, setFlash] = useState(null);
  useEffect(() => { adm('/me').then(setMe).catch(() => setMe(null)); }, []);

  const run = useCallback(async (fn, okText) => {
    try { const r = await fn(); if (okText) { setFlash({ kind: 'ok', text: okText }); setTimeout(() => setFlash(null), 2600); } return r; }
    catch (e) { if (e.status === 401) setMe(null); setFlash({ kind: 'error', text: e.message }); return null; }
  }, []);

  if (me === undefined) return <div className="admin"><div className="backdrop deep" /></div>;
  if (!me) return <Login onIn={setMe} />;

  const Section = { overview: Overview, wallets: Wallets, assets: Assets, announcements: Announcements, txs: Transfers, settings: SettingsPane, audit: Audit }[section];
  return (
    <div className="admin">
      <div className="backdrop deep" aria-hidden="true" />
      <aside className="admin-side">
        <Wordmark />
        <p className="side-tag">Control room</p>
        <nav>{SECTIONS.map(([k, label]) => <button key={k} className={section === k ? 'on' : ''} onClick={() => { setSection(k); setFlash(null); }}>{label}</button>)}</nav>
        <div className="side-foot"><span>Signed in as {me.username}</span><button className="btn ghost small" onClick={() => adm('/logout', { method: 'POST', body: {} }).finally(() => setMe(null))}>Sign out</button></div>
      </aside>
      <main className="admin-main">
        {flash && <Notice kind={flash.kind}>{flash.text}</Notice>}
        <Section run={run} goTo={setSection} />
      </main>
    </div>
  );
}

function Login({ onIn }) {
  const [username, setU] = useState('admin'), [password, setP] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { onIn(await adm('/login', { method: 'POST', body: { username, password } })); } catch (err) { setError(err.message); }
    setBusy(false);
  };
  return (
    <div className="admin-login">
      <div className="backdrop deep" aria-hidden="true" />
      <form className="card flow-card" onSubmit={submit}>
        <Wordmark />
        <h1>Staff sign-in</h1>
        <label className="field"><span>Username</span><input value={username} onChange={(e) => setU(e.target.value)} autoComplete="username" /></label>
        <label className="field"><span>Password</span><input type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete="current-password" autoFocus /></label>
        <Notice>{error}</Notice>
        <div className="actions"><button className="btn primary" disabled={busy || !password}>{busy ? 'Signing in…' : 'Sign in'}</button><a className="btn ghost" href="#/">Back to site</a></div>
      </form>
    </div>
  );
}

function useLoad(path, run, deps = []) {
  const [data, setData] = useState(null);
  const reload = useCallback(() => run(() => adm(path)).then((d) => { if (d) setData(d); }), [path, run]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload, ...deps]);
  return [data, setData, reload];
}

const Switch = ({ checked, onChange, label }) => (
  <label className="switch"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><i aria-hidden="true" /><span className={label ? '' : 'sr'}>{label || 'Enabled'}</span></label>
);

function Overview({ run, goTo }) {
  const [d] = useLoad('/overview', run);
  if (!d) return <p className="muted">Loading…</p>;
  const t = d.totals, peak = Math.max(1, ...d.days.map((x) => x.wallets));
  const tiles = [['Wallets', t.wallets], ['Active in the last 24 h', t.active24h], ['New in the last 7 days', t.new7d], ['Suspended', t.frozen], ['Restored from a phrase', t.imported], ['Transfers sent', t.sends], ['Networks live', t.chains], ['Tokens listed', t.tokens]];
  return (
    <>
      <h1>Overview</h1>
      {d.settings.maintenance && <Notice kind="warn">Maintenance mode is on. Wallets cannot load balances or send. <button className="link" onClick={() => goTo('settings')}>Open settings</button></Notice>}
      <div className="tiles">{tiles.map(([label, v]) => <div className="tile" key={label}><b>{v.toLocaleString()}</b><span>{label}</span></div>)}</div>
      <div className="admin-cols">
        <section className="card pad">
          <h2>New wallets, last 14 days</h2>
          <div className="bars" role="img" aria-label={`New wallets per day: ${d.days.map((x) => x.wallets).join(', ')}`}>
            {d.days.map((x) => <div key={x.day} title={`${new Date(x.day).toLocaleDateString()}: ${x.wallets} new, ${x.sends} transfers`}><i style={{ height: `${(x.wallets / peak) * 100}%` }} /><span>{new Date(x.day).getDate()}</span></div>)}
          </div>
        </section>
        <section className="card pad">
          <h2>Latest activity</h2>
          {d.events.length === 0 ? <p className="muted">Nothing yet. Activity appears once the first wallet is created.</p> : (
            <ul className="feed">{d.events.map((e) => <li key={e.id}><b>{EVENT_LABEL[e.type] || e.type}</b><span className="mono">{shortAddr(e.wallet_id, 5)}</span><span className="muted">{e.detail}</span><time>{ago(e.created_at)}</time></li>)}</ul>
          )}
        </section>
      </div>
    </>
  );
}

function Wallets({ run }) {
  const [query, setQuery] = useState(''), [status, setStatus] = useState('');
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => run(() => adm(`/wallets?q=${encodeURIComponent(query)}&status=${status}`)).then((d) => d && setList(d.wallets)), [query, status, run]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  return (
    <>
      <h1>Wallets</h1>
      <p className="lede-s">Latch never receives backup phrases or private keys, so staff cannot move funds. Suspending a wallet blocks it from this app; the owner can still use their words elsewhere.</p>
      <div className="toolbar">
        <label className="search"><span className="sr">Search wallets</span><input type="search" placeholder="Search by any address or note" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <label className="sr" htmlFor="st">Status</label>
        <select id="st" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="frozen">Suspended</option></select>
      </div>
      <section className="card">
        {!list ? <p className="muted pad">Loading…</p> : list.length === 0 ? <div className="empty">{query || status ? 'No wallet matches that search.' : 'No wallets yet. They appear here when someone creates or restores one.'}</div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Wallet</th><th>Status</th><th>Origin</th><th>Created</th><th>Last seen</th><th className="num">Transfers</th><th /></tr></thead>
            <tbody>{list.map((w) => (
              <tr key={w.id}>
                <td className="mono">{shortAddr(w.id, 8)}{w.note && <small className="note-dot" title={w.note}> note</small>}</td>
                <td><span className={`pill ${w.status}`}>{w.status === 'frozen' ? 'Suspended' : 'Active'}</span></td>
                <td>{w.origin === 'imported' ? 'Restored' : 'Created'}</td><td>{when(w.created_at)}</td><td>{ago(w.last_seen)}</td><td className="num">{w.sends}</td>
                <td className="num"><button className="btn ghost small" onClick={() => setOpen(w.id)}>Open</button></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>
      {open && <WalletDetail id={open} run={run} onClose={() => { setOpen(null); load(); }} />}
    </>
  );
}

function WalletDetail({ id, run, onClose }) {
  const [d, setD] = useState(null);
  const [note, setNote] = useState('');
  const [sure, setSure] = useState(false);
  const { config } = useApp();
  const load = useCallback(() => run(() => adm(`/wallets/${id}`)).then((r) => { if (r) { setD(r); setNote(r.wallet.note); } }), [id, run]);
  useEffect(() => { load(); }, [load]);
  const patch = (body, ok) => run(() => adm(`/wallets/${id}`, { method: 'PATCH', body }), ok).then((r) => r && setD((x) => ({ ...x, wallet: r.wallet })));
  const chainName = (cid) => config?.chains.find((c) => c.id === cid)?.name || cid;

  return (
    <Modal title="Wallet" onClose={onClose} wide>
      {!d ? <p className="muted">Reading balances from the networks…</p> : (
        <div className="wallet-detail">
          <div className="wd-head">
            <code translate="no">{d.wallet.id}</code>
            <span className={`pill ${d.wallet.status}`}>{d.wallet.status === 'frozen' ? 'Suspended' : 'Active'}</span>
          </div>
          <p className="muted">{d.wallet.origin === 'imported' ? 'Restored' : 'Created'} {when(d.wallet.created_at)}. Last seen {ago(d.wallet.last_seen)} from {d.wallet.ip || 'unknown address'}.</p>
          <div className="actions">
            {d.wallet.status === 'active'
              ? <button className="btn danger" onClick={() => patch({ status: 'frozen' }, 'Wallet suspended')}>Suspend wallet</button>
              : <button className="btn primary" onClick={() => patch({ status: 'active' }, 'Wallet reinstated')}>Reinstate wallet</button>}
            <button className="btn ghost" onClick={() => run(() => adm(`/wallets/${id}/sign-out`, { method: 'POST', body: {} }), 'Signed out of all devices')}>Sign out of all devices</button>
            {!sure ? <button className="btn ghost" onClick={() => setSure(true)}>Delete record…</button>
              : <button className="btn danger" onClick={() => run(() => adm(`/wallets/${id}`, { method: 'DELETE', body: {} }), 'Record deleted').then((r) => r && onClose())}>Confirm: delete record and history</button>}
          </div>
          <label className="field"><span>Staff note</span><span className="with-btn"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Visible to staff only" /><button className="btn ghost small" onClick={() => patch({ note }, 'Note saved')}>Save note</button></span></label>

          <h3>Balances, read live from each network</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>Asset</th><th>Network</th><th className="num">Balance</th><th className="num">Value</th></tr></thead>
            <tbody>{d.balances.map((b) => { const q = b.raw == null ? null : Number(formatUnits(b.raw, b.decimals)); const p = d.prices[b.cg]; return (
              <tr key={b.key} className={q ? '' : 'dim'}><td><b>{b.symbol}</b></td><td>{chainName(b.chain)}</td><td className="num">{q == null ? 'Unavailable' : fmtAmount(q)}</td><td className="num">{q != null && p ? usd(q * p) : '—'}</td></tr>); })}</tbody>
          </table></div>

          <h3>Addresses</h3>
          <ul className="addr-list">{Object.entries(d.wallet.addresses).map(([k, v]) => <li key={k}><span><b>{k === 'evm' ? 'Ethereum and EVM' : k[0].toUpperCase() + k.slice(1)}</b><code translate="no">{v}</code></span><Copy text={v} /></li>)}</ul>

          <h3>History</h3>
          <ul className="feed">{d.events.map((e) => <li key={e.id}><b>{EVENT_LABEL[e.type] || e.type}</b><span className="muted">{e.detail}</span><time>{when(e.created_at)}</time></li>)}</ul>
        </div>
      )}
    </Modal>
  );
}

function Assets({ run }) {
  const [d, setD] = useLoad('/assets', run);
  const { reloadConfig } = useApp();
  const [rpcEdit, setRpcEdit] = useState({});
  const [form, setForm] = useState({ chain: 'ethereum', contract: '', symbol: '', name: '', decimals: 18, cg: '' });
  if (!d) return <p className="muted">Loading…</p>;
  const done = (key) => (r) => { if (r) { setD((x) => ({ ...x, [key]: r[key] })); reloadConfig(); } return r; };
  const evm = d.chains.filter((c) => c.family === 'evm');
  return (
    <>
      <h1>Networks and tokens</h1>
      <p className="lede-s">Turn a network off to hide it from every wallet. Change the node address if a provider is slow or down.</p>
      <section className="card">
        <div className="table-wrap"><table>
          <thead><tr><th>Network</th><th>Coin</th><th>Node address</th><th>Live</th></tr></thead>
          <tbody>{d.chains.map((c) => (
            <tr key={c.id}>
              <td><span className="coin-cell"><i className="dot" style={{ background: c.color }} /><b>{c.name}</b>{c.testnet && <span className="pill">Testnet</span>}</span></td>
              <td>{c.symbol}</td>
              <td><span className="with-btn tight"><input className="mono" aria-label={`Node address for ${c.name}`} value={rpcEdit[c.id] ?? c.rpc} onChange={(e) => setRpcEdit((m) => ({ ...m, [c.id]: e.target.value }))} />
                {rpcEdit[c.id] != null && rpcEdit[c.id] !== c.rpc && <button className="btn ghost small" onClick={() => run(() => adm(`/chains/${c.id}`, { method: 'PATCH', body: { rpc: rpcEdit[c.id] } }), 'Node address saved').then(done('chains')).then((r) => r && setRpcEdit((m) => { const n = { ...m }; delete n[c.id]; return n; }))}>Save</button>}</span></td>
              <td><Switch checked={c.enabled} onChange={(v) => run(() => adm(`/chains/${c.id}`, { method: 'PATCH', body: { enabled: v } }), v ? `${c.name} is live` : `${c.name} is hidden`).then(done('chains'))} /></td>
            </tr>))}</tbody>
        </table></div>
      </section>

      <h2>Tokens</h2>
      <section className="card">
        <div className="table-wrap"><table>
          <thead><tr><th>Token</th><th>Network</th><th>Contract</th><th className="num">Decimals</th><th>Live</th><th /></tr></thead>
          <tbody>{d.tokens.map((t) => (
            <tr key={t.id}><td><b>{t.symbol}</b> <span className="muted">{t.name}</span></td><td>{d.chains.find((c) => c.id === t.chain)?.name}</td><td className="mono">{shortAddr(t.contract, 8)}</td><td className="num">{t.decimals}</td>
              <td><Switch checked={t.enabled} onChange={(v) => run(() => adm(`/tokens/${t.id}`, { method: 'PATCH', body: { enabled: v } })).then(done('tokens'))} /></td>
              <td className="num"><button className="btn ghost small" onClick={() => run(() => adm(`/tokens/${t.id}`, { method: 'DELETE', body: {} }), `${t.symbol} removed`).then(done('tokens'))}>Remove</button></td></tr>))}</tbody>
        </table></div>
      </section>
      <form className="card pad form-grid" onSubmit={(e) => { e.preventDefault(); run(() => adm('/tokens', { method: 'POST', body: { ...form, decimals: Number(form.decimals) } }), `${form.symbol.toUpperCase()} listed`).then(done('tokens')).then((r) => r && setForm((f) => ({ ...f, contract: '', symbol: '', name: '', cg: '' }))); }}>
        <h3>List a token</h3>
        <label className="field"><span>Network</span><select value={form.chain} onChange={(e) => setForm({ ...form, chain: e.target.value })}>{evm.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field span2"><span>Contract address</span><input className="mono" value={form.contract} onChange={(e) => setForm({ ...form, contract: e.target.value })} placeholder="0x…" /></label>
        <label className="field"><span>Symbol</span><input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} placeholder="PEPE" /></label>
        <label className="field"><span>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Pepe" /></label>
        <label className="field"><span>Decimals</span><input type="number" min="0" max="36" value={form.decimals} onChange={(e) => setForm({ ...form, decimals: e.target.value })} /></label>
        <label className="field span2"><span>CoinGecko ID for pricing (optional)</span><input value={form.cg} onChange={(e) => setForm({ ...form, cg: e.target.value })} placeholder="pepe" /></label>
        <div className="actions"><button className="btn primary">List token</button></div>
      </form>
    </>
  );
}

function Announcements({ run }) {
  const [d, setD] = useLoad('/announcements', run);
  const { reloadConfig } = useApp();
  const [form, setForm] = useState({ title: '', body: '', level: 'info' });
  const done = (r) => { if (r) { setD(r); reloadConfig(); } return r; };
  return (
    <>
      <h1>Announcements</h1>
      <p className="lede-s">A live announcement shows as a banner at the top of every unlocked wallet.</p>
      <form className="card pad form-grid" onSubmit={(e) => { e.preventDefault(); run(() => adm('/announcements', { method: 'POST', body: form }), 'Announcement published').then(done).then((r) => r && setForm({ title: '', body: '', level: 'info' })); }}>
        <label className="field span2"><span>Title</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} /></label>
        <label className="field"><span>Kind</span><select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}><option value="info">Information</option><option value="warning">Warning</option></select></label>
        <label className="field span3"><span>Details (optional)</span><textarea rows={2} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={600} /></label>
        <div className="actions"><button className="btn primary" disabled={!form.title.trim()}>Publish announcement</button></div>
      </form>
      <section className="card">
        {!d ? <p className="muted pad">Loading…</p> : d.announcements.length === 0 ? <div className="empty">No announcements. Publish one above to reach every wallet.</div> : (
          <ul className="ann-list">{d.announcements.map((a) => (
            <li key={a.id}><div><b>{a.title}</b> <span className={`pill ${a.level}`}>{a.level === 'warning' ? 'Warning' : 'Information'}</span><p>{a.body}</p><time className="muted">{when(a.created_at)}</time></div>
              <Switch label="Live" checked={!!a.active} onChange={(v) => run(() => adm(`/announcements/${a.id}`, { method: 'PATCH', body: { active: v } })).then(done)} />
              <button className="btn ghost small" onClick={() => run(() => adm(`/announcements/${a.id}`, { method: 'DELETE', body: {} }), 'Announcement deleted').then(done)}>Delete</button></li>))}</ul>
        )}
      </section>
    </>
  );
}

function Transfers({ run }) {
  const [d] = useLoad('/txs', run);
  const { config } = useApp();
  return (
    <>
      <h1>Transfers</h1>
      <p className="lede-s">Transfers users sent from Latch. Wallets sign these on the device; this is a record, not a queue you can alter.</p>
      <section className="card">
        {!d ? <p className="muted pad">Loading…</p> : d.txs.length === 0 ? <div className="empty">No transfers yet.</div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Time</th><th>From wallet</th><th>Network</th><th>To</th><th className="num">Amount</th><th /></tr></thead>
            <tbody>{d.txs.map((t) => { const c = config?.chains.find((x) => x.id === t.chain); return (
              <tr key={t.id}><td>{when(t.created_at)}</td><td className="mono">{shortAddr(t.wallet_id)}</td><td>{c?.name || t.chain}</td><td className="mono">{shortAddr(t.to_addr)}</td><td className="num">{t.amount} {t.symbol}</td><td>{c && <a href={c.explorerTx + t.hash} target="_blank" rel="noreferrer">Explorer</a>}</td></tr>); })}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}

function SettingsPane({ run }) {
  const [d, setD] = useLoad('/settings', run);
  const { reloadConfig } = useApp();
  const [pw, setPw] = useState({ current: '', next: '' });
  const [text, setText] = useState(null);
  if (!d) return <p className="muted">Loading…</p>;
  const s = d.settings;
  const save = (patch, ok) => run(() => adm('/settings', { method: 'PUT', body: patch }), ok).then((r) => { if (r) { setD(r); reloadConfig(); } });
  const draft = text ?? { maintenanceMessage: s.maintenanceMessage, supportEmail: s.supportEmail };
  return (
    <>
      <h1>Settings</h1>
      <section className="card pad rows">
        <div className="row"><div><b>Maintenance mode</b><p>Unlocked wallets see the message below and cannot load balances or send.</p></div><Switch checked={s.maintenance} onChange={(v) => save({ maintenance: v }, v ? 'Maintenance mode is on' : 'Maintenance mode is off')} /></div>
        <div className="row"><div><b>Allow new wallets</b><p>When off, existing wallets keep working and nobody new can register.</p></div><Switch checked={s.allowNewWallets} onChange={(v) => save({ allowNewWallets: v }, 'Saved')} /></div>
        <div className="row"><div><b>Allow sending</b><p>When off, Latch refuses to broadcast transfers on every network.</p></div><Switch checked={s.sendEnabled} onChange={(v) => save({ sendEnabled: v }, 'Saved')} /></div>
        <div className="row"><div><b>Sign every wallet out</b><p>Ends all sessions. Users unlock again with their password.</p></div><button className="btn ghost small" onClick={() => run(() => adm('/sign-out-everyone', { method: 'POST', body: {} }), 'All wallets signed out')}>Sign everyone out</button></div>
      </section>
      <form className="card pad form-grid" onSubmit={(e) => { e.preventDefault(); save(draft, 'Saved').then(() => setText(null)); }}>
        <label className="field span3"><span>Maintenance message</span><textarea rows={2} value={draft.maintenanceMessage} onChange={(e) => setText({ ...draft, maintenanceMessage: e.target.value })} /></label>
        <label className="field span2"><span>Support email shown to users</span><input type="email" value={draft.supportEmail} onChange={(e) => setText({ ...draft, supportEmail: e.target.value })} /></label>
        <div className="actions"><button className="btn primary" disabled={!text}>Save changes</button></div>
      </form>
      <form className="card pad form-grid" onSubmit={(e) => { e.preventDefault(); run(() => adm('/password', { method: 'POST', body: pw }), 'Password changed').then((r) => r && setPw({ current: '', next: '' })); }}>
        <h3>Change admin password</h3>
        <label className="field"><span>Current password</span><input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
        <label className="field"><span>New password, 10 characters or more</span><input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
        <div className="actions"><button className="btn primary" disabled={!pw.current || !pw.next}>Change password</button></div>
      </form>
    </>
  );
}

function Audit({ run }) {
  const [d] = useLoad('/audit', run);
  return (
    <>
      <h1>Audit log</h1>
      <p className="lede-s">Every staff action, newest first.</p>
      <section className="card">
        {!d ? <p className="muted pad">Loading…</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Time</th><th>Staff</th><th>Action</th><th>Detail</th></tr></thead>
            <tbody>{d.audit.map((a) => <tr key={a.id}><td>{when(a.created_at)}</td><td>{a.admin}</td><td><b>{a.action}</b></td><td className="mono">{a.detail.length > 46 ? shortAddr(a.detail, 10) : a.detail}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
