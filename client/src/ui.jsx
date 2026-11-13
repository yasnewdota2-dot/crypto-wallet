import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createLockScene, createCoinScene } from './three/LockScene.js';

// ---------- formatting ----------
export const usd = (n, compact = false) => {
  if (n == null || Number.isNaN(n)) return '—';
  if (compact) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(n);
  const digits = n !== 0 && Math.abs(n) < 1 ? (Math.abs(n) < 0.01 ? 6 : 4) : 2;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: digits }).format(n);
};
export const pct = (n) => (n == null ? '—' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`);
export const amount = (n) => (n == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: n !== 0 && Math.abs(n) < 1 ? 8 : 4 }).format(n));
export const when = (ts) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export const ago = (ts) => {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

// ---------- 3D canvases ----------
export function LockCanvas({ mode = 'panel', coins = [], stage = 0, lit = 0, pulse = 0, className = '' }) {
  const ref = useRef(null), scene = useRef(null);
  const [failed, setFailed] = useState(false);
  const hasCoins = coins.length > 0;
  useEffect(() => {
    try { scene.current = createLockScene(ref.current, { mode, coins }); scene.current.setStage(stage); scene.current.setLit(lit); }
    catch (e) { console.warn('3D unavailable', e); setFailed(true); }
    return () => { scene.current?.dispose(); scene.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, hasCoins]);
  useEffect(() => { scene.current?.setStage(stage); }, [stage]);
  useEffect(() => { scene.current?.setLit(lit); }, [lit]);
  useEffect(() => { if (pulse) scene.current?.pulse(); }, [pulse]);
  if (failed) return <div className={`lock-fallback ${className}`} aria-hidden="true" />;
  return <canvas ref={ref} className={`lock-canvas ${className}`} aria-hidden="true" />;
}

export function CoinCanvas({ glyph, color }) {
  const ref = useRef(null), scene = useRef(null);
  useEffect(() => {
    try { scene.current = createCoinScene(ref.current, { glyph, color }); } catch { /* no WebGL: the panel still works without the coin */ }
    return () => { scene.current?.dispose(); scene.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } scene.current?.set({ glyph, color }); }, [glyph, color]);
  return <canvas ref={ref} className="coin-canvas" aria-label="3D coin. Drag to spin." />;
}

// ---------- small pieces ----------
export function Wordmark({ onClick }) {
  return (
    <a className="wordmark" href="#/" onClick={onClick} aria-label="Latch home">
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
        <circle cx="16" cy="16" r="11.5" fill="none" stroke="var(--brass)" strokeWidth="4" />
        <circle cx="16" cy="14.4" r="3" fill="var(--bone)" /><path d="M14.2 15.4h3.6l1.2 6.4h-6z" fill="var(--bone)" />
      </svg>
      <span>Latch</span>
    </a>
  );
}

export function Spark({ data, up }) {
  if (!data || data.length < 2) return <span className="spark-empty" />;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${((i / (data.length - 1)) * 100).toFixed(1)} ${(26 - ((v - min) / span) * 24).toFixed(1)}`).join(' ');
  return <svg className="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path d={d} fill="none" stroke={up ? 'var(--mint)' : 'var(--coral)'} strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></svg>;
}

export function CoinIcon({ image, glyph, color, size = 36 }) {
  const [broken, setBroken] = useState(false);
  if (image && !broken) return <img className="coin-icon" src={image} alt="" width={size} height={size} loading="lazy" onError={() => setBroken(true)} />;
  return <span className="coin-icon glyph" style={{ width: size, height: size, background: color || 'var(--brass)', fontSize: size * 0.5 }} aria-hidden="true">{glyph || '•'}</span>;
}

export function Copy({ text, label = 'Copy', className = 'btn ghost small' }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={className} onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1600); } catch { /* clipboard blocked */ } }}>
      {done ? 'Copied' : label}
    </button>
  );
}

export function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header><h2>{title}</h2><button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button></header>
        {children}
      </div>
    </div>
  );
}

export function Notice({ kind = 'error', children }) {
  if (!children) return null;
  return <p className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</p>;
}

// ---------- live market table ----------
export function MarketTable({ markets, initial = 12 }) {
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(initial);
  const rows = useMemo(() => {
    const s = query.trim().toLowerCase();
    return s ? markets.coins.filter((c) => c.name.toLowerCase().includes(s) || c.symbol.toLowerCase().includes(s)) : markets.coins;
  }, [markets.coins, query]);

  if (!markets.coins.length) {
    return <div className="empty">{markets.loading ? 'Loading live prices…' : 'Live prices aren’t available right now. The price feed didn’t respond; this page retries on its own every 90 seconds.'}</div>;
  }
  return (
    <div className="market">
      <div className="market-tools">
        <label className="search"><span className="sr">Search coins</span>
          <input type="search" placeholder={`Search ${markets.coins.length} coins`} value={query} onChange={(e) => { setQuery(e.target.value); setShown(initial); }} />
        </label>
        {markets.stale && <span className="muted">Prices may be a few minutes old</span>}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th className="num hide-s">#</th><th>Coin</th><th className="num">Price</th><th className="num">24 h</th><th className="num hide-s">7 d</th><th className="hide-s">Last 7 days</th><th className="num hide-m">Market cap</th></tr></thead>
          <tbody>
            {rows.slice(0, shown).map((c) => (
              <tr key={c.id}>
                <td className="num muted hide-s">{c.rank ?? ''}</td>
                <td><span className="coin-cell"><CoinIcon image={c.image} glyph={c.symbol[0]} size={28} /><b>{c.name}</b><span className="muted">{c.symbol}</span></span></td>
                <td className="num">{usd(c.price)}</td>
                <td className={`num ${c.d1 >= 0 ? 'up' : 'down'}`}>{pct(c.d1)}</td>
                <td className={`num hide-s ${c.d7 >= 0 ? 'up' : 'down'}`}>{pct(c.d7)}</td>
                <td className="hide-s"><Spark data={c.spark} up={(c.d7 ?? 0) >= 0} /></td>
                <td className="num hide-m">{usd(c.cap, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <div className="empty">No coin matches “{query}”.</div>}
      {rows.length > shown && <button type="button" className="btn ghost" onClick={() => setShown((n) => n + 25)}>Show 25 more</button>}
    </div>
  );
}
