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
import { useEffect, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { blobURL } from '../lib/storage.js';
import { ZoneImage } from './ZoneImage.jsx';

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
    qu'à l'enregistrement de la carte, jamais avant. Zone de collage « image » (survol, ⌘V,
    lib/collerAuSurvol.js) ; `onColler(fichier)` : bouton « Coller » des écrans tactiles.
    (11/10, Zones image v2) même composant que les cartes Muscle : components/ZoneImage.jsx. */
export function ChampImageFlashcard({ valeur, onChange, onColler = null }) {
  const { place } = valeur;
  const aUneImage = !!(valeur.fichier || valeur.imageId);
  const places = aUneImage && (
    <div className="zim-place" role="group" aria-label="Afficher l’image au">
      <span className="zim-place-titre" title="Face de la carte où l’image s’affiche">Afficher au</span>
      <div className="seg fc-seg">
        {PLACES_IMAGE.map((p) => (
          <button key={p.id} type="button" className={'seg-btn' + (place === p.id ? ' active' : '')}
            onClick={() => onChange({ ...valeur, place: p.id })}>{p.label}</button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="imp-field fci-champ" data-zone-image="image">
      <label>Image <span className="imp-opt">(optionnelle)</span></label>
      <ZoneImage valeur={valeur} taille="carte" libelle="Image" onColler={onColler} aside={places}
        onChange={(v) => onChange({ imageId: v.imageId || null, fichier: v.fichier || null, place })} />
    </div>
  );
}
