/* ============================================================
   My Org — app shell : charge le snapshot IndexedDB (stores
   myorg_*), route les écrans et expose tout aux pages via `ctx`.
   Thème = thème partagé "univers" (passé par App.jsx).
   100 % local : aucune IA, aucun réseau, aucun localStorage.
   ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../shared/Icon.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Todos } from './pages/Todos.jsx';
import { Goals } from './pages/Goals.jsx';
import { Placeholder } from './pages/Placeholder.jsx';
import { ensureSchema, getAll, put, remove } from './lib/storage.js';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'calendrier', label: 'Calendrier', icon: 'calendar' },
  { id: 'todos', label: 'To-do', icon: 'check' },
  { id: 'finance', label: 'Finance', icon: 'euro' },
  { id: 'sante', label: 'Santé', icon: 'heart' },
  { id: 'goals', label: 'Objectifs', icon: 'target' },
];

const SCREENS = {
  dashboard: Dashboard,
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

  const reload = useCallback(async () => {
    const [todos, goals] = await Promise.all([getAll('todos'), getAll('goals')]);
    setDb({ todos: todos || [], goals: goals || [] });
  }, []);

  useEffect(() => { (async () => { await ensureSchema(); await reload(); })(); }, [reload]);

  const ctx = {
    theme, toggleTheme, goHub,
    go: setScreen,
    db, reload,
    // ---- mutations (persist + reload) ----
    saveTodo: async (t) => { await put('todos', t); await reload(); },
    deleteTodo: async (id) => { await remove('todos', id); await reload(); },
    saveGoal: async (g) => { await put('goals', g); await reload(); },
    deleteGoal: async (id) => { await remove('goals', id); await reload(); },
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
    </div>
  );
}
