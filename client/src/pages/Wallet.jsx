import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAddress } from 'ethers';
import QRCode from 'qrcode';
import { useApp, go } from '../App.jsx';
import { LockCanvas, CoinCanvas, CoinIcon, Wordmark, Notice, Copy, Modal, MarketTable, usd, pct, amount as fmtAmount, when } from '../ui.jsx';
import { deriveAddresses, evmSigner, shortAddr } from '../lib/wallet.js';
import { readVault, openVault, removeVault, hasVault } from '../lib/vault.js';
import { api, signIn, setWalletToken, prepareSend, maxNative, fmtUnits } from '../lib/api.js';
import { take } from '../lib/session.js';

const AUTO_LOCK_MS = 10 * 60 * 1000;

function useNarrow() {
  const mq = useMemo(() => window.matchMedia('(max-width: 980px)'), []);
  const [narrow, setNarrow] = useState(mq.matches);
  useEffect(() => { const on = () => setNarrow(mq.matches); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }, [mq]);
  return narrow;
}

export default function Wallet() {
  const [session, setSession] = useState(() => take());
  const lock = useCallback(() => { setWalletToken(null); setSession(null); }, []);
  if (!hasVault()) {
    return (
      <Shell>
        <div className="card flow-card centered">
          <h1>No wallet on this device yet</h1>
          <p>Create one, or restore yours with its 12 words.</p>
          <div className="actions"><button className="btn primary" onClick={() => go('/create')}>Create a new wallet</button><button className="btn ghost" onClick={() => go('/import')}>Restore from a phrase</button></div>
        </div>
      </Shell>
    );
  }
  if (!session) return <Unlock onOpen={setSession} />;
  return <Dashboard session={session} onLock={lock} />;
}

function Shell({ children }) {
  return <div className="app-shell"><div className="backdrop deep" aria-hidden="true" /><header className="app-bar"><Wordmark /></header><main className="app-main">{children}</main></div>;
}

function Unlock({ onOpen }) {
  const vault = readVault();
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [lit, setLit] = useState(0);

  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const phrase = await openVault(pw);
      const addresses = deriveAddresses(phrase);
      await signIn(evmSigner(phrase), addresses, vault.origin);
      setLit(12); setPulse((n) => n + 1);
      setTimeout(() => onOpen({ phrase, addresses }), 900);
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <div className="onboard">
      <div className="backdrop" aria-hidden="true" />
      <aside className="onboard-art"><LockCanvas mode="panel" lit={lit} pulse={pulse} /></aside>
      <main className="onboard-flow">
        <header className="flow-head"><Wordmark /></header>
        <form className="card flow-card" onSubmit={submit}>
          <h1>Unlock your wallet</h1>
          <p translate="no" className="addr-line">{shortAddr(vault.address, 8)}</p>
          <label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></label>
          <Notice>{error}</Notice>
          <div className="actions">
            <button className="btn primary" type="submit" disabled={busy || !pw}>{busy ? 'Unlocking…' : 'Unlock'}</button>
            <button type="button" className="btn ghost" onClick={() => go('/import')}>Forgot password? Restore with your words</button>
          </div>
        </form>
      </main>
    </div>
  );
}

