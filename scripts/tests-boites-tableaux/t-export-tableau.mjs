// §5 EXPORT PDF FIDÈLE d'une boîte-tableau : couleurs de cellule, fusions, bordures, texte (gras, italique, taille,
// alignements), hauteur de la boîte = celle du tableau. Comparaison avec la capture écran.  → ../cap/bt-export-p1.png
import { banc } from './commun.mjs';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const b = await banc();
const g = { v: 2, cols: [0.3, 0.35, 0.35], entete: true, alterne: true,
  lignes: [['Muscle', 'Origine', 'Action'], ['Psoas', 'L1–L4 (corps et processus transverses)', 'Flexion de hanche'], ['Iliaque', 'Fosse iliaque', ''], ['Grand fessier', 'Ilium', 'Extension'], ['Sartorius', 'EIAS', 'Flexion, abduction, rotation latérale']],
  fusions: [{ i: 1, j: 2, rs: 2, cs: 1 }],
  formats: [[{ fond: 'bleufonce', couleur: 'blanc', alignH: 'center' }, { fond: 'bleufonce', couleur: 'blanc', alignH: 'center' }, { fond: 'bleufonce', couleur: 'blanc', alignH: 'center' }],
    [null, { italique: true }, { fond: 'jaune-vif', alignV: 'milieu', alignH: 'center', gras: true }], [null, null, null], [{ couleur: 'rouge' }, null, null], [null, null, { taille: 11 }]],
  bordures: { mode: 'toutes', couleur: 'bleufonce', ep: 1.5 } };
await b.preparer({ annotations: [b.boiteGrille('bt-exp', g, { x: 0.08, y: 0.1, width: 0.6, couleur: 'blanc', taille1000: 15 })] });
await b.ouvrirCours({});
await b.capRect('bt-export-ecran', `document.querySelector('.note-box.boite-tableau')`, 6);
const ecran = await b.ev(`(()=>{const bx=document.querySelector('.note-box.boite-tableau');const p=document.querySelector('.pdfr-page[data-cle="1"]').getBoundingClientRect();const r=bx.querySelector('.btab-table').getBoundingClientRect();return {h:r.height/p.height,w:r.width/p.width}})()`);
const r = JSON.parse(await b.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const E=await import(u.find(n=>n.includes('/pdf/exportAnnote.js')));const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js')));
  const fi=await S.getOne('fiches','f-simpl');const an=(await S.getAll('annotations')).filter(a=>a.ficheId==='f-simpl');
  const r=await E.exporterDepuisBlob(fi.pdfId,[],an);let s='';const o=r.octets;for(let i=0;i<o.length;i+=0x8000)s+=String.fromCharCode.apply(null,o.subarray(i,i+0x8000));return JSON.stringify({b64:btoa(s),bilan:r.bilan})})()`));
fs.writeFileSync('../cap/bt-export.pdf', Buffer.from(r.b64, 'base64'));
b.ok(r.bilan.boites === 1 && r.bilan.ignores === 0, 'export : la boîte-tableau est exportée', JSON.stringify(r.bilan));
execSync(`node -e "const {PDFDocument}=require('../../node_modules/pdf-lib');const fs=require('fs');(async()=>{const s=await PDFDocument.load(fs.readFileSync('../cap/bt-export.pdf'));const d=await PDFDocument.create();const [p]=await d.copyPages(s,[0]);d.addPage(p);fs.writeFileSync('../cap/bt-export-p1.pdf',await d.save())})()" && sips -s format png -Z 1600 ../cap/bt-export-p1.pdf --out ../cap/bt-export-p1.png >/dev/null`);
// mesure dans le PNG exporté : la boîte (fond blanc) et ses cellules colorées, par l'image
const png = fs.readFileSync('../cap/bt-export-p1.png').toString('base64');
const m = JSON.parse(await b.ev(`new Promise(ok=>{const i=new Image();i.onload=()=>{const k=document.createElement('canvas');k.width=i.width;k.height=i.height;const x=k.getContext('2d');x.drawImage(i,0,0);const d=x.getImageData(0,0,i.width,i.height).data;
  const px=(X,Y)=>{const o=(Y*i.width+X)*4;return [d[o],d[o+1],d[o+2]]};
  // bleu foncé de l'en-tête : première et dernière ligne de pixels « bleu foncé » sous la colonne 15 % de la largeur
  let bleu=[],jaune=0;for(let Y=0;Y<i.height;Y++){for(let X=0;X<i.width;X+=3){const [r,g,b2]=px(X,Y);if(b2>200&&r<90&&g<130)bleu.push(Y);if(r>220&&g>180&&b2<90)jaune++;}}
  ok(JSON.stringify({w:i.width,h:i.height,bleuHaut:Math.min(...bleu),bleuBas:Math.max(...bleu),jaune}))};i.src='data:image/png;base64,${png}'})`));
b.ok(m.jaune > 500, 'couleur de fond d’une cellule (jaune) exportée', JSON.stringify(m));
const hBoite = (m.bleuBas - m.bleuHaut) / m.h; // les bordures bleu foncé encadrent tout le tableau (toutes)
b.ok(Math.abs(hBoite - ecran.h) < 0.04, 'la hauteur du tableau exporté suit celle de l’écran (bordures extérieures)', JSON.stringify({ export: +hBoite.toFixed(3), ecran: +ecran.h.toFixed(3) }));
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
