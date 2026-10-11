/* ============================================================
   MedRevise — ZONE IMAGE v2 (11/10/2026, docs/compte-rendu-flashcards.md « Zones image v2 »).
   UN SEUL composant pour ajouter / voir / remplacer / retirer une image, partout : lignes et
   image générale des cartes Muscle, image des cartes standard, image des cartes Molécule.

   - VignetteImage : vignette compacte à coins arrondis, HAUTEUR FIXE (réservée pendant le
     chargement : rien ne saute quand l'image arrive), largeur proportionnelle, ≤ 100 % de la
     cellule ; un clic l'agrandit (VisionneuseImage, ImagesMuscle.jsx : Échap / clic pour fermer).
     Petit indicateur OCR en bas à droite : spinner pendant la lecture, puis icône « texte » si
     l'OCR a trouvé des mots (rien sinon). Sert aussi en révision (même taille, cliquable).
   - ZoneImage : vide → petit bouton « Image » en pointillés (32 px) ; avec image → vignette +
     actions en icônes (Remplacer, Masquer des mots — seulement si l'OCR a lu du texte —, Retirer).
     `aside` : réglage posé à côté (case « Montrer au recto », « Afficher au … »).
   Le collage au survol ne change pas (lib/collerAuSurvol.js) : la zone porte [data-zone-visuel],
   la classe zi-survol que le collage y pose ne fait plus que passer le bouton « Image » en trait
   plein (styles/muscle-images.css) — plus de contour ni de bulle.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { blobURL } from '../lib/storage.js';
import { ocrImage } from '../ocr/ocrImage.js';
import { VisionneuseImage } from './ImagesMuscle.jsx';
import { MasquerMots } from './MasquerMots.jsx';
import { BoutonColler } from './CollageImage.jsx';
import '../../styles/muscle-images.css';

/** URL objet d'un blob enregistré, ou d'un fichier pas encore enregistré */
export function useUrlImage(imageId, fichier = null) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let vivant = true, u = null;
    if (fichier) { u = URL.createObjectURL(fichier); setUrl(u); }
    else if (imageId) blobURL(imageId).then((x) => { u = x; if (vivant) setUrl(x); else if (x) URL.revokeObjectURL(x); });
    else setUrl(null);
    return () => { vivant = false; if (u) URL.revokeObjectURL(u); };
  }, [imageId, fichier]);
  return url;
}

/** OCR de l'image de la zone (nouvelle : par son adresse ; enregistrée : par son blob, résultat en
   cache local, ocr/ocrImage.js) → null | { etat: 'lecture' | 'fait' | 'erreur', n } */
export function useOcrZone(imageId, fichier, url) {
  const [ocr, setOcr] = useState(null);
  useEffect(() => {
    if (!(fichier ? url : imageId)) { setOcr(null); return undefined; }
    let vivant = true;
    setOcr({ etat: 'lecture' });
    ocrImage(fichier ? { src: url } : { blobId: imageId })
      .then((r) => { if (vivant) setOcr({ etat: 'fait', n: ((r && r.mots) || []).length }); })
      .catch(() => { if (vivant) setOcr({ etat: 'erreur' }); });
    return () => { vivant = false; };
  }, [imageId, fichier, url]);
  return ocr;
}

const stop = (e) => e.stopPropagation();

/** icône « masquer » (œil barré) — absente du jeu d'icônes partagé, qu'on ne modifie pas */
const IconeMasquer = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9.9 4.24A9 9 0 0 1 12 4c7 0 10 8 10 8a17 17 0 0 1-2.16 3.19M6.6 6.6C3.6 8.6 2 12 2 12s3 8 10 8a9.7 9.7 0 0 0 5.4-1.6" />
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="M2 2l20 20" />
  </svg>
);
const IconeTexte = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M4 7V5h16v2M12 5v14M9 19h6" /></svg>
);

