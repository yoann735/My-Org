// MESURE du test réel (22/11) : la réponse de l'IA ($TRAVAIL/reponse-ia.json) passe par la lecture et le recalage de
// l'app (src/medrevise/lib/masquesIA.js) avec l'OCR de l'app ($TRAVAIL/ocr.json, produit par rendu.mjs), puis chaque
// masque est comparé à la VÉRITÉ : la couche texte du PDF ($TRAVAIL/verite.json), étiquettes regroupées ci-dessous.
//   node mesure.mjs [reponse.json] [--decaler=0.015]   (décalage aléatoire des rectangles : une IA moins précise)
import fs from 'node:fs';
import path from 'node:path';
import { lireMasquesIA, recalerMasques } from '../../src/medrevise/lib/masquesIA.js';

const TRAVAIL = process.env.TRAVAIL || path.join((await import('node:os')).tmpdir(), 'banc-masques-ia');
const arg = process.argv.slice(2);
const fichier = arg.find((a) => !a.startsWith('--')) || path.join(TRAVAIL, 'reponse-ia.json');
const decaler = Number((arg.find((a) => a.startsWith('--decaler=')) || '=0').split('=')[1]);
const graine = Number((arg.find((a) => a.startsWith('--graine=')) || '=1').split('=')[1]);
const V = JSON.parse(fs.readFileSync(path.join(TRAVAIL, 'verite.json'), 'utf8'));
const ocr = JSON.parse(fs.readFileSync(path.join(TRAVAIL, 'ocr.json'), 'utf8'));
const { W, H } = V;

/* ÉTIQUETTES (vérité) : lignes de la couche texte, regroupées par étiquette ; [x, y] = point d'ancrage approximatif en
   fraction de page pour départager les doublons. « postérieur » (4e ligne de la gouttière) est caché sous le dessin. */
const ET = [
  ['Epines tibiales', ['Epines tibiales'], [0.07, 0.25]], ['Tubercule de Gerdi', ['Tubercule de Gerdi'], [0.07, 0.27]], ['Tête fibulaire', ['Tête fibulaire'], [0.09, 0.30]],
  ['Face latérale', ['Face latérale'], [0.13, 0.42]], ['Bord antérieur', ['Bord antérieur'], [0.13, 0.46]], ['Face médiale', ['Face médiale'], [0.14, 0.50]],
  ['Diaphyse', ['Diaphyse'], [0.15, 0.54]], ['Bord interosseux', ['Bord interosseux'], [0.11, 0.59]],
  ['Surface articulaire de la malléole', ['Surface articulaire', 'de la malléole'], [0.11, 0.74]], ['Malléole externe', ['Malléole externe'], [0.10, 0.77]],
  ['Face latérale', ['Face latérale'], [0.40, 0.44]], ['Crête tibiale', ['Crête tibiale'], [0.40, 0.47]], ['Face médiale', ['Face médiale'], [0.40, 0.51]],
  ['Bord latéral interosseux', ['Bord latéral', 'interosseux'], [0.39, 0.55]], ['Articulation avec le talus', ['Articulation avec', 'le talus'], [0.44, 0.72]],
  ['Malléole interne', ['Malléole interne'], [0.45, 0.75]], ['Surface rétro spinale', ['Surface rétro spinale'], [0.47, 0.25]], ['Patte d’oie', ['Patte d’oie'], [0.44, 0.28]],
  ['Tubérosité tibiale antérieure', ['Tubérosité', 'tibiale antérieure'], [0.45, 0.31]],
  ['Gaines tibiales pour les ligaments croisés', ['Gaines tibiales', 'pour les', 'ligaments croisés'], [0.58, 0.16]], ['Gaine médiale', ['Gaine médiale'], [0.59, 0.21]],
  ['Insertion semi membraneuse', ['Insertion semi', 'membraneuse'], [0.56, 0.28]], ['Crête soléaire', ['Crête soléaire'], [0.59, 0.37]], ['Trou nourricier', ['Trou nourricier'], [0.59, 0.42]],
  ['Bord latéral interosseux', ['Bord latéral', 'interosseux'], [0.60, 0.48]], ['Face postérieure', ['Face postérieure'], [0.58, 0.51]], ['Diaphyse', ['Diaphyse'], [0.60, 0.55]],
  ['Gouttière des tendons fléchisseurs communs et tibial', ['Gouttière des', 'tendons fléchisseurs', 'communs et tibial'], [0.58, 0.68]],
  ['Malléole interne', ['Malléole interne'], [0.55, 0.74]], ['Mortaise tibio-fibulaire', ['Mortaise tibio-fibulaire'], [0.52, 0.78]],
  ['Gaine latérale', ['Gaine latérale'], [0.85, 0.15]], ['Insertion biceps fémoral', ['Insertion', 'biceps fémoral'], [0.91, 0.19]],
  ['Insertion du ligament long extenseur', ['Insertion du', 'ligament long', 'extenseur'], [0.93, 0.26]], ['Col de la fibula', ['Col de la fibula'], [0.91, 0.30]],
  ['Face postérieure', ['Face postérieure'], [0.90, 0.49]], ['Crête médiale', ['Crête médiale'], [0.90, 0.52]], ['Face latérale', ['Face latérale'], [0.88, 0.55]],
  ['Surface articulaire de la malléole', ['Surface', 'articulaire de', 'la malléole'], [0.87, 0.65]],
  ['Fosse malléolaire pour les collatéraux fibulaires', ['Fosse', 'malléolaire pour', 'les collatéraux', 'fibulaires'], [0.91, 0.72]],
  ['Gouttière pour le passage des tendons péronniens', ['Gouttière pour le', 'passage des', 'tendons', 'péronniens'], [0.88, 0.80]],
];
const PAS_MASQUER = ['Tibia - Fibula', 'Vue antérieure', 'Vue postérieure', 'Crânial', 'Médial', '3'];

