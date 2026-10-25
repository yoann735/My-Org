// §1 IMAGE DANS UNE BOÎTE : ⌘V (boîte sélectionnée, puis en édition), glisser-déposer, bouton « Image » de la mini barre,
// largeur intérieure + proportions, redimension, au-dessus / en dessous, remplacer, retirer, ⌘Z, OCR (+ surligneur),
// export PDF.   node t-image.mjs [tablette]
import { banc, imagesTest } from './commun.mjs';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const tablette = process.argv[2] === 'tablette';
const b = await banc();
const IM = await imagesTest(b);
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const base = { ficheId: 'f-simpl', page: 1, kind: 'libre', type: 'boite', fond: 'plein', gabarit: 'carte', taille1000: 16, bord1000: 1.5, pad1000: [10, 8], couleur: 'jaune-franc', createdAt: '2026-10-25T08:00:00.000Z' };
await b.preparer({ annotations: [
  { ...base, id: 'bi-1', x: 0.08, y: 0.12, width: 0.05, height: 0.04, content: doc('Le néphron') },
  { ...base, id: 'bi-2', x: 0.5, y: 0.12, width: 0.05, height: 0.04, couleur: 'vert-franc', content: doc('Rein droit') },
  { ...base, id: 'bi-3', x: 0.5, y: 0.6, width: 0.05, height: 0.04, couleur: 'bleu-franc', content: doc('Glissé ici') },
] });
await b.ouvrirCours({ tablette });
const A = async (id) => (await b.enBase()).find((a) => a.id === id);
const box = (id) => `document.querySelector('.note-box[data-boite="${id}"]')`;
const mesure = (id) => b.ev(`(()=>{const bx=${box(id)};const im=bx&&bx.querySelector('.nb-image');if(!im)return null;const body=bx.querySelector('.nb-body');const cs=getComputedStyle(body);const k=parseFloat(getComputedStyle(bx).scale)||1;
  const r=im.getBoundingClientRect(),q=bx.getBoundingClientRect(),i=im.querySelector('img');const t=bx.querySelector('.nb-texte p, .ProseMirror p');
  return {w:r.width,h:r.height,inner:body.getBoundingClientRect().width-(parseFloat(cs.paddingLeft)+parseFloat(cs.paddingRight))*k,boiteBas:q.bottom,imgBas:r.bottom,imgHaut:r.top,texteHaut:t?t.getBoundingClientRect().top:null,charge:!!(i&&i.complete&&i.naturalWidth)}})()`);
