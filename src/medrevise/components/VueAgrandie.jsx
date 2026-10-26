/* ============================================================
   MedRevise — « AGRANDIR » une carte du panneau Flashcards (26/10, docs/compte-rendu-flashcards.md).
   La carte en grand, EXACTEMENT comme en révision : même composant d'affichage que la séance du jour
   (session/SeanceFC.jsx FaceFC — recto, retourner, verso, champs Muscle / Tableau révélables un par un),
   même cadre `.sfc-carte`, même rangée d'icônes (« À apprendre » toujours, carnet une fois retournée).
   Aucune notation : rien n'est planifié ni journalisé.
   Échap ou clic dehors : ferme. ← → : carte précédente / suivante de la liste (filtres compris).
   Espace / Entrée : retourner. Fenêtre montée sur document.body (le panneau transformé ne l'enferme pas).
   ============================================================ */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { FaceFC } from '../session/SeanceFC.jsx';
import { ActionsCarte } from './ActionsCarte.jsx';
import { EtiquetteAApprendre } from './BoutonAApprendre.jsx';
import { ligneParLigne } from './FlashcardMuscle.jsx';

const etroit = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(max-width: 760px)').matches;

/* `ids` : l'ordre de la liste affichée ; `id` : la carte agrandie ; `onChanger(id)` ; `onFermer()` */
export function VueAgrandie({ ctx, ids, id, onChanger, onFermer }) {
  const [retournee, setRetournee] = useState(false);
  const mobile = etroit();
  const carte = (ctx.db.questions || []).find((q) => q.id === id) || null;
  const i = ids.indexOf(id);
  useEffect(() => { setRetournee(false); }, [id]);
  useEffect(() => {
    const k = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('.cn-pop, .cn-feuille, .ac-fenetre')) return; // menu du carnet ouvert : il prend Échap
      if (e.key === 'Escape') { e.preventDefault(); onFermer(); }
      else if (e.key === 'ArrowRight' && i >= 0 && i < ids.length - 1) { e.preventDefault(); onChanger(ids[i + 1]); }
      else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); onChanger(ids[i - 1]); }
      else if ((e.key === ' ' || e.key === 'Enter') && !(t && t.closest && t.closest('button:not(.sfc-carte)'))) { e.preventDefault(); setRetournee((r) => !r); }
    };
    // phase de CAPTURE : la rangée d'icônes de la carte (ActionsCarte) arrête la propagation du clavier ; Échap doit
    // fermer même quand le focus est sur l'étoile ou le carnet
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [i, ids, onChanger, onFermer]);
  if (!carte) return null;
  return createPortal(
    <div className="alib2-apercu-fond va-fond" onClick={onFermer}>
      <div className={'alib2-apercu va' + (mobile ? ' mobile' : '')} role="dialog" aria-label="Carte agrandie" data-agrandie={carte.id} onClick={(e) => e.stopPropagation()}>
        <div className="alib2-atete">
          <span className="alib2-acours">{carte.theme || 'Sans thème'}<EtiquetteAApprendre carte={carte} /></span>
          <span className="hint tnum" data-position>{i + 1} / {ids.length}</span>
          <button type="button" className="cn-fermer" onClick={onFermer} aria-label="Fermer" title="Fermer (Échap)"><Icon name="x" size={15} /></button>
        </div>
        <div className="sfc va-sfc">
          <div className="sfc-carte-cadre">
            <button type="button" className="sfc-carte avec-actions" key={carte.id + ':' + (retournee ? 'v' : 'r')} data-carte={carte.id} data-cote={retournee ? 'verso' : 'recto'}
              onClick={() => setRetournee((r) => !r)}>
              <FaceFC carte={carte} cote={retournee ? 'verso' : 'recto'} masquable={ligneParLigne(ctx)} />
              {!retournee && <span className="sfc-indication">Touche pour voir la réponse</span>}
            </button>
            <ActionsCarte ctx={ctx} carte={carte} mobile={mobile} carnet={retournee} />
          </div>
        </div>
        <div className="alib2-apied">
          <button type="button" className="icon-btn" disabled={i <= 0} onClick={() => onChanger(ids[i - 1])} aria-label="Carte précédente" title="Carte précédente (←)" data-va="prec"><Icon name="chevL" size={17} /></button>
          <button type="button" className="btn" data-va="retourner" onClick={() => setRetournee((r) => !r)}><Icon name="refresh" size={13} /> Retourner</button>
          <button type="button" className="icon-btn" disabled={i < 0 || i >= ids.length - 1} onClick={() => onChanger(ids[i + 1])} aria-label="Carte suivante" title="Carte suivante (→)" data-va="suiv"><Icon name="chevR" size={17} /></button>
        </div>
      </div>
    </div>, document.body);
}
