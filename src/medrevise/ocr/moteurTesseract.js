/* ============================================================
   MedRevise — OCR : moteur Tesseract.js (voir moteur.js pour l'interface).

   - Tesseract.js tourne dans SON Web Worker : la reconnaissance ne fige jamais
     l'interface ;
   - tout est servi par l'app (/tesseract/…, vite.config.js#tesseractAssets) : aucun
     CDN, aucune clé, aucun service externe ;
   - modèles fra + eng (« best_int », LSTM) mis en cache dans IndexedDB par
     Tesseract.js lui-même (cacheMethod 'write') après le premier chargement.
   ============================================================ */
import { createWorker, PSM, OEM } from 'tesseract.js';

export const VERSION_TESSERACT = '7.0.0+best_int+sparse'; // entre dans l'identifiant des couches

/** deux boîtes se recouvrent-elles (plus de 30 % de la plus petite) ? */
function recouvre(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ix * iy > 0.3 * Math.min(a.w * a.h, b.w * b.h);
}

export function creerMoteurTesseract(langues) {
  let workerP = null;
  const worker = () => {
    if (!workerP) {
      workerP = createWorker(langues, OEM.LSTM_ONLY, {
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract/core',
        langPath: '/tesseract/lang',
        cacheMethod: 'write',
        gzip: true,
      }).then(async (w) => {
        await w.setParameters({
          tessedit_pageseg_mode: PSM.AUTO, // pages de cours ET schémas à étiquettes
          user_defined_dpi: '300',
          preserve_interword_spaces: '0',
        });
        return w;
      });
      workerP.catch(() => { workerP = null; });
    }
    return workerP;
  };

  /** une reconnaissance → mots (lignes et paragraphes numérotés à partir de `ligne0`) */
  async function lire(w, blob, psm, ligne0) {
    await w.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = await w.recognize(blob, {}, { blocks: true, text: false });
    const mots = [];
    let ligne = ligne0, para = ligne0;
    for (const bloc of data.blocks || []) {
      for (const p of bloc.paragraphs || []) {
        for (const l of p.lines || []) {
          for (const m of l.words || []) {
            const b = m.bbox;
            mots.push({ t: m.text, x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0, c: Math.round(m.confidence), line: ligne, para });
          }
          ligne++;
        }
        para++;
      }
    }
    return { mots, lignes: ligne };
  }

  return {
    nom: 'tesseract',
    version: VERSION_TESSERACT,
    langues,
    async recognizePage(bitmap) {
      // Tesseract lit une image ENCODÉE : ImageBitmap → OffscreenCanvas → PNG (hors fil principal)
      const oc = new OffscreenCanvas(bitmap.width, bitmap.height);
      oc.getContext('bitmaprenderer').transferFromImageBitmap(bitmap);
      const blob = await oc.convertToBlob({ type: 'image/png' });
      oc.width = 1; oc.height = 1;
      const w = await worker();
      const passe1 = await lire(w, blob, PSM.AUTO, 0);
      let mots = passe1.mots;
      /* SCHÉMAS : sur une page peu dense (< 80 mots), le mode automatique rate souvent
         les étiquettes collées aux traits de rappel. Seconde passe en « texte épars »
         (PSM 11) : on n'en garde que les mots qui ne recouvrent aucun mot déjà trouvé. */
      if (mots.length < 80) {
        const passe2 = await lire(w, blob, PSM.SPARSE_TEXT, passe1.lignes);
        const nouveaux = passe2.mots.filter((m) => !mots.some((k) => recouvre(m, k)));
        mots = [...mots, ...nouveaux];
        await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      }
      const data = { confidence: mots.length ? mots.reduce((x, m) => x + m.c, 0) / mots.length : 0 };
      return { confidence: Math.round(data.confidence || 0), mots };
    },
    async liberer() {
      const p = workerP; workerP = null;
      if (p) { try { (await p).terminate(); } catch (e) { /* déjà terminé */ } }
    },
  };
}
