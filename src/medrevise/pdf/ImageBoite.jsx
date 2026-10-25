/* ============================================================
   MedRevise — L'IMAGE D'UNE BOÎTE (25/10, docs/compte-rendu-boites-tableaux.md §1). Un composant, posé dans une boîte
   du lecteur (pdf/PdfPage.jsx, NoteBox : cours PDF, document créé dans l'app, fiche jumelle) et dans une carte du
   tableau Miro (tableau/Board.jsx, carte issue d'une boîte).

   Champ `image` de la boîte : { blobId, ratio (hauteur / largeur de l'image), position: 'dessus' | 'dessous', nom? }.
   L'image occupe TOUTE LA LARGEUR INTÉRIEURE de la boîte (ses marges sont respectées), sa hauteur suit ses proportions
   (aspect-ratio) : redimensionner la boîte la redimensionne, et la boîte grandit avec elle.
   OCR comme les autres images (ocr/ocrImage.js, en cache par blob) : mots transparents posés en fractions de l'image ;
   au Surligneur, balayer les mots les surligne (surlignage `imageId` = l'id de la boîte, `mots` = indices OCR).
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { blobURL } from '../lib/storage.js';
import { ocrImage } from '../ocr/ocrImage.js';
import { couleurHex, opaciteSurlignage, lignesSurlignage } from './pdfShared.js';

const URLS = new Map(); // blobId → adresse objet (partagée par toutes les boîtes de la session)
const mesure = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
export const POSITIONS_IMAGE = [{ id: 'dessus', label: 'Au-dessus du texte' }, { id: 'dessous', label: 'En dessous du texte' }];

/** largeur / hauteur naturelles d'un fichier image (null s'il n'est pas lisible) */
export async function tailleImage(file) {
  try { const bm = await createImageBitmap(file); const r = { w: bm.width, h: bm.height }; if (bm.close) bm.close(); return r.w && r.h ? r : null; } catch (e) { return null; }
}

/**
 * <ImageBoite image outil surlignages couleurSurligneur onSurligner />
 *   onSurligner({ mots, texte, texteDe, rectsDe }, couleur, opts)   mots balayés au Surligneur ; `rectsDe(ids)` en
 *                                                                    fractions de la PAGE (cadre affiché de l'image)
 */
