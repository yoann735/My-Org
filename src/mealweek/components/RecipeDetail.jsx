/* ============================================================
   Overlay de détail recette — « mode cuisine ».

   Hiérarchie : le titre, le temps et les ustensiles en haut, le
   sélecteur de portions à côté et toujours visible. Puis deux zones
   nettement séparées — « ce qu'il faut » (ingrédients cochables,
   tableau nutritionnel, recette d'origine) et « ce qu'on fait »
   (les étapes numérotées, qui prennent la place principale).

   Desktop : deux colonnes (ingrédients | étapes), chacune défilante.
   Mobile  : une seule colonne défilante, réordonnée par CSS —
             ingrédients, étapes, nutrition, source. Pas d'onglets :
             on fait défiler, on ne cherche pas.

   Le tableau nutritionnel est TOUJOURS affiché (jamais replié), et le
   lien vers la source est un vrai bouton plein.

   Le sélecteur de portions pilote l'état global ctx.portions (le même
   que les Réglages) et met à l'échelle les quantités affichées et la
   colonne « total » du tableau. Les cases d'étapes sont persistées.
   ============================================================ */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { Stepper } from './primitives.jsx';
import {
  scaleIngredientQty, scaledNutrition, NUTRITION_FIELDS, weekRecipes, fmtNum,
} from '../data/dataLayer.js';

