/* ============================================================
   Navigation — floating Sidebar on desktop, BottomNav on mobile.
   Both drive the same `screen` state. The sidebar is hidden under
   760px (CSS), the bottom nav shown only under 760px (CSS).
   ============================================================ */
import { Icon } from './Icon.jsx';

export const NAV = [
  { id: 'dashboard', label: 'Accueil', icon: 'home' },
  { id: 'planning', label: 'Semaine', icon: 'calendar' },
  { id: 'shopping', label: 'Courses', icon: 'cart' },
  { id: 'library', label: 'Recettes', icon: 'book' },
];

/* ---------- Desktop sidebar ---------- */
export function Sidebar({ current, onNav, expanded, onToggle, shoppingBadge }) {
  return (
    <nav className={'sidebar' + (expanded ? ' expanded' : '')}>
      <div className="sb-brand">
        <div className="sb-logo"><Icon name="bowl" size={20} stroke={2.2} /></div>
        <div className="sb-brand-name">MealWeek<small>Planning repas</small></div>
      </div>
      <div className="sb-nav">
        {NAV.map((n) => (
          <div
            key={n.id}
            className={'sb-item' + (current === n.id ? ' active' : '')}
            onClick={() => onNav(n.id)}
            title={n.label}
          >
            <span className="sb-icon"><Icon name={n.icon} size={20} /></span>
            <span className="sb-label">{n.label}</span>
            {n.id === 'shopping' && shoppingBadge > 0 && <span className="sb-badge">{shoppingBadge}</span>}
          </div>
        ))}
      </div>
      <div className="sb-spacer" />
      <div className="sb-foot">
        <div
          className={'sb-item' + (current === 'settings' ? ' active' : '')}
          onClick={() => onNav('settings')}
          title="Réglages"
        >
          <span className="sb-icon"><Icon name="settings" size={20} /></span>
          <span className="sb-label">Réglages</span>
        </div>
        <button className="sb-toggle" onClick={onToggle} title={expanded ? 'Réduire' : 'Étendre'} type="button">
          <span className="sb-icon"><Icon name="panel" size={19} /></span>
          <span className="sb-label">Réduire</span>
        </button>
      </div>
    </nav>
  );
}

/* ---------- Mobile bottom nav ---------- */
export function BottomNav({ current, onNav, shoppingBadge }) {
  const items = [...NAV, { id: 'settings', label: 'Réglages', icon: 'settings' }];
  return (
    <nav className="bottom-nav">
      {items.map((n) => (
        <button
          key={n.id}
          type="button"
          className={'bn-item' + (current === n.id ? ' active' : '')}
          onClick={() => onNav(n.id)}
        >
          <span className="bn-ic">
            <Icon name={n.icon} size={20} />
            {n.id === 'shopping' && shoppingBadge > 0 && <span className="bn-badge">{shoppingBadge}</span>}
          </span>
          {n.label}
        </button>
      ))}
    </nav>
  );
}
