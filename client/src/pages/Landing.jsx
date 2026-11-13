import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useApp, go } from '../App.jsx';
import { LockCanvas, Wordmark, MarketTable, usd, pct } from '../ui.jsx';
import { hasVault } from '../lib/vault.js';

const HERO_COINS = [
  { glyph: '₿', color: '#F7931A' }, { glyph: 'Ξ', color: '#8C9EFF' }, { glyph: 'S', color: '#14F195' }, { glyph: 'Ð', color: '#C2A633' },
  { glyph: 'T', color: '#FF3B4E' }, { glyph: 'X', color: '#C9D1D9' }, { glyph: 'Ł', color: '#A6B8D4' }, { glyph: 'B', color: '#F3BA2F' },
];

const STEPS = [
  { title: 'Latch makes 12 words on your device', body: 'They are picked at random in your browser from the standard BIP39 word list. They are never sent to us, so there is no copy for anyone to steal or hand over.' },
  { title: 'You write them down on paper', body: 'The 12 words are your wallet. Put them somewhere a fire, a flood or a flatmate will not reach. Skip the screenshot and the notes app.' },
  { title: 'You confirm three words and set a password', body: 'We ask for three of the words to check your paper copy. The password locks Latch on this device only; the words restore your coins anywhere, in any wallet that speaks BIP39.' },
];

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export default function Landing() {
  const { config, markets } = useApp();
  const [stage, setStage] = useState(0);
  const [lit, setLit] = useState(0);
  const [step, setStep] = useState(-1);
  const refs = { backup: useRef(null), markets: useRef(null), cta: useRef(null), hero: useRef(null) };
  const introLit = useRef(0);
  const returning = hasVault();

  // one load sequence: headline rises while the lock assembles and its pins light
  useLayoutEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { introLit.current = 12; setLit(12); return undefined; }
    const ctx = gsap.context(() => {
      gsap.timeline({ delay: 0.2 })
        .from('.hero h1 .w > span', { yPercent: 115, duration: 1.15, ease: 'expo.out', stagger: 0.07 })
        .from('.hero .lede, .hero .actions, .site-nav', { opacity: 0, y: 14, duration: 0.9, ease: 'power3.out', stagger: 0.08 }, 0.55)
        .to(introLit, { current: 12, duration: 1.5, ease: 'none', onUpdate: () => setLit((v) => Math.max(v, Math.round(introLit.current))) }, 1.3);
    });
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const y = window.scrollY, vh = window.innerHeight;
      const tops = ['backup', 'markets', 'cta'].map((k) => refs[k].current?.offsetTop ?? 1e9);
      const s = tops.reduce((sum, top) => sum + clamp((y + vh * 0.85 - top) / (vh * 0.6)), 0);
      setStage(s);
      const b = refs.backup.current;
      if (b) {
        const p = clamp((y + vh * 0.45 - b.offsetTop) / (b.offsetHeight - vh * 0.35));
        setStep(s < 0.5 ? -1 : Math.min(2, Math.floor(p * 3)));
        if (s >= 0.5 && s < 2.5) setLit(Math.round(p * 12));
        else if (introLit.current >= 12) setLit(12);
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = () => go(returning ? '/wallet' : '/create');
  const chains = config?.chains || [];
  const ticker = markets.coins.slice(0, 14);
  const headline = ['Twelve', 'words', 'hold', 'everything.'];

  return (
    <div className="landing">
      <div className="backdrop" aria-hidden="true" />
      <LockCanvas mode="hero" className="fixed" coins={HERO_COINS} stage={stage} lit={lit} />

      <nav className="site-nav">
        <Wordmark />
        <div className="nav-links">
          <a href="#backup" onClick={(e) => { e.preventDefault(); refs.backup.current.scrollIntoView({ behavior: 'smooth' }); }}>How the backup works</a>
          <a href="#markets" onClick={(e) => { e.preventDefault(); refs.markets.current.scrollIntoView({ behavior: 'smooth' }); }}>Live prices</a>
        </div>
        <button className="btn primary small" onClick={start}>{returning ? 'Open my wallet' : 'Create a wallet'}</button>
      </nav>

      <header className="hero" ref={refs.hero}>
        <div className="hero-copy">
          <h1 aria-label={headline.join(' ')}>
            {headline.map((w) => <span className="w" key={w} aria-hidden="true"><span>{w}</span></span>)}
          </h1>
          <p className="lede">
            Latch is a crypto wallet that only you can open. It makes your keys in this browser and hands you a 12-word backup for Bitcoin, Ethereum, Solana and {Math.max(12, chains.length - 3)} more networks. We never see the words, so we can never move your coins.
          </p>
          <div className="actions">
            <button className="btn primary" onClick={start}>{returning ? 'Open my wallet' : 'Create a new wallet'}</button>
            {!returning && <button className="btn ghost" onClick={() => go('/import')}>I already have a phrase</button>}
          </div>
        </div>
        {ticker.length > 0 && (
          <div className="ticker" aria-label="Live prices">
            <div className="ticker-track">
              {[0, 1].map((n) => (
                <div className="ticker-set" key={n} aria-hidden={n === 1}>
                  {ticker.map((c) => <span key={c.id}><b>{c.symbol}</b> {usd(c.price)} <i className={c.d1 >= 0 ? 'up' : 'down'}>{pct(c.d1)}</i></span>)}
                </div>
              ))}
            </div>
          </div>
        )}
      </header>

      <section className="backup" id="backup" ref={refs.backup}>
        <div className="backup-copy">
          <h2>The lock has twelve pins. So does your backup.</h2>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className={step === i ? 'on' : step > i ? 'done' : ''}>
                <span className="step-n">{i + 1}</span>
                <div><h3>{s.title}</h3><p>{s.body}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="markets-section" id="markets" ref={refs.markets}>
        <div className="section-head">
          <h2>Every coin, priced live</h2>
          <p>Track the top {markets.coins.length || 250} coins by market value. Hold and receive on {chains.length || 15} networks from one phrase, and add any ERC-20 or BEP-20 token by its contract address.</p>
        </div>
        <ul className="chain-row" aria-label="Supported networks">
          {chains.map((c) => <li key={c.id}><i style={{ background: c.color }} />{c.name}</li>)}
        </ul>
        <MarketTable markets={markets} initial={10} />
      </section>

      <section className="cta" id="cta" ref={refs.cta}>
        <h2>{returning ? 'Your wallet is on this device.' : 'Two minutes, a pen and a piece of paper.'}</h2>
        <p>{returning ? 'Unlock it with your password.' : 'That is all it takes to hold your own coins.'}</p>
        <div className="actions">
          <button className="btn primary" onClick={start}>{returning ? 'Open my wallet' : 'Create a new wallet'}</button>
          <button className="btn ghost" onClick={() => go('/import')}>Restore from a phrase</button>
        </div>
      </section>

      <footer className="site-foot">
        <Wordmark />
        <p>Latch is self-custody software. Your backup phrase is the only way to restore your wallet; Latch cannot reset it. Crypto prices move fast and you can lose money.</p>
        <a href="#/admin">Staff sign-in</a>
      </footer>
    </div>
  );
}
