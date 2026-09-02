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

/** « tout remettre » — visible seulement si des recettes ont été retirées
    de la semaine-type en cours */
export function ResetRemovedButton({ ctx }) {
  if (!ctx.removedCount) return null;
  return (
    <button type="button" className="btn ghost" onClick={ctx.resetRemoved}
      title="Remettre toutes les recettes retirées dans cette semaine">
      <Icon name="refresh" size={15} /> Tout remettre ({ctx.removedCount})
    </button>
  );
}

/** Export CSV de la bibliothèque de recettes. Toujours la base ENTIÈRE,
    jamais le sous-ensemble filtré à l'écran : c'est une sauvegarde, pas une
    vue. Utilisable au doigt sur mobile (téléchargement natif, ou feuille de
    partage iOS — voir exportRecipesCsv). */
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
        title={`Télécharger un CSV des ${RECIPES.length} recettes de la base`}>
        <Icon name="upload" size={15} />
        {etat.busy ? 'Export en cours…' : 'Exporter toutes les recettes (CSV)'}
      </button>
      {etat.message && <span className="hint">{etat.message}</span>}
    </div>
  );
}

/** Export CSV de la base ingrédients — une ligne par entrée de
    ingredients_ref. Comme l'export recettes : toujours la base ENTIÈRE, et
    utilisable au doigt sur mobile (téléchargement natif, ou feuille de
    partage iOS — voir exportIngredientsCsv). */
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
        title={`Télécharger un CSV des ${Object.keys(ING_REF).length} ingrédients de la base`}>
        <Icon name="upload" size={15} />
        {etat.busy ? 'Export en cours…' : 'Exporter tous les ingrédients (CSV)'}
      </button>
      {etat.message && <span className="hint">{etat.message}</span>}
    </div>
  );
}
