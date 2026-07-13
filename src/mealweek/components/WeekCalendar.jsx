/* ============================================================
   Weekly calendar — shared by Dashboard and Planning.
   Desktop : aligned grid (row of day heads, then MIDI row, then
             SOIR row) so every meal lines up across days.
   Mobile  : vertical stack, one block per day with its two slots.
   Leftovers (midi) carry their dinner's tint (cuisson_x2 link).
   Each slot has a discreet on/off toggle: a disabled meal dims and
   drops out of the shopping list / budget / nutrition (see dataLayer).
   ============================================================ */
import { Icon } from '../../shared/Icon.jsx';
import { useIsMobile } from '../../shared/hooks/useMediaQuery.js';
import { weekPlan, weekRaw, recipeById, recipeTint } from '../data/dataLayer.js';

function SlotCard({ recipeId, leftover, weekend, active, onToggle, onOpen, rep = 1 }) {
  const r = recipeById(recipeId);
  if (!r) return <div className="slot-empty" style={{ minHeight: 64 }}><Icon name="minus" size={16} /></div>;
  const t = recipeTint(r.id);
  const isWeekendPizza = weekend && r.pizza;
  return (
    <div
      className={'cal-slot' + (active ? '' : ' off')}
      onClick={() => (active ? onOpen(r.id) : onToggle && onToggle())}
      style={active ? { background: t.bg, borderColor: 'var(--border)', boxShadow: `inset 3px 0 0 ${t.solid}` } : undefined}
      title={active ? undefined : 'Repas désactivé — cliquer pour le réactiver'}
    >
      {onToggle && (
        <button
          type="button"
          className="slot-toggle"
          aria-pressed={!active}
          title={active ? 'Je ne prends pas ce repas' : 'Réactiver ce repas'}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
        >
          <Icon name={active ? 'ban' : 'plus'} size={13} />
        </button>
      )}
      <div className="cs-name">{r.nom}</div>
      <div className="cs-meta">
        <span className="meta tnum"><Icon name="clock" size={12} className="ic" /> {r.temps_min}</span>
        <span className="meta tnum"><Icon name="flame" size={12} className="ic" /> {r.nutrition_1portion?.kcal}</span>
        {r.four && <Icon name="fire" size={12} fill style={{ color: 'var(--accent-2)' }} />}
      </div>
      <div className="cs-tags">
        {!active && <span className="tag-leftover">Désactivé</span>}
        {active && leftover && <span className="tag-leftover"><Icon name="refresh" size={10} /> Restes</span>}
        {active && rep > 1 && <span className="pill accent" style={{ height: 19, padding: '0 7px', fontSize: 9.5 }} title={`Cette recette revient ${rep} fois cette semaine`}><Icon name="refresh" size={10} /> ×{rep} cette semaine</span>}
        {active && isWeekendPizza && <span className="pill amber" style={{ height: 19, padding: '0 7px', fontSize: 9.5 }}><Icon name="pizza" size={10} /> WE</span>}
      </div>
    </div>
  );
}

export function WeekCalendar({ weekKey, onOpenRecipe, slotsOff = {}, onToggleSlot }) {
  const mobile = useIsMobile();
  const plan = weekPlan(weekKey);
  if (!plan) return null;

  const reps = (weekRaw(weekKey) || {}).repetitions || {}; // LOT 3 (semaines super_eco)
  const repOf = (rid) => reps[rid] || 1;
  const slotActive = (dayKey, meal) => !slotsOff[`${dayKey}-${meal}`];
  const toggler = (dayKey, meal) => (onToggleSlot ? () => onToggleSlot(dayKey, meal) : undefined);

  if (mobile) {
    return (
      <div className="cal-grid cal-mobile">
        {plan.days.map((d) => {
          const dayOff = !slotActive(d.key, 'midi') && !slotActive(d.key, 'soir');
          return (
            <div key={d.key} className={'cal-day-block' + (d.weekend ? ' weekend' : '') + (dayOff ? ' day-off' : '')}>
              <div className="cdb-head">
                <span className="dname">{d.full}</span>
                {d.weekend && <span className="pill amber" style={{ height: 18, fontSize: 9.5 }}>Week-end</span>}
              </div>
              <div className="cdb-slot">
                <span className="slot-label"><Icon name="sun" size={11} /> Midi</span>
                <SlotCard recipeId={d.midi} leftover={d.midiLeftover} weekend={d.weekend} active={slotActive(d.key, 'midi')} onToggle={toggler(d.key, 'midi')} onOpen={onOpenRecipe} rep={repOf(d.midi)} />
              </div>
              <div className="cdb-slot">
                <span className="slot-label"><Icon name="moon" size={11} /> Soir</span>
                <SlotCard recipeId={d.soir} leftover={false} weekend={d.weekend} active={slotActive(d.key, 'soir')} onToggle={toggler(d.key, 'soir')} onOpen={onOpenRecipe} rep={repOf(d.soir)} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="cal-grid">
      <div className="cg-corner" />
      {plan.days.map((d) => {
        const dayOff = !slotActive(d.key, 'midi') && !slotActive(d.key, 'soir');
        return (
          <div className={'cg-head' + (d.weekend ? ' weekend' : '') + (dayOff ? ' off' : '')} key={'h' + d.key}>
            <span className="dname">{d.key}</span>
            {d.weekend && <span className="dnum">WE</span>}
          </div>
        );
      })}

      <div className="cg-rowlabel"><Icon name="sun" size={12} /> Midi</div>
      {plan.days.map((d) => (
        <div className="cg-cell" key={'m' + d.key}>
          <SlotCard recipeId={d.midi} leftover={d.midiLeftover} weekend={d.weekend} active={slotActive(d.key, 'midi')} onToggle={toggler(d.key, 'midi')} onOpen={onOpenRecipe} rep={repOf(d.midi)} />
        </div>
      ))}

      <div className="cg-rowlabel"><Icon name="moon" size={12} /> Soir</div>
      {plan.days.map((d) => (
        <div className="cg-cell" key={'s' + d.key}>
          <SlotCard recipeId={d.soir} leftover={false} weekend={d.weekend} active={slotActive(d.key, 'soir')} onToggle={toggler(d.key, 'soir')} onOpen={onOpenRecipe} rep={repOf(d.soir)} />
        </div>
      ))}
    </div>
  );
}