function Dashboard({ session, onLock }) {
  const { config, markets } = useApp();
  const narrow = useNarrow();
  const [balances, setBalances] = useState(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState(null);
  const [tab, setTab] = useState('assets');
  const [selected, setSelected] = useState('bitcoin');
  const [detailOpen, setDetailOpen] = useState(false);
  const [modal, setModal] = useState(null); // { type: 'send' | 'receive', asset }
  const [filter, setFilter] = useState('');
  const [hideZero, setHideZero] = useState(false);
  const [txs, setTxs] = useState([]);
  const signer = useMemo(() => evmSigner(session.phrase), [session.phrase]);

  const load = useCallback(async () => {
    try {
      const { balances: b } = await api('/wallet/balances', { auth: true });
      setBalances(Object.fromEntries(b.map((x) => [x.key, x]))); setProblem(null);
    } catch (e) {
      if (e.status === 401) return onLock();
      setProblem({ status: e.status, message: e.message });
    } finally { setLoading(false); }
    return undefined;
  }, [onLock]);
  const loadTxs = useCallback(() => api('/wallet/txs', { auth: true }).then((r) => setTxs(r.txs)).catch(() => {}), []);

  useEffect(() => { load(); loadTxs(); const t = setInterval(() => { if (!document.hidden) load(); }, 30_000); return () => clearInterval(t); }, [load, loadTxs]);

  // lock after ten idle minutes
  useEffect(() => {
    let t = setTimeout(onLock, AUTO_LOCK_MS);
    const reset = () => { clearTimeout(t); t = setTimeout(onLock, AUTO_LOCK_MS); };
    const evs = ['pointerdown', 'keydown', 'scroll'];
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => { clearTimeout(t); evs.forEach((e) => window.removeEventListener(e, reset)); };
  }, [onLock]);

  const coinById = useMemo(() => Object.fromEntries(markets.coins.map((c) => [c.id, c])), [markets.coins]);

  const assets = useMemo(() => {
    if (!config) return [];
    const out = [];
    for (const c of config.chains) {
      const mk = (key, o) => {
        const bal = balances?.[key]; const m = coinById[o.cg];
        const raw = bal?.raw ?? null;
        const qty = raw != null ? Number(fmtUnits(raw, o.decimals)) : null;
        return { key, chain: c, ...o, address: session.addresses[c.addressKey], raw, qty, price: m?.price ?? null, d1: m?.d1 ?? null, image: m?.image, value: qty != null && m ? qty * m.price : qty === 0 ? 0 : null };
      };
      out.push(mk(c.id, { symbol: c.symbol, name: c.name, decimals: c.decimals, cg: c.cg, color: c.color, glyph: c.glyph, native: true }));
      for (const t of config.tokens.filter((t) => t.chain === c.id)) out.push(mk(`${c.id}:${t.contract}`, { symbol: t.symbol, name: t.name, decimals: t.decimals, cg: t.cg, color: c.color, glyph: t.symbol[0], contract: t.contract }));
    }
    return out;
  }, [config, balances, coinById, session.addresses]);

  const total = assets.reduce((s, a) => s + (a.value || 0), 0);
  const dayAgo = assets.reduce((s, a) => s + (a.value ? a.value / (1 + (a.d1 || 0) / 100) : 0), 0);
  const change = dayAgo > 0 ? ((total - dayAgo) / dayAgo) * 100 : null;
  const unknown = balances ? assets.filter((a) => a.raw == null).length : 0;

  const list = assets
    .filter((a) => !filter || `${a.name} ${a.symbol} ${a.chain.name}`.toLowerCase().includes(filter.toLowerCase()))
    .filter((a) => !hideZero || (a.qty || 0) > 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0));
  const current = assets.find((a) => a.key === selected) || assets[0];

  if (problem?.status === 503 || config?.settings?.maintenance) {
    return <Shell><div className="card flow-card centered"><h1>Latch is down for maintenance</h1><p>{problem?.message || config.settings.maintenanceMessage}</p><button className="btn ghost" onClick={onLock}>Lock wallet</button></div></Shell>;
  }
  if (problem?.status === 403) {
    return <Shell><div className="card flow-card centered"><h1>This wallet is suspended on Latch</h1><p>Your coins are still yours. Restore your 12 words in any other BIP39 wallet to use them, or write to {config?.settings?.supportEmail}.</p><button className="btn ghost" onClick={onLock}>Lock wallet</button></div></Shell>;
  }

  const detail = current && (
    <AssetDetail asset={current} sendEnabled={config?.settings?.sendEnabled !== false}
      onSend={() => { setDetailOpen(false); setModal({ type: 'send', asset: current }); }}
      onReceive={() => { setDetailOpen(false); setModal({ type: 'receive', asset: current }); }} />
  );

  return (
    <div className="app-shell">
      <div className="backdrop deep" aria-hidden="true" />
      <header className="app-bar">
        <Wordmark />
        <div className="bar-right">
          <Copy text={session.addresses.evm} label={shortAddr(session.addresses.evm, 5)} className="btn ghost small mono" />
          <button className="btn ghost small" onClick={onLock}>Lock</button>
        </div>
      </header>

      <main className="app-main">
        {config?.announcements?.map((a) => (
          <div key={a.id} className={`banner ${a.level}`} role="status"><b>{a.title}</b>{a.body && <span>{a.body}</span>}</div>
        ))}

        <section className="summary">
          <div>
            <p className="label">Total balance</p>
            <p className="total">{loading ? <span className="shimmer">$0,000.00</span> : usd(total)}</p>
            <p className="sub">
              {change != null && <span className={change >= 0 ? 'up' : 'down'}>{pct(change)} today</span>}
              {!loading && total === 0 && <span>Nothing here yet. Receive coins to get started.</span>}
              {unknown > 0 && <span className="muted">{unknown} balance{unknown > 1 ? 's' : ''} could not be read; total may be incomplete.</span>}
            </p>
          </div>
          <div className="actions">
            <button className="btn primary" onClick={() => setModal({ type: 'receive', asset: current })}>Receive</button>
            <button className="btn ghost" onClick={() => setModal({ type: 'send', asset: current?.chain.family === 'evm' ? current : assets.find((a) => a.key === 'ethereum') || current })}>Send</button>
            <button className="btn ghost" onClick={() => { setLoading(true); load(); }} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
          </div>
        </section>
        {problem && <Notice>{problem.message}</Notice>}

        <div className="tabs" role="tablist">
          {[['assets', 'Assets'], ['markets', 'Prices'], ['activity', 'Activity'], ['settings', 'Backup and settings']].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>

        {tab === 'assets' && (
          <div className="assets-grid">
            <section className="card asset-list">
              <div className="list-tools">
                <label className="search"><span className="sr">Filter assets</span><input type="search" placeholder="Filter assets" value={filter} onChange={(e) => setFilter(e.target.value)} /></label>
                <label className="toggle"><input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} /><span>Hide empty</span></label>
              </div>
              <ul>
                {list.map((a) => (
                  <li key={a.key}>
                    <button className={`asset-row ${current?.key === a.key ? 'on' : ''}`} onClick={() => { setSelected(a.key); setDetailOpen(true); }}>
                      <CoinIcon image={a.image} glyph={a.glyph} color={a.color} />
                      <span className="a-name"><b>{a.symbol}</b><small>{a.native ? a.name : `${a.name} on ${a.chain.name}`}</small></span>
                      <span className="a-price hide-s">{a.price != null ? usd(a.price) : a.chain.testnet ? 'Test coin' : '—'}<small className={a.d1 >= 0 ? 'up' : 'down'}>{a.d1 != null ? pct(a.d1) : ''}</small></span>
                      <span className="a-bal">{a.raw == null ? (loading ? '…' : 'Unavailable') : fmtAmount(a.qty)}<small>{a.value != null ? usd(a.value) : ''}</small></span>
                    </button>
                  </li>
                ))}
              </ul>
              {!list.length && <div className="empty">{hideZero && !filter ? 'Every asset is empty. Turn off “Hide empty” to see them all.' : 'No asset matches that filter.'}</div>}
            </section>
            {!narrow && <aside className="card asset-detail">{detail}</aside>}
            {narrow && detailOpen && current && <Modal title={`${current.symbol} on ${current.chain.name}`} onClose={() => setDetailOpen(false)}>{detail}</Modal>}
          </div>
        )}

        {tab === 'markets' && <section className="card pad"><MarketTable markets={markets} initial={25} /></section>}

        {tab === 'activity' && (
          <section className="card pad">
            {txs.length === 0 ? <div className="empty">No sends yet. Transfers you make from Latch are listed here. To see incoming transfers, open an asset and view its address on the block explorer.</div> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Sent</th><th>Network</th><th>To</th><th className="num">Amount</th><th /></tr></thead>
                <tbody>{txs.map((t) => { const c = config.chains.find((x) => x.id === t.chain); return (
                  <tr key={t.hash}><td>{when(t.created_at)}</td><td>{c?.name || t.chain}</td><td className="mono">{shortAddr(t.to_addr)}</td><td className="num">{t.amount} {t.symbol}</td><td>{c && <a href={c.explorerTx + t.hash} target="_blank" rel="noreferrer">View on explorer</a>}</td></tr>); })}</tbody>
              </table></div>
            )}
          </section>
        )}

        {tab === 'settings' && <Settings session={session} chains={config?.chains || []} onLock={onLock} />}
      </main>

      {modal?.type === 'receive' && modal.asset && <Receive asset={modal.asset} onClose={() => setModal(null)} />}
      {modal?.type === 'send' && modal.asset && <Send asset={modal.asset} assets={assets} signer={signer} enabled={config?.settings?.sendEnabled !== false} onClose={() => setModal(null)} onSent={() => { load(); loadTxs(); }} />}
    </div>
  );
}

