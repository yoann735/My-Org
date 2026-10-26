/* ============================================================
   MedRevise — BOUTON « À APPRENDRE » (26/10, docs/compte-rendu-flashcards.md).
   La MÊME icône partout où une carte est affichée (liste du panneau, vue agrandie, séance de
   révision, tableau de bord et session du mode Apprentissage) : une étoile, pleine quand la carte
   est taguée. Un tap bascule le tag (lib/aApprendre.js — n'écrit que `aApprendre`), puis une
   confirmation discrète : toast « Ajoutée à À apprendre » / « Retirée d’À apprendre » · Annuler.
   Les clics ne remontent jamais à la carte (qui se retourne au clic).
   ============================================================ */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Icon } from '../../shared/Icon.jsx';
import { estAApprendre, admissibleAApprendre, ecrireAApprendre } from '../lib/aApprendre.js';
import '../../styles/actions-carte.css';

/* TOAST hors du cycle de vie de la carte : la carte peut disparaître de la liste à l'instant où on retire son tag
   (filtre « À apprendre » actif) — « Annuler » doit rester là. Un seul hôte, monté une fois sur document.body. */
let hote = null;
let minuteur = null;
function montrerToast(t) {
  if (!hote) { const d = document.createElement('div'); d.className = 'aap-toast-hote'; document.body.appendChild(d); hote = createRoot(d); }
  clearTimeout(minuteur);
  const fermer = () => { clearTimeout(minuteur); hote.render(null); };
  if (!t) { fermer(); return; }
  hote.render(
    /* téléphone : en HAUT de l'écran — en bas, il recouvrirait les boutons de notation de la séance pendant 4,5 s */
    <div className={'sn-toast' + (t.mobile ? ' mobile haut' : '')} role="status" data-toast="aap">
      <Icon name="star" size={14} fill />
      <span className="sn-toast-texte">{t.texte}</span>
      {t.annuler && <button type="button" className="sn-toast-action" onClick={() => { fermer(); t.annuler(); }}>Annuler</button>}
    </div>,
  );
  minuteur = setTimeout(fermer, 4500);
}

/* `classe` : classe du bouton (« ac-icone » dans une rangée d'icônes de carte, « cd-ic » ailleurs) ;
   `taille` : taille de l'icône ; `mobile` : toast au-dessus de la zone sûre du téléphone */
export function BoutonAApprendre({ ctx, carte, classe = 'ac-icone', taille = 15, mobile = false }) {
  const [vu, setVu] = useState(null); // valeur affichée en attendant que la base rafraîchisse la carte
  const enBase = estAApprendre(carte);
  useEffect(() => { setVu(null); }, [enBase, carte && carte.id]);
  if (!admissibleAApprendre(carte)) return null;
  const actif = vu == null ? enBase : vu;
  const stop = (e) => e.stopPropagation();

  const ecrire = async (valeur) => {
    setVu(valeur);
    try { await ecrireAApprendre(carte.id, valeur, ctx.saveQuestion); return true; } catch (e) { setVu(null); montrerToast({ texte: e.message, mobile }); return false; }
  };
  const basculer = async () => {
    const avant = actif;
    const id = carte.id, sauver = ctx.saveQuestion;
    // « Annuler » n'a besoin que de l'id : il marche même si cette carte n'est plus affichée
    if (await ecrire(!avant)) montrerToast({ texte: !avant ? 'Ajoutée à À apprendre' : 'Retirée d’À apprendre', mobile, annuler: () => ecrireAApprendre(id, avant, sauver).catch(() => {}) });
  };

  return (
    <button type="button" className={classe + ' aap-bt' + (actif ? ' actif' : '')} data-aap={actif ? 'oui' : 'non'} aria-pressed={actif}
      title={actif ? 'À apprendre — retirer le tag' : 'Marquer « À apprendre »'} aria-label="À apprendre"
      onClick={(e) => { stop(e); basculer(); }} onPointerDown={stop} onMouseDown={stop} onTouchStart={stop} onTouchEnd={stop}>
      <Icon name="star" size={taille} fill={actif} />
    </button>
  );
}

/** petite étiquette « À apprendre » posée sur une carte taguée */
export const EtiquetteAApprendre = ({ carte }) => (estAApprendre(carte) ? <span className="aap-etiquette" data-etiquette="aap"><Icon name="star" size={10} fill /> À apprendre</span> : null);
