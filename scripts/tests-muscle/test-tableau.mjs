// Tests du décodeur de tableau « Muscle » (src/medrevise/lib/muscle.js) — node scripts/tests-muscle/test-tableau.mjs
// 1. vrais mots OCR (Tesseract de l'app) de la capture grand-gluteal.png, figés dans ocr-grand-gluteal.json ;
// 2. tableaux simulés : étiquettes en haut de cellule / centrées, tableau horizontal, titres « Origine : » ;
// 3. puces collées depuis un slide, mise à plat (copie / verso texte).
import fs from 'fs';
import { lignesDepuisMots, normaliserPuces, versoMuscle, blocsContenu } from '../../src/medrevise/lib/muscle.js';
let echecs = 0;
const ok = (c, m, d = '') => { console.log((c ? '✅' : '❌') + ' ' + m + (c ? '' : ' — ' + d)); if (!c) echecs++; };
const egal = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m, JSON.stringify(a));

const ATTENDU = {
  origine: "• Face postérieure de l'ilium, en arrière de la ligne glutéale postérieure\n• Face postérieure du sacrum et du coccyx\n• Ligament sacro-tubéral",
  trajet: 'Oblique en bas et en dehors, fibres parallèles',
  insertion: '• Tubérosité glutéale du fémur (faisceau profond)\n• Tractus ilio-tibial (faisceau superficiel)',
  action: '• Extenseur puissant de la cuisse\n• Rotateur latéral de la cuisse\n• Stabilise le bassin en station debout',
  innervation: 'Nerf glutéal inférieur (L5, S1, S2)',
};
const fx = JSON.parse(fs.readFileSync(new URL('./ocr-grand-gluteal.json', import.meta.url)));
const r = lignesDepuisMots(fx.mots, fx.ratio);
egal(r.trouvees, ['origine', 'trajet', 'insertion', 'action', 'innervation'], 'capture réelle : 5 étiquettes trouvées');
for (const k of Object.keys(ATTENDU)) egal(r.lignes[k], ATTENDU[k], 'capture réelle : ' + k);
egal(r.nom, 'm. Grand glutéal (fessier)', 'capture réelle : nom');

// simulateur : une ligne de texte → mots (x, y relatifs)
function page() {
  const mots = []; let L = 0;
  const ligne = (x, y, txt) => { let cx = x; for (const t of txt.split(' ')) { const w = t.length * 0.008; mots.push({ t, x: cx, y, w, h: 0.018, c: 90, line: L }); cx += w + 0.006; } L++; };
  return { mots, ligne };
}
const LIGNES = [['Origine', ['• Face postérieure du sacrum', '• Ligament sacro-tubéral']], ['Direction des fibres / Trajet', ['Oblique en bas et en dehors']],
  ['Insertion', ['• Tubérosité glutéale']], ['Action', ['• Extenseur de la cuisse', '• Rotateur latéral']], ['Innervation', ['Nerf glutéal inférieur']]];
for (const centre of [false, true]) {
  const { mots, ligne } = page();
  ligne(0.3, 0.03, 'm. Grand glutéal (fessier)');
  let y = 0.1;
  for (const [lab, cont] of LIGNES) {
    const labs = lab.startsWith('Direction') ? ['Direction des', 'fibres /', 'Trajet'] : [lab];
    const h = Math.max(cont.length, labs.length) * 0.026;
    const ly = centre ? y + h / 2 - labs.length * 0.013 : y;
    labs.forEach((t, i) => ligne(0.05, ly + i * 0.026, t));
    cont.forEach((t, i) => ligne(0.35, y + i * 0.026, t));
    y += h + 0.03;
  }
  const s = lignesDepuisMots(mots);
  ok(s.trouvees.length === 5 && s.lignes.origine === '• Face postérieure du sacrum\n• Ligament sacro-tubéral' && s.lignes.action === '• Extenseur de la cuisse\n• Rotateur latéral' && s.lignes.trajet === 'Oblique en bas et en dehors' && s.nom === 'm. Grand glutéal (fessier)',
    'tableau simulé, étiquettes ' + (centre ? 'centrées' : 'en haut de cellule'), JSON.stringify(s));
}
{ // tableau horizontal : étiquettes en en-tête
  const { mots, ligne } = page();
  ['Origine', 'Trajet', 'Insertion', 'Action', 'Innervation'].forEach((t, i) => ligne(0.05 + i * 0.19, 0.1, t));
  ['Sacrum', 'Oblique', 'Fémur', 'Extension', 'Nerf glutéal'].forEach((t, i) => ligne(0.05 + i * 0.19, 0.15, t));
  const s = lignesDepuisMots(mots);
  egal([s.lignes.origine, s.lignes.trajet, s.lignes.insertion, s.lignes.action, s.lignes.innervation], ['Sacrum', 'Oblique', 'Fémur', 'Extension', 'Nerf glutéal'], 'tableau horizontal');
}
{ // étiquette absente → ligne vide, aucune erreur
  const { mots, ligne } = page();
  ligne(0.05, 0.1, 'Origine'); ligne(0.3, 0.1, 'Sacrum'); ligne(0.05, 0.2, 'Action'); ligne(0.3, 0.2, 'Extension');
  const s = lignesDepuisMots(mots);
  ok(s.trouvees.join() === 'origine,action' && s.lignes.trajet === '' && s.lignes.origine === 'Sacrum' && s.lignes.action === 'Extension', 'étiquettes manquantes : lignes vides', JSON.stringify(s));
  egal(lignesDepuisMots([]).trouvees, [], 'aucun mot : rien, sans erreur');
  egal(lignesDepuisMots(null).trouvees, [], 'entrée nulle : rien, sans erreur');
}
egal(normaliserPuces('\tSacrum\n•\tCoccyx\n\t◦ sous-point\n- tiret'), '• Sacrum\n• Coccyx\n  ◦ sous-point\n• tiret', 'puces collées d’un slide');
egal(blocsContenu('Intro\n• a\n  ◦ b'), [{ kind: 'texte', texte: 'Intro' }, { kind: 'puces', items: [{ texte: 'a', niveau: 0 }, { texte: 'b', niveau: 1 }] }], 'blocs : paragraphe puis liste');
egal(versoMuscle({ origine: '• a\n• b', trajet: '', insertion: 'x', action: '', innervation: 'n' }),
  'Origine :\n  • a\n  • b\nDirection des fibres / Trajet : —\nInsertion : x\nAction : —\nInnervation : n', 'mise à plat (verso texte, copie)');
console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est vert.');
process.exit(echecs ? 1 : 0);