const pris = new Set();
const ctr = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const verite = ET.map(([label, lignes, [ax, ay]]) => {
  const items = lignes.map((l) => {
    const c = V.items.map((it, i) => ({ it, i })).filter(({ it, i }) => it.t.trim() === l && !pris.has(i))
      .sort((a, b) => Math.hypot(ctr(a.it).x - ax, ctr(a.it).y - ay) - Math.hypot(ctr(b.it).x - ax, ctr(b.it).y - ay))[0];
    if (!c) throw new Error('ligne introuvable : ' + l);
    pris.add(c.i); return c.it;
  });
  return { label, items };
});
const titres = V.items.filter((it) => PAS_MASQUER.includes(it.t.trim()));

// réponse de l'IA → lecture + recalage de l'APP
let texte = fs.readFileSync(fichier, 'utf8');
if (decaler) { // une IA moins précise : chaque rectangle déplacé et redimensionné au hasard (graine fixe)
  let s = graine; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 * 2 - 1; };
  const j = JSON.parse(texte);
  j.masques = j.masques.map((m) => ({ ...m, x: +(m.x + rnd() * decaler).toFixed(3), y: +(m.y + rnd() * decaler).toFixed(3), w: +(m.w * (1 + rnd() * 0.2)).toFixed(3), h: +(m.h * (1 + rnd() * 0.2)).toFixed(3) }));
  texte = JSON.stringify(j);
}
const lu = lireMasquesIA(texte, { W, H });
if (!lu.ok) { console.log('lecture impossible :', lu.erreur); process.exit(1); }
const res = recalerMasques(lu.masques, ocr, { W, H });

// couverture : part de la boîte d'encre d'une ligne (rétrécie de 2 px) cachée par les masques — échantillonnage 1 px
const px = (r) => ({ x0: Math.ceil(r.x * W + 2), y0: Math.ceil(r.y * H + 2), x1: Math.floor((r.x + r.w) * W - 2), y1: Math.floor((r.y + r.h) * H - 2) });
const couverture = (r, masques) => {
  const b = px(r); let n = 0, c = 0;
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) { n++; if (masques.some((m) => x >= m.x * W && x <= (m.x + m.w) * W && y >= m.y * H && y <= (m.y + m.h) * H)) c++; }
  return n ? c / n : 1;
};
const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

const lignes = []; let oubliees = 0, visibles = 0, visiblesOrange = 0;
for (const v of verite) {
  const couv = Math.min(...v.items.map((it) => couverture(it, res)));
  const touche = res.filter((m) => v.items.some((it) => inter(it, m) > 0.3 * it.w * it.h));
  const orange = touche.some((m) => !m.recale);
  if (!touche.length) oubliees++;
  else if (couv < 0.995) { visibles++; if (orange) visiblesOrange++; }
  lignes.push(`${couv >= 0.995 ? '✅' : touche.length ? '⚠️' : '❌'} ${v.label.padEnd(52)} couverture ${(couv * 100).toFixed(1).padStart(5)} %  ${touche.map((m) => (m.recale ? 'recalé' : 'ORANGE')).join('+') || 'aucun masque'}`);
}
const titresMasques = titres.filter((t) => res.some((m) => inter(t, m) > 0.2 * t.w * t.h)).map((t) => t.t);
// masques en trop : ne touchent aucune étiquette
const enTrop = res.filter((m) => !verite.some((v) => v.items.some((it) => inter(it, m) > 0.3 * it.w * it.h)));
console.log(lignes.join('\n'));
console.log(`\nfichier ${path.basename(fichier)}${decaler ? ` · décalage aléatoire ±${decaler} (graine ${graine})` : ''}`);
console.log(`étiquettes (vérité) : ${verite.length} · masques obtenus : ${res.length} · recalés : ${res.filter((m) => m.recale).length} · à vérifier (orange) : ${res.filter((m) => !m.recale).length}`);
console.log(`étiquettes oubliées : ${oubliees} · laissant voir une partie de la réponse : ${visibles} (dont ${visiblesOrange} signalées en orange, ${visibles - visiblesOrange} recalées) · titres/repères masqués : ${titresMasques.length}${titresMasques.length ? ' (' + titresMasques.join(', ') + ')' : ''} · masques en trop : ${enTrop.length}`);
console.log('avertissements :', lu.avertissements.join(' ') || 'aucun');
fs.writeFileSync(path.join(TRAVAIL, 'mesure-' + path.basename(fichier, '.json') + (decaler ? '-decale' + graine : '') + '.json'), JSON.stringify({ res, oubliees, visibles, visiblesOrange, titresMasques }, null, 1));
