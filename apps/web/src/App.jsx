import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { makeT } from './i18n.js';
import { call } from './api.js';
import { Icon } from './components/ui.jsx';
import Today from './screens/Today.jsx';
import Recipes from './screens/Recipes.jsx';
import ImportScreen from './screens/Import.jsx';
import Pantry from './screens/Pantry.jsx';
import Menu from './screens/Menu.jsx';
import Shopping from './screens/Shopping.jsx';
import Prices from './screens/Prices.jsx';
import Settings from './screens/Settings.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export const NAV = [
  { id: 'today', icon: 'today' }, { id: 'recipes', icon: 'recipes' }, { id: 'import', icon: 'import' }, { id: 'pantry', icon: 'pantry' },
  { id: 'menu', icon: 'menu' }, { id: 'shopping', icon: 'shopping' }, { id: 'prices', icon: 'prices' }, { id: 'settings', icon: 'settings' },
];
const MOBILE_MAIN = ['today', 'recipes', 'import', 'pantry', 'shopping'];

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const screen = NAV.some((n) => n.id === parts[0]) ? parts[0] : 'today';
  return { screen, params: parts.slice(1) };
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [lang, setLangState] = useState(() => { try { return localStorage.getItem('cookhoard.lang') || 'es'; } catch { return 'es'; } });
  const [toasts, setToasts] = useState([]);
  const [counts, setCounts] = useState({});
  const [moreOpen, setMoreOpen] = useState(false);
  const t = useMemo(() => makeT(lang), [lang]);

  useEffect(() => { const onHash = () => { setRoute(parseHash()); setMoreOpen(false); window.scrollTo(0, 0); }; window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => { call('settings_get').then((s) => { if (s.lang && s.lang !== lang) { setLangState(s.lang); try { localStorage.setItem('cookhoard.lang', s.lang); } catch { /* ignore */ } } }).catch(() => {}); /* eslint-disable-next-line */ }, []);

  const go = useCallback((screen, ...params) => { location.hash = `#/${[screen, ...params].map(encodeURIComponent).join('/')}`; }, []);
  const toast = useCallback((message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list, { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 4500);
  }, []);
  const setLang = useCallback((next) => { setLangState(next); try { localStorage.setItem('cookhoard.lang', next); } catch { /* ignore */ } call('settings_set', { settings: { lang: next } }).catch(() => {}); }, []);
  const refreshCounts = useCallback(() => {
    call('today_overview', { dinners: 1 }).then((v) => setCounts({ import: v.drafts_pending + v.review_queue, shopping: v.shopping_to_buy })).catch(() => {});
  }, []);
  useEffect(() => { refreshCounts(); }, [route.screen, refreshCounts]);

  const value = useMemo(() => ({ t, lang, setLang, go, route, toast, refreshCounts }), [t, lang, setLang, go, route, toast, refreshCounts]);
  const Screen = { today: Today, recipes: Recipes, import: ImportScreen, pantry: Pantry, menu: Menu, shopping: Shopping, prices: Prices, settings: Settings }[route.screen];
  const cooking = route.screen === 'recipes' && route.params[1] === 'cook';

  return (
    <Ctx.Provider value={value}>
      <div className={`shell ${cooking ? 'shell-cooking' : ''}`}>
        <aside className="sidebar" aria-label="CookHoard">
          <a className="brand" href="#/today"><img src="/icon-192.png" alt="" width="36" height="36" /><span><b className="hoard-brand">{t('app')}</b><small>{t('tagline')}</small></span></a>
          <nav>
            {NAV.map((n) => (
              <a key={n.id} href={`#/${n.id}`} className={route.screen === n.id ? 'on' : ''} aria-current={route.screen === n.id ? 'page' : undefined}>
                <Icon name={n.icon} /><span>{t(`nav.${n.id}`)}</span>{counts[n.id] ? <span className="count">{counts[n.id]}</span> : null}
              </a>
            ))}
          </nav>
        </aside>
        <main id="main"><Screen key={route.screen} /></main>
        <nav className="tabbar" aria-label="CookHoard">
          {MOBILE_MAIN.map((id) => (
            <a key={id} href={`#/${id}`} className={route.screen === id ? 'on' : ''}><Icon name={NAV.find((n) => n.id === id).icon} /><span>{t(`nav.${id}`)}</span>{counts[id] ? <i className="dot" /> : null}</a>
          ))}
          <button className={!MOBILE_MAIN.includes(route.screen) ? 'on' : ''} onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}><Icon name="more" /><span>{t('nav.more')}</span></button>
          {moreOpen ? (
            <div className="more-sheet">
              {NAV.filter((n) => !MOBILE_MAIN.includes(n.id)).map((n) => <a key={n.id} href={`#/${n.id}`}><Icon name={n.icon} /><span>{t(`nav.${n.id}`)}</span></a>)}
            </div>
          ) : null}
        </nav>
        <div className="toasts" aria-live="polite">{toasts.map((x) => <div key={x.id} className={`toast toast-${x.tone}`}>{x.message}</div>)}</div>
      </div>
    </Ctx.Provider>
  );
}
