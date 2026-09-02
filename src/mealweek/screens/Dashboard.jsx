/* ============================================================
   Screen — Dashboard / semaine-type retenue
   KPIs (budget / calories / temps / recettes) + planning de la semaine
   + « prochaine recette » + détail du budget + récap nutritionnel.
   Tout est branché sur la semaine-type actuellement retenue et sur les
   recettes que l'utilisateur en a retirées.
   ============================================================ */
import { Icon } from '../../shared/Icon.jsx';
import { Card, Bar, HBar, WeekNav } from '../components/primitives.jsx';
import { WeekCalendar } from '../components/WeekCalendar.jsx';
import { TopActions, ResetRemovedButton } from './_shared.jsx';
import {
  weekPlan, weekKpis, weekNutrition, weekBudget, weekRaw, recipeById, money, money0,
} from '../data/dataLayer.js';
import { formatJour } from '../lib/rotation.js';

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export function Dashboard({ ctx }) {
  const { weekKey, weeklyBudget, removedInWeek } = ctx;
  const plan = weekPlan(weekKey, removedInWeek);
  const kpi = weekKpis(weekKey, removedInWeek);
  const nut = weekNutrition(weekKey, removedInWeek);
  const wk = weekRaw(weekKey);

  const { recipesTotal, persoTotal: persoT, total: budgetTotal } =
    weekBudget(weekKey, removedInWeek, ctx.shoppingChecked, ctx.perso);
  const over = budgetTotal > weeklyBudget;

  /* « prochaine recette » = le prochain dîner encore au planning, à partir
     du jour réel. Les jours du planning V2 sont nommés en clair
     (« Lundi », « Dimanche (retrait) »…) : on repart du nom du jour. */
  const todayName = JOURS[new Date().getDay()];
  const startIdx = Math.max(0, plan.days.findIndex((d) => d.full.startsWith(todayName)));
  let nextDay = null;
  let nextLabel = 'Ce soir';
  for (let i = 0; i < plan.days.length; i++) {
    const d = plan.days[(startIdx + i) % plan.days.length];
    if (d.soirRecipeId && !d.soirOff) {
      nextDay = d;
      nextLabel = i === 0 ? 'Ce soir' : d.full;
      break;
    }
  }
  const next = nextDay ? recipeById(nextDay.soirRecipeId) : null;

  const kpis = [
    { icon: 'euro', tint: 'var(--accent)', label: 'Budget semaine', val: <>{money0(budgetTotal)} <small>/ {weeklyBudget}€</small></>, bar: { value: budgetTotal, max: weeklyBudget, variant: over ? 'crit' : '' } },
    { icon: 'flame', tint: 'var(--p-pork)', label: 'Calories moy./jour', val: <>{kpi.avgKcalDay} <small>kcal</small></> },
    { icon: 'clock', tint: 'var(--p-fish)', label: 'Temps moyen', val: <>{kpi.avgTime} <small>min</small></> },
    { icon: 'book', tint: 'var(--accent-2)', label: 'Recettes à cuisiner', val: <>{kpi.recipeCount} <small>cette semaine</small></> },
  ];

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div style={{ minWidth: 0 }}>
          <h1 className="serif">
            Semaine {(weekKey || '').replace(/\D/g, '') || '—'}
            <span style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: 24 }}>
              {' '}sur {plan.days.length ? 8 : 0}
            </span>
          </h1>
          <div className="sub">
            {ctx.autoRotate
              ? <>Rotation automatique · prochain changement <strong style={{ color: 'var(--text)' }}>{formatJour(ctx.prochainChangement)}</strong>{ctx.enApercu && <> · vous regardez la semaine {(ctx.weekKey || '').replace(/\D/g, '')}, la rotation continue</>}</>
              : <>Semaine-type retenue — elle est mémorisée et retrouvée au prochain lancement.</>}
            {ctx.removedCount > 0 && <strong style={{ color: 'var(--accent-2)' }}> · {ctx.removedCount} recette{ctx.removedCount > 1 ? 's' : ''} retirée{ctx.removedCount > 1 ? 's' : ''}</strong>}
          </div>
        </div>
        <div className="topbar-actions">
          <WeekNav weekKey={weekKey} auto={ctx.autoRotate} apercu={ctx.enApercu}
            onPrev={ctx.prevWeek} onNext={ctx.nextWeek} onExitApercu={ctx.exitApercu} />
          <TopActions ctx={ctx} />
        </div>
      </div>

      {/* next recipe hero — top of the dashboard */}
      {next && (
        <div className="card next-recipe" onClick={() => ctx.openRecipe(next.id)} style={{ marginBottom: 22 }}>
          <div className="nr-glow" />
          <div className="nr-body">
            <div className="nr-main">
              <span className="nr-eyebrow"><Icon name="clock" size={13} /> Prochaine recette · {nextLabel === 'Ce soir' ? 'Ce soir' : nextLabel + ' soir'}</span>
              <div className="nr-title serif">{next.nom}</div>
              <div className="row wrap nr-metas">
                <span className="nr-meta"><Icon name="clock" size={14} /> {next.temps}</span>
                <span className="nr-meta"><Icon name="flame" size={14} /> {Math.round(next.nutrition_1portion?.kcal || 0)} kcal</span>
                {next.ustensiles && next.ustensiles.length > 0 && (
                  <span className="nr-meta"><Icon name="utensil" size={14} /> {next.ustensiles.join(', ')}</span>
                )}
              </div>
            </div>
            <button className="nr-cta" type="button" onClick={(e) => { e.stopPropagation(); ctx.openRecipe(next.id); }}>
              Voir la recette <Icon name="arrowR" size={17} />
            </button>
          </div>
        </div>
      )}

      {/* KPI bar */}
      <div className="kpis">
        {kpis.map((k, i) => (
          <div className="kpi" key={i}>
            <div className="kpi-top">
              <div className="kpi-ic" style={{ background: `color-mix(in srgb, ${k.tint} 16%, transparent)`, color: k.tint }}>
                <Icon name={k.icon} size={17} />
              </div>
              <div className="kpi-label">{k.label}</div>
            </div>
            <div className="kpi-val tnum">{k.val}</div>
            {k.bar && <Bar {...k.bar} />}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* planning de la semaine (pleine largeur) */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-head">
            <Icon name="calendar" size={17} className="ic" />
            <h3>Planning de la semaine</h3>
            <div className="right">
              <ResetRemovedButton ctx={ctx} />
              <span className="pill"><Icon name="refresh" size={12} /> Restes réutilisés</span>
              <span className="pill accent">{kpi.mealsPlanned}/{kpi.mealsTotal} repas</span>
            </div>
          </div>
          <div className="card-body" style={{ padding: 18 }}>
            <WeekCalendar
              weekKey={weekKey}
              removed={removedInWeek}
              onOpenRecipe={ctx.openRecipe}
              onToggleRecipe={ctx.toggleRecipeRemoved}
            />
            <div className="hint" style={{ marginTop: 12 }}>
              <Icon name="ban" size={12} /> Survolez une recette et cliquez sur le bouton pour la retirer de la semaine : le récap et la liste de courses se mettent à jour.
            </div>
          </div>
        </div>

        {/* budget + nutrition */}
        <div className="dash-bottom" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'stretch' }}>
          <Card title="Budget de la semaine" icon="euro" className="eqcard"
            action={<button className="icon-btn sm" title="Régler le budget" onClick={() => ctx.go('settings')} type="button"><Icon name="edit" size={15} /></button>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13, height: '100%' }}>
              <BudgetRow label="Courses de la semaine" value={recipesTotal} />
              <BudgetRow label="Courses perso" value={persoT} />
              <div style={{ height: 1, background: 'var(--border-2)' }} />
              <div className="row spread">
                <span style={{ fontWeight: 700, fontSize: 15 }}>Total semaine</span>
                <span className="tnum serif" style={{ fontSize: 22, color: over ? 'var(--crit)' : 'var(--accent)' }}>{money(budgetTotal)}</span>
              </div>
              <Bar value={budgetTotal} max={weeklyBudget} variant={over ? 'crit' : ''} />
              {wk && wk.total_eur != null && (
                <div className="hint">Total annoncé pour {weekKey} dans les données : {money(wk.total_eur)}</div>
              )}
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
              <HBar label="Glucides" value={nut.glucides_g} max={110} unit="g" />
              <HBar label="Lipides" value={nut.lipides_g} max={60} unit="g" />
              <div className="hint" style={{ marginTop: 'auto', paddingTop: 12 }}>Moyenne par portion sur les {nut.count} recette{nut.count > 1 ? 's' : ''} de la semaine</div>
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
