/* shared bits used across screens */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { RECIPES, ING_REF } from '../data/dataLayer.js';
import { exportRecipesCsv } from '../lib/exportRecipesCsv.js';
import { exportIngredientsCsv } from '../lib/exportIngredientsCsv.js';

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

/** Mode éco toggle — bascule vers les semaines éco (E1/E2) moins chères */
export function EcoToggle({ ctx }) {
  return (
    <button
      type="button"
      className={'btn' + (ctx.ecoMode ? ' primary' : '')}
      onClick={ctx.toggleEco}
      title="Basculer entre les semaines standard et les semaines éco (moins chères)"
    >
      <Icon name={ctx.ecoMode ? 'check' : 'euro'} size={15} />
      {ctx.ecoMode ? 'Mode éco activé' : 'Mode éco'}
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

/** Export CSV exhaustif de la bibliothèque — une ligne par couple
    (recette, ingrédient), ingrédients livrés ET non inclus. Toujours la base
    ENTIÈRE (43 recettes), jamais le sous-ensemble filtré à l'écran : c'est une
    sauvegarde, pas une vue. Utilisable au doigt sur mobile (téléchargement
    natif, ou feuille de partage iOS — voir exportRecipesCsv). */
export function ExportCsvButton({ className = 'btn', style }) {
  const [etat, setEtat] = useState({ busy: false, message: '' });

  const run = async () => {
    if (etat.busy) return;
    setEtat({ busy: true, message: '' });
    const res = await exportRecipesCsv(RECIPES);
    setEtat({ busy: false, message: res.message });
  };

  return (
    <div className="row wrap" style={{ gap: 10, ...style }}>
      <button type="button" className={className} onClick={run} disabled={etat.busy}
        title={`Télécharger un CSV détaillé des ${RECIPES.length} recettes (une ligne par ingrédient)`}>
        <Icon name="upload" size={15} />
        {etat.busy ? 'Export en cours…' : 'Exporter toutes les recettes (CSV)'}
      </button>
      {etat.message && <span className="hint">{etat.message}</span>}
    </div>
  );
}

/** Export CSV exhaustif de la base ingrédients — une ligne par couple
    (ingrédient, format d'achat) : les 140 entrées de ingredients_ref, un
    ingrédient multi-format donnant une ligne par format. Prix Chronodrive,
    contenance et prix au kg/L compris. Comme l'export recettes : toujours la
    base ENTIÈRE, et utilisable au doigt sur mobile (téléchargement natif, ou
    feuille de partage iOS — voir exportIngredientsCsv). */
export function ExportIngredientsCsvButton({ className = 'btn', style }) {
  const [etat, setEtat] = useState({ busy: false, message: '' });

  const run = async () => {
    if (etat.busy) return;
    setEtat({ busy: true, message: '' });
    const res = await exportIngredientsCsv(ING_REF);
    setEtat({ busy: false, message: res.message });
  };

  return (
    <div className="row wrap" style={{ gap: 10, ...style }}>
      <button type="button" className={className} onClick={run} disabled={etat.busy}
        title={`Télécharger un CSV détaillé des ${Object.keys(ING_REF).length} ingrédients (une ligne par format d'achat, prix Chronodrive)`}>
        <Icon name="upload" size={15} />
        {etat.busy ? 'Export en cours…' : 'Exporter tous les ingrédients (CSV)'}
      </button>
      {etat.message && <span className="hint">{etat.message}</span>}
    </div>
  );
}
