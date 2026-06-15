/* ============================================================
   Weekly calendar — shared by Dashboard and Planning.
   Desktop : aligned grid (row of day heads, then MIDI row, then
             SOIR row) so every meal lines up across days.
   Mobile  : vertical stack, one block per day with its two slots.
   Leftovers (midi) carry their dinner's tint (cuisson_x2 link).
   When the weekend is toggled off, Sam/Dim show as "masqué".
   ============================================================ */
import { Icon } from './Icon.jsx';
import { useIsMobile } from '../hooks/useMediaQuery.js';
import { weekPlan, recipeById, recipeTint, recipeProtein } from '../data/dataLayer.js';

function SlotCard({ recipeId, leftover, weekend, includeWeekend, onOpen }) {
  if (weekend && !includeWeekend) {
    return <div className="slot-empty" style={{ minHeight: 64 }}><span className="hint">Masqué</span></div>;
  }
  const r = recipeById(recipeId);
  if (!r) return <div className="slot-empty" style={{ minHeight: 64 }}><Icon name="minus" size={16} /></div>;
  const t = recipeTint(r.id);
  const isWeekendPizza = weekend && r.pizza;
  return (
    <div
      className="cal-slot"
      onClick={() => onOpen(r.id)}
      style={{ background: t.bg, borderColor: 'var(--border)', boxShadow: `inset 3px 0 0 ${t.solid}` }}
    >
      <div className="cs-name">{r.nom}</div>
      <div className="cs-meta">
        <span className="meta tnum"><Icon name="clock" size={12} className="ic" /> {r.temps_min}</span>
        <span className="meta tnum"><Icon name="flame" size={12} className="ic" /> {r.nutrition_1portion?.kcal}</span>
        {r.four && <Icon name="fire" size={12} fill style={{ color: 'var(--accent-2)' }} />}
      </div>
      <div className="cs-tags">
        {leftover && <span className="tag-leftover"><Icon name="refresh" size={10} /> Restes</span>}
        {isWeekendPizza && <span className="pill amber" style={{ height: 19, padding: '0 7px', fontSize: 9.5 }}><Icon name="pizza" size={10} /> WE</span>}
      </div>
    </div>
  );
}

export function WeekCalendar({ weekKey, onOpenRecipe, includeWeekend = true }) {
  const mobile = useIsMobile();
  const plan = weekPlan(weekKey);
  if (!plan) return null;

  if (mobile) {
    return (
      <div className="cal-grid cal-mobile">
        {plan.days.map((d) => (
          <div key={d.key} className={'cal-day-block' + (d.weekend ? ' weekend' : '')}>
            <div className="cdb-head">
              <span className="dname">{d.full}</span>
              {d.weekend && <span className="pill amber" style={{ height: 18, fontSize: 9.5 }}>Week-end</span>}
            </div>
            <div className="cdb-slot">
              <span className="slot-label"><Icon name="sun" size={11} /> Midi</span>
              <SlotCard recipeId={d.midi} leftover={d.midiLeftover} weekend={d.weekend} includeWeekend={includeWeekend} onOpen={onOpenRecipe} />
            </div>
            <div className="cdb-slot">
              <span className="slot-label"><Icon name="moon" size={11} /> Soir</span>
              <SlotCard recipeId={d.soir} leftover={false} weekend={d.weekend} includeWeekend={includeWeekend} onOpen={onOpenRecipe} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="cal-grid">
      <div className="cg-corner" />
      {plan.days.map((d) => (
        <div className={'cg-head' + (d.weekend ? ' weekend' : '')} key={'h' + d.key}>
          <span className="dname">{d.key}</span>
          {d.weekend && <span className="dnum">WE</span>}
        </div>
      ))}

      <div className="cg-rowlabel"><Icon name="sun" size={12} /> Midi</div>
      {plan.days.map((d) => (
        <div className="cg-cell" key={'m' + d.key}>
          <SlotCard recipeId={d.midi} leftover={d.midiLeftover} weekend={d.weekend} includeWeekend={includeWeekend} onOpen={onOpenRecipe} />
        </div>
      ))}

      <div className="cg-rowlabel"><Icon name="moon" size={12} /> Soir</div>
      {plan.days.map((d) => (
        <div className="cg-cell" key={'s' + d.key}>
          <SlotCard recipeId={d.soir} leftover={false} weekend={d.weekend} includeWeekend={includeWeekend} onOpen={onOpenRecipe} />
        </div>
      ))}
    </div>
  );
}
