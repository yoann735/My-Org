/* ============================================================
   Shared UI primitives (ported from the design's components.jsx,
   converted to ESM React modules and wired to the real data layer).
   ============================================================ */
import { Icon } from '../../shared/Icon.jsx';
import { PROT, COMPLEXITY_VARIANT, recipeProtein, weekRaw, money0 } from '../data/dataLayer.js';

/* ---- Card ---- */
export function Card({ title, icon, action, children, style, className = '', bodyStyle }) {
  return (
    <div className={'card ' + className} style={style}>
      {title && (
        <div className="card-head">
          {icon && <Icon name={icon} size={17} className="ic" />}
          <h3>{title}</h3>
          {action && <div className="right">{action}</div>}
        </div>
      )}
      <div className="card-body" style={bodyStyle}>{children}</div>
    </div>
  );
}

/* ---- progress bar ---- */
export function Bar({ value, max = 100, variant = '' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return <div className={'bar ' + variant}><span style={{ width: pct + '%' }} /></div>;
}

/* ---- horizontal bar row (nutrition recap) ---- */
export function HBar({ label, value, max, unit, highlight }) {
  const pct = Math.max(4, Math.min(100, (value / max) * 100));
  return (
    <div className="hbar-row">
      <span className="lbl">{label}</span>
      <div className="hbar"><span style={{ width: pct + '%', background: highlight ? 'var(--accent-2)' : 'var(--accent)' }} /></div>
      <span className="val">{value}<span style={{ color: 'var(--text-3)', fontWeight: 500, fontSize: 11 }}> {unit}</span></span>
    </div>
  );
}

/* ---- meta (icon + value) ---- */
export function Meta({ icon, children, accent, fill = false }) {
  const c = accent ? { color: 'var(--accent-2)' } : null;
  return (
    <span className="meta tnum" style={c}>
      <Icon name={icon} size={13} className="ic" stroke={2} fill={fill} style={c} />
      {children}
    </span>
  );
}

/* ---- protein badge (maps raw protein → color class) ---- */
export function ProteinBadge({ recipe, protein, withLabel = true }) {
  const p = recipe ? recipeProtein(recipe) : (protein ? { cls: protein, label: PROT[protein]?.label } : null);
  if (!p) return null;
  return (
    <span className="prot-badge">
      <span className={'dot ' + p.cls} />
      {withLabel && p.label}
    </span>
  );
}

/* ---- complexity pill ---- */
export function ComplexityPill({ level }) {
  return <span className={'pill ' + (COMPLEXITY_VARIANT[level] || '')}>{level}</span>;
}

/* ---- checkbox ---- */
export function Check({ on, onChange, round }) {
  return (
    <div
      className={'check' + (round ? ' round' : '') + (on ? ' on' : '')}
      role="checkbox"
      aria-checked={on}
      onClick={(e) => { e.stopPropagation(); onChange(!on); }}
    >
      <Icon name="check" size={round ? 13 : 12} stroke={3} />
    </div>
  );
}

/* ---- toggle switch ---- */
export function Switch({ on, onChange, locked }) {
  return (
    <button
      className={'switch' + (on ? ' on' : '') + (locked ? ' locked' : '')}
      onClick={() => !locked && onChange(!on)}
      aria-pressed={on}
      type="button"
    />
  );
}

/* ---- portion / number stepper ---- */
export function Stepper({ value, min = 1, max = 6, step = 1, onChange, suffix, subLabel, big }) {
  return (
    <div className="stepper" style={big ? { } : undefined}>
      <button type="button" onClick={() => onChange(Math.max(min, value - step))}><Icon name="minus" size={16} /></button>
      <span className="val" style={{ minWidth: big ? 78 : 52 }}>
        {value}{suffix}
        {subLabel && <small>{subLabel}</small>}
      </span>
      <button type="button" onClick={() => onChange(Math.min(max, value + step))}><Icon name="plus" size={16} /></button>
    </div>
  );
}

/* ---- week navigator (S1..S6 / E1..E5 / X1..X3 cycle) ----
   LOT 4 : affiche le budget estimé de la semaine (budget_total_estime)
   directement dans le sélecteur de semaines. */
export function WeekNav({ weekKey, theme, onPrev, onNext }) {
  const wk = weekRaw(weekKey);
  const est = wk && wk.budget_total_estime;
  return (
    <div className="weeknav">
      <button onClick={onPrev} title="Semaine précédente" type="button"><Icon name="chevL" size={18} /></button>
      <span className="wk">
        {weekKey}{theme ? ` · ${theme}` : ''}
        {est != null && <span className="wk-budget" style={{ marginLeft: 6, color: 'var(--text-3)', fontWeight: 600 }}>· ~{money0(est)}</span>}
      </span>
      <button onClick={onNext} title="Semaine suivante" type="button"><Icon name="chevR" size={18} /></button>
    </div>
  );
}
