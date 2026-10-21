// Export PDF annoté : anciennes annotations + nouvelles (boîte « un mot » avec flèche courbe, trait du crayon, flèche
// de forme courbe, zone de texte) — exporté sans erreur, tout compté ; page 1 rendue en PNG (../cap/export-p1.png).
import { banc, FICHE } from './commun.mjs';
import { ANCIENNES } from './anciennes.mjs';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const b = await banc();
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const base = { ficheId: FICHE, page: 1, createdAt: '2026-10-21T10:00:00.000Z' };
const NOUVELLES = [
  { ...base, id: 'n-b1', kind: 'libre', type: 'boite', gabarit: 'mot', x: 0.3, y: 0.88, width: 0.05, height: 0.02, couleur: 'rose-franc', fond: 'plein', content: doc('Rein'),
    fleches: [{ id: 'nfl1', x: 0.8, y: 0.95, texte: null, type: 'souple', geo: 2, points: [{ x: 0.55, y: 0.8 }] }] },
  { ...base, id: 'n-t1', kind: 'texte', type: 'texte', gabarit: 'mot', x: 0.3, y: 0.94, width: 0.05, height: 0.02, couleur: 'bleu-franc', content: doc('Hile rénal') },
  { ...base, id: 'n-tr1', kind: 'trait', type: 'trait', mode: 'dessin', rendu: 'cr', couleur: 'vert-franc', epaisseur: 0.0042, opacite: 1, points: Array.from({ length: 20 }, (_, i) => [0.6 + i * 0.01, 0.82 + 0.01 * Math.sin(i / 2)]) },
  { ...base, id: 'n-f1', kind: 'forme', type: 'forme', forme: 'fleche', x: 0.1, y: 0.92, width: 0.15, height: 0.04, couleur: 'violet-franc', epaisseur: 0.0025, fleche: { type: 'souple', points: [{ x: 0.17, y: 0.88 }] } },
];
await b.preparer([...ANCIENNES, ...NOUVELLES]);
await b.ouvrirCours();
const r = JSON.parse(await b.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const E=await import(u.find(n=>n.includes('/pdf/exportAnnote.js')));const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js')));
  const fi=await S.getOne('fiches',${JSON.stringify(FICHE)});const an=(await S.getAll('annotations')).filter(a=>a.ficheId===${JSON.stringify(FICHE)});
  const r=await E.exporterDepuisBlob(fi.pdfId,[],an);let s='';const o=r.octets;for(let i=0;i<o.length;i+=0x8000)s+=String.fromCharCode.apply(null,o.subarray(i,i+0x8000));return JSON.stringify({b64:btoa(s),bilan:r.bilan})})()`));
fs.writeFileSync('../cap/export.pdf', Buffer.from(r.b64, 'base64'));
const bi = r.bilan;
b.ok(bi && bi.boites === 6 && bi.fleches === 4 && bi.traits === 6 && bi.formes === 5 && bi.textes === 2 && bi.questions === 1 && bi.ignores === 0, 'export annoté : anciennes et nouvelles annotations toutes exportées', JSON.stringify(bi));
// page 1 en image (pdf-lib du dépôt pour extraire la page, puis sips)
execSync(`node -e "const {PDFDocument}=require('../../node_modules/pdf-lib');const fs=require('fs');(async()=>{const s=await PDFDocument.load(fs.readFileSync('../cap/export.pdf'));const d=await PDFDocument.create();const [p]=await d.copyPages(s,[0]);d.addPage(p);fs.writeFileSync('../cap/export-p1.pdf',await d.save())})()" && sips -s format png ../cap/export-p1.pdf --out ../cap/export-p1.png >/dev/null`);
b.ok(fs.existsSync('../cap/export-p1.png'), 'page 1 exportée rendue en image', '../cap/export-p1.png');
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
