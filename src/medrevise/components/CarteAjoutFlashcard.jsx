/* ============================================================
   MedRevise — CARTE D'AJOUT DE FLASHCARD du panneau (05/10 ; formulaire unifié 08/10).

   Affichée EN PLACE dans le mode Exercices › Flashcards (pas de modale).
   UN SEUL formulaire (08/10, docs/compte-rendu-flashcards-molecules.md) : recto, verso,
   zone Image facultative. Dès qu'une image est ajoutée (coller ⌘V, glisser, parcourir),
   la carte devient une carte image et ses options apparaissent (afficher au recto / au
   verso / sur les deux faces, « Masques à deviner… » avec « Masquer des mots » par OCR) ;
   retirer l'image ramène aux options texte. Plus de sélecteur « Texte · Image ».
   À côté du formulaire, deux choix qui le transforment : « + Tableau muscle »
   (components/FlashcardMuscle.jsx) et « + Molécule » (molecule/FormulaireMolecule.jsx,
   chargé à la demande : l'éditeur de molécules ne pèse rien tant qu'on ne l'ouvre pas).
   Les formulaires restent MONTÉS (l'un masqué) : changer de sorte ne perd rien.
   Après chaque ajout, la carte reste ouverte et vide pour enchaîner ; « Terminer » la ferme.
   REFONTE (22/10, docs/compte-rendu-tableau-flashcards.md §6) : un SÉLECTEUR DE TYPE unique et compact en tête
   (Texte · Muscle · Tableau · Molécule) qui transforme le formulaire ; plus de « Terminer » flottant — « Annuler »
   ferme, « Ajouter » (⌘↵) enregistre et laisse le formulaire vide pour enchaîner. Le MÊME composant sert à la
   MODIFICATION (`initial`) : sa sorte y est affichée, verrouillée.
   ============================================================ */
import { lazy, Suspense, useRef, useState } from 'react';
import { FlashcardForm } from './AddItemForm.jsx';
import { OcclusionEditorModal } from './OcclusionImage.jsx';
import { FormulaireMuscle } from './FlashcardMuscle.jsx';
import { FormulaireTableau } from './FlashcardTableau.jsx';
import { estMuscle } from '../lib/muscle.js';
import { estTableau } from '../lib/carteTableau.js';
import { estMolecule } from '../molecule/carte.js';

const FormulaireMolecule = lazy(() => import('../molecule/FormulaireMolecule.jsx'));

export const SORTES = [{ id: 'standard', label: 'Texte' }, { id: 'muscle', label: 'Muscle' }, { id: 'tableau', label: 'Tableau' }, { id: 'molecule', label: 'Molécule' }];
export const sorteDe = (item) => (estMuscle(item) ? 'muscle' : estTableau(item) ? 'tableau' : estMolecule(item) ? 'molecule' : 'standard');

export function CarteAjoutFlashcard({ ctx, ficheId, themeDefaut = '', onAjouter, onTerminer, busy, rectoInitial = null, initial = null }) {
  const edition = !!initial;
  const [sorte, setSorte] = useState(() => (initial ? sorteDe(initial) : 'standard'));
  const [moleculeVue, setMoleculeVue] = useState(() => !!(initial && sorteDe(initial) === 'molecule')); // monté une fois ouvert (chargement à la demande)
  const [nb, setNb] = useState(0);
  const [occ, setOcc] = useState(null); // { fichier, recto, verso, theme } → éditeur de masques
  const [cle, setCle] = useState(0); // remise à zéro du formulaire standard (après une carte à masques)
  const racine = useRef(null);
  const ajouter = async (raw) => { await onAjouter(raw); setNb((n) => n + 1); };
  const choisir = (x) => { setSorte(x); if (x === 'molecule') setMoleculeVue(true); };
  const libelle = edition ? 'Enregistrer' : 'Ajouter';

  return (
    /* un appui sur « Ajouter » / « Annuler » / une sorte ne retire pas le focus du champ en cours : sur tablette, la perte
       du focus replie le volet du panneau et déplaçait le bouton sous le doigt avant le « click » (toucher manqué) */
    <div className={'pis-add card fc-carte' + (edition ? ' edition' : '')} ref={racine} style={{ margin: '4px 0 12px' }}
      onMouseDown={(e) => { if (e.target.closest && e.target.closest('.imp-actions button, .fc-type')) e.preventDefault(); }}>
      <div className="card-body">
        <div className="fc-carte-tete">
          <div className="fc-types" role="radiogroup" aria-label="Sorte de carte">
            {SORTES.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={sorte === t.id} data-sorte={t.id} disabled={edition && sorte !== t.id}
                className={'fc-type' + (sorte === t.id ? ' actif' : '')} onClick={() => !edition && choisir(t.id)}
                title={edition ? 'La sorte d’une carte ne change pas une fois créée' : `Carte ${t.label.toLowerCase()}`}>{t.label}</button>
            ))}
          </div>
          {edition && <span className="fc-carte-mode">Modification</span>}
          {!edition && nb > 0 && <span className="fc-carte-nb tnum" aria-live="polite">{nb} ajoutée{nb > 1 ? 's' : ''} ✓</span>}
        </div>
        <div hidden={sorte !== 'standard'}>
          <FlashcardForm key={cle} apercu clavier themeDefaut={themeDefaut} onAdd={ajouter} busy={busy} initial={edition && sorte === 'standard' ? initial : undefined}
            onCancel={onTerminer} submitLabel={libelle}
            rectoInitial={rectoInitial || ''} onOcclusion={(x) => setOcc(x)} />
        </div>
        {(!edition || sorte === 'muscle') && (
          <div hidden={sorte !== 'muscle'}>
            <FormulaireMuscle themeDefaut={themeDefaut} onAdd={ajouter} onCancel={onTerminer} busy={busy} initial={edition ? initial : null} submitLabel={libelle}
              actif={sorte === 'muscle'} racine={racine} />
          </div>
        )}
        {(!edition || sorte === 'tableau') && (
          <div hidden={sorte !== 'tableau'}>
            <FormulaireTableau themeDefaut={themeDefaut} onAdd={ajouter} onCancel={onTerminer} busy={busy} initial={edition ? initial : null} submitLabel={libelle} />
          </div>
        )}
        {moleculeVue && (!edition || sorte === 'molecule') && (
          <div hidden={sorte !== 'molecule'}>
            <Suspense fallback={<div className="hint mol-chargement"><span className="mu-sablier" /> Chargement de l’éditeur de molécules…</div>}>
              <FormulaireMolecule themeDefaut={themeDefaut} onAdd={ajouter} onCancel={onTerminer} busy={busy} actif={sorte === 'molecule'} initial={edition ? initial : null} submitLabel={libelle} />
            </Suspense>
          </div>
        )}
      </div>
      {occ && (
        <OcclusionEditorModal ctx={ctx} ficheId={ficheId} imageInitiale={occ.fichier}
          rectoInitial={occ.recto} versoInitial={occ.verso} themeInitial={occ.theme}
          onClose={() => setOcc(null)}
          onSaved={() => { setNb((n) => n + 1); setCle((k) => k + 1); }} />
      )}
    </div>
  );
}
