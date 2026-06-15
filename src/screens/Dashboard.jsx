/* ============================================================
   Screen — Dashboard / calendrier hebdomadaire
   KPIs (budget / calories / temps / four) + weekly calendar +
   "prochaine recette" hero + budget breakdown + nutrition recap.
   ============================================================ */
import { Icon } from '../components/Icon.jsx';
import { Card, Bar, HBar, WeekNav } from '../components/primitives.jsx';
import { WeekCalendar } from '../components/WeekCalendar.jsx';
import { TopActions } from './_shared.jsx';
import {
  weekPlan, weekKpis, weekNutrition, weekShopping, recipeById, recipeProtein,
  PERSO_FIXES, BUDGET_TARGET, money, money0,
} from '../data/dataLayer.js';

export function Dashboard({ ctx }) {
  const { weekKey, weeklyBudget, includeWeekend } = ctx;
  const plan = weekPlan(weekKey);
  const kpi = weekKpis(weekKey, includeWeekend);
  const nut = weekNutrition(weekKey, includeWeekend);

  const shopping = weekShopping(weekKey, includeWeekend);
  const recipesTotal = shopping.reduce((a, i) => a + i.price, 0);
  const persoT = PERSO_FIXES.reduce((a, p) => a + p.total, 0);
  const budgetTotal = recipesTotal + persoT;
  const budgetPct = Math.round((budgetTotal / weeklyBudget) * 100);
  const over = budgetTotal > weeklyBudget;

  // next recipe = Monday dinner (first cooked meal of the cycle)
  const firstDay = plan.days[0];
  const next = recipeById(firstDay.soir);

  const kpis = [
    { icon: 'euro', tint: 'var(--accent)', label: 'Budget semaine', val: <>{money0(budgetTotal)} <small>/ {weeklyBudget}€</small></>, bar: { value: budgetTotal, max: weeklyBudget, variant: over ? 'crit' : '' } },
    { icon: 'flame', tint: 'var(--p-pork)', label: 'Calories moy./jour', val: <>{kpi.avgKcalDay} <small>kcal</small></> },
    { icon: 'clock', tint: 'var(--p-fish)', label: 'Temps moyen', val: <>{kpi.avgTime} <small>min</small></> },
    { icon: 'fire', tint: 'var(--accent-2)', label: 'Recettes au four', val: <>{kpi.ovenCount} <small>cette semaine</small></> },
  ];

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div style={{ minWidth: 0 }}>
          <h1 className="serif">
            Semaine {weekKey.replace('S', '')}{' '}
            <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>—</span>{' '}
            <span style={{ fontSize: 24, color: 'var(--text-2)' }}>{plan.theme}</span>
          </h1>
          <div className="sub">Votre planning de la semaine en un coup d'œil. {!includeWeekend && <strong style={{ color: 'var(--accent-2)' }}>· Week-end masqué</strong>}</div>
        </div>
        <div className="topbar-actions">
          <WeekNav weekKey={weekKey} onPrev={ctx.prevWeek} onNext={ctx.nextWeek} />
          <TopActions ctx={ctx} />
        </div>
      </div>

      {/* KPI bar */}
      <div className="kpis">
        {kpis.map((k, i) => (
          <div className="kpi" key={i}>
            <div className="kpi-top">
              <div className="kpi-ic" style={{ background: `color-mix(in srgb, ${k.tint} 16%, transparent)`, color: k.tint }}>
                <Icon name={k.icon} size={17} fill={k.icon === 'fire'} />
              </div>
              <div className="kpi-label">{k.label}</div>
            </div>
            <div className="kpi-val tnum">{k.val}</div>
            {k.bar && <Bar {...k.bar} />}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* calendar + next recipe */}
        <div className="dash-top" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.1fr) minmax(300px,1fr)', gap: 20, alignItems: 'stretch' }}>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="card-head">
              <Icon name="calendar" size={17} className="ic" />
              <h3>Calendrier hebdomadaire</h3>
              <div className="right">
                <span className="pill"><Icon name="refresh" size={12} /> Restes réutilisés</span>
                <span className="pill accent">{kpi.mealsPlanned}/14 repas</span>
                <button className="btn ghost" style={{ padding: '6px 11px' }} onClick={() => ctx.go('planning')}>
                  <Icon name="grid" size={15} /> Planning
                </button>
              </div>
            </div>
            <div className="card-body" style={{ padding: 18 }}>
              <WeekCalendar weekKey={weekKey} onOpenRecipe={ctx.openRecipe} includeWeekend={includeWeekend} />
            </div>
          </div>

          {next && (
            <div className="card next-recipe" onClick={() => ctx.openRecipe(next.id)}>
              <div className="nr-glow" />
              <div className="nr-body">
                <div className="row spread" style={{ alignItems: 'center' }}>
                  <span className="nr-eyebrow"><Icon name="clock" size={13} /> Prochaine recette</span>
                  <span className="pill amber" style={{ background: 'rgba(255,255,255,.18)', color: '#fff', borderColor: 'rgba(255,255,255,.28)' }}>Lundi · Soir</span>
                </div>
                <div style={{ marginTop: 'auto' }}>
                  <div className="serif" style={{ fontSize: 30, lineHeight: 1.05, color: '#fff' }}>{next.nom}</div>
                  {next.tagline && next.tagline !== next.nom && (
                    <div className="ital" style={{ fontSize: 14.5, marginTop: 6, color: 'rgba(255,255,255,.8)' }}>{next.tagline}</div>
                  )}
                </div>
                <div className="row wrap" style={{ gap: 14, marginTop: 16 }}>
                  <span className="nr-meta"><span className="dot" style={{ background: `var(--p-${recipeProtein(next).cls})`, width: 9, height: 9 }} /> {recipeProtein(next).label}</span>
                  <span className="nr-meta"><Icon name="clock" size={14} /> {next.temps_min} min</span>
                  <span className="nr-meta"><Icon name="flame" size={14} /> {next.nutrition_1portion?.kcal} kcal</span>
                </div>
                <button className="nr-cta" type="button" onClick={(e) => { e.stopPropagation(); ctx.openRecipe(next.id); }}>
                  Voir la recette <Icon name="arrowR" size={17} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* budget + nutrition */}
        <div className="dash-bottom" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'stretch' }}>
          <Card title="Budget de la semaine" icon="euro" className="eqcard"
            action={<button className="icon-btn sm" title="Régler le budget" onClick={() => ctx.go('settings')} type="button"><Icon name="edit" size={15} /></button>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13, height: '100%' }}>
              <BudgetRow label="Courses recettes" value={recipesTotal} />
              <BudgetRow label="Courses perso (skyr, bananes)" value={persoT} />
              <div style={{ height: 1, background: 'var(--border-2)' }} />
              <div className="row spread">
                <span style={{ fontWeight: 700, fontSize: 15 }}>Total semaine</span>
                <span className="tnum serif" style={{ fontSize: 22, color: over ? 'var(--crit)' : 'var(--accent)' }}>{money(budgetTotal)}</span>
              </div>
              <Bar value={budgetTotal} max={weeklyBudget} variant={over ? 'crit' : ''} />
              <div className="budget-target" style={{ marginTop: 'auto' }}>
                <span className="hint">Objectif {weeklyBudget}€</span>
                <span className={'pill ' + (over ? 'crit' : 'ok')} style={{ marginLeft: 'auto' }}>
                  <Icon name={over ? 'alert' : 'check'} size={13} />
                  {over ? `${money(budgetTotal - weeklyBudget)} au-dessus` : `${money(weeklyBudget - budgetTotal)} sous le budget`}
                </span>
              </div>
            </div>
          </Card>

          <Card title="Récap nutritionnel" icon="bowl" className="eqcard">
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <HBar label="Calories" value={nut.kcal} max={900} unit="kcal" />
              <HBar label="Protéines" value={nut.proteines_g} max={50} unit="g" highlight />
              <HBar label="Glucides" value={nut.glucides_g} max={100} unit="g" />
              <HBar label="Lipides" value={nut.lipides_g} max={60} unit="g" />
              <div className="hint" style={{ marginTop: 'auto', paddingTop: 12 }}>Moyenne par repas planifié ({nut.count} repas)</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function BudgetRow({ label, value }) {
  return (
    <div className="row spread">
      <span className="muted" style={{ fontSize: 13.5 }}>{label}</span>
      <span className="tnum" style={{ fontWeight: 600, fontSize: 14 }}>{money(value)}</span>
    </div>
  );
}