// 1. ⌘V (vrai, presse-papiers du navigateur) sur une boîte SÉLECTIONNÉE
await b.c.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: 'http://localhost:5199' });
await b.clic(await b.pos(box('bi-1'), false), { att: 500 });
await b.ev(`(async()=>{const bl=await (await fetch('data:image/png;base64,${fs.readFileSync(IM.schema).toString('base64')}')).blob();await navigator.clipboard.write([new ClipboardItem({'image/png':bl})]);return 1})()`);
await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', modifiers: 4, windowsVirtualKeyCode: 86, commands: ['paste'] });
await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', modifiers: 4, windowsVirtualKeyCode: 86 });
await b.dormir(1500);
let B1 = await A('bi-1');
const nImagesPage = await b.ev(`document.querySelectorAll('.pdfr-image').length`);
b.ok(B1.image && B1.image.blobId && Math.abs(B1.image.ratio - 520 / 900) < 0.01 && B1.image.position === 'dessus' && nImagesPage === 0, '⌘V sur une boîte sélectionnée : l’image va DANS la boîte (pas sur la page)', JSON.stringify(B1.image));
let m = await mesure('bi-1');
b.ok(m && m.charge && Math.abs(m.w - m.inner) <= 1.5 && Math.abs(m.h / m.w - 520 / 900) < 0.02, 'l’image occupe la largeur intérieure (marges respectées), hauteur proportionnelle', JSON.stringify(m && { w: Math.round(m.w), inner: Math.round(m.inner), ratio: +(m.h / m.w).toFixed(3) }));
b.ok(m && m.imgBas < m.texteHaut && m.imgBas <= m.boiteBas, 'au-dessus du texte, dans la boîte (la boîte a grandi)', JSON.stringify(m && { imgBas: Math.round(m.imgBas), texteHaut: Math.round(m.texteHaut), boiteBas: Math.round(m.boiteBas) }));
await b.capRect('bt-boite-image', box('bi-1'), 14);
// 2. redimensionner la boîte : l'image suit
await b.ev(`${box('bi-1')}.scrollIntoView({block:'center'});1`); await b.dormir(600);
const w0 = m.w;
const coin = await b.pos(`${box('bi-1')}.querySelector('.sel-coin.sel-se')`, false);
await b.glisser(coin, [coin[0] + 90, coin[1]], 10); await b.dormir(700);
m = await mesure('bi-1');
b.ok(m.w > w0 + 60 && Math.abs(m.w - m.inner) <= 1.5 && Math.abs(m.h / m.w - 520 / 900) < 0.02 && m.imgBas <= m.boiteBas, 'redimensionner la boîte : l’image se réajuste (largeur intérieure, proportions)', JSON.stringify({ avant: Math.round(w0), apres: Math.round(m.w) }));
// 3. position : en dessous (menu Image de la mini barre)
await b.clic(await b.pos(`[...document.querySelectorAll('.mini-barre [data-option="image"]')].find(e=>e.offsetParent)`, false), { att: 400 });
const entrees = await b.ev(`[...document.querySelectorAll('.mb-plus-pop [data-option]')].map(e=>e.dataset.option)`);
b.ok(JSON.stringify(entrees) === JSON.stringify(['image-dessus', 'image-dessous', 'image-remplacer', 'image-retirer']), 'mini barre › Image : au-dessus · en dessous · remplacer · retirer', JSON.stringify(entrees));
await b.clic(await b.pos(`document.querySelector('.mb-plus-pop [data-option="image-dessous"]')`, false), { att: 600 });
m = await mesure('bi-1');
b.ok((await A('bi-1')).image.position === 'dessous' && m.imgHaut > m.texteHaut, 'en dessous du texte', JSON.stringify({ imgHaut: Math.round(m.imgHaut), texteHaut: Math.round(m.texteHaut) }));
await b.capRect('bt-boite-image-dessous', box('bi-1'), 14);
// 4. ⌘V en ÉDITION : remplace l'image (le texte reste)
await b.clic(await b.pos(`${box('bi-1')}.querySelector('.nb-texte')`, false), { att: 700 });
const enEdition = await b.ev(`!!${box('bi-1')}.querySelector('.ProseMirror')`);
await b.ev(`(async()=>{const bl=await (await fetch('data:image/png;base64,${fs.readFileSync(IM.photo).toString('base64')}')).blob();await navigator.clipboard.write([new ClipboardItem({'image/png':bl})]);return 1})()`);
await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', modifiers: 4, windowsVirtualKeyCode: 86, commands: ['paste'] });
await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', modifiers: 4, windowsVirtualKeyCode: 86 });
await b.dormir(1500);
B1 = await A('bi-1');
b.ok(enEdition && Math.abs(B1.image.ratio - 0.5) < 0.01 && B1.image.position === 'dessous' && /néphron/.test(JSON.stringify(B1.content)) && (await b.ev(`!!${box('bi-1')}.querySelector('.ProseMirror')`)), '⌘V en édition : l’image est remplacée, le texte et la position restent, l’édition continue', JSON.stringify({ enEdition, ratio: B1.image.ratio }));
// 5. ⌘Z : l'image précédente revient
await b.T.Escape(); await b.dormir(300);
await b.touche('z', { meta: true, code: 'KeyZ', vk: 90 }); await b.dormir(700);
b.ok(Math.abs((await A('bi-1')).image.ratio - 520 / 900) < 0.01, '⌘Z : l’image d’avant revient');
// 6. bouton « Image » de la mini barre (choix d'un fichier) sur une boîte sans image
await b.T.Escape(); await b.dormir(300);
await b.clic(await b.pos(box('bi-2'), false), { att: 500 });
const choix = b.choisirFichier(IM.photo);
await b.clic(await b.pos(`[...document.querySelectorAll('.mini-barre [data-option="image"]')].find(e=>e.offsetParent)`, false), { att: 300 });
await choix; await b.dormir(1500);
const B2 = await A('bi-2');
b.ok(B2.image && Math.abs(B2.image.ratio - 0.5) < 0.01 && B2.largeurFixe && B2.width >= 0.28, 'bouton « Image » : fichier choisi, image dans la boîte (largeur ≥ 28 % de la page)', JSON.stringify({ image: B2.image, width: B2.width }));
// 7. glisser-déposer un fichier sur une boîte
await b.T.Escape(); await b.dormir(300);
const p3 = await b.pos(box('bi-3'), true); await b.dormir(400);
const q3 = await b.pos(box('bi-3'), false);
await b.c.send('Input.setInterceptDrags', { enabled: false });
for (const type of ['dragEnter', 'dragOver', 'drop']) { await b.c.send('Input.dispatchDragEvent', { type, x: q3[0], y: q3[1], data: { items: [], files: [IM.schema], dragOperationsMask: 1 } }); await b.dormir(300); }
await b.dormir(1500);
const B3 = await A('bi-3');
b.ok(B3.image && Math.abs(B3.image.ratio - 520 / 900) < 0.01 && (await b.ev(`document.querySelectorAll('.pdfr-image').length`)) === 0, 'glisser-déposer un fichier sur une boîte : l’image va dans la boîte', JSON.stringify(B3.image));
// 8. OCR : le texte de l'image est reconnu (mots posés sur l'image)
let mots = null;
for (let k = 0; k < 40 && !mots; k++) { await b.dormir(1000); mots = await b.ev(`(()=>{const c=${box('bi-3')}.querySelector('.pi-texte');return c?c.textContent:null})()`); }
b.ok(mots && /GLOMERULE/i.test(mots) && /TUBULE/i.test(mots), 'OCR : le texte de l’image de la boîte est reconnu', JSON.stringify(mots));
// surligneur : balayer les mots de l'image les surligne (comme sur les autres images)
if (mots) {
  await b.outil6('surligneur'); await b.dormir(400);
  const w1 = await b.ev(`(()=>{const s=[...${box('bi-3')}.querySelectorAll('.pi-mot')].find(e=>/GLOMERULE/i.test(e.textContent));const r=s.getBoundingClientRect();return [r.left+2,r.top+r.height/2,r.right-2]})()`);
  await b.glisser([w1[0], w1[1]], [w1[2], w1[1]], 10); await b.dormir(900);
  const hl = await b.surlignagesEnBase();
  b.ok(hl.some((h) => h.imageId === 'bi-3' && /GLOMERULE/i.test(h.texte || '')), 'Surligneur sur l’image de la boîte : un surlignage de ses mots', JSON.stringify(hl.map((h) => [h.imageId, h.texte])));
  await b.ev(`document.querySelector('[data-outil="main"], [data-outil="selection"]') && 1`);
  await b.T.Escape(); await b.dormir(300);
  await b.capRect('bt-boite-image-ocr', box('bi-3'), 14);
  await b.outil6(await b.ev(`document.querySelector('[data-outil="selection"]')?'selection':'main'`)); await b.dormir(300);
}
// 9. retirer l'image (et ses mots surlignés)
await b.clic(await b.pos(box('bi-3'), false), { att: 500 });
await b.clic(await b.pos(`[...document.querySelectorAll('.mini-barre [data-option="image"]')].find(e=>e.offsetParent)`, false), { att: 400 });
await b.clic(await b.pos(`document.querySelector('.mb-plus-pop [data-option="image-retirer"]')`, false), { att: 700 });
b.ok(!(await A('bi-3')).image && !(await b.ev(`!!${box('bi-3')}.querySelector('.nb-image')`)) && !(await b.surlignagesEnBase()).some((h) => h.imageId === 'bi-3'), 'Retirer l’image (ses surlignages partent avec)');
await b.touche('z', { meta: true, code: 'KeyZ', vk: 90 }); await b.dormir(700);
b.ok(!!(await A('bi-3')).image, '⌘Z : l’image retirée revient');
// 10. export PDF : l'image de la boîte est dessinée
const r = JSON.parse(await b.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const E=await import(u.find(n=>n.includes('/pdf/exportAnnote.js')));const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js')));
  const fi=await S.getOne('fiches','f-simpl');const an=(await S.getAll('annotations')).filter(a=>a.ficheId==='f-simpl');
  const r=await E.exporterDepuisBlob(fi.pdfId,[],an);let s='';const o=r.octets;for(let i=0;i<o.length;i+=0x8000)s+=String.fromCharCode.apply(null,o.subarray(i,i+0x8000));return JSON.stringify({b64:btoa(s),bilan:r.bilan})})()`));
fs.writeFileSync('../cap/bt-image-export.pdf', Buffer.from(r.b64, 'base64'));
execSync(`node -e "const {PDFDocument}=require('../../node_modules/pdf-lib');const fs=require('fs');(async()=>{const s=await PDFDocument.load(fs.readFileSync('../cap/bt-image-export.pdf'));const d=await PDFDocument.create();const [p]=await d.copyPages(s,[0]);d.addPage(p);fs.writeFileSync('../cap/bt-image-export-p1.pdf',await d.save())})()" && sips -s format png -Z 1400 ../cap/bt-image-export-p1.pdf --out ../cap/bt-image-export-p1.png >/dev/null`);
const vert = JSON.parse(await b.ev(`new Promise(ok=>{const i=new Image();i.onload=()=>{const k=document.createElement('canvas');k.width=i.width;k.height=i.height;const x=k.getContext('2d');x.drawImage(i,0,0);const d=x.getImageData(0,0,i.width,i.height).data;let n=0,rouge=0;for(let o=0;o<d.length;o+=4){if(d[o+1]>120&&d[o]<90&&d[o+2]<110)n++;if(d[o]>170&&d[o+1]<80&&d[o+2]<70)rouge++}ok(JSON.stringify({vert:n,rouge}))};i.src='data:image/png;base64,${''}'+${JSON.stringify(fs.readFileSync('../cap/bt-image-export-p1.png').toString('base64'))}})`));
b.ok(r.bilan.boites === 3 && vert.vert > 300 && vert.rouge > 100, 'export PDF : les images des boîtes sont dessinées (dégradé vert, cercle rouge du schéma)', JSON.stringify({ bilan: r.bilan.boites, ...vert }));
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
