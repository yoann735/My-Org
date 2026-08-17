/* Icon — jeu d'icônes maison (trait uniforme, `stroke` réglable).
   Les noms viennent de l'inventaire ICONS de src/shared/Icon.jsx. */
import { Icon } from 'mealweek';

const Row = ({ names }: { names: string[] }) => (
  <div className="row" style={{ gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
    {names.map((n) => (
      <span key={n} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 74 }}>
        <Icon name={n} size={22} />
        <code style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{n}</code>
      </span>
    ))}
  </div>
);

export const Navigation = () => <Row names={['home', 'calendar', 'book', 'folder', 'search', 'settings']} />;

export const Revision = () => <Row names={['cards', 'list', 'lightbulb', 'target', 'brain', 'trophy']} />;

export const Etat = () => <Row names={['check', 'alert', 'clock', 'bell', 'bellOff', 'flame']} />;

export const Tailles = () => (
  <div className="row" style={{ gap: 18, alignItems: 'center' }}>
    {[14, 18, 22, 28, 36].map((s) => (
      <span key={s} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <Icon name="cards" size={s} />
        <code style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{s}</code>
      </span>
    ))}
  </div>
);

export const Rempli = () => (
  <div className="row" style={{ gap: 22, alignItems: 'center' }}>
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Icon name="play" size={22} /> <code style={{ fontSize: 11 }}>trait</code></span>
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Icon name="play" size={22} fill /> <code style={{ fontSize: 11 }}>fill</code></span>
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Icon name="star" size={22} stroke={3} /> <code style={{ fontSize: 11 }}>stroke=3</code></span>
  </div>
);
