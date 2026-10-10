// Chantier 1 (suite) : fin de la page cible, déplacement d'un bloc image, PDF importé.
// Pré-requis : t-images-doc.mjs vient de tourner (« Document neuf J » ouvert, 3 pages).
import { banc } from './commun-doc.mjs';
import path from 'path';
const B = await banc();
const { c, ev, ok, clic, dormir } = B;
const PHOTO = path.resolve('../fx/photo.png');
await c.send('Page.enable'); await c.send('DOM.enable');
await c.send('Page.setInterceptFileChooserDialog', { enabled: true });
let choix = null;
c.on((m) => { if (m.method === 'Page.fileChooserOpened') choix = m.params; });
const choisirFichier = async () => { for (let i = 0; i < 20 && !choix; i++) await dormir(100); if (choix) await c.send('DOM.setFileInputFiles', { files: [PHOTO], backendNodeId: choix.backendNodeId }); choix = null; await dormir(1500); };
const etat = () => ev(`(()=>{const pm=document.querySelector('.pt-flux');const ed=pm.editor;const out=[];const pages=pm.pagination&&pm.pagination.res.pages;ed.state.doc.forEach((n,p,i)=>out.push((n.type.name==='image'?'IMG':n.type.name==='paragraph'?(n.textContent.slice(0,14)||'¶vide'):n.type.name)+'@'+(pages?pages[i]:'?')));return out})()`);
// E. curseur sur la page 1, page 3 affichée → l'image va à la FIN de la page 3
await ev(`(()=>{const s=document.querySelector('.pdfr-scroll');s.scrollTop=s.scrollHeight;return 1})()`); await dormir(800);
const pageAff = await ev(`document.querySelector('.ptb-page, .pdfr-num, [class*=page-num]') ? 1 : 1`);
let e0 = await etat();
await clic(await B.pos(`document.querySelector('button.ptb-outil[title^="Image"]')`, false), { att: 500 });
await choisirFichier();
let e1 = await etat();
const derPage = Math.max(...e1.map((x) => Number(x.split('@')[1]) || 0));
const nouvelles = e1.filter((x) => x.startsWith('IMG')).length - e0.filter((x) => x.startsWith('IMG')).length;
const idx = e1.findIndex((x, i) => x !== e0[i]);
ok(nouvelles === 1 && e1[idx].startsWith('IMG') && Number(e1[idx].split('@')[1]) >= derPage - 1, 'E. curseur ailleurs : image ajoutée en fin de page affichée', `${JSON.stringify(e0)} → ${JSON.stringify(e1)}`);
// F. DÉPLACER un bloc image (sélection, puis glisser au pointeur au-dessus du paragraphe 1)
await ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await dormir(600);
e0 = await etat();
const img = await B.pos(`document.querySelectorAll('.pt-flux .pti img')[0]`);
await clic(img, { att: 500 });
const dest = await ev(`(()=>{const h=document.querySelector('.pt-flux > h1');const p=h.nextElementSibling;const a=h.getBoundingClientRect(),b=p.getBoundingClientRect();return [b.x+b.width/2,(a.bottom+b.top)/2]})()`);
await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: img[0], y: img[1], button: 'left', clickCount: 1, buttons: 1 });
for (let i = 1; i <= 12; i++) { await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: img[0] + (dest[0] - img[0]) * i / 12, y: img[1] + (dest[1] - img[1]) * i / 12, button: 'left', buttons: 1 }); await dormir(40); }
await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dest[0], y: dest[1], button: 'left', clickCount: 1 });
await dormir(1200);
e1 = await etat();
ok(e1[1].startsWith('IMG') && e1.length === e0.length, 'F. bloc image déplacé entre le titre et P1', `${JSON.stringify(e0.slice(0, 4))} → ${JSON.stringify(e1.slice(0, 4))}`);
await B.capture('F-deplace');
// G. ANNULER le déplacement (⌘Z) puis RÉTABLIR
await B.touche('z', { meta: true, code: 'KeyZ', vk: 90 }); await dormir(900);
const e2 = await etat();
ok(JSON.stringify(e2) === JSON.stringify(e0), 'G. ⌘Z annule le déplacement', JSON.stringify(e2.slice(0, 4)));
c.fermer();
