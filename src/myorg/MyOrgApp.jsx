/* ============================================================
   My Org — app shell : charge le snapshot IndexedDB (stores
   myorg_*), route les écrans et expose tout aux pages via `ctx`.
   Thème = thème partagé "univers" (passé par App.jsx).
   100 % local (hors /api/news, /api/article) : aucune clé API
   côté client, aucun localStorage.
   Nav actuelle : Dashboard + News fonctionnels ; Objectifs, Finance,
   Santé en placeholder « Bientôt » (Calendrier et To-do retirés de
   la nav — code et données existants conservés, juste débranchés).
   ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../shared/Icon.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { News } from './pages/News.jsx';
import { Placeholder } from './pages/Placeholder.jsx';
import { NewsReader } from './components/NewsReader.jsx';
import { ensureSchema, getAll, getOne, getMeta, setMeta, put, remove } from './lib/storage.js';

const NEWS_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3h
const DEFAULT_NEWS_LANG = 'fr';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'news', label: 'News', icon: 'newspaper' },
  { id: 'goals', label: 'Objectifs', icon: 'target' },
  { id: 'finance', label: 'Finance', icon: 'euro' },
  { id: 'sante', label: 'Santé', icon: 'heart' },
];

const SCREENS = {
  dashboard: Dashboard,
  news: News,
  goals: (p) => <Placeholder {...p} icon="target" title="Objectifs" />,
  finance: (p) => <Placeholder {...p} icon="euro" title="Finance" />,
  sante: (p) => <Placeholder {...p} icon="heart" title="Santé" />,
};

function OrgSidebar({ current, onNav, expanded, onToggle, onHub }) {
  return (
    <nav className={'sidebar' + (expanded ? ' expanded' : '')}>
      <div className="sb-brand">
        <div className="sb-logo" style={{ background: 'linear-gradient(145deg, var(--accent), color-mix(in srgb, var(--accent) 50%, #4CAF8E))' }}><Icon name="target" size={20} stroke={2} /></div>
        <div className="sb-brand-name">My Org<small>Organisation</small></div>
      </div>
      <div className="sb-nav">
        {NAV.map((n) => (
          <div key={n.id} className={'sb-item' + (current === n.id ? ' active' : '')} onClick={() => onNav(n.id)} title={n.label}>
            <span className="sb-icon"><Icon name={n.icon} size={20} /></span>
            <span className="sb-label">{n.label}</span>
          </div>
        ))}
      </div>
      <div className="sb-spacer" />
      <div className="sb-foot">
        <div className="sb-item" onClick={onHub} title="Accueil — changer d'app">
          <span className="sb-icon"><Icon name="grid" size={20} /></span>
          <span className="sb-label">Changer d'app</span>
        </div>
        <button className="sb-toggle" onClick={onToggle} title={expanded ? 'Réduire' : 'Étendre'}>
          <span className="sb-icon"><Icon name="panel" size={19} /></span>
          <span className="sb-label">Réduire</span>
        </button>
      </div>
    </nav>
  );
}

function OrgBottomNav({ current, onNav }) {
  const items = [
    { id: 'dashboard', label: 'Accueil', icon: 'home' },
    { id: 'news', label: 'News', icon: 'newspaper' },
    { id: 'goals', label: 'Objectifs', icon: 'target' },
    { id: 'finance', label: 'Finance', icon: 'euro' },
    { id: 'sante', label: 'Santé', icon: 'heart' },
  ];
  return (
    <nav className="bottom-nav">
      {items.map((n) => (
        <button key={n.id} className={'bn-item' + (current === n.id ? ' active' : '')} onClick={() => onNav(n.id)}>
          <span className="bn-ic"><Icon name={n.icon} size={21} /></span>
          {n.label}
        </button>
      ))}
    </nav>
  );
}

export default function MyOrgApp({ themeApi, goHub }) {
  const { theme, toggleTheme } = themeApi;
  const [screen, setScreen] = useState('dashboard');
  const [expanded, setExpanded] = useState(false);
  const [db, setDb] = useState(null);
  const [newsLang, setNewsLangState] = useState(DEFAULT_NEWS_LANG);
  const [newsCache, setNewsCache] = useState(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsReaderItem, setNewsReaderItem] = useState(null);

  // todos/goals conservés (stores existants) même si non routés pour l'instant
  const reload = useCallback(async () => {
    const [todos, goals, newsReadRecs] = await Promise.all([
      getAll('todos'), getAll('goals'), getAll('newsRead'),
    ]);
    setDb({
      todos: todos || [],
      goals: goals || [],
      newsReadUrls: new Set((newsReadRecs || []).map((r) => r.id)),
    });
  }, []);

  const loadNewsCache = useCallback(async (lang) => {
    const rec = await getOne('newsCache', 'latest_' + lang);
    setNewsCache(rec || null);
  }, []);

  // fetch /api/news?lang=… si le cache (de cette langue) est absent/périmé (>3h) ou si `force`
  const refreshNews = useCallback(async (lang, force = false) => {
    const rec = await getOne('newsCache', 'latest_' + lang);
    const stale = !rec || (Date.now() - (rec.ts || 0) > NEWS_CACHE_TTL_MS);
    if (!force && !stale) { setNewsCache(rec); return; }
    setNewsLoading(true);
    try {
      const res = await fetch('/api/news?lang=' + lang);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const payload = await res.json();
      const newRec = { id: 'latest_' + lang, payload, ts: Date.now() };
      await put('newsCache', newRec);
      setNewsCache(newRec);
    } catch (err) {
      console.error('Rafraîchissement des actus impossible', err);
    } finally {
      setNewsLoading(false);
    }
  }, []);

  const setNewsLang = useCallback(async (lang) => {
    if (lang === newsLang) return;
    setNewsLangState(lang);
    await setMeta('newsLang', lang);
    await loadNewsCache(lang);
    refreshNews(lang, false);
  }, [newsLang, loadNewsCache, refreshNews]);

  useEffect(() => {
    (async () => {
      await ensureSchema();
      await reload();
      const lang = (await getMeta('newsLang')) || DEFAULT_NEWS_LANG;
      setNewsLangState(lang);
      await loadNewsCache(lang);
      refreshNews(lang, false);
    })();
  }, [reload, loadNewsCache, refreshNews]);

  const markNewsRead = useCallback(async (url) => {
    if (!url) return;
    await put('newsRead', { id: url, readAt: new Date().toISOString() });
    await reload();
  }, [reload]);

  const forgetNewsRead = useCallback(async (url) => {
    await remove('newsRead', url);
    await reload();
  }, [reload]);

  const openNewsReader = useCallback((item) => {
    setNewsReaderItem(item);
    if (item?.url) markNewsRead(item.url);
  }, [markNewsRead]);

  const closeNewsReader = useCallback(() => setNewsReaderItem(null), []);

  const ctx = {
    theme, toggleTheme, goHub,
    go: setScreen,
    db, reload,
    // ---- mutations (persist + reload) — Todos/Goals gardés en réserve ----
    saveTodo: async (t) => { await put('todos', t); await reload(); },
    deleteTodo: async (id) => { await remove('todos', id); await reload(); },
    saveGoal: async (g) => { await put('goals', g); await reload(); },
    deleteGoal: async (id) => { await remove('goals', id); await reload(); },
    // ---- news ----
    newsLang,
    setNewsLang,
    newsCache,
    newsLoading,
    refreshNews: (force) => refreshNews(newsLang, force),
    markNewsRead,
    forgetNewsRead,
    openNewsReader,
  };

  if (!db) {
    return <div className="soon"><div className="soon-logo"><Icon name="target" size={30} /></div><p>Chargement de My Org…</p></div>;
  }

  const Current = SCREENS[screen] || Dashboard;
  return (
    <div className="app">
      <OrgSidebar current={screen} onNav={setScreen} expanded={expanded} onToggle={() => setExpanded((v) => !v)} onHub={goHub} />
      <div className="main">
        <Current ctx={ctx} key={screen} />
      </div>
      <OrgBottomNav current={screen} onNav={setScreen} />
      {newsReaderItem && <NewsReader item={newsReaderItem} onClose={closeNewsReader} />}
    </div>
  );
}