function Masques({ masques }) {
  if (!masques || !masques.length) return null;
  return masques.map((m) => {
    const r = (m.zone && m.zone.rect) || m.rect;
    if (!r) return null;
    return <span key={m.id} className="mui-masque" style={{ left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' }} />;
  });
}

/** vignette (taille : 'ligne' 96 px | 'generale' 140 px | 'carte' 120 px) — un clic l'agrandit.
   `ocr` : état de l'OCR (formulaire) ; absent en révision. */
export function VignetteImage({ imageId, fichier = null, url: urlDonnee = null, masques = null, titre = 'Image', taille = 'ligne', ocr = null, className = '' }) {
  const urlPropre = useUrlImage(urlDonnee ? null : imageId, urlDonnee ? null : fichier);
  const url = urlDonnee || urlPropre;
  const [chargee, setChargee] = useState(false);
  const [ouverte, setOuverte] = useState(false);
  useEffect(() => setChargee(false), [url]);
  if (!imageId && !fichier && !urlDonnee) return null;
  const ouvrir = (e) => { e.stopPropagation(); e.preventDefault(); if (url) setOuverte(true); };
  return (
    <>
      <span role="button" tabIndex={0} className={`zim-vignette ${taille}${chargee ? '' : ' attente'}${className ? ' ' + className : ''}`}
        title={`${titre} — agrandir`} aria-label={`${titre} — agrandir`}
        onPointerDown={stop} onMouseDown={stop} onClick={ouvrir}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') ouvrir(e); }}>
        {url && (
          <span className="zim-cadre">
            <img src={url} alt="" draggable={false} onLoad={() => setChargee(true)} />
            {chargee && <Masques masques={masques} />}
            {ocr && ocr.etat === 'lecture' && <span className="zim-ocr lecture" title="Lecture du texte de l’image…" aria-label="Lecture du texte" />}
            {ocr && ocr.etat === 'fait' && ocr.n > 0 && <span className="zim-ocr" title={`Texte reconnu : ${ocr.n} mot${ocr.n > 1 ? 's' : ''}`} aria-label="Texte reconnu"><IconeTexte /></span>}
          </span>
        )}
      </span>
      {ouverte && url && <VisionneuseImage imageId={fichier ? null : imageId} url={url} masques={masques} titre={titre} onFermer={() => setOuverte(false)} />}
    </>
  );
}

/**
 * Champ image d'un formulaire.
 *   valeur        { imageId, fichier, masques? } — vide : { imageId: null, fichier: null }
 *   onChange(v)   nouvelle valeur ({ imageId: null, fichier: f, masques: null } pour une image choisie)
 *   avecMasques   active « Masquer des mots » (cartes Muscle)
 *   onColler(f)   bouton « Coller » des écrans tactiles (même règle que ⌘V)
 *   aside         réglage à côté de la vignette
 */
export function ZoneImage({ valeur, onChange, libelle = 'Image', taille = 'ligne', avecMasques = false, onColler = null, aside = null, className = '', ...attrs }) {
  const { imageId = null, fichier = null, masques = null } = valeur || {};
  const url = useUrlImage(imageId, fichier);
  const ocr = useOcrZone(imageId, fichier, url);
  const input = useRef(null);
  const [masquer, setMasquer] = useState(null); // { url, w, h }
  const [glisse, setGlisse] = useState(false);
  const aImage = !!(imageId || fichier);
  const choisir = (f) => { if (f && /^image\//.test(f.type || '')) onChange({ ...(valeur || {}), imageId: null, fichier: f, masques: null }); };
  const parcourir = () => input.current && input.current.click();
  const deposer = {
    onDragOver: (e) => { if (![...(e.dataTransfer.types || [])].includes('Files')) return; e.preventDefault(); e.stopPropagation(); setGlisse(true); },
    onDragLeave: () => setGlisse(false),
    onDrop: (e) => { const f = [...(e.dataTransfer.files || [])].find((x) => /^image\//.test(x.type)); setGlisse(false); if (!f) return; e.preventDefault(); e.stopPropagation(); choisir(f); },
  };
  const ouvrirMasquer = async () => {
    if (!url) return;
    let w = 4, h = 3;
    try { const im = new Image(); im.src = url; await im.decode(); w = im.naturalWidth; h = im.naturalHeight; } catch (e) { /* proportions par défaut */ }
    setMasquer({ url, w, h });
  };
  const nbMasques = (masques && masques.length) || 0;
  const texteLu = !!(ocr && ocr.etat === 'fait' && ocr.n > 0);
  return (
    <div className={`zim ${taille}${glisse ? ' glisse' : ''}${className ? ' ' + className : ''}`} data-zone-visuel="" {...deposer} {...attrs}>
      <input ref={input} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { choisir(e.target.files[0]); e.target.value = ''; }} />
      {!aImage ? (
        <div className="zim-vide">
          <button type="button" className="zim-ajout" onClick={parcourir} title={`${libelle} : parcourir, coller (⌘V / Ctrl+V) ou glisser une image ici`}>
            <Icon name="image" size={14} /> Image
          </button>
          <BoutonColler onFichier={(f) => (onColler ? onColler(f) : choisir(f))} />
          {aside}
        </div>
      ) : (
        <div className="zim-pleine">
          <div className="zim-bloc">
          <VignetteImage imageId={imageId} fichier={fichier} url={url} masques={masques} titre={libelle} taille={taille} ocr={ocr} />
          <div className="zim-actions" role="toolbar" aria-label={`Image : ${libelle}`}>
            <button type="button" className="zim-act" onClick={parcourir} title="Remplacer l’image" aria-label="Remplacer l’image"><Icon name="refresh" size={15} /></button>
            {avecMasques && texteLu && (
              <button type="button" className={'zim-act' + (nbMasques ? ' actif' : '')} onClick={ouvrirMasquer}
                title={nbMasques ? `Masquer des mots (${nbMasques} masqué${nbMasques > 1 ? 's' : ''})` : 'Masquer des mots'} aria-label="Masquer des mots">
                <IconeMasquer />{nbMasques > 0 && <span className="zim-nb tnum">{nbMasques}</span>}
              </button>
            )}
            {avecMasques && nbMasques > 0 && (
              <button type="button" className="zim-act" onClick={() => onChange({ ...valeur, masques: null })} title="Ôter les masques" aria-label="Ôter les masques"><Icon name="x" size={15} /></button>
            )}
            <button type="button" className="zim-act retirer" onClick={() => onChange({ ...valeur, imageId: null, fichier: null, masques: null })} title="Retirer l’image" aria-label="Retirer l’image"><Icon name="trash" size={15} /></button>
          </div>
          </div>
          {aside && <div className="zim-aside">{aside}</div>}
        </div>
      )}
      {aImage && <BoutonColler onFichier={(f) => (onColler ? onColler(f) : choisir(f))} />}
      {masquer && (
        <MasquerMots image={masquer} onFermer={() => setMasquer(null)}
          onAjouter={(nouveaux) => { onChange({ ...valeur, masques: [...(masques || []), ...nouveaux] }); setMasquer(null); }} />
      )}
    </div>
  );
}
