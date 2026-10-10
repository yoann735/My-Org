// Chantier 1 : dans un DOCUMENT, les 4 chemins d'ajout d'image donnent un bloc du flux.
// Pré-requis : « Document neuf J » ouvert (node ouvrir-cours.mjs "Document neuf J").
import { banc } from './commun-doc.mjs';
import path from 'path';
import fs from 'fs';
const B64 = fs.readFileSync('../fx/photo.png').toString('base64');
const B = await banc();
const { c, ev, ok, clic, dormir } = B;
const PHOTO = path.resolve('../fx/photo.png');
await c.send('Page.enable'); await c.send('DOM.enable');
await c.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: 'http://localhost:5199' }).catch(() => {});
const etat = () => ev(`(()=>{const pm=document.querySelector('.pt-flux');const ed=pm&&pm.editor;const out=[];ed.state.doc.forEach((n,p,i)=>out.push(n.type.name==='image'?'IMG':n.type.name==='paragraph'?(n.textContent.slice(0,14)||'¶vide'):n.type.name));return {blocs:out,flottantes:document.querySelectorAll('.pdfr-image').length}})()`);
const nbImg = (e) => e.blocs.filter((b) => b === 'IMG').length;
// curseur à la fin du texte du paragraphe dont le texte commence par `debut`
const curseurDans = async (debut) => {
  const p = await ev(`(()=>{const el=[...document.querySelectorAll('.pt-flux > p')].find(x=>x.textContent.startsWith(${JSON.stringify(debut)}));if(!el)return null;el.scrollIntoView({block:'center'});const r=document.createRange();r.selectNodeContents(el);const rs=r.getClientRects();const d=rs[rs.length-1];return [d.right-3,d.top+d.height/2]})()`);
  await clic(p, { att: 400 });
};
const indexApres = (e, debut) => e.blocs.findIndex((b) => b.startsWith(debut));
// A. bouton Image de la barre d'annotation (sélecteur de fichier intercepté)
await c.send('Page.setInterceptFileChooserDialog', { enabled: true });
let choix = null;
c.on((m) => { if (m.method === 'Page.fileChooserOpened') choix = m.params; });
await curseurDans('Paragraphe 2.');
let e0 = await etat();
await clic(await B.pos(`document.querySelector('button.ptb-outil[title^="Image"]')`), { att: 500 });
for (let i = 0; i < 20 && !choix; i++) await dormir(100);
if (choix) await c.send('DOM.setFileInputFiles', { files: [PHOTO], backendNodeId: choix.backendNodeId });
await dormir(1500);
let e1 = await etat();
ok(nbImg(e1) === nbImg(e0) + 1 && e1.blocs[indexApres(e1, 'Paragraphe 2.') + 1] === 'IMG' && !e1.flottantes, 'A. bouton Image de la barre → bloc du flux sous le paragraphe du curseur', JSON.stringify(e1.blocs));
await B.capture('A-bouton-barre');
// B. ⌘V avec le curseur dans le texte
await curseurDans('Paragraphe 4.');
await ev(`(async()=>{const r=await fetch('/@fs'+${JSON.stringify(PHOTO)}).catch(()=>null);let b=r&&r.ok?await r.blob():null;if(!b){const cv=document.createElement('canvas');cv.width=300;cv.height=120;const g=cv.getContext('2d');g.fillStyle='#cde';g.fillRect(0,0,300,120);g.fillStyle='#123';g.font='28px Arial';g.fillText('Collée ⌘V',20,70);b=await new Promise(o=>cv.toBlob(o,'image/png'))}await navigator.clipboard.write([new ClipboardItem({'image/png':b})]);return b.size})()`);
e0 = await etat();
await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 4, commands: ['paste'] });
await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 4 });
await dormir(1500);
e1 = await etat();
ok(nbImg(e1) === nbImg(e0) + 1 && e1.blocs[indexApres(e1, 'Paragraphe 4.') + 1] === 'IMG' && !e1.flottantes, 'B. ⌘V (curseur dans le texte) → bloc sous le paragraphe 4', JSON.stringify(e1.blocs));
// B2. ⌘V sans le curseur dans le texte (clic dans le panneau) → fin de la page courante
await clic(await B.pos(`document.querySelector('.pis-vide, .cis-empty, .ci-sidebar, .pis') || document.querySelector('.lecteur-entete')`, false), { att: 300 });
await ev(`document.activeElement && document.activeElement.blur && document.activeElement.blur(), 1`);
e0 = await etat();
await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 4, commands: ['paste'] });
await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 4 });
await dormir(1500);
e1 = await etat();
ok(nbImg(e1) === nbImg(e0) + 1 && !e1.flottantes, 'B2. ⌘V hors du texte → bloc du flux (curseur gardé sur la page, sinon fin de page)', JSON.stringify(e1.blocs));
// C. glisser-déposer d'un fichier ENTRE le paragraphe 1 et le paragraphe 2
const entre = await ev(`(()=>{const ps=[...document.querySelectorAll('.pt-flux > p')];const a=ps.find(x=>x.textContent.startsWith('Paragraphe 1.')),b=ps.find(x=>x.textContent.startsWith('Paragraphe 2.'));a.scrollIntoView({block:'center'});const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();return [ra.x+ra.width/2,(ra.bottom+rb.top)/2]})()`);
e0 = await etat();
const data = { items: [], files: [PHOTO], dragOperationsMask: 1 };
for (const type of ['dragEnter', 'dragOver', 'drop']) { await c.send('Input.dispatchDragEvent', { type, x: entre[0], y: entre[1], data }); await dormir(120); }
await dormir(1500);
e1 = await etat();
ok(nbImg(e1) === nbImg(e0) + 1 && e1.blocs[indexApres(e1, 'Paragraphe 1.') + 1] === 'IMG' && !e1.flottantes, 'C. glisser un fichier entre P1 et P2 → bloc à cet endroit', JSON.stringify(e1.blocs));
// C2. glisser dans la MARGE de la page (hors du texte), au niveau du paragraphe 3
const marge = await ev(`(()=>{const p=[...document.querySelectorAll('.pt-flux > p')].find(x=>x.textContent.startsWith('Paragraphe 3.'));p.scrollIntoView({block:'center'});const r=p.getBoundingClientRect();const pg=document.querySelector('.pdfr-pages-doc').getBoundingClientRect();return [r.left-30,r.bottom-4]})()`);
e0 = await etat();
for (const type of ['dragEnter', 'dragOver', 'drop']) { await c.send('Input.dispatchDragEvent', { type, x: marge[0], y: marge[1], data }); await dormir(120); }
await dormir(1500);
e1 = await etat();
ok(nbImg(e1) === nbImg(e0) + 1 && e1.blocs[indexApres(e1, 'Paragraphe 3.') + 1] === 'IMG' && !e1.flottantes, 'C2. glisser dans la marge → bloc à la limite la plus proche (sous P3)', JSON.stringify(e1.blocs));
// D. Dessins : « Poser » depuis le menu
await B.S(`const bin=atob(${JSON.stringify(B64)});const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);const b=await S.putBlob(new Blob([a],{type:'image/png'}));await S.put('dessins',{id:'dz-1',ficheId:'j-doc2',blobId:b,envoyeLe:new Date().toISOString(),largeur:600,hauteur:300});return 1`);
await dormir(3000); // sondage des dessins (2 s)
await ev(`(()=>{const a=[...document.querySelectorAll('.ad button')].find(b=>/Plus tard/.test(b.innerText));a&&a.click();return 1})()`); await dormir(900);
await curseurDans('Paragraphe 1.');
e0 = await etat();
await clic(await B.pos(`document.querySelector('.ptb-dessins')`), { att: 600 });
await clic(await B.pos(`[...document.querySelectorAll('.od-carte button')].find(b=>b.innerText.trim()==='Poser')`), { att: 1800 });
e1 = await etat();
ok(nbImg(e1) === nbImg(e0) + 1 && !e1.flottantes, 'D. Dessins › Poser → bloc du flux (au curseur)', JSON.stringify(e1.blocs));
// D2. Dessins : glisser la carte entre P2 et P3 (glisser HTML5 réel intercepté)
await ev(`(()=>{const p=[...document.querySelectorAll('.pt-flux > p')].find(x=>x.textContent.startsWith('Paragraphe 2.'));p.scrollIntoView({block:'center'});return 1})()`); await dormir(400);
await clic(await B.pos(`document.querySelector('.ptb-dessins')`), { att: 600 });
const carte = await B.pos(`document.querySelector('.od-carte .od-vignette')`);
const cible = await ev(`(()=>{const ps=[...document.querySelectorAll('.pt-flux > p')];const a=ps.find(x=>x.textContent.startsWith('Paragraphe 2.')),b=a.nextElementSibling;const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();return [ra.x+ra.width/2,(ra.bottom+rb.top)/2]})()`);
await c.send('Input.setInterceptDrags', { enabled: true });
let intercepte = null;
c.on((m) => { if (m.method === 'Input.dragIntercepted') intercepte = m.params.data; });
await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: carte[0], y: carte[1] });
await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: carte[0], y: carte[1], button: 'left', clickCount: 1 });
for (let i = 1; i <= 8; i++) { await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: carte[0] + (cible[0] - carte[0]) * i / 8, y: carte[1] + (cible[1] - carte[1]) * i / 8, button: 'left', buttons: 1 }); await dormir(40); }
for (let i = 0; i < 20 && !intercepte; i++) await dormir(100);
e0 = await etat();
if (intercepte) for (const type of ['dragEnter', 'dragOver', 'drop']) { await c.send('Input.dispatchDragEvent', { type, x: cible[0], y: cible[1], data: intercepte }); await dormir(150); }
await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cible[0], y: cible[1], button: 'left', clickCount: 1 });
await c.send('Input.setInterceptDrags', { enabled: false });
await dormir(1800);
e1 = await etat();
ok(!!intercepte && nbImg(e1) === nbImg(e0) + 1 && e1.blocs[indexApres(e1, 'Paragraphe 2.') + 1] === 'IMG' && !e1.flottantes, 'D2. Dessins › glisser la carte entre P2 et P3 → bloc à cet endroit', JSON.stringify(e1.blocs));
await B.capture('D-dessins');
// pagination : chaque image a une page calculée ; le document s'est allongé
const pag = await ev(`(()=>{const pm=document.querySelector('.pt-flux');const p=pm.pagination;const imgs=[];pm.editor.state.doc.forEach((n,pos,i)=>{if(n.type.name==='image')imgs.push(p&&p.res&&p.res.pages?p.res.pages[i]:null)});return {pages:document.querySelectorAll('.pdfr-page').length+document.querySelectorAll('.pdfr-placeholder').length,imgs}})()`);
ok(pag.imgs.every((x) => Number.isInteger(x)), 'pagination : chaque image a sa page', JSON.stringify(pag));
// sauvegarde : le flux enregistré contient les images (blobId)
await dormir(1200);
const sauve = await B.S(`const r=await S.getOne('notes_doc','j-doc2');let n=0;JSON.stringify(r.flux).replace(/"type":"image"/g,()=>n++);return n`);
const final = await etat();
ok(sauve === nbImg(final), 'flux enregistré : ' + sauve + ' image(s), comme à l’écran');
ok(!B.erreurs.length, 'aucune exception JS', B.erreurs.join(' | '));
c.fermer();