export function RecipeDetail({ recipe, onClose, ctx }) {
  const portions = (ctx && ctx.portions) || 2;
  const setPortions = (ctx && ctx.setPortions) || (() => {});
  const [got, setGot] = useState({}); // coches éphémères « je l'ai sorti »

  const stepsDone = (ctx.cookSteps && ctx.cookSteps[recipe.id]) || {};

  useEffect(() => { setGot({}); }, [recipe.id]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const delivered = recipe.ingredients_livres || [];

  // Ingrédient partagé : le même produit Chronodrive est utilisé par une
  // AUTRE recette encore au planning de la semaine retenue. On le signale
  // pour que la quantité prise ici ne prive pas l'autre recette.
  const removedInWeek = (ctx && ctx.removedInWeek) || {};
  const recettesSemaine = weekRecipes(ctx && ctx.weekKey).filter((r) => !removedInWeek[r.id]);
  const dansLaSemaine = recettesSemaine.some((r) => r.id === recipe.id);
  const sharedCount = (produit) => {
    if (!produit || !dansLaSemaine) return 0;
    const n = recettesSemaine.filter((r) =>
      (r.ingredients_livres || []).some((i) => i.produit_chronodrive === produit)).length;
    return n > 1 ? n : 0;
  };

  // lien vers la recette d'origine : `source` est du texte « Marmiton — https://… »
  const sourceUrl = (String(recipe.source || '').match(/https?:\/\/\S+/) || [null])[0];
  const sourceNom = String(recipe.source || '').split('—')[0].trim();

  const steps = recipe.etapes || [];
  const doneCount = steps.filter((s, k) => stepsDone[k]).length;
  const progress = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;

  return (
    <div className="cook-overlay recipe-overlay" role="dialog" aria-modal="true" aria-label={recipe.nom}>
      <div className="overlay-scrim" onClick={onClose} />
      <div className="cook-panel">

        {/* ---- en-tête : titre, repères, portions ---- */}
        <header className="cook-top">
          <div className="cook-top-main">
            <h1 className="cook-title serif">{recipe.nom}</h1>
            <div className="cook-metas">
              <span className="meta"><Icon name="clock" size={14} className="ic" /> {recipe.temps}</span>
              <span className="meta"><Icon name="list" size={14} className="ic" /> {steps.length} étapes</span>
              {(recipe.ustensiles || []).map((u) => (
                <span className="pill" key={u} style={{ height: 25, fontSize: 11.5 }}>
                  <Icon name="utensil" size={12} /> {u}
                </span>
              ))}
            </div>
          </div>
          <div className="cook-top-side">
            <button className="icon-btn" onClick={onClose} title="Fermer (Échap)" aria-label="Fermer" type="button">
              <Icon name="x" size={18} />
            </button>
            <div className="portion-box">
              <span className="pb-label">Portions</span>
              <Stepper value={portions} min={1} max={6} onChange={setPortions} suffix=" pers." />
            </div>
          </div>
        </header>

        {/* ---- corps ---- */}
        <div className="cook-body">
          <aside className="cook-left scroll">

            {/* ce qu'il faut */}
            <section className="cook-sec cook-sec-ing">
              <div className="cook-sec-head">
                <Icon name="cart" size={16} />
                <h3>Ingrédients</h3>
                <span className="hint tnum" style={{ marginLeft: 'auto' }}>pour {portions} pers.</span>
              </div>
              <div className="ing-list">
                {delivered.map((i, k) => (
                  <button
                    key={'d-' + i.nom + k}
                    type="button"
                    className={'ing-check' + (got['d' + k] ? ' on' : '')}
                    onClick={() => setGot((g) => ({ ...g, ['d' + k]: !g['d' + k] }))}
                  >
                    <span className="ing-box"><Icon name="check" size={12} stroke={3} /></span>
                    <span className="ing-nm">
                      {i.nom}
                      {sharedCount(i.produit_chronodrive) > 0 && <SharedBadge count={sharedCount(i.produit_chronodrive)} />}
                      {i.origine === 'placard' && (
                        <span className="pill ok" style={{ height: 18, fontSize: 9.5, marginLeft: 4 }}>
                          <Icon name="home" size={9} /> Placard
                        </span>
                      )}
                      {i.equivalent ? <span className="ing-note">· {i.equivalent}</span> : null}
                    </span>
                    <span className="ing-q tnum">{scaleIngredientQty(i, portions)}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* nutrition — toujours affichée */}
            <section className="cook-sec cook-sec-nut">
              <div className="cook-sec-head">
                <Icon name="bowl" size={16} />
                <h3>Valeurs nutritionnelles</h3>
              </div>
              <NutritionTable recipe={recipe} portions={portions} />
            </section>

            {recipe.substitutions && recipe.substitutions !== 'aucune' && (
              <section className="cook-sec cook-sec-subs">
                <div className="cook-sub">Substitutions</div>
                <div className="hint" style={{ lineHeight: 1.55 }}>{recipe.substitutions}</div>
              </section>
            )}

            {sourceUrl && (
              <section className="cook-sec cook-sec-cta">
                <a
                  className="btn primary cook-cta"
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="ext" size={17} />
                  Voir la recette originale
                  {sourceNom && <span className="cta-src">· {sourceNom}</span>}
                </a>
              </section>
            )}
          </aside>

          {/* ce qu'on fait */}
          <main className="cook-right scroll">
            <div
              className="cook-sec-head"
              style={{ position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 2, paddingTop: 4, paddingBottom: 4 }}
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
                    {s.titre && <div className="cstep-title">{s.titre}</div>}
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
          </main>
        </div>
      </div>
    </div>
  );
}

/* ---- tableau nutritionnel ----
   Une ligne par nutriment présent dans les données. Colonne « par
   portion » = la valeur du fichier telle quelle ; colonne « total »
   (seulement au-delà d'une portion) = la même valeur mise à l'échelle
   par scaledNutrition. Aucun calcul nouveau. */
function NutritionTable({ recipe, portions }) {
  const base = recipe.nutrition_1portion || {};
  const total = scaledNutrition(recipe, portions);
  const rows = NUTRITION_FIELDS.filter((f) => base[f.key] != null);
  if (!rows.length) return <div className="hint">Valeurs non renseignées pour cette recette.</div>;

  const montreTotal = portions > 1;
  return (
    <table className="nut-table">
      <thead>
        <tr>
          <th>Nutriment</th>
          <th>Par portion</th>
          {montreTotal && <th>Pour {portions} pers.</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((f) => (
          <tr key={f.key}>
            <td>{f.label}</td>
            <td className="val">{fmtNum(base[f.key])} {f.unit}</td>
            {montreTotal && <td className="val val-total">{fmtNum(total[f.key])} {f.unit}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---- badge « ingrédient partagé cette semaine » (survol desktop + tap mobile) ----
   Le déclencheur est un <span> role="button" (jamais un <button> imbriqué dans
   le <button> de la ligne) et stoppe la propagation pour ne pas cocher l'ingrédient.

   Le TOOLTIP est rendu via un PORTAL vers document.body, en position: fixed
   calculée depuis getBoundingClientRect() du badge. Il est ainsi TOTALEMENT hors
   flux : il ne pousse plus le contenu de la liste et ne peut ni chevaucher les
   lignes voisines ni être rogné par le conteneur scrollable. L'état de survol est
   LOCAL à chaque badge (une instance = un état) → un seul tooltip visible à la
   fois, jamais de fantôme. Fermé au départ souris, au scroll/resize (la position
   fixed deviendrait obsolète) et au clic/tap extérieur. ---- */
function SharedBadge({ count }) {
  const badgeRef = useRef(null);
  const [coords, setCoords] = useState(null); // null = caché ; {x,y} = position fixed du tooltip

  const show = () => {
    const el = badgeRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({ x: r.left + r.width / 2, y: r.top }); // ancré au centre-haut du badge
  };
  const hide = () => setCoords(null);
  // pointer/tap = AFFICHER (jamais toggle) : sur mobile, un tap synthétise
  // mouseenter PUIS click ; un toggle refermerait aussitôt le tooltip. On ferme
  // donc via départ souris / scroll / tap extérieur / Échap.
  const openOn = (e) => { e.stopPropagation(); show(); };

  useEffect(() => {
    if (!coords) return undefined;
    const onScrollResize = () => hide();
    const onOutside = (e) => { if (badgeRef.current && !badgeRef.current.contains(e.target)) hide(); };
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    return () => {
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
    };
  }, [coords]);

  return (
    <span
      ref={badgeRef}
      role="button"
      tabIndex={0}
      className="pill amber"
      style={{ height: 18, fontSize: 9.5, marginLeft: 4, cursor: 'help' }}
      aria-label={`Ingrédient aussi utilisé dans ${count} recettes cette semaine`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={openOn}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openOn(e); }
        else if (e.key === 'Escape') hide();
      }}
    >
      <Icon name="alert" size={9} /> ×{count}
      {coords && createPortal(
        <span
          role="tooltip"
          style={{
            position: 'fixed', left: coords.x, top: coords.y,
            transform: 'translate(-50%, calc(-100% - 8px))',
            zIndex: 9999, pointerEvents: 'none',
            background: 'var(--text)', color: 'var(--bg)',
            fontSize: 11.5, fontWeight: 500, padding: '7px 11px', borderRadius: 8,
            width: 230, maxWidth: '72vw', lineHeight: 1.35, textAlign: 'left',
            boxShadow: 'var(--shadow-lg)', whiteSpace: 'normal',
          }}
        >
          Cet ingrédient est aussi utilisé dans d'autres recettes cette semaine — respecte bien la quantité indiquée pour ne pas en manquer.
        </span>,
        document.body,
      )}
    </span>
  );
}
