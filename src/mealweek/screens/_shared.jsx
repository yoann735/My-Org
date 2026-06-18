/* shared bits used across screens */
import { Icon } from '../../shared/Icon.jsx';

/** hub + theme toggle + avatar (top-right of every screen) */
export function TopActions({ ctx }) {
  return (
    <>
      {ctx.goHub && (
        <button className="icon-btn" type="button" title="Retour à l'accueil (mes apps)" onClick={ctx.goHub}>
          <Icon name="grid" size={18} />
        </button>
      )}
      <button
        className="icon-btn"
        type="button"
        title={ctx.theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
        onClick={ctx.toggleTheme}
      >
        <Icon name={ctx.theme === 'dark' ? 'sun' : 'moon'} size={19} />
      </button>
      <div className="avatar" title="Mon espace">MW</div>
    </>
  );
}

/** weekend shortcut — toggles the four weekend slots at once. The
    per-meal toggles in the calendar are the general mechanism; this is
    just the handy "skip the whole weekend" special case. */
export function WeekendToggle({ ctx }) {
  return (
    <button
      type="button"
      className={'btn' + (ctx.weekendOff ? ' primary' : '')}
      onClick={ctx.toggleWeekend}
      title="Activer ou masquer les repas du samedi et du dimanche"
    >
      <Icon name={ctx.weekendOff ? 'check' : 'calendar'} size={15} />
      {ctx.weekendOff ? 'Week-end masqué' : 'Masquer le week-end'}
    </button>
  );
}

/** "re-enable everything" — shown only when some meals are disabled */
export function ResetSlotsButton({ ctx }) {
  if (!ctx.disabledCount) return null;
  return (
    <button type="button" className="btn ghost" onClick={ctx.resetSlots} title="Réactiver tous les repas">
      <Icon name="refresh" size={15} /> Tout réactiver ({ctx.disabledCount})
    </button>
  );
}
