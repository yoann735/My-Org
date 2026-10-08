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
   ============================================================ */
import { lazy, Suspense, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { FlashcardForm } from './AddItemForm.jsx';
import { OcclusionEditorModal } from './OcclusionImage.jsx';
import { FormulaireMuscle } from './FlashcardMuscle.jsx';

const FormulaireMolecule = lazy(() => import('../molecule/FormulaireMolecule.jsx'));

const SORTES = { muscle: 'Tableau muscle', molecule: 'Molécule' };
const MOLECULE_PRETE = false; // le choix « + Molécule » s'affiche quand l'éditeur est livré

export function CarteAjoutFlashcard({ ctx, ficheId, themeDefaut = '', onAjouter, onTerminer, busy, rectoInitial = null }) {
  const [sorte, setSorte] = useState('standard'); // standard | muscle | molecule
  const [moleculeVue, setMoleculeVue] = useState(false); // monté une fois ouvert (chargement à la demande)
  const [nb, setNb] = useState(0);
  const [occ, setOcc] = useState(null); // { fichier, recto, verso, theme } → éditeur de masques
  const [cle, setCle] = useState(0); // remise à zéro du formulaire standard (après une carte à masques)
  const racine = useRef(null);
  const ajouter = async (raw) => { await onAjouter(raw); setNb((n) => n + 1); };
  const choisir = (x) => { setSorte(x); if (x === 'molecule') setMoleculeVue(true); };

  return (
    <div className="pis-add card fc-carte" ref={racine} style={{ margin: '4px 0 12px' }}>
      <div className="card-body">
        <div className="fc-carte-tete">
          {sorte === 'standard' ? (
            <div className="fc-sortes" role="group" aria-label="Autres sortes de carte">
              <button type="button" className="fc-sorte" onClick={() => choisir('muscle')}><Icon name="plus" size={12} /> Tableau muscle</button>
              {MOLECULE_PRETE && <button type="button" className="fc-sorte" onClick={() => choisir('molecule')}><Icon name="plus" size={12} /> Molécule</button>}
            </div>
          ) : (
            <div className="fc-sortes">
              <button type="button" className="fc-sorte retour" onClick={() => setSorte('standard')}><Icon name="chevL" size={12} /> Carte standard</button>
              <span className="fc-sorte-titre">{SORTES[sorte]}</span>
            </div>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn sm" onClick={onTerminer}>Terminer</button>
        </div>
        {nb > 0 && <div className="fc-carte-nb tnum">{nb} flashcard{nb > 1 ? 's' : ''} ajoutée{nb > 1 ? 's' : ''} ✓ — continue, ou « Terminer »</div>}
        <div hidden={sorte !== 'standard'}>
          <FlashcardForm key={cle} apercu clavier themeDefaut={themeDefaut} onAdd={ajouter} busy={busy}
            onCancel={onTerminer} submitLabel="Ajouter"
            rectoInitial={rectoInitial || ''} onOcclusion={(x) => setOcc(x)} />
        </div>
        <div hidden={sorte !== 'muscle'}>
          <FormulaireMuscle themeDefaut={themeDefaut} onAdd={ajouter} onCancel={onTerminer} busy={busy}
            actif={sorte === 'muscle'} racine={racine} />
        </div>
        {moleculeVue && (
          <div hidden={sorte !== 'molecule'}>
            <Suspense fallback={<div className="hint mol-chargement"><span className="mu-sablier" /> Chargement de l’éditeur de molécules…</div>}>
              <FormulaireMolecule themeDefaut={themeDefaut} onAdd={ajouter} onCancel={onTerminer} busy={busy} actif={sorte === 'molecule'} />
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
