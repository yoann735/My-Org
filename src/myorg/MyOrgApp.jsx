/* ============================================================
   My Org — app shell : charge le snapshot IndexedDB (stores
   myorg_*), route les écrans et expose tout aux pages via `ctx`.
   Thème = thème partagé "univers" (passé par App.jsx).
   100 % local (hors /api/news, /api/article) : aucune clé API
   côté client, aucun localStorage.
   News : un seul fetch /api/news (firehose combiné fr+en), le
   filtre Tous/FR/EN est purement client-side (myorg_meta). Les
   clics sur les articles alimentent un profil d'affinité local
   (myorg_news_clicks) utilisé pour classer la section "Pour toi"
   (voir lib/newsAffinity.js) — aucune IA pour ça.
   Nav actuelle : Dashboard + News fonctionnels ; Objectifs, Finance,
   Santé en placeholder « Bientôt » (Calendrier et To-do retirés de
   la nav — code et données existants conservés, juste débranchés).
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../shared/Icon.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { News } from './pages/News.jsx';
import { Placeholder } from './pages/Placeholder.jsx';
import { NewsReader } from './components/NewsReader.jsx';
import { ensureSchema, getAll, getOne, getMeta, setMeta, put, remove } from './lib/storage.js';
import { emptyProfile, recordClick, rankForYou } from './lib/newsAffinity.js';

const NEWS_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3h
const DEFAULT_NEWS_LANG_FILTER = 'all'; // 'all' | 'fr' | 'en'

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
  const [newsLangFilter, setNewsLangFilterState] = useState(DEFAULT_NEWS_LANG_FILTER);
  const [newsCache, setNewsCache] = useState(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsReaderItem, setNewsReaderItem] = useState(null);
  const [newsProfile, setNewsProfile] = useState(emptyProfile());

  // todos/goals conservés (stores existants) même si non routés pour l'instant
  const reload = useCallback(async () => {
    const [todos, goals, newsReadRecs, profileRec] = await Promise.all([
      getAll('todos'), getAll('goals'), getAll('newsRead'), getOne('newsClicks', 'profile'),
    ]);
    setDb({
      todos: todos || [],
      goals: goals || [],
      newsReadUrls: new Set((newsReadRecs || []).map((r) => r.id)),
    });
    setNewsProfile(profileRec || emptyProfile());
  }, []);

  const loadNewsCache = useCallback(async () => {
    const rec = await getOne('newsCache', 'latest');
    setNewsCache(rec || null);
  }, []);

  // fetch /api/news si le cache est absent/périmé (>3h) ou si `force`
  const refreshNews = useCallback(async (force = false) => {
    const rec = await getOne('newsCache', 'latest');
    const stale = !rec || (Date.now() - (rec.ts || 0) > NEWS_CACHE_TTL_MS);
    if (!force && !stale) { setNewsCache(rec); return; }
    setNewsLoading(true);
    try {
      const res = await fetch('/api/news');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const payload = await res.json();
      const newRec = { id: 'latest', payload, ts: Date.now() };
      await put('newsCache', newRec);
      setNewsCache(newRec);
    } catch (err) {
      console.error('Rafraîchissement des actus impossible', err);
    } finally {
      setNewsLoading(false);
    }
  }, []);

  const setNewsLangFilter = useCallback(async (lang) => {
    setNewsLangFilterState(lang);
    await setMeta('newsLangFilter', lang);
  }, []);

  useEffect(() => {
    (async () => {
      await ensureSchema();
      await reload();
      const lang = (await getMeta('newsLangFilter')) || DEFAULT_NEWS_LANG_FILTER;
      setNewsLangFilterState(lang);
      await loadNewsCache();
      refreshNews(false);
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
    if (item?.url) {
      markNewsRead(item.url);
      const nextProfile = recordClick(newsProfile, item);
      setNewsProfile(nextProfile);
      put('newsClicks', nextProfile);
    }
  }, [markNewsRead, newsProfile]);

  const closeNewsReader = useCallback(() => setNewsReaderItem(null), []);

  const resetNewsProfile = useCallback(async () => {
    const fresh = emptyProfile();
    await put('newsClicks', fresh);
    setNewsProfile(fresh);
  }, []);

  // items du payload, filtrés par langue (Tous/FR/EN) — purement côté client
  const newsItems = useMemo(() => {
    const items = newsCache?.payload?.items || [];
    if (newsLangFilter === 'all') return items;
    return items.filter((it) => it.lang === newsLangFilter);
  }, [newsCache, newsLangFilter]);

  const forYouItems = useMemo(() => {
    if (!db) return [];
    return rankForYou(newsItems, newsProfile, db.newsReadUrls);
  }, [newsItems, newsProfile, db]);

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
    newsLangFilter,
    setNewsLangFilter,
    newsCache,
    newsItems,
    forYouItems,
    newsLoading,
    refreshNews: (force) => refreshNews(force),
    markNewsRead,
    forgetNewsRead,
    openNewsReader,
    resetNewsProfile,
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
