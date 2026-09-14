/* ============================================================
   MedRevise — point d'entrée UNIQUE de pdf.js : worker + ressources binaires
   embarquées + netteté du rendu. Tout getDocument de l'app passe par openPdf,
   pour que personne n'oublie les ressources (voir pdfjsAssets, vite.config.js).
   100 % hors API externe : worker et ressources sont servis par l'app.
   ============================================================ */
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const ASSETS = import.meta.env.BASE_URL + 'pdfjs/';

/** ouvre un PDF (ArrayBuffer/Uint8Array) avec polices standard, CMaps et
    décodeurs wasm locaux — sans eux, un PDF à police non intégrée ou à image
    JPX/JBIG2 s'afficherait faux, sans erreur visible. */
export function openPdf(data) {
  return pdfjsLib.getDocument({
    data,
    cMapUrl: ASSETS + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: ASSETS + 'standard_fonts/',
    wasmUrl: ASSETS + 'wasm/',
    iccUrl: ASSETS + 'iccs/',
  }).promise;
}

/* Plafond de pixels d'UN canvas : même valeur que le lecteur officiel de pdf.js
   (maxCanvasPixels = 2^24 ≈ 16,7 Mpx). Au-delà, Safari (iOS surtout) refuse le
   canvas et la page reste blanche — on sacrifie alors un peu de netteté. */
const MAX_CANVAS_PIXELS = 2 ** 24;

/** facteur de densité du canvas pour une page de w×h px CSS : la densité réelle
    de l'écran (2 sur Retina), bornée par le plafond ci-dessus. Jamais sous 1 —
    c'était le comportement d'avant, on ne dégrade aucun cas existant. */
export function outputScaleFor(w, h, dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1) {
  return Math.max(1, Math.min(dpr, Math.sqrt(MAX_CANVAS_PIXELS / (w * h))));
}

export { pdfjsLib };
