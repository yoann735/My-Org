/* ============================================================
   MedRevise — MASQUES PRODUITS PAR UNE IA, dans l'éditeur de flashcard image (22/11/2026,
   docs/compte-rendu-masques-ia.md).

   - `BoutonPromptMasques` : copie le prompt autonome (lib/masquesIA.js#PROMPT_MASQUES_IA), à coller
     AVEC l'image dans n'importe quelle IA ;
   - `CollerMasques` : zone de collage (marche sur iPhone : un champ texte, pas l'API presse-papiers)
     + choix d'un fichier .json → lecture tolérante → OCR EXISTANT de l'image (ocr/ocrImage.js, même
     worker Tesseract.js) → recalage → `onImporter(liste)`. Rien n'est enregistré ici : l'éditeur
     (components/OcclusionImage.jsx) ajoute les masques en aperçu, puis « Valider » ou « Annuler ».
   ============================================================ */
import { useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { ocrImage } from '../ocr/ocrImage.js';
import { PROMPT_MASQUES_IA, lireMasquesIA, recalerMasques } from '../lib/masquesIA.js';

/** copie un texte : API presse-papiers, sinon sélection d'un champ caché (anciens Safari) */
async function copier(texte) {
  try { await navigator.clipboard.writeText(texte); return true; } catch (e) { /* repli ci-dessous */ }
  try {
    const t = document.createElement('textarea');
    t.value = texte; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(t); t.select(); t.setSelectionRange(0, texte.length);
    const ok = document.execCommand('copy'); t.remove(); return ok;
  } catch (e) { return false; }
}

export function BoutonPromptMasques() {
  const [etat, setEtat] = useState(null); // null | 'ok' | 'ko'
  return (
    <button type="button" className="btn sm occ-ia-btn" data-prompt-masques
      title="Copie un prompt à coller, avec l’image, dans n’importe quelle IA : elle répond par la liste des masques"
      onClick={async () => { const ok = await copier(PROMPT_MASQUES_IA); setEtat(ok ? 'ok' : 'ko'); setTimeout(() => setEtat(null), 1800); }}>
      <Icon name={etat === 'ok' ? 'check' : 'copy'} size={13} /> {etat === 'ok' ? 'Prompt copié' : etat === 'ko' ? 'Copie refusée' : 'Copier le prompt IA'}
    </button>
  );
}

/** panneau d'import. `image` = { url, w, h, blobId } ; onImporter({ liste, avertissements }) ; onFermer() */
export function CollerMasques({ image, onImporter, onFermer }) {
  const [texte, setTexte] = useState('');
  const [erreur, setErreur] = useState(null);
  const [lecture, setLecture] = useState(false);
  const fichierRef = useRef(null);

  const importer = async (brut) => {
    setErreur(null);
    const r = lireMasquesIA(brut, { W: image.w, H: image.h });
    if (!r.ok) { setErreur(r.erreur); return; }
    setLecture(true);
    let ocr = null;
    try { ocr = await ocrImage(image.blobId ? { blobId: image.blobId } : { src: image.url }); } catch (e) { ocr = null; }
    const liste = recalerMasques(r.masques, ocr, { W: image.w, H: image.h });
    const avertissements = [...r.avertissements];
    if (!ocr || !(ocr.mots || []).length) avertissements.push('L’image n’a pas pu être lue (OCR) : aucun masque n’a été recalé.');
    setLecture(false);
    onImporter({ liste, avertissements });
  };

  const choisirFichier = async (f) => {
    if (!f) return;
    try { const t = await f.text(); setTexte(t); importer(t); } catch (e) { setErreur('Fichier illisible.'); }
  };

  return (
    <div className="occ-ia card" data-coller-masques>
      <div className="occ-ia-tete">
        <b>Coller des masques</b>
        <span className="hint">Colle la réponse de l’IA (le JSON), ou choisis un fichier .json.</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="icon-btn" title="Fermer" aria-label="Fermer" onClick={onFermer}><Icon name="x" size={14} /></button>
      </div>
      <textarea className="occ-ia-zone" value={texte} onChange={(e) => { setTexte(e.target.value); setErreur(null); }} rows={5}
        placeholder={'{"format":"medrevise-masques","version":1,"masques":[…]}'} spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={lecture} />
      {erreur && <div className="occ-ia-erreur" role="alert"><Icon name="alert" size={12} /> {erreur}</div>}
      <div className="occ-ia-actions">
        <input ref={fichierRef} type="file" accept=".json,application/json,text/plain" hidden onChange={(e) => { choisirFichier(e.target.files && e.target.files[0]); e.target.value = ''; }} />
        <button type="button" className="btn ghost sm" disabled={lecture} title="Choisir un fichier .json de masques" onClick={() => fichierRef.current && fichierRef.current.click()}>
          <Icon name="folder" size={13} /> Choisir un fichier .json
        </button>
        <span style={{ flex: 1 }} />
        {lecture && <span className="hint"><span className="mu-sablier" /> Lecture de l’image et recalage…</span>}
        <button type="button" className="btn primary sm" disabled={lecture || !texte.trim()} title="Lire le JSON et recaler les masques sur l’image" onClick={() => importer(texte)}>
          <Icon name="check" size={13} /> Importer
        </button>
      </div>
    </div>
  );
}
