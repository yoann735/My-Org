// Partie C : carte Muscle avec images (création). « PDF texte J » ouvert, panneau Exercices › Flashcards.
import { banc } from './commun-doc.mjs';
import path from 'path';
const B = await banc();
const { c, ev, ok, clic, dormir } = B;
await c.send('Page.enable'); await c.send('DOM.enable');
await c.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: 'http://localhost:' + (process.env.CDP_FILTRE || '5199') }).catch(() => {});
await c.send('Page.setInterceptFileChooserDialog', { enabled: true });
let choix = null;
c.on((m) => { if (m.method === 'Page.fileChooserOpened') choix = m.params; });
const GG = path.resolve('../fx/grand-gluteal.png'), PH = path.resolve('../fx/photo.png');
const bouton = (txt, dans = 'document') => B.pos(`[...${dans}.querySelectorAll('button')].find(b=>b.innerText.trim().startsWith(${JSON.stringify(txt)}))`, false);
await clic(await B.pos(`[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Exercices')&&x.closest('[role=tablist], .pis-modes, .cis-modes')) || [...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Exercices')`, false), { att: 400 });
await clic(await B.pos(`[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Flashcards'))`, false), { att: 400 });
await clic(await bouton('Ajouter'), { att: 600 });
await clic(await bouton('Tableau muscle'), { att: 600 });
const form = `document.querySelector('.mu-form')`;
const nom = await B.pos(`${form}.querySelector('.mu-nom-champ')`);
await clic(nom); await B.ecrire('m. Grand glutéal (images)');
// lignes de texte
for (const [id, t] of [['origine', 'Face postérieure de l’ilium'], ['action', 'Extenseur de la cuisse'], ['innervation', 'Nerf glutéal inférieur']]) {
  await clic(await B.pos(`document.getElementById('mu-${id}')`)); await B.ecrire(t);
}
// 1. ⌘V d'une image avec le curseur dans la ligne Origine → image de la ligne Origine
await clic(await B.pos(`document.getElementById('mu-origine')`));
await ev(`(async()=>{const b=await (await fetch('data:image/png;base64,${''}')).blob().catch(()=>null);return 1})()`);
const b64gg = (await import('fs')).readFileSync(GG).toString('base64');
await ev(`(async()=>{const bin=atob(${JSON.stringify(b64gg)});const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);await navigator.clipboard.write([new ClipboardItem({'image/png':new Blob([a],{type:'image/png'})})]);return 1})()`);
await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 4, commands: ['paste'] });
await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 4 });
await dormir(900);
const vign = () => ev(`[...document.querySelectorAll('.mu-saisie-ligne')].map(l=>({l:l.querySelector('.mu-etiquette').innerText,img:!!l.querySelector('.mui-vignette img')}))`);
let v = await vign();
ok(v[0].img && !v.slice(1).some((x) => x.img) && (await ev(`!document.querySelector('.mu-ocr-etat')`)), '1. ⌘V dans la ligne Origine → image de cette ligne (pas de pré-remplissage)', JSON.stringify(v.map((x) => x.img)));
// 2. parcourir : bouton « Image » de la ligne Action
await clic(await B.pos(`[...document.querySelectorAll('.mu-saisie-ligne')][3].querySelector('.mui-ajout')`), { att: 400 });
for (let i = 0; i < 20 && !choix; i++) await dormir(100);
await c.send('DOM.setFileInputFiles', { files: [PH], backendNodeId: choix.backendNodeId }); choix = null;
await dormir(800);
v = await vign();
ok(v[3].img, '2. « Image » de la ligne Action (parcourir) → vignette dans la ligne', JSON.stringify(v.map((x) => x.img)));
// 3. glisser un fichier sur le champ « Image du muscle » (image générale)
const zg = await B.pos(`document.querySelector('.mu-generale .mui-champ')`);
for (const type of ['dragEnter', 'dragOver', 'drop']) { await c.send('Input.dispatchDragEvent', { type, x: zg[0], y: zg[1], data: { items: [], files: [PH], dragOperationsMask: 1 } }); await dormir(120); }
await dormir(800);
const gen = await ev(`!!document.querySelector('.mu-generale .mui-vignette img')`);
const opt = await ev(`(()=>{const c=document.querySelector('.mu-recto-opt input');return c?c.checked:null})()`);
ok(gen && opt === false, '3. image générale déposée ; « Montrer l’image au recto » décochée par défaut');
// 4. « Masquer des mots » sur l'image d'Origine (OCR) : 2 mots
await clic(await B.pos(`[...document.querySelectorAll('.mu-saisie-ligne')][0].querySelector('.mui-liens button')`, false), { att: 600 });
for (let i = 0; i < 60 && !(await ev(`document.querySelectorAll('.mm-mot').length`)); i++) await dormir(500);
const nMots = await ev(`document.querySelectorAll('.mm-mot').length`);
await ev(`(()=>{const ms=[...document.querySelectorAll('.mm-mot')];const g=ms.find(m=>/^glut/i.test(m.title))||ms[3];g.click();const n=ms.find(m=>/^Nerf$/i.test(m.title))||ms[5];n.click();return 1})()`);
await B.capture('muscle-masquer-mots');
await clic(await B.pos(`[...document.querySelectorAll('.mm button')].find(b=>b.innerText.includes('Masquer'))`, false), { att: 500 });
const nbMasques = await ev(`document.querySelectorAll('.mu-saisie-ligne')[0].querySelectorAll('.mui-masque').length`);
ok(nMots > 20 && nbMasques === 2, '4. « Masquer des mots » (OCR) : 2 mots choisis → 2 masques sur l’image de la ligne', `${nMots} mots lus`);
await B.capture('muscle-formulaire');
// 5. enregistrer
await clic(await B.pos(`[...document.querySelectorAll('.mu-form .imp-actions button')].find(b=>b.innerText.includes('Ajouter'))`), { att: 1500 });
const carte = await B.S(`const q=(await S.getAll('questions')).filter(q=>q.ficheId==='j-txt'&&q.muscle&&q.recto.includes('images'));return q.map(x=>({id:x.id,muscle:x.muscle,verso:x.verso}))`);
const m = carte[0] && carte[0].muscle;
ok(carte.length === 1 && m.images.origine.imageId && m.images.origine.masques.length === 2 && m.images.action.imageId && !m.images.insertion && m.imageGenerale.imageId && m.imageGenerale.auRecto === false,
  '5. carte enregistrée : images Origine (2 masques) et Action, image générale au verso', JSON.stringify({ images: Object.keys(m.images), gen: m.imageGenerale }));
ok(/\[image du muscle : image-b[0-9a-z]+\.png\]/.test(carte[0].verso) && /Origine : Face postérieure de l’ilium\n  \[image : image-b/.test(carte[0].verso), '5b. verso texte (exports) : images listées en pièces', carte[0].verso.split('\n').slice(0, 3).join(' ⏎ '));
const blobs = await B.S(`const ids=[${'`'}${'$'}{0}${'`'}];return 1`).catch(() => 1);
const presents = await B.S(`const m=${JSON.stringify(m)};const ids=[m.images.origine.imageId,m.images.action.imageId,m.imageGenerale.imageId];return (await Promise.all(ids.map(i=>S.getBlob(i)))).map(b=>!!b&&b.size)`);
ok(presents.every(Boolean), '5c. les trois images sont des blobs enregistrés', JSON.stringify(presents));
ok(!B.erreurs.length, 'aucune exception JS', B.erreurs.join(' | '));
console.log('CARTE', carte[0].id);
c.fermer();
