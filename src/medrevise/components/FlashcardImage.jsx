/* ============================================================
   MedRevise — IMAGE D'UNE FLASHCARD TEXTE (recto / verso / les deux).

   Données (sur la question, type 'flashcard') :
     imageId     — blob de l'image (putBlob, lib/storage.js : même stockage et
                   même synchro que les PDF ; un champ « …Id » est couvert d'office
                   par l'audit des fichiers) ;
     imagePlace  — 'recto' | 'verso' | 'deux'. ABSENT = 'recto' : c'est ainsi
                   que s'affichaient déjà les flashcards d'anatomie qui portaient
                   un imageId — elles ne changent pas.
   Les flashcards IMAGE à masques (occlusion) ne sont pas concernées : elles ont
   leur propre image (components/OcclusionImage.jsx).
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { blobURL } from '../lib/storage.js';

export const PLACES_IMAGE = [
  { id: 'recto', label: 'Recto' },
  { id: 'verso', label: 'Verso' },
  { id: 'deux', label: 'Les deux' },
];

/** où l'image de cette carte s'affiche : 'recto' | 'verso' | 'deux' | null */
export function placeImage(item) {
  if (!item || !item.imageId || item.occlusion) return null;
  return item.imagePlace === 'verso' || item.imagePlace === 'deux' ? item.imagePlace : 'recto';
}
export const imageAuRecto = (item) => ['recto', 'deux'].includes(placeImage(item));
export const imageAuVerso = (item) => ['verso', 'deux'].includes(placeImage(item));

/** l'image elle-même (blob → URL objet, libérée au démontage). */
export function ImageFlashcard({ imageId, maxH = 240, className = '' }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let vivant = true; let u = null;
    blobURL(imageId).then((x) => { u = x; if (vivant) setUrl(x); });
    return () => { vivant = false; if (u) URL.revokeObjectURL(u); };
  }, [imageId]);
  if (!imageId) return null;
  return (
    <div className={'fc-image ' + className} style={{ maxHeight: maxH }}>
      {url ? <img src={url} alt="" style={{ maxHeight: maxH }} /> : <span className="fc-image-ph"><Icon name="image" size={22} /></span>}
    </div>
  );
}

/** Champ du formulaire : ajouter / remplacer / retirer l'image + où l'afficher.
    Contrôlé : { imageId, fichier, place } — le fichier n'est écrit (putBlob)
    qu'à l'enregistrement de la carte, jamais avant. */
export function ChampImageFlashcard({ valeur, onChange }) {
  const { imageId, fichier, place } = valeur;
  const input = useRef(null);
  const [apercu, setApercu] = useState(null);
  useEffect(() => {
    if (!fichier) { setApercu(null); return undefined; }
    const u = URL.createObjectURL(fichier); setApercu(u);
    return () => URL.revokeObjectURL(u);
  }, [fichier]);
  const aUneImage = !!(fichier || imageId);
  const choisir = (f) => { if (f && /^image\//.test(f.type || '')) onChange({ ...valeur, fichier: f }); };
  return (
    <div className="imp-field fci-champ">
      <label>Image <span className="imp-opt">(optionnelle)</span></label>
      <input ref={input} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => { choisir(e.target.files[0]); e.target.value = ''; }} />
      {!aUneImage ? (
        <button type="button" className="fc-ajout" onClick={() => input.current && input.current.click()}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); choisir(e.dataTransfer.files[0]); }}>
          <Icon name="image" size={15} /> Ajouter une image <span className="imp-opt">— ou colle-la (<kbd>⌘V</kbd> / <kbd>Ctrl+V</kbd>), ou glisse-la ici</span>
        </button>
      ) : (
        <div className="fc-choisie">
          <div className="fc-vignette">
            {apercu ? <img src={apercu} alt="" /> : <ImageFlashcard imageId={imageId} maxH={64} />}
          </div>
          <div className="fc-reglages">
            <span className="fc-reglages-titre">Afficher au</span>
            <div className="seg fc-seg">
              {PLACES_IMAGE.map((p) => (
                <button key={p.id} type="button" className={'seg-btn' + (place === p.id ? ' active' : '')}
                  onClick={() => onChange({ ...valeur, place: p.id })}>{p.label}</button>
              ))}
            </div>
            <div className="fc-liens">
              <button type="button" className="linklike" onClick={() => input.current && input.current.click()}>Remplacer</button>
              <button type="button" className="linklike fc-retirer" onClick={() => onChange({ imageId: null, fichier: null, place })}>Retirer l'image</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