export function ImageBoite({ image, outil = 'main', surlignages = [], couleurSurligneur = 'jaune-franc', onSurligner = null, classe = '' }) {
  const [url, setUrl] = useState(() => URLS.get(image.blobId) || null);
  const [manquante, setManquante] = useState(false);
  useEffect(() => {
    if (URLS.has(image.blobId)) { setUrl(URLS.get(image.blobId)); setManquante(false); return undefined; }
    let annule = false;
    blobURL(image.blobId).then((x) => { if (x) URLS.set(image.blobId, x); if (!annule) { setUrl(x); setManquante(!x); } }).catch(() => { if (!annule) setManquante(true); });
    return () => { annule = true; };
  }, [image.blobId]);
  // OCR en arrière-plan (même moteur et même cache que les images collées)
  const [ocr, setOcr] = useState(null);
  useEffect(() => {
    if (!image.blobId) return undefined;
    let vivant = true;
    setOcr(null);
    ocrImage({ blobId: image.blobId }).then((r) => { if (vivant && r && r.mots && r.mots.length) setOcr(r); }).catch(() => {});
    return () => { vivant = false; };
  }, [image.blobId]);
  const ref = useRef(null), calqueRef = useRef(null);
  const [taille, setTaille] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const m = () => setTaille((t) => (t.w === el.offsetWidth && t.h === el.offsetHeight ? t : { w: el.offsetWidth, h: el.offsetHeight }));
    m();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(m); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tailles = useMemo(() => {
    if (!ocr || !mesure || !taille.w) return [];
    return ocr.mots.map((m) => {
      const fs = Math.max(3, m.h * taille.h * 0.86);
      mesure.font = `${fs}px sans-serif`;
      return { fs, sx: (m.w * taille.w) / (mesure.measureText(m.t).width || 1) };
    });
  }, [ocr, taille.w, taille.h]);
  const vivant = !!ocr && outil === 'surligneur' && !!onSurligner;
  const texteDe = (ids) => ids.map((i) => ocr.mots[i] && ocr.mots[i].t).filter(Boolean).join(' ');
  const rectsDe = (ids) => {
    const el = ref.current, page = el && el.closest('.pdfr-page');
    if (!el || !page) return [];
    const r = el.getBoundingClientRect(), p = page.getBoundingClientRect();
    const F = { x: (r.left - p.left) / p.width, y: (r.top - p.top) / p.height, w: r.width / p.width, h: r.height / p.height };
    return ids.map((i) => ocr.mots[i]).filter(Boolean).map((m) => ({ x: F.x + m.x * F.w, y: F.y + m.y * F.h, width: m.w * F.w, height: m.h * F.h }));
  };
  const appuiMots = (e) => {
    if (!vivant || (e.button && e.button !== 0) || !(e.target.classList && e.target.classList.contains('pi-mot'))) return;
    e.stopPropagation(); // la boîte ne bouge pas : on balaie son texte
    try { window.getSelection().removeAllRanges(); } catch (x) { /* ignore */ }
    const fin = () => {
      window.removeEventListener('pointerup', fin, true);
      setTimeout(() => {
        const sel = window.getSelection(), cal = calqueRef.current;
        if (!sel || sel.isCollapsed || !sel.rangeCount || !cal || !cal.contains(sel.anchorNode)) return;
        const r = sel.getRangeAt(0);
        const ids = [...cal.children].filter((sp) => sp.firstChild && r.intersectsNode(sp.firstChild) && !(r.endContainer === sp.firstChild && r.endOffset === 0)).map((sp) => Number(sp.dataset.i));
        if (ids.length) onSurligner({ mots: ids, texte: texteDe(ids), texteDe, rectsDe }, couleurSurligneur);
        sel.removeAllRanges();
      }, 0);
    };
    window.addEventListener('pointerup', fin, true);
  };
  const motsSurlignes = surlignages.flatMap((h) => (h.mots || []).map((i) => ({ h, m: ocr && ocr.mots[i] }))).filter((x) => x.m);
  const ratio = Number.isFinite(image.ratio) && image.ratio > 0 ? image.ratio : 0.66;
  return (
    <div ref={ref} className={'nb-image' + (classe ? ' ' + classe : '')} data-position={image.position || 'dessus'} style={{ aspectRatio: `1 / ${ratio}` }}>
      {url ? <img src={url} alt={image.nom || 'Image de la boîte'} draggable={false} />
        : <div className="nb-image-vide">{manquante ? 'Image indisponible sur cet appareil' : '…'}</div>}
      {motsSurlignes.length > 0 && (
        <div className="pi-surlignages" aria-hidden="true">
          {[...motsSurlignes.reduce((acc, { h, m }) => { if (!acc.has(h.id)) acc.set(h.id, { h, ms: [] }); acc.get(h.id).ms.push(m); return acc; }, new Map()).values()]
            .flatMap(({ h, ms }) => lignesSurlignage(ms).map((m, i) => (
              <span key={h.id + ':' + i} className="pdfr-hl-rect pi-hl" data-hl={h.id}
                style={{ left: m.x * 100 + '%', top: m.y * 100 + '%', width: m.w * 100 + '%', height: m.h * 100 + '%', background: couleurHex(h.couleur),
                  ...(opaciteSurlignage(h.couleur) < 1 ? { opacity: opaciteSurlignage(h.couleur) } : {}) }} />
            )))}
        </div>
      )}
      {ocr && (
        <div ref={calqueRef} className={'pi-texte' + (vivant ? ' vivant' : '')} data-ocr={ocr.mots.length} onPointerDown={appuiMots}>
          {ocr.mots.map((m, i) => (
            <span key={i} className="pi-mot" data-i={i}
              style={{ left: m.x * 100 + '%', top: m.y * 100 + '%', height: m.h * 100 + '%', fontSize: tailles[i] ? tailles[i].fs : undefined, transform: tailles[i] ? `scaleX(${tailles[i].sx})` : undefined }}>
              {m.t + (i + 1 < ocr.mots.length ? (ocr.mots[i + 1].line !== m.line ? '\n' : ' ') : '')}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
