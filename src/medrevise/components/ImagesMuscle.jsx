/* ============================================================
   MedRevise — IMAGES D'UNE CARTE MUSCLE (10/10 soir, modèle dans lib/muscle.js).

   - ImageMuscle : vignette dans une ligne du tableau (ou image générale du muscle) ; un
     toucher l'agrandit (VisionneuseImage) — jamais il ne retourne la carte ni ne révèle
     une autre ligne (propagation arrêtée).
   - VisionneuseImage : l'image en grand ; « Texte » affiche le texte reconnu (OCR existant,
     ocr/ocrImage.js, mis en cache par image) en calque SÉLECTIONNABLE, « Copier le texte » ;
     les mots masqués (« Masquer des mots ») sont couverts jusqu'à « Révéler ».
   - ChampImageMuscle : dans le formulaire — ajouter (parcourir, coller, glisser), remplacer,
     retirer, « Masquer des mots » (components/MasquerMots.jsx, la même fenêtre que pour une
     flashcard image). Le fichier n'est écrit (putBlob) qu'à l'enregistrement de la carte.
   (11/10, Zones image v2) ImageMuscle et ChampImageMuscle ne sont plus que des raccourcis vers
   le composant unique components/ZoneImage.jsx (VignetteImage, ZoneImage).
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { ocrImage } from '../ocr/ocrImage.js';
import { VignetteImage, ZoneImage, useUrlImage } from './ZoneImage.jsx';
import '../../styles/muscle-images.css';

export { useUrlImage };

const stop = (e) => e.stopPropagation();

/** masques (zones en fractions de l'image) posés sur l'image */
function Masques({ masques, caches }) {
  if (!masques || !masques.length || !caches) return null;
  return masques.map((m) => {
    const r = (m.zone && m.zone.rect) || m.rect;
    if (!r) return null;
    return <span key={m.id} className="mui-masque" style={{ left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' }} />;
  });
}

/** vignette d'une ligne (ou image générale) — un clic l'agrandit */
export function ImageMuscle({ imageId, fichier = null, masques = null, titre = 'Image', grande = false, className = '' }) {
  return <VignetteImage imageId={imageId} fichier={fichier} masques={masques} titre={titre} taille={grande ? 'generale' : 'ligne'} className={className} />;
}

/** l'image en grand, avec le texte reconnu sélectionnable */
export function VisionneuseImage({ imageId, url, masques = null, titre = 'Image', onFermer }) {
  const [texte, setTexte] = useState(false);
  const [ocr, setOcr] = useState(null); // null (lecture) | { mots } | { erreur }
  const [revele, setRevele] = useState(false);
  const [copie, setCopie] = useState(false);
  const cadre = useRef(null);
  const [hauteur, setHauteur] = useState(0);
  useEffect(() => {
    let vivant = true;
    ocrImage(imageId ? { blobId: imageId } : { src: url }).then((r) => { if (vivant) setOcr({ mots: ((r && r.mots) || []).filter((m) => m.t && m.w > 0 && m.h > 0) }); })
      .catch(() => { if (vivant) setOcr({ erreur: true, mots: [] }); });
    return () => { vivant = false; };
  }, [imageId, url]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onFermer(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onFermer]);
  useEffect(() => {
    const el = cadre.current;
    if (!el) return undefined;
    const mesurer = () => setHauteur(el.clientHeight);
    mesurer();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(mesurer); ro.observe(el);
    return () => ro.disconnect();
  }, [url]);
  const mots = (ocr && ocr.mots) || [];
  const copier = async () => {
    const lignes = new Map();
    mots.forEach((m) => { if (!lignes.has(m.line)) lignes.set(m.line, []); lignes.get(m.line).push(m.t); });
    try { await navigator.clipboard.writeText([...lignes.values()].map((l) => l.join(' ')).join('\n')); setCopie(true); setTimeout(() => setCopie(false), 1600); } catch (e) { /* refus */ }
  };
  const caches = !!(masques && masques.length) && !revele;
  return createPortal(
    <div className="mui-visionneuse" role="dialog" aria-label={titre} onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onFermer(); }}
      onPointerDown={stop} onMouseDown={stop}>
      <div className="mui-v-barre">
        <b className="mui-v-titre">{titre}</b>
        <span style={{ flex: 1 }} />
        <button type="button" className={'btn sm' + (texte ? ' primary' : '')} aria-pressed={texte} onClick={() => setTexte((v) => !v)}
          disabled={!mots.length} title={ocr ? (mots.length ? 'Afficher le texte reconnu (sélectionnable)' : 'Aucun texte reconnu') : 'Lecture du texte…'}>
          <Icon name="search" size={13} /> {ocr ? (mots.length ? 'Texte' : 'Aucun texte') : 'Lecture…'}
        </button>
        {mots.length > 0 && <button type="button" className="btn sm" onClick={copier}><Icon name="copy" size={13} /> {copie ? 'Copié ✓' : 'Copier le texte'}</button>}
        {masques && masques.length > 0 && <button type="button" className="btn sm" onClick={() => setRevele((v) => !v)}>{revele ? 'Remasquer' : `Révéler (${masques.length})`}</button>}
        <button type="button" className="icon-btn sm" onClick={onFermer} aria-label="Fermer" title="Fermer (Échap)"><Icon name="x" size={15} /></button>
      </div>
      <div className="mui-v-zone" onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
        <div ref={cadre} className={'mui-v-cadre' + (texte ? ' texte' : '')}>
          <img src={url} alt="" draggable={false} />
          <Masques masques={masques} caches={caches} />
          {texte && (
            <div className="mui-v-mots">
              {mots.map((m, i) => (
                <span key={i} style={{ left: m.x * 100 + '%', top: m.y * 100 + '%', width: m.w * 100 + '%', height: m.h * 100 + '%', fontSize: Math.max(6, m.h * hauteur * 0.82) + 'px' }}>{m.t + ' '}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** champ du formulaire : { imageId, fichier, masques } — vide : { imageId: null, fichier: null }.
   `onColler(fichier)` : bouton « Coller » (écrans tactiles) — passe par la même règle que ⌘V. */
export function ChampImageMuscle({ valeur, onChange, libelle = 'Image', compact = false, onColler = null, aside = null }) {
  return <ZoneImage valeur={valeur} onChange={onChange} libelle={libelle} taille={compact ? 'ligne' : 'generale'} avecMasques onColler={onColler} aside={aside} />;
}
