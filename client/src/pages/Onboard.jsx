import React, { useEffect, useMemo, useRef, useState } from 'react';
import { wordlists } from 'ethers';
import { useApp, go } from '../App.jsx';
import { LockCanvas, Wordmark, Notice, Copy } from '../ui.jsx';
import { createPhrase, normalizePhrase, isValidPhrase, deriveAddresses, evmSigner } from '../lib/wallet.js';
import { saveVault, hasVault } from '../lib/vault.js';
import { signIn } from '../lib/api.js';
import { stash } from '../lib/session.js';

const PROMISES = [
  'If I lose the 12 words, nobody can restore my wallet. Not Latch, not anyone.',
  'Anyone who sees the words can take my coins.',
  'Latch staff will never ask me for the words.',
];

function pickQuiz(words) {
  const idx = [...words.keys()].sort(() => Math.random() - 0.5).slice(0, 3).sort((a, b) => a - b);
  return idx.map((i) => {
    const options = new Set([words[i]]);
    while (options.size < 4) { const w = wordlists.en.getWord(Math.floor(Math.random() * 2048)); if (!words.includes(w)) options.add(w); }
    return { i, options: [...options].sort(() => Math.random() - 0.5) };
  });
}

export default function Onboard({ kind }) {
  const { config } = useApp();
  const creating = kind === 'create';
  const [step, setStep] = useState(creating ? 'promise' : 'import');
  const [ticks, setTicks] = useState([false, false, false]);
  const [phrase, setPhrase] = useState('');
  const [revealed, setRevealed] = useState(0);
  const [quiz, setQuiz] = useState([]);
  const [answers, setAnswers] = useState({});
  const [importText, setImportText] = useState('');
  const [pw, setPw] = useState(''), [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [replace, setReplace] = useState(hasVault());
  const timer = useRef(0);

  const words = useMemo(() => (phrase ? phrase.split(' ') : []), [phrase]);
  useEffect(() => () => clearInterval(timer.current), []);

  const blocked = config?.settings?.maintenance || (config && config.settings?.allowNewWallets === false);

  const reveal = () => {
    const p = phrase || createPhrase(12);
    setPhrase(p); setStep('phrase'); setRevealed(0);
    clearInterval(timer.current);
    timer.current = setInterval(() => setRevealed((n) => { if (n >= 12) { clearInterval(timer.current); return n; } return n + 1; }), 110);
  };

  const toQuiz = () => { setQuiz(pickQuiz(words)); setAnswers({}); setError(''); setStep('quiz'); };

  const answer = (q, w) => {
    if (w === words[q.i]) { setError(''); setAnswers((a) => ({ ...a, [q.i]: w })); }
    else setError(`That is not word ${q.i + 1}. Check your paper copy and try again.`);
  };
  const quizDone = quiz.length > 0 && quiz.every((q) => answers[q.i]);

  const submitImport = (e) => {
    e.preventDefault();
    const p = normalizePhrase(importText);
    const n = p ? p.split(' ').length : 0;
    if (![12, 15, 18, 21, 24].includes(n)) return setError(`A backup phrase has 12 or 24 words. You entered ${n}.`);
    if (!isValidPhrase(p)) return setError('These words do not form a valid backup phrase. Check the spelling and the order.');
    setError(''); setPhrase(p); setStep('password');
    return undefined;
  };

  const finish = async (e) => {
    e.preventDefault();
    if (pw.length < 8) return setError('Use at least 8 characters.');
    if (pw !== pw2) return setError('The two passwords do not match.');
    setError(''); setBusy(true);
    try {
      const addresses = deriveAddresses(phrase);
      const signer = evmSigner(phrase);
      const origin = creating ? 'created' : 'imported';
      await signIn(signer, addresses, origin); // register first so a refused sign-up never leaves a half-made wallet
      await saveVault(phrase, pw, { address: addresses.evm, origin, createdAt: Date.now() });
      stash({ phrase, addresses });
      setPulse((n) => n + 1); setStep('done');
      setTimeout(() => go('/wallet'), 1500);
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
    return undefined;
  };

  const lit = step === 'promise' || step === 'import' ? ticks.filter(Boolean).length * (creating ? 1 : 0) : step === 'phrase' ? revealed : 12;
  const order = creating ? ['promise', 'phrase', 'quiz', 'password'] : ['import', 'password'];
  const at = Math.max(0, order.indexOf(step === 'done' ? 'password' : step));

  return (
    <div className="onboard">
      <div className="backdrop" aria-hidden="true" />
      <aside className="onboard-art"><LockCanvas mode="panel" lit={lit} pulse={pulse} /></aside>
      <main className="onboard-flow">
        <header className="flow-head">
          <Wordmark />
          <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={order.length} aria-valuenow={at + 1} aria-label={`Step ${at + 1} of ${order.length}`}>
            {order.map((s, i) => <i key={s} className={i <= at ? 'on' : ''} />)}
          </div>
        </header>

        {replace && (
          <div className="card flow-card">
            <h1>There is already a wallet on this device</h1>
            <p>Continuing replaces it here. If you have not written down its 12 words, open it first and back it up, or those coins are gone for good.</p>
            <div className="actions"><button className="btn primary" onClick={() => go('/wallet')}>Open my existing wallet</button><button className="btn ghost" onClick={() => setReplace(false)}>Replace it</button></div>
          </div>
        )}

        {!replace && blocked && (
          <div className="card flow-card"><h1>New wallets are paused</h1><p>{config.settings.maintenance ? config.settings.maintenanceMessage : 'The Latch team has paused sign-ups for now. Try again later.'}</p><button className="btn ghost" onClick={() => go('/')}>Back to home</button></div>
        )}

        {!replace && !blocked && step === 'promise' && (
          <div className="card flow-card">
            <h1>Three things to know first</h1>
            <p>Latch is not a bank. There is no “forgot my phrase” button, and that is the point.</p>
            <div className="checks">
              {PROMISES.map((t, i) => (
                <label key={t} className={ticks[i] ? 'on' : ''}>
                  <input type="checkbox" checked={ticks[i]} onChange={(e) => setTicks((a) => a.map((v, j) => (j === i ? e.target.checked : v)))} /><span>{t}</span>
                </label>
              ))}
            </div>
            <div className="actions">
              <button className="btn primary" disabled={!ticks.every(Boolean)} onClick={reveal}>Show my 12 words</button>
              <button className="btn ghost" onClick={() => go('/import')}>I already have a phrase</button>
            </div>
          </div>
        )}

        {!replace && !blocked && step === 'phrase' && (
          <div className="card flow-card">
            <h1>Write these down, in order</h1>
            <p>Use pen and paper. Make sure nobody is looking at your screen.</p>
            <ol className="phrase" translate="no">
              {words.map((w, i) => <li key={i} className={i < revealed ? 'in' : ''}><span>{i + 1}</span><b>{i < revealed ? w : ''}</b></li>)}
            </ol>
            <div className="actions">
              <button className="btn primary" disabled={revealed < 12} onClick={toQuiz}>I wrote them down</button>
              <Copy text={phrase} label="Copy words" className="btn ghost" />
            </div>
            <p className="fine">Copying puts the words on your clipboard, where other apps can read them. Paper is safer.</p>
          </div>
        )}

        {!replace && !blocked && step === 'quiz' && (
          <div className="card flow-card">
            <h1>Check your paper copy</h1>
            <p>Pick the right word for each position.</p>
            {quiz.map((q) => (
              <fieldset key={q.i} className="quiz" disabled={!!answers[q.i]}>
                <legend>Word {q.i + 1}</legend>
                <div className="options" translate="no">
                  {q.options.map((w) => <button type="button" key={w} className={`chip ${answers[q.i] === w ? 'right' : ''}`} onClick={() => answer(q, w)}>{w}</button>)}
                </div>
              </fieldset>
            ))}
            <Notice>{error}</Notice>
            <div className="actions">
              <button className="btn primary" disabled={!quizDone} onClick={() => { setError(''); setStep('password'); }}>Continue</button>
              <button className="btn ghost" onClick={() => { setError(''); setStep('phrase'); setRevealed(12); }}>Show the words again</button>
            </div>
          </div>
        )}

        {!replace && !blocked && step === 'import' && (
          <form className="card flow-card" onSubmit={submitImport}>
            <h1>Restore a wallet</h1>
            <p>Enter the 12 or 24 words from Latch, Trust Wallet, MetaMask or any other BIP39 wallet, separated by spaces. They stay in this browser.</p>
            <label className="field"><span>Backup phrase</span>
              <textarea rows={4} autoComplete="off" autoCapitalize="none" spellCheck={false} translate="no" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="word1 word2 word3 …" />
            </label>
            <Notice>{error}</Notice>
            <div className="actions"><button className="btn primary" type="submit">Continue</button><button type="button" className="btn ghost" onClick={() => go('/create')}>Create a new wallet instead</button></div>
          </form>
        )}

        {!replace && !blocked && step === 'password' && (
          <form className="card flow-card" onSubmit={finish}>
            <h1>Set a password for this device</h1>
            <p>It encrypts your wallet in this browser and unlocks Latch here. It is not a backup: on a new device you will need the words.</p>
            <label className="field"><span>Password</span><input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></label>
            <label className="field"><span>Repeat password</span><input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
            <Notice>{error}</Notice>
            <div className="actions"><button className="btn primary" type="submit" disabled={busy}>{busy ? 'Locking your wallet…' : creating ? 'Create wallet' : 'Restore wallet'}</button></div>
          </form>
        )}

        {step === 'done' && (
          <div className="card flow-card done"><h1>{creating ? 'Wallet created' : 'Wallet restored'}</h1><p>Opening it now.</p></div>
        )}
      </main>
    </div>
  );
}
