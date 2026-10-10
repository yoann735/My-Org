// Partie A : export spécial IA par l'interface. « Cours 12 pages IA » ouvert, page 1 affichée (seed-ia.mjs).
import { banc } from './commun-doc.mjs';
import { outilsJson } from './json-commun.mjs';
import fs from 'fs';
import { execSync } from 'child_process';
const B = await banc();
const { c, ev, ok, clic, dormir } = B;
const J = outilsJson(B);
await c.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: 'http://localhost:' + (process.env.CDP_FILTRE || '5199') }).catch(() => {});
await ev(`(()=>{window.__telecharges=[];const o=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__telecharges.push({nom:this.download,href:this.href});return}return o.call(this)};return 1})()`);
await ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await dormir(600);
const recupere = async (dossier) => {
  const t = await ev(`(async()=>{const t=window.__telecharges[window.__telecharges.length-1];const b=await (await fetch(t.href)).blob();const r=new FileReader();return await new Promise(ok=>{r.onload=()=>ok({nom:t.nom,b64:r.result.split(',')[1]});r.readAsDataURL(b)})})()`);
  fs.rmSync(dossier, { recursive: true, force: true }); fs.mkdirSync(dossier, { recursive: true });
  fs.writeFileSync(`${dossier}/${t.nom}`, Buffer.from(t.b64, 'base64'));
  execSync(`cd "${dossier}" && unzip -q "${t.nom}"`);
  return { nom: t.nom, fichiers: fs.readdirSync(dossier).filter((f) => f !== t.nom).sort() };
};
// 0. le menu Fichier propose l'entrée, distincte de l'export PDF annoté
await clic(await B.pos(`document.querySelector('.mf-bouton')`, false), { att: 400 });
const items = await ev(`[...document.querySelectorAll('.mf-item')].map(b=>b.innerText.trim())`);
ok(items.includes('Export spécial IA…') && items.some((x) => x.startsWith('Exporter en PDF annoté')), '0. Fichier › « Export spécial IA… » à côté de « Exporter en PDF annoté » (inchangé)', items.join(' | '));
await clic(await B.pos(`[...document.querySelectorAll('.mf-item')].find(b=>b.innerText.startsWith('Export spécial IA'))`, false), { att: 600 });
await J.capturer('ia-panneau', { x: 860, y: 60, width: 580, height: 380 });
// 1. aperçu (page 1)
await clic(await B.bouton('Aperçu'), { att: 400 });
for (let i = 0; i < 40 && !(await ev(`!!document.querySelector('.eia-page img')`)); i++) await dormir(250);
await dormir(600);
const ap = await ev(`(()=>{const i=document.querySelector('.eia-page img');return {n:document.querySelectorAll('.eia-page').length,w:i.naturalWidth,h:i.naturalHeight,leg:document.querySelector('.eia-page figcaption').innerText}})()`);
ok(ap.n === 1 && ap.w === 1190 && ap.h === 1684, '1. Aperçu : la page avec ses repères, PNG 2× (1190 × 1684)', JSON.stringify(ap));
await B.capture('ia-apercu');
await clic(await B.pos(`document.querySelector('.eia-apercu button[aria-label="Fermer l’aperçu"]')`, false), { att: 400 });
// 2. zip de la page 1
await clic(await B.bouton('Télécharger (.zip)'), { att: 400 });
for (let i = 0; i < 40 && !(await ev(`window.__telecharges.length`)); i++) await dormir(250);
const z1 = await recupere('../cap/zip-p01');
ok(z1.nom === 'Cours-12-pages-IA-export-IA-p01.zip' && z1.fichiers.join() === 'LISEZMOI.txt,annotations.json,page-01.png,visuel.pdf', '2. .zip de la page : nommage et contenu', `${z1.nom} → ${z1.fichiers.join(', ')}`);
const j1 = JSON.parse(fs.readFileSync('../cap/zip-p01/annotations.json', 'utf8'));
ok(j1.boxes.length === 8 && j1.boxes.every((b) => Object.keys(b).join() === 'id,ref,text' && /^#[a-z0-9]{3,}$/.test(b.ref) && b.id.endsWith(b.ref.slice(1))) && typeof j1.instructions === 'string', '2b. annotations.json : 8 boîtes { id, ref, text }, ref = fin de l’id, consignes incluses');
const lis = fs.readFileSync('../cap/zip-p01/LISEZMOI.txt', 'utf8');
ok(/flèche/.test(lis) && /mêmes "id" et "ref"/.test(lis), '2c. LISEZMOI : format de retour et rôle des flèches');
// 3. copier le JSON / copier l'image
await clic(await B.bouton('Copier le JSON'), { att: 800 });
const cj = JSON.parse(await ev(`navigator.clipboard.readText()`));
ok(JSON.stringify(cj) === JSON.stringify(j1), '3a. « Copier le JSON » = annotations.json du .zip');
await clic(await B.bouton('Copier l’image'), { att: 400 });
for (let i = 0; i < 40 && !(await ev(`(document.querySelector('.ta-message')||{}).innerText||''`)).includes('copiée'); i++) await dormir(250);
const img = await ev(`(async()=>{const it=await navigator.clipboard.read();const b=await it[0].getType('image/png');const bm=await createImageBitmap(b);return [b.size,bm.width,bm.height]})()`);
ok(img[1] === 1190 && img[2] === 1684, '3b. « Copier l’image » : PNG de la page dans le presse-papiers', JSON.stringify(img));
// 4. cours entier (12 pages)
await clic(await B.pos(`[...document.querySelectorAll('.eia-panneau .mep-pre')].find(b=>b.innerText.startsWith('Cours'))`, false), { att: 300 });
const avantN = await ev(`window.__telecharges.length`);
await clic(await B.bouton('Télécharger (.zip)'), { att: 400 });
for (let i = 0; i < 120 && (await ev(`window.__telecharges.length`)) === avantN; i++) await dormir(250);
const z2 = await recupere('../cap/zip-cours');
const attendus = ['LISEZMOI.txt', 'annotations.json', ...Array.from({ length: 12 }, (_, i) => `page-${String(i + 1).padStart(2, '0')}.png`), 'visuel.pdf'].sort();
const j2 = JSON.parse(fs.readFileSync('../cap/zip-cours/annotations.json', 'utf8'));
const { PDFDocument } = await import('pdf-lib');
const pagesPdf = String((await PDFDocument.load(fs.readFileSync('../cap/zip-cours/visuel.pdf'))).getPageCount());
ok(z2.nom === 'Cours-12-pages-IA-export-IA.zip' && JSON.stringify(z2.fichiers) === JSON.stringify(attendus) && !('page' in j2) && j2.boxes.length === 13 && pagesPdf === '12', '4. cours entier : 12 PNG page-01…page-12, visuel.pdf de 12 pages, 13 boîtes', `${z2.nom} · ${z2.fichiers.length} fichiers · pdf ${pagesPdf} p.`);
const refsP1 = new Map(j1.boxes.map((b) => [b.id, b.ref]));
ok(j2.boxes.filter((b) => refsP1.has(b.id)).every((b) => refsP1.get(b.id) === b.ref), '4b. mêmes repères en export page et en export cours');
await B.touche('Escape', { vk: 27 }); await dormir(300);
// 5. réimport avec la SEULE ref : une boîte modifiée ; plus une ref ambiguë et une ref inconnue
const cible = j1.boxes.find((b) => b.text.startsWith('Citrate'));
const retour = { boxes: [{ ref: cible.ref, text: 'Citrate synthase : étape 1.' }, { ref: '#xyz', text: 'ambiguë' }, { ref: '#zzz9', text: 'inconnue' }] };
const avantRecs = await B.S(`return (await S.getAll('annotations')).filter(a=>a.ficheId==='ia-12').sort((a,b)=>a.id.localeCompare(b.id))`);
await J.fichier('Importer des textes');
await ev(`(()=>{const t=document.querySelector('.ta-colle');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,${JSON.stringify(JSON.stringify(retour))});t.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
await dormir(200);
await clic(await B.bouton('Importer le collage'), { att: 900 });
const msg = await ev(`(document.querySelector('.ta-message')||{}).innerText`);
await B.touche('Escape', { vk: 27 }); await dormir(400);
const apresRecs = await B.S(`return (await S.getAll('annotations')).filter(a=>a.ficheId==='ia-12').sort((a,b)=>a.id.localeCompare(b.id))`);
const changes = apresRecs.filter((a) => JSON.stringify(a) !== JSON.stringify(avantRecs.find((x) => x.id === a.id)));
const b = apresRecs.find((a) => a.id === cible.id);
ok(changes.length === 1 && changes[0].id === cible.id && b.textAlt === 'Citrate synthase : étape 1.' && b.displayVersion === 'alt' && b.textOriginal.startsWith('Citrate synthase : premiere'), '5. réimport par ref seule : seule cette boîte change (versions IA / orig.)', msg.replace(/\n/g, ' '));
ok(/1 ref ambiguë ignorée/.test(msg) && /1 id inconnu ignoré/.test(msg) && /#xyz/.test(msg), '5b. ref ambiguë et ref inconnue : ignorées et signalées');
// 6. la bascule de version reste disponible sur la boîte
await J.fichier('Version des textes');
await clic(await B.bouton('Tout afficher en version originale'), { att: 700 });
const b2 = (await B.S(`return await S.getOne('annotations',${JSON.stringify(cible.id)})`));
ok(b2.displayVersion === 'original' && b2.textAlt === 'Citrate synthase : étape 1.', '6. bascule conservée (retour à l’original, version IA gardée)');
await B.touche('Escape', { vk: 27 });
ok(!B.erreurs.length, 'aucune exception JS', B.erreurs.join(' | '));
c.fermer();
