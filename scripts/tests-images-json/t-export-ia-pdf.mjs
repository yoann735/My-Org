// Export IA en PDF (11/10), par l'interface. Prérequis : seed-ia.mjs, seed-ia26.mjs ; lancé depuis un dossier
// dont ../cap et ../fx existent. Les téléchargements sont interceptés (lien <a download>) et enregistrés dans ../cap/pdf-ia/.
// 1. page unique → PDF d'une page + annotations.json + LISEZMOI.txt ; 2. cours de 12 pages → PDF de 12 pages, poids,
// couche texte invisible (#ref — texte, numéro de page), JSON cohérent ; 3. PNG par page ; 4. cours de 26 pages :
// progression, interface fluide, Annuler, puis export complet ; 5. réimport d'un JSON modifié ; 6. PDF annoté normal.
import { banc } from './commun-doc.mjs';
import { outilsJson } from './json-commun.mjs';
import fs from 'fs';
import { execSync } from 'child_process';
const B = await banc();
const { c, ev, ok, clic, dormir } = B;
const J = outilsJson(B);
const DOSSIER = '../cap/pdf-ia';
fs.rmSync(DOSSIER, { recursive: true, force: true }); fs.mkdirSync(DOSSIER, { recursive: true });
await c.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: 'http://localhost:5199' }).catch(() => {});
const intercepter = () => ev(`(()=>{window.__telecharges=window.__telecharges||[];if(window.__intercepte)return 1;window.__intercepte=1;const o=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__telecharges.push({nom:this.download,href:this.href});return}return o.call(this)};return 1})()`);
// enregistre les téléchargements à partir de l'indice `depuis` (le blob est lu avant sa révocation, 4 s)
const recuperer = async (depuis, sous) => {
  const liste = await ev(`(async()=>{const out=[];for(const t of window.__telecharges.slice(${depuis})){const b=await (await fetch(t.href)).blob();const r=new FileReader();out.push(await new Promise(ok=>{r.onload=()=>ok({nom:t.nom,b64:r.result.split(',')[1]});r.readAsDataURL(b)}))}return out})()`);
  const d = `${DOSSIER}/${sous}`; fs.mkdirSync(d, { recursive: true });
  for (const f of liste) fs.writeFileSync(`${d}/${f.nom}`, Buffer.from(f.b64, 'base64'));
  return liste.map((f) => f.nom);
};
const nbTel = () => ev(`window.__telecharges.length`);
const attendreTel = async (avant, n, ms = 120000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await nbTel()) >= avant + n) return true; await dormir(150); } return false; };
const ouvrirPanneau = async () => {
  await clic(await B.pos(`document.querySelector('.mf-bouton')`, false), { att: 400 });
  await clic(await B.pos(`[...document.querySelectorAll('.mf-item')].find(b=>b.innerText.startsWith('Export spécial IA'))`, false), { att: 600 });
};
const portee = (txt) => B.pos(`[...document.querySelectorAll('.eia-panneau .mep-pre')].find(b=>b.innerText.startsWith(${JSON.stringify(txt)}))`, false);
// analyse d'un PDF DANS la page, avec le pdf.js de l'app (celui du PdfReader) : pages, tailles, texte, rendu
const analyser = (chemin) => ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const P=await import(u.find(n=>n.includes('/medrevise/pdf/pdfjsSetup.js'))||'/src/medrevise/pdf/pdfjsSetup.js');
  const bin=atob(${JSON.stringify(fs.readFileSync(chemin).toString('base64'))});const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
  const doc=await P.openPdf(a);const pages=[];for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i);const vp=p.getViewport({scale:1});const t=await p.getTextContent();pages.push({w:Math.round(vp.width),h:Math.round(vp.height),texte:t.items.map(x=>x.str).join(' ')})}
  const n=doc.numPages;doc.loadingTask.destroy();return {n,pages}})()`);
// structure brute : images (dimensions, filtre), mode de rendu du texte
const brut = (chemin) => {
  const s = fs.readFileSync(chemin).toString('latin1');
  const images = [...s.matchAll(/\/Subtype\s*\/Image[\s\S]{0,300}?>>/g)].map((m) => ({ w: +(/\/Width\s+(\d+)/.exec(m[0]) || [])[1], h: +(/\/Height\s+(\d+)/.exec(m[0]) || [])[1], jpeg: /DCTDecode/.test(m[0]) }));
  return { images, taille: fs.statSync(chemin).size };
};
await intercepter();
await ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await dormir(600);

// 1. PAGE UNIQUE
await ouvrirPanneau();
const boutons = await ev(`[...document.querySelectorAll('.eia-panneau button')].map(b=>b.innerText.trim()).filter(Boolean)`);
ok(boutons.includes('Télécharger (PDF + JSON)') && boutons.includes('PNG par page') && boutons.includes('Copier le JSON') && boutons.includes('Aperçu'), '0. panneau : « Télécharger (PDF + JSON) » par défaut, « PNG par page », Aperçu, Copier le JSON', boutons.join(' | '));
await J.capturer('pdf-ia-panneau', { x: 860, y: 60, width: 580, height: 400 });
let avant = await nbTel();
await clic(await B.bouton('Télécharger (PDF + JSON)'), { att: 300 });
ok(await attendreTel(avant, 3, 60000), '1. un clic → trois téléchargements');
const f1 = await recuperer(avant, 'page');
ok(f1.join() === 'Cours-12-pages-IA-export-ia-p01.pdf,annotations.json,LISEZMOI.txt', '1a. page 1 : <cours>-export-ia-p01.pdf + annotations.json + LISEZMOI.txt', f1.join(', '));
const a1 = await analyser(`${DOSSIER}/page/${f1[0]}`);
const b1 = brut(`${DOSSIER}/page/${f1[0]}`);
const j1 = JSON.parse(fs.readFileSync(`${DOSSIER}/page/annotations.json`, 'utf8'));
ok(a1.n === 1 && a1.pages[0].w === 595 && a1.pages[0].h === 842 && b1.images.length === 1 && b1.images[0].w === 1240 && b1.images[0].h === 1754 && b1.images[0].jpeg, '1b. PDF d’une page, format de la page d’origine (595 × 842 pt), image JPEG 150 dpi (1 240 × 1 754 px)', JSON.stringify({ n: a1.n, page: a1.pages[0].w + '×' + a1.pages[0].h, images: b1.images, octets: b1.taille }));
ok(j1.boxes.length === 8 && j1.boxes.every((b) => a1.pages[0].texte.includes(`${b.ref} — `)) && /Page 1 \/ 12/.test(a1.pages[0].texte), '1c. couche texte : « #ref — texte » pour les 8 boîtes + « Page 1 / 12 » en pied', a1.pages[0].texte.slice(0, 160) + '…');
const lis = fs.readFileSync(`${DOSSIER}/page/LISEZMOI.txt`, 'utf8');
ok(lis.includes('Cours-12-pages-IA-export-ia-p01.pdf') && /texte invisible/.test(lis) && /mêmes "id" et "ref"/.test(lis), '1d. LISEZMOI : nomme le PDF, explique la couche texte et le format de retour');
const msg1 = await ev(`(document.querySelector('.eia-panneau .ta-message')||{}).innerText||''`);
ok(/1 page, .* Mo .*150 dpi/.test(msg1), '1e. message : pages, poids, dpi', msg1);

// 2. COURS ENTIER (12 pages)
await clic(await portee('Cours'), { att: 300 });
avant = await nbTel();
await clic(await B.bouton('Télécharger (PDF + JSON)'), { att: 100 });
let vuProgres = '';
for (let i = 0; i < 400 && (await nbTel()) < avant + 3; i++) { const p = await ev(`(document.querySelector('.eia-progres')||{}).innerText||''`); if (/Pages du PDF : \d+ \/ 12/.test(p)) vuProgres = p.split('\n')[0]; await dormir(60); }
const f2 = await recuperer(avant, 'cours');
ok(f2.join() === 'Cours-12-pages-IA-export-ia.pdf,annotations.json,LISEZMOI.txt', '2. cours entier : Cours-12-pages-IA-export-ia.pdf + annotations.json + LISEZMOI.txt', f2.join(', '));
ok(!!vuProgres, '2a. barre de progression page par page', vuProgres);
const P2 = `${DOSSIER}/cours/${f2[0]}`;
const a2 = await analyser(P2);
const b2 = brut(P2);
const j2 = JSON.parse(fs.readFileSync(`${DOSSIER}/cours/annotations.json`, 'utf8'));
const poidsPages = b2.images.map(() => 0);
ok(a2.n === 12 && a2.pages.every((p) => p.w === 595 && p.h === 842) && b2.images.length === 12 && b2.images.every((im) => im.w === 1240 && im.h === 1754 && im.jpeg), '2b. 12 pages au format d’origine, une image JPEG 1 240 × 1 754 par page', `${a2.n} p., ${b2.images.length} images`);
ok(b2.taille < 12 * 1024 * 1024 && b2.taille / 12 < 1024 * 1024 && b2.taille < 40 * 1024 * 1024, `2c. poids : ${(b2.taille / 1024 / 1024).toFixed(2)} Mo pour 12 pages (≈ ${Math.round(b2.taille / 12 / 1024)} Ko par page) — < 1 Mo par page, < 40 Mo`);
const refsTexte = new Set(a2.pages.flatMap((p) => [...p.texte.matchAll(/(#[a-z0-9]+) — /g)].map((m) => m[1])));
const refsJson = new Set(j2.boxes.map((b) => b.ref));
ok(j2.boxes.length === 13 && [...refsJson].every((r) => refsTexte.has(r)) && refsTexte.size === refsJson.size, '2d. JSON cohérent : 13 boîtes, mêmes repères dans le JSON et dans le texte du PDF', [...refsJson].join(' '));
const pageDe = (ref) => a2.pages.findIndex((p) => p.texte.includes(ref + ' — ')) + 1;
const p5 = j2.boxes.find((b) => b.text === 'page cinq'), p12 = j2.boxes.find((b) => b.text === 'page douze');
ok(pageDe(p5.ref) === 5 && pageDe(p12.ref) === 12 && a2.pages.every((p, i) => p.texte.includes(`Page ${i + 1} / 12`)), `2e. chaque repère est sur SA page (${p5.ref} → p. 5, ${p12.ref} → p. 12), numéro de page en pied de chaque page`);
const cible = j2.boxes.find((b) => b.text.startsWith('Citrate'));
ok(a2.pages[0].texte.includes(`${cible.ref} — Citrate synthase`), `2f. lien repère ↔ texte dans le PDF : « ${cible.ref} — Citrate synthase… »`);
await clic(await B.bouton('Copier le JSON'), { att: 800 });
ok(JSON.stringify(JSON.parse(await ev(`navigator.clipboard.readText()`))) === JSON.stringify(j2), '2g. « Copier le JSON » = annotations.json téléchargé');
fs.copyFileSync(P2, '../cap/pdf-ia-cours12.pdf');

// 3. PNG PAR PAGE
avant = await nbTel();
await clic(await B.bouton('PNG par page'), { att: 300 });
ok(await attendreTel(avant, 1, 120000), '3. « PNG par page » → un .zip');
const f3 = await recuperer(avant, 'png');
execSync(`cd "${DOSSIER}/png" && unzip -q -o "${f3[0]}"`);
const contenu = fs.readdirSync(`${DOSSIER}/png`).filter((f) => f !== f3[0]).sort();
ok(f3[0] === 'Cours-12-pages-IA-export-ia-png.zip' && contenu.length === 14 && contenu.includes('page-01.png') && contenu.includes('page-12.png') && contenu.includes('annotations.json'), '3a. zip : page-01…page-12.png + annotations.json + LISEZMOI.txt', contenu.join(', '));
await B.touche('Escape', { vk: 27 }); await dormir(400);
ok(!B.erreurs.length, 'cours de 12 pages : aucune exception JS', B.erreurs.join(' | '));
c.fermer();
console.log('POIDS12', b2.taille);