function AssetDetail({ asset, onSend, onReceive, sendEnabled }) {
  const evm = asset.chain.family === 'evm';
  return (
    <div className="detail">
      <CoinCanvas glyph={asset.glyph} color={asset.color} />
      <h2>{asset.native ? asset.name : `${asset.name} on ${asset.chain.name}`}</h2>
      <p className="detail-bal">{asset.raw == null ? '—' : fmtAmount(asset.qty)} <span>{asset.symbol}</span></p>
      <p className="muted">{asset.value != null ? usd(asset.value) : asset.chain.testnet ? 'Test coins have no market price' : 'Balance not available right now'}{asset.price != null && ` at ${usd(asset.price)} each`}</p>
      <div className="actions">
        <button className="btn primary" onClick={onReceive}>Receive</button>
        <button className="btn ghost" onClick={onSend} disabled={!evm || !sendEnabled}>Send</button>
      </div>
      {!evm && <p className="fine">Latch can hold and receive {asset.symbol}. Sending from Latch works on Ethereum-compatible networks for now; to move {asset.symbol}, restore your 12 words in a wallet that sends on {asset.chain.name}.</p>}
      {evm && !sendEnabled && <p className="fine">Sending is paused by the Latch team right now.</p>}
      <div className="addr-box"><span className="label">Your {asset.chain.name} address</span><code translate="no">{asset.address}</code>
        <div className="actions"><Copy text={asset.address} label="Copy address" /><a className="btn ghost small" href={asset.chain.explorerAddr + asset.address} target="_blank" rel="noreferrer">View on explorer</a></div>
      </div>
    </div>
  );
}

