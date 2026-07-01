/* ============================================================
   Recipe overlay — "mode cuisine".
   Desktop : faithful two-column cook layout (ingredients + nutrition
             on the left, numbered steps on the right).
   Mobile  : 3 tabs (Ingrédients / Étapes / Nutrition) — easier to use
             one-handed in the kitchen (brief requirement).
   Portion selector (1-6) rescales ingredients AND nutrition live.
   Delivered ingredients and "non inclus" are two distinct lists.
   Step checkboxes are persisted (per recipe) via ctx.
   ============================================================ */
import { useState, useEffect } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Stepper, ComplexityPill, ProteinBadge, Meta } from './primitives.jsx';
import { useIsMobile } from '../../shared/hooks/useMediaQuery.js';
import {
  scaleQty, scaledNutrition, NUTRITION_FIELDS, recipeProtein, money,
} from '../data/dataLayer.js';

export function RecipeDetail({ recipe, onClose, ctx }) {
  const mobile = useIsMobile();
  const [portions, setPortions] = useState((ctx && ctx.portions) || 2);
  const [got, setGot] = useState({});           // transient "j'ai pris" ticks
  const [tab, setTab] = useState('ing');         // mobile tab
  const [showNut, setShowNut] = useState(false); // desktop collapsible nutrition

  const stepsDone = (ctx.cookSteps && ctx.cookSteps[recipe.id]) || {};

  useEffect(() => {
    setGot({});
    setPortions((ctx && ctx.portions) || 2);
    setShowNut(false);
    setTab('ing');
  }, [recipe.id]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const delivered = recipe.ingredients_livres || [];
  const nonInclus = recipe.non_inclus || [];
  const steps = recipe.etapes || [];
  const doneCount = steps.filter((s, k) => stepsDone[k]).length;
  const progress = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;
  const prot = recipeProtein(recipe);

  /* ---- ingredients column ---- */
  const Ingredients = (
    <>
      <div className="cook-sec-head">
        <Icon name="cart" size={16} />
        <h3>Ingrédients livrés</h3>
        <span className="hint tnum" style={{ marginLeft: 'auto' }}>× {portions} pers.</span>
      </div>
      <div className="ing-list">
        {delivered.map((i, k) => (
          <button
            key={'d' + k}
            type="button"
            className={'ing-check' + (got['d' + k] ? ' on' : '')}
            onClick={() => setGot((g) => ({ ...g, ['d' + k]: !g['d' + k] }))}
          >
            <span className="ing-box"><Icon name="check" size={12} stroke={3} /></span>
            <span className="ing-nm">{i.nom}{i.note ? <span className="ing-note">· {i.note}</span> : null}</span>
            <span className="ing-q tnum">{scaleQty(i.qty_1portion, portions)}</span>
          </button>
        ))}
      </div>

      {nonInclus.length > 0 && (
        <>
          <div className="cook-sub">Non inclus — à prévoir chez vous</div>
          <div className="ing-list">
            {nonInclus.map((i, k) => (
              <button
                key={'n' + k}
                type="button"
                className={'ing-check' + (got['n' + k] ? ' on' : '')}
                onClick={() => setGot((g) => ({ ...g, ['n' + k]: !g['n' + k] }))}
              >
                <span className="ing-box"><Icon name="check" size={12} stroke={3} /></span>
                <span className="ing-nm">
                  {i.nom}{' '}
                  <span className="pill ok" style={{ height: 18, fontSize: 9.5, marginLeft: 4 }}>
                    <Icon name="home" size={9} /> Maison
                  </span>
                  {i.note ? <span className="ing-note">· {i.note}</span> : null}
                </span>
                <span className="ing-q tnum">{scaleQty(i.qty, portions)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {recipe.ustensiles && recipe.ustensiles.length > 0 && (
        <>
          <div className="cook-sub">Ustensiles</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {recipe.ustensiles.map((u) => (
              <span className="pill" key={u} style={{ height: 26, fontSize: 11.5 }}>
                <Icon name="utensil" size={12} /> {u}
              </span>
            ))}
          </div>
        </>
      )}

      {recipe.allergenes && (
        <>
          <div className="cook-sub">Allergènes</div>
          <div className="hint" style={{ lineHeight: 1.5 }}>{recipe.allergenes}</div>
        </>
      )}

      {recipe.url && (
        <a
          className="btn ghost"
          href={recipe.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginTop: 16, width: '100%' }}
        >
          <Icon name="ext" size={15} /> Recette originale HelloFresh
        </a>
      )}

      {/* desktop-only collapsible nutrition */}
      {!mobile && (
        <>
          <button type="button" className="nut-toggle" onClick={() => setShowNut((v) => !v)}>
            <Icon name="bowl" size={15} />
            <span style={{ fontWeight: 600 }}>Valeurs nutritionnelles</span>
            <span className="hint" style={{ marginLeft: 'auto' }}>× {portions}</span>
            <Icon name={showNut ? 'chevU' : 'chevD'} size={16} />
          </button>
          {showNut && <div className="nut-panel"><NutritionGauges recipe={recipe} portions={portions} /></div>}
        </>
      )}
    </>
  );

  /* ---- steps column ---- */
  const Steps = (
    <>
      <div
        className="cook-sec-head"
        style={{ position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 2, paddingTop: 2 }}
      >
        <Icon name="list" size={16} />
        <h3>Préparation</h3>
        <div className="row" style={{ marginLeft: 'auto', gap: 10 }}>
          <div className="step-progress"><span style={{ width: progress + '%' }} /></div>
          <span className="hint tnum">{doneCount}/{steps.length}</span>
        </div>
      </div>
      <div className="cook-steps">
        {steps.map((s, k) => (
          <div
            key={k}
            className={'cook-step' + (stepsDone[k] ? ' done' : '')}
            onClick={() => ctx.toggleStep(recipe.id, k)}
          >
            <div className="cstep-num serif">{s.numero ?? k + 1}</div>
            <div className="cstep-body">
              <div className="cstep-title">{s.titre}</div>
              <div className="cstep-text">{s.texte}</div>
            </div>
            <div className={'cstep-check' + (stepsDone[k] ? ' on' : '')}>
              <Icon name="check" size={16} stroke={3} />
            </div>
          </div>
        ))}
        <div className="cook-finish">
          {progress === 100
            ? <div className="finish-done"><Icon name="check" size={18} stroke={3} /> Bon appétit ! Recette terminée.</div>
            : <div className="hint" style={{ textAlign: 'center' }}>Cochez chaque étape au fur et à mesure.</div>}
        </div>
      </div>
    </>
  );

  return (
    <div className="cook-overlay recipe-overlay">
      <div className="overlay-scrim" onClick={onClose} />
      <div className="cook-panel">
        {/* top bar */}
        <header className="cook-top">
          <div className="cook-top-main">
            <div className="row wrap" style={{ gap: 10, marginBottom: 6 }}>
              {recipe.complexite && <ComplexityPill level={recipe.complexite} />}
              <span className="meta"><Icon name="clock" size={13} className="ic" /> {recipe.temps_min} min</span>
              <ProteinBadge recipe={recipe} />
              {recipe.four && <span className="pill amber" style={{ height: 24, fontSize: 11 }}><Icon name="fire" size={12} fill /> Four</span>}
              {recipe.pizza && <span className="pill amber" style={{ height: 24, fontSize: 11 }}><Icon name="pizza" size={12} /> Pizza WE</span>}
            </div>
            <h1 className="serif" style={{ fontSize: 34, margin: 0, lineHeight: 1.02 }}>{recipe.nom}</h1>
            {recipe.tagline && recipe.tagline !== recipe.nom && (
              <div className="ital muted" style={{ fontSize: 16, marginTop: 4 }}>{recipe.tagline}</div>
            )}
          </div>
          <div className="cook-top-side">
            <button className="icon-btn" onClick={onClose} title="Fermer (Échap)" type="button"><Icon name="x" size={18} /></button>
            <div className="portion-box">
              <span className="kpi-label" style={{ marginBottom: 0 }}>Portions</span>
              <Stepper value={portions} min={1} max={6} onChange={setPortions} subLabel="pers." />
            </div>
          </div>
        </header>

        {/* mobile tab strip */}
        {mobile && (
          <div className="recipe-tabs">
            <button type="button" className={'tab' + (tab === 'ing' ? ' active' : '')} onClick={() => setTab('ing')}>Ingrédients</button>
            <button type="button" className={'tab' + (tab === 'steps' ? ' active' : '')} onClick={() => setTab('steps')}>Étapes</button>
            <button type="button" className={'tab' + (tab === 'nut' ? ' active' : '')} onClick={() => setTab('nut')}>Nutrition</button>
          </div>
        )}

        {/* body */}
        {mobile ? (
          <div className="cook-body tabbed scroll">
            {tab === 'ing' && <div className="cook-left">{Ingredients}</div>}
            {tab === 'steps' && <div className="cook-right">{Steps}</div>}
            {tab === 'nut' && (
              <div className="cook-left">
                <div className="cook-sec-head"><Icon name="bowl" size={16} /><h3>Nutrition</h3><span className="hint" style={{ marginLeft: 'auto' }}>× {portions} pers.</span></div>
                <NutritionGauges recipe={recipe} portions={portions} />
              </div>
            )}
          </div>
        ) : (
          <div className="cook-body scroll">
            <aside className="cook-left scroll">{Ingredients}</aside>
            <main className="cook-right scroll">{Steps}</main>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- nutrition gauges (scaled) ---- */
function NutritionGauges({ recipe, portions }) {
  const n = scaledNutrition(recipe, portions);
  const rows = NUTRITION_FIELDS
    .filter((f) => n[f.key] != null)
    .map((f) => ({ ...f, value: n[f.key] }));
  const maxKey = rows.reduce((a, b) => ((b.value / b.max) > (a.value / a.max) ? b : a), rows[0]);

  return (
    <div>
      {portions > 1 && (
        <div className="pill amber" style={{ marginBottom: 14, height: 24, fontSize: 11 }}>
          × {portions} pers. au total
        </div>
      )}
      {rows.map((r) => {
        const pct = Math.max(3, Math.min(100, (r.value / r.max) * 100));
        const isMax = maxKey && r.key === maxKey.key;
        const sub = r.label.startsWith('dont');
        return (
          <div key={r.key} style={{ marginBottom: 11, paddingLeft: sub ? 12 : 0 }}>
            <div className="row spread" style={{ marginBottom: 5 }}>
              <span style={{ fontSize: 12.5, fontWeight: sub ? 500 : 600, color: isMax ? 'var(--accent)' : (sub ? 'var(--text-3)' : 'var(--text-2)') }}>{r.label}</span>
              <span className="tnum" style={{ fontSize: 12.5, fontWeight: 700 }}>
                {String(r.value).replace('.', ',')} {r.unit}
                <span className="t3" style={{ fontWeight: 500, marginLeft: 5 }}>{Math.round((r.value / r.rda) * 100)}%</span>
              </span>
            </div>
            <div className="hbar" style={{ height: sub ? 5 : 7 }}>
              <span style={{ width: pct + '%', background: isMax ? 'var(--accent-2)' : 'var(--accent)' }} />
            </div>
          </div>
        );
      })}
      <div className="hint" style={{ marginTop: 10 }}>% des apports quotidiens recommandés (base 2000 kcal).</div>
    </div>
  );
}
