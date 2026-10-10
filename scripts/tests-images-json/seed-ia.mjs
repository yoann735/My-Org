// Cours « Cours 12 pages IA » : 8 boîtes variées sur la page 1 (dont une minuscule, une au bord du schéma,
// une posée SUR le schéma, un texte libre), une boîte sur les pages 2, 5 et 12. node seed-ia.mjs
import { connecter } from './cdp.mjs';
import fs from 'fs';
const c = await connecter();
const pdf = fs.readFileSync('../fx/cours12.pdf').toString('base64');
const doc = (t) => ({ type: 'doc', content: t.split('\n').map((l) => ({ type: 'paragraph', content: [{ type: 'text', text: l, marks: [{ type: 'textStyle', attrs: { fontSize: '13px' } }] }] })) });
const B = [
  ['anmv3a0k1a7q', 1, 'libre', 0.62, 0.12, 0.2, 0.036, 'Krebs', { couleur: 'ambre' }],
  ['anmv3a0k2c9w', 1, 'libre', 0.05, 0.30, 0.04, 0.022, 'x', { couleur: 'rose', largeurFixe: true }],
  ['anmv3a0k3d2e', 1, 'libre', 0.05, 0.70, 0.3, 0.036, 'Citrate synthase : premiere etape du cycle, condensation acetyl-CoA + oxaloacetate', { couleur: 'bleu', fond: 'plein', ancre: { x: 0.4, y: 0.55, texte: 'schéma' }, fleche: true }],
  ['anmv3a0k4f5r', 1, 'libre', 0.757, 0.47, 0.2, 0.036, 'bord droit du schema', { couleur: 'vert', ancre: { x: 0.7, y: 0.5 }, fleche: true }],
  ['anmv3a0k5g8t', 1, 'texte', 0.55, 0.75, 0.3, 0.02, 'texte libre sans cadre', { couleur: 'noir' }],
  ['anmv3a0k6h1y', 1, 'libre', 0.3, 0.85, 0.4, 0.05, 'NADH', { couleur: 'ambre', largeurFixe: true, fond: 'teinte' }],
  ['anmv3a0k7j4u', 1, 'libre', 0.86, 0.22, 0.09, 0.1, 'GTP x1\npar tour', { couleur: 'rose', largeurFixe: true }],
  ['anmv3a0k8k6i', 1, 'libre', 0.3, 0.50, 0.18, 0.036, 'hexokinase ?', { couleur: 'ambre', fond: 'teinte' }],
  ['anmv3a0p2l3o', 2, 'libre', 0.6, 0.2, 0.25, 0.036, 'page deux', { couleur: 'vert' }],
  ['anmv3a0z1xyz', 2, 'libre', 0.6, 0.3, 0.25, 0.036, 'jumelle un', { couleur: 'ambre' }],
  ['anmv3a0z2xyz', 2, 'libre', 0.6, 0.4, 0.25, 0.036, 'jumelle deux', { couleur: 'ambre' }],
  ['anmv3a0p5m7p', 5, 'libre', 0.6, 0.2, 0.25, 0.036, 'page cinq', { couleur: 'bleu' }],
  ['anmv3a0pcn2a', 12, 'libre', 0.6, 0.2, 0.25, 0.036, 'page douze', { couleur: 'rose' }],
];
console.log(await c.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js'))||'/src/medrevise/lib/storage.js');
const bin=atob(${JSON.stringify(pdf)});const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
await S.put('sources',{id:'src-ia',nom:'Source IA',couleur:'#7c5cff'});
await S.put('matieres',{id:'mat-ia',nom:'Biochimie IA',sourceId:'src-ia'});
const pdfId=await S.putBlob(new Blob([a],{type:'application/pdf'}));
await S.put('fiches',{id:'ia-12',matiereId:'mat-ia',dossierId:null,titre:'Cours 12 pages IA',type:'standard',pdfId,dateImport:'2026-10-10'});
for(const a of (await S.getAll('annotations')).filter(a=>a.ficheId==='ia-12'))await S.remove('annotations',a.id);
const now=new Date().toISOString();
for(const [id,page,kind,x,y,w,h,t,extra] of ${JSON.stringify(B.map(([id, page, kind, x, y, w, h, t, extra]) => [id, page, kind, x, y, w, h, doc(t), extra]))})
  await S.put('annotations',{id,ficheId:'ia-12',page,kind,type:kind==='libre'?'boite':'texte',x,y,width:w,height:h,content:t,createdAt:now,...extra});
return 'seed IA ok'})()`));
c.fermer();