function Receive({ asset, onClose }) {
  const [qr, setQr] = useState('');
  useEffect(() => { QRCode.toDataURL(asset.address, { margin: 1, width: 440, color: { dark: '#070b33', light: '#f2eee3' } }).then(setQr).catch(() => {}); }, [asset.address]);
  return (
    <Modal title={`Receive ${asset.symbol}`} onClose={onClose}>
      <div className="receive">
        {qr ? <img src={qr} alt={`QR code for ${asset.address}`} width="220" height="220" /> : <div className="qr-blank" />}
        <p>Send only <b>{asset.symbol}</b> on <b>{asset.chain.name}</b> to this address. Coins sent on another network may be lost.</p>
        <code translate="no">{asset.address}</code>
        <Copy text={asset.address} label="Copy address" className="btn primary" />
      </div>
    </Modal>
  );
}

function Send({ asset, assets, signer, enabled, onClose, onSent }) {
  const chain = asset.chain;
  const native = assets.find((a) => a.key === chain.id);
  const [to, setTo] = useState('');
  const [qty, setQty] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [quote, setQuote] = useState(null);
  const [hash, setHash] = useState('');
  const evm = chain.family === 'evm';

  const clean = (e) => {
    const m = e?.shortMessage || e?.message || '';
    if (/insufficient funds/i.test(m)) return `Not enough ${native.symbol} on ${chain.name} to cover the amount plus the network fee.`;
    if (/paused/i.test(m)) return 'Sending is paused by the Latch team right now.';
    if (/exceeds balance|transfer amount/i.test(m)) return `You don’t have that much ${asset.symbol}.`;
    return m ? `The network rejected this transfer: ${m.slice(0, 160)}` : 'The transfer could not be prepared. Try again.';
  };

  const review = async (e) => {
    e.preventDefault(); setError('');
    if (!isAddress(to.trim())) return setError(`Enter a valid ${chain.name} address. It starts with 0x and has 42 characters.`);
    const n = Number(qty);
    if (!qty || !Number.isFinite(n) || n <= 0) return setError('Enter an amount greater than zero.');
    if (asset.qty != null && n > asset.qty) return setError(`You have ${fmtAmount(asset.qty)} ${asset.symbol} available.`);
    setBusy('review');
    try { setQuote(await prepareSend({ signer, chain, asset, to: to.trim(), amount: qty })); }
    catch (err) { setError(clean(err)); }
    setBusy('');
    return undefined;
  };

  const confirm = async () => {
    setBusy('send'); setError('');
    try {
      const h = await quote.send();
      setHash(h);
      api('/wallet/tx', { method: 'POST', auth: true, body: { chain: chain.id, symbol: asset.symbol, hash: h, to: to.trim(), amount: qty } }).catch(() => {}).finally(onSent);
    } catch (err) { setError(clean(err)); }
    setBusy('');
  };

  const max = async () => {
    setError('');
    if (asset.raw == null) return;
    if (asset.contract) return setQty(fmtUnits(asset.raw, asset.decimals));
    try { setQty(await maxNative({ signer, chain, rawBalance: asset.raw })); } catch { setQty(fmtUnits(asset.raw, asset.decimals)); }
  };

  const fee = quote ? Number(fmtUnits(quote.feeWei, 18)) : 0;

  return (
    <Modal title={`Send ${asset.symbol}`} onClose={onClose}>
      {!evm ? (
        <div className="send"><p>Latch can hold and receive {asset.symbol}, but sending from Latch works on Ethereum-compatible networks for now. To move {asset.symbol}, restore your 12 words in a wallet that sends on {chain.name}.</p><button className="btn ghost" onClick={onClose}>Close</button></div>
      ) : !enabled ? (
        <div className="send"><p>Sending is paused by the Latch team right now. Your coins have not moved.</p><button className="btn ghost" onClick={onClose}>Close</button></div>
      ) : hash ? (
        <div className="send done">
          <h3>Sent</h3>
          <p>{qty} {asset.symbol} is on its way to <span className="mono">{shortAddr(to.trim())}</span>. The network usually confirms within a minute.</p>
          <div className="actions"><a className="btn primary" href={chain.explorerTx + hash} target="_blank" rel="noreferrer">View on explorer</a><button className="btn ghost" onClick={onClose}>Done</button></div>
        </div>
      ) : quote ? (
        <div className="send">
          <dl className="review">
            <div><dt>Send</dt><dd>{qty} {asset.symbol}{asset.price != null && <small>{usd(Number(qty) * asset.price)}</small>}</dd></div>
            <div><dt>To</dt><dd className="mono wrap" translate="no">{to.trim()}</dd></div>
            <div><dt>Network</dt><dd>{chain.name}</dd></div>
            <div><dt>Network fee, up to</dt><dd>{fmtAmount(fee)} {native.symbol}{native.price != null && <small>{usd(fee * native.price)}</small>}</dd></div>
          </dl>
          <p className="fine">Transfers cannot be reversed. Check the address character by character.</p>
          <Notice>{error}</Notice>
          <div className="actions"><button className="btn primary" onClick={confirm} disabled={!!busy}>{busy ? 'Sending…' : `Send ${qty} ${asset.symbol}`}</button><button className="btn ghost" onClick={() => { setQuote(null); setError(''); }} disabled={!!busy}>Back</button></div>
        </div>
      ) : (
        <form className="send" onSubmit={review}>
          <p className="muted">From your {chain.name} address. Available: {asset.raw == null ? '—' : fmtAmount(asset.qty)} {asset.symbol}</p>
          <label className="field"><span>Recipient address</span><input className="mono" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} autoFocus /></label>
          <label className="field"><span>Amount in {asset.symbol}</span>
            <span className="with-btn"><input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))} placeholder="0.0" /><button type="button" className="btn ghost small" onClick={max}>Max</button></span>
          </label>
          <Notice>{error}</Notice>
          <div className="actions"><button className="btn primary" type="submit" disabled={!!busy}>{busy ? 'Checking the fee…' : 'Review transfer'}</button></div>
        </form>
      )}
    </Modal>
  );
}

