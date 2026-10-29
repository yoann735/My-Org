// SONDE (29/10, docs/compte-rendu-synchro-rapide-surlignage-listes.md) : écart, en pixels écran, entre les bords calculés
// d'un mot (comme pour un surlignage) et les bords RÉELS de son encre sur le canvas pdf.js. Pour chaque mot entouré
// d'espaces, au milieu d'un morceau de texte :
//   début : écart > 0 → le surlignage commence APRÈS l'encre (1ʳᵉ lettre découverte) ;
//   fin   : écart > 0 → le surlignage s'arrête AVANT la fin de l'encre (dernière lettre coupée).
// Deux calculs : « DOM » (lettres sans-serif de la couche de texte, l'ancien calcul) et « exact » (pdfShared.js
// rectsTexteEcran, vraies largeurs de glyphes — le calcul du surlignage depuis le 29/10).
// Banc : Vite :5199 sans Supabase, Chrome headless 9333 (voir tout.sh). node sonde-bornes.mjs [fichier.pdf] [page]
import { banc, FX } from '../tests-pdfreader-v3/commun.mjs';
process.env.FX = process.env.FX || FX;
const FICHIER = process.argv[2] || 'cours.pdf', PAGE = +(process.argv[3] || 2);
const b = await banc(1440, 900);
await b.semer('f-sonde', 'Sonde bornes', FICHIER);
await b.biblio({ recharger: true });
await b.ouvrir('Sonde bornes'); await b.dormir(2000);
await b.allerPage(PAGE); await b.dormir(2500);
const r = await b.ev(`(async () => {
  const P = await import(performance.getEntriesByType('resource').map((x) => x.name).find((n) => n.includes('/pdf/pdfShared.js')) || '/src/medrevise/pdf/pdfShared.js');
  const page = document.querySelector('.pdfr-page[data-cle="${PAGE}"]');
  const layer = page.querySelector('.pdfr-textlayer');
  // double tampon (pdf/rendusPages.js) : on prend le canvas qui porte le plus d'encre
  const encrePart = (c) => { if (!c.width) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 64) if (d[i] < 128) n++; return n; };
  const canvas = [...page.querySelectorAll('canvas.pdfr-tampon')].sort((a, b) => encrePart(b) - encrePart(a))[0];
  const cr = canvas.getBoundingClientRect(); const kx = canvas.width / cr.width, ky = canvas.height / cr.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const encre = (x, y) => { const d = ctx.getImageData(Math.round((x - cr.left) * kx), Math.round((y - cr.top) * ky), 1, 1).data; return (d[0] + d[1] + d[2]) / 3 < 160; };
  const colonne = (x, y0, y1) => { for (let y = y0; y <= y1; y += 0.5) if (encre(x, y)) return true; return false; };
  // vérité terrain : la ligne découpée en PAQUETS D'ENCRE (colonnes encrées, séparées par un blanc d'au moins 0,16 corps =
  // une espace) ; si le nombre de paquets = le nombre de mots du span, le k-ième paquet est le k-ième mot.
  const out = [];
  for (const sp of layer.querySelectorAll('span')) {
    const t = sp.firstChild; if (!t || t.nodeType !== 3) continue;
    const s = t.textContent; const mots = [...s.matchAll(/\\S+/gu)];
    if (mots.length < 2) continue;
    const R = sp.getBoundingClientRect(); const em = R.height;
    const y0 = R.top + em * 0.25, y1 = R.bottom - em * 0.2;
    const paquets = []; let cur = null, blanc = 0;
    for (let x = R.left - em * 0.3; x <= R.right + em * 0.3; x += 0.25) {
      if (colonne(x, y0, y1)) { if (cur && blanc < em * 0.18) cur[1] = x; else { cur = [x, x]; paquets.push(cur); } blanc = 0; }
      else blanc += 0.25;
    }
    if (paquets.length !== mots.length) continue;
    mots.forEach((m, k) => {
      if (!/^[\\p{L}]/u.test(m[0])) return;
      const rg = document.createRange(); rg.setStart(t, m.index); rg.setEnd(t, m.index + m[0].length);
      const q = rg.getBoundingClientRect(); const x = P.rectsTexteEcran(layer, rg)[0];
      const [g, dr] = paquets[k];
      out.push({ mot: m[0], domG: +(q.left - g).toFixed(2), domD: +(dr - q.right).toFixed(2), exG: x ? +(x.left - g).toFixed(2) : null, exD: x ? +(dr - x.right).toFixed(2) : null, modele: !!P.fractionsCaracteres(layer, sp) });
    });
  }
  return out;
})()`);
// un écart de plus de 20 px = paquet d'encre mal apparié (deux mots collés, ponctuation) : écarté des statistiques.
// « découverte » = l'encre dépasse le surlignage malgré ses 2 px de débord (écart > 2 px).
const stats = (k) => { const e = r.map((x) => x[k]).filter((v) => v != null && Math.abs(v) < 20).sort((a, b) => a - b); return { med: e[Math.floor(e.length / 2)], max: e.at(-1), hors: e.filter((v) => v > 2).length, n: e.length }; };
console.log(`${FICHIER} p.${PAGE} : ${r.length} mots (modèle de glyphes : ${r.filter((x) => x.modele).length})`);
for (const [k, l] of [['domG', 'début, DOM  '], ['exG', 'début, exact'], ['domD', 'fin,   DOM  '], ['exD', 'fin,   exact']]) { const s = stats(k); console.log(`  ${l} : écart médian ${s.med} px · max ${s.max} px · lettre découverte malgré le débord de 2 px : ${s.hors}/${s.n}`); }
const ex = r.find((x) => x.mot === 'exemple'); if (ex) console.log('  « exemple » :', JSON.stringify(ex));
if (process.env.DETAIL) console.log(JSON.stringify(r));
process.exit(0);
