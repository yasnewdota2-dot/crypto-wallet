import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './lib/api.js';
import Landing from './pages/Landing.jsx';
import Onboard from './pages/Onboard.jsx';
import Wallet from './pages/Wallet.jsx';
import Admin from './pages/Admin.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);
export const go = (path) => { location.hash = path; };

const routeOf = () => location.hash.replace(/^#/, '') || '/';

export default function App() {
  const [route, setRoute] = useState(routeOf());
  const [config, setConfig] = useState(null);
  const [markets, setMarkets] = useState({ coins: [], stale: true, loading: true });

  const loadConfig = useCallback(() => api('/config').then(setConfig).catch(() => setConfig((c) => c || { offline: true, settings: {}, chains: [], tokens: [], announcements: [] })), []);
  const loadMarkets = useCallback(() => api('/markets').then((m) => setMarkets({ ...m, loading: false })).catch(() => setMarkets((m) => ({ ...m, loading: false }))), []);

  useEffect(() => {
    const onHash = () => { setRoute(routeOf()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    loadConfig(); loadMarkets();
    const t = setInterval(() => { if (!document.hidden) { loadMarkets(); loadConfig(); } }, 90_000);
    return () => { window.removeEventListener('hashchange', onHash); clearInterval(t); };
  }, [loadConfig, loadMarkets]);

  let page;
  if (route.startsWith('/admin')) page = <Admin />;
  else if (route === '/create') page = <Onboard key="create" kind="create" />;
  else if (route === '/import') page = <Onboard key="import" kind="import" />;
  else if (route === '/wallet') page = <Wallet />;
  else page = <Landing />;

  return <Ctx.Provider value={{ config, markets, reloadConfig: loadConfig }}>{page}</Ctx.Provider>;
}