function Settings({ session, chains, onLock }) {
  const [pw, setPw] = useState('');
  const [words, setWords] = useState(null);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState('');
  const hideTimer = useRef(0);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const reveal = async (e) => {
    e.preventDefault(); setError('');
    try { const p = await openVault(pw); setWords(p.split(' ')); setPw(''); hideTimer.current = setTimeout(() => setWords(null), 60_000); }
    catch (err) { setError(err.message); }
  };
  const seen = new Set();
  const rows = chains.filter((c) => (seen.has(c.addressKey) ? false : seen.add(c.addressKey)));

  return (
    <div className="settings-grid">
      <section className="card pad">
        <h2>Backup phrase</h2>
        <p>These 12 words restore your wallet on any device. Anyone who sees them can take your coins.</p>
        {words ? (
          <>
            <ol className="phrase" translate="no">{words.map((w, i) => <li key={i} className="in"><span>{i + 1}</span><b>{w}</b></li>)}</ol>
            <div className="actions"><button className="btn ghost" onClick={() => setWords(null)}>Hide words</button></div>
            <p className="fine">The words hide themselves after a minute.</p>
          </>
        ) : (
          <form onSubmit={reveal}>
            <label className="field"><span>Enter your password to show them</span><input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
            <Notice>{error}</Notice>
            <div className="actions"><button className="btn primary" type="submit" disabled={!pw}>Show backup phrase</button></div>
          </form>
        )}
      </section>

      <section className="card pad">
        <h2>Your addresses</h2>
        <p>One phrase, one address per network family. Ethereum-compatible networks share an address.</p>
        <ul className="addr-list">
          {rows.map((c) => (
            <li key={c.addressKey}><span><b>{c.family === 'evm' ? 'Ethereum and EVM networks' : c.name}</b><code translate="no">{session.addresses[c.addressKey]}</code></span><Copy text={session.addresses[c.addressKey]} /></li>
          ))}
        </ul>
      </section>

      <section className="card pad danger">
        <h2>Remove wallet from this device</h2>
        <p>This deletes the encrypted wallet from this browser. Your coins stay on-chain, and you can restore them with the 12 words. Without the words they are lost.</p>
        <label className="field"><span>Type REMOVE to confirm</span><input value={confirmRemove} onChange={(e) => setConfirmRemove(e.target.value)} autoComplete="off" /></label>
        <div className="actions">
          <button className="btn danger" disabled={confirmRemove !== 'REMOVE'} onClick={() => { removeVault(); onLock(); go('/'); }}>Remove wallet</button>
          <button className="btn ghost" onClick={onLock}>Lock now</button>
        </div>
        <p className="fine">Latch locks itself after 10 minutes without activity.</p>
      </section>
    </div>
  );
}
