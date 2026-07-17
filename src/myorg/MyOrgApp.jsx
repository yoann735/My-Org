/* ============================================================
   My Org — app shell : charge le snapshot IndexedDB (stores
   myorg_*), route les écrans et expose tout aux pages via `ctx`.
   Thème = thème partagé "univers" (passé par App.jsx).
   100 % local : aucune IA, aucun réseau, aucun localStorage.
   ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../shared/Icon.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { News } from './pages/News.jsx';
import { Todos } from './pages/Todos.jsx';
import { Goals } from './pages/Goals.jsx';
import { Placeholder } from './pages/Placeholder.jsx';
import { NewsReader } from './components/NewsReader.jsx';
import { ensureSchema, getAll, getOne, put, remove } from './lib/storage.js';

const NEWS_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3h

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'news', label: 'News', icon: 'newspaper' },
  { id: 'calendrier', label: 'Calendrier', icon: 'calendar' },
  { id: 'todos', label: 'To-do', icon: 'check' },
  { id: 'finance', label: 'Finance', icon: 'euro' },
  { id: 'sante', label: 'Santé', icon: 'heart' },
  { id: 'goals', label: 'Objectifs', icon: 'target' },
];

const SCREENS = {
  dashboard: Dashboard,
  news: News,
  todos: Todos,
  goals: Goals,
  calendrier: (p) => <Placeholder {...p} icon="calendar" title="Calendrier" />,
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
  // libellés courts (6 entrées sur mobile)
  const items = [
    { id: 'dashboard', label: 'Accueil', icon: 'home' },
    { id: 'news', label: 'News', icon: 'newspaper' },
    { id: 'calendrier', label: 'Agenda', icon: 'calendar' },
    { id: 'todos', label: 'To-do', icon: 'check' },
    { id: 'finance', label: 'Finance', icon: 'euro' },
    { id: 'sante', label: 'Santé', icon: 'heart' },
    { id: 'goals', label: 'Objectifs', icon: 'target' },
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
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsReaderItem, setNewsReaderItem] = useState(null);

  const reload = useCallback(async () => {
    const [todos, goals, newsCacheRec, newsReadRecs] = await Promise.all([
      getAll('todos'), getAll('goals'), getOne('newsCache', 'latest'), getAll('newsRead'),
    ]);
    setDb({
      todos: todos || [],
      goals: goals || [],
      newsCache: newsCacheRec || null,
      newsReadUrls: new Set((newsReadRecs || []).map((r) => r.id)),
    });
  }, []);

  // fetch /api/news si le cache est absent/périmé (>3h) ou si `force` (bouton Rafraîchir)
  const refreshNews = useCallback(async (force = false) => {
    const rec = await getOne('newsCache', 'latest');
    const stale = !rec || (Date.now() - (rec.ts || 0) > NEWS_CACHE_TTL_MS);
    if (!force && !stale) return;
    setNewsLoading(true);
    try {
      const res = await fetch('/api/news');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const payload = await res.json();
      await put('newsCache', { id: 'latest', payload, ts: Date.now() });
      await reload();
    } catch (err) {
      console.error('Rafraîchissement des actus impossible', err);
    } finally {
      setNewsLoading(false);
    }
  }, [reload]);

  useEffect(() => { (async () => { await ensureSchema(); await reload(); refreshNews(false); })(); }, [reload, refreshNews]);

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
    // ---- mutations (persist + reload) ----
    saveTodo: async (t) => { await put('todos', t); await reload(); },
    deleteTodo: async (id) => { await remove('todos', id); await reload(); },
    saveGoal: async (g) => { await put('goals', g); await reload(); },
    deleteGoal: async (id) => { await remove('goals', id); await reload(); },
    // ---- news ----
    newsLoading,
    refreshNews,
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
