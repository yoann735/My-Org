/* ============================================================
   Screen — Planification de la semaine
   Full week calendar + weekend lever + congélation datée
   (freeze/use days for meats) + consommé/reste status badges.
   ============================================================ */
import { Icon } from '../../shared/Icon.jsx';
import { Card, WeekNav } from '../components/primitives.jsx';
import { WeekCalendar } from '../components/WeekCalendar.jsx';
import { TopActions, WeekendToggle, ResetSlotsButton } from './_shared.jsx';
import { weekPlan, weekRaw } from '../data/dataLayer.js';

function verdictVariant(verdict) {
  if (!verdict) return '';
  if (verdict.includes('Consommé')) return 'ok';
  if (verdict.includes('Reste')) return 'amber';
  return ''; // Variable / autre
}

export function Planning({ ctx }) {
  const { weekKey, slotsOff } = ctx;
  const plan = weekPlan(weekKey);
  const wk = weekRaw(weekKey) || {};
  const congelation = wk.congelation || [];
  const status = wk.ingredients_status || {};
  const statusEntries = Object.entries(status);

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div style={{ minWidth: 0 }}>
          <h1 className="serif">
            Planning{' '}
            <span style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: 24 }}>— {plan.theme}</span>
          </h1>
          <div className="sub">Semaine {weekKey.replace('S', '')} sur 6 · cuisson ×2 : chaque dîner devient le déjeuner du lendemain.</div>
        </div>
        <div className="topbar-actions">
          <WeekNav weekKey={weekKey} onPrev={ctx.prevWeek} onNext={ctx.nextWeek} />
          <TopActions ctx={ctx} />
        </div>
      </div>

      <div className="row wrap" style={{ marginBottom: 16, gap: 10 }}>
        <WeekendToggle ctx={ctx} />
        <ResetSlotsButton ctx={ctx} />
        <span className="pill"><Icon name="refresh" size={12} /> Restes = déjeuner du lendemain</span>
        <span className="pill amber"><Icon name="pizza" size={12} /> Pizzas : Sam &amp; Dim</span>
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        <span className="hint"><Icon name="ban" size={12} /> Survolez un repas et cliquez sur le bouton pour le désactiver : la liste de courses, le budget et le récap nutritionnel se recalculent aussitôt.</span>
      </div>

      {/* full-width calendar */}
      <div className="card" style={{ overflow: 'hidden', marginBottom: 20 }}>
        <div className="card-head">
          <Icon name="calendar" size={17} className="ic" />
          <h3>Repas de la semaine</h3>
        </div>
        <div className="card-body">
          <WeekCalendar weekKey={weekKey} onOpenRecipe={ctx.openRecipe} slotsOff={slotsOff} onToggleSlot={ctx.toggleSlot} />
        </div>
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        {/* Congélation datée */}
        <Card title="Congélation & fraîcheur" icon="snow"
          action={<span className="hint">{congelation.length} ingrédient(s) suivis</span>}>
          {congelation.length === 0 ? (
            <div className="hint">Aucun suivi de congélation pour cette semaine.</div>
          ) : (
            <div style={{ margin: '-4px -4px 0' }}>
              <div className="freeze-row head">
                <span>Ingrédient</span>
                <span>Action</span>
                <span style={{ textAlign: 'center' }}>Congel.</span>
                <span style={{ textAlign: 'center' }}>Usage</span>
                <span>Note</span>
              </div>
              {congelation.map((c, i) => {
                const frozen = c.freeze_day && c.freeze_day !== '—';
                return (
                  <div className="freeze-row" key={i}>
                    <span className="fr-ing">{c.ingredient}</span>
                    <span>
                      <span className={'pill ' + (frozen ? 'accent' : '')} style={{ height: 22, fontSize: 11 }}>
                        {frozen && <Icon name="snow" size={11} />} {c.action}
                      </span>
                    </span>
                    <span style={{ textAlign: 'center' }}>
                      {frozen ? <span className="freeze-day freeze">{c.freeze_day}</span> : <span className="t3">—</span>}
                    </span>
                    <span style={{ textAlign: 'center' }}>
                      <span className="freeze-day cook">{c.use_day}</span>
                    </span>
                    <span className="fr-note">{c.note}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Consommé / reste */}
        <Card title="Consommé vs reste" icon="box"
          action={<span className="hint">{statusEntries.length} ingrédient(s)</span>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 460, overflowY: 'auto' }} className="scroll">
            {statusEntries.map(([name, s]) => (
              <div className="ing" key={name} style={{ borderColor: 'var(--border-2)' }}>
                <span className="iname" style={{ flex: 1 }}>{name}</span>
                <span className="hint" style={{ marginRight: 8, fontSize: 11.5, textAlign: 'right', maxWidth: 150 }}>{s.detail}</span>
                <span className={'pill ' + verdictVariant(s.verdict)} style={{ height: 22, fontSize: 11 }}>{s.verdict}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
