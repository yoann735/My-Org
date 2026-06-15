/* shared bits used across screens */
import { Icon } from '../components/Icon.jsx';

/** theme toggle + avatar (top-right of every screen) */
export function TopActions({ ctx }) {
  return (
    <>
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

/** weekend on/off toggle — the main budget lever (brief: weekend_retirable) */
export function WeekendToggle({ ctx }) {
  return (
    <button
      type="button"
      className={'btn' + (ctx.includeWeekend ? '' : ' primary')}
      onClick={() => ctx.setIncludeWeekend(!ctx.includeWeekend)}
      title="Masquer Sam + Dim pour réduire le budget"
    >
      <Icon name={ctx.includeWeekend ? 'calendar' : 'check'} size={15} />
      {ctx.includeWeekend ? 'Masquer le week-end' : 'Week-end masqué'}
    </button>
  );
}
