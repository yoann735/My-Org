// Export IA en PDF (11/10) — suite. Prérequis : t-export-ia-pdf.mjs (dossier ../cap/pdf-ia), seed-ia26.mjs.
// 4. « Cours 26 pages IA » : progression page par page, interface fluide (plus long blocage mesuré), Annuler (aucun
//    fichier), puis export complet (poids) ; 5. le PDF exporté s'ouvre dans le PdfReader de l'app (cours de test) ;
// 6. réimport d'un JSON modifié → seule la boîte visée change ; 7. « Exporter en PDF annoté » inchangé (sans repères).
import { banc } from './commun-doc.mjs';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
const B = await banc();
const { c, ev, ok, clic, dormir } = B;
const DOSSIER = '../cap/pdf-ia';
const RACINE = fileURLToPath(new URL('.', import.meta.url));
const ouvrirCours = (titre, recharger = false) => execSync(`node "${RACINE}ouvrir-cours.mjs" "${titre}"${recharger ? ' --recharger' : ''}`, { env: process.env }).toString().trim();
const intercepter = () => ev(`(()=>{window.__telecharges=window.__telecharges||[];if(window.__intercepte)return 1;window.__intercepte=1;const o=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__telecharges.push({nom:this.download,href:this.href});return}return o.call(this)};return 1})()`);
const nbTel = () => ev(`window.__telecharges.length`);
const recuperer = async (depuis, sous) => {
  const liste = await ev(`(async()=>{const out=[];for(const t of window.__telecharges.slice(${depuis})){const b=await (await fetch(t.href)).blob();const r=new FileReader();out.push(await new Promise(ok=>{r.onload=()=>ok({nom:t.nom,b64:r.result.split(',')[1]});r.readAsDataURL(b)}))}return out})()`);
  const d = `${DOSSIER}/${sous}`; fs.mkdirSync(d, { recursive: true });
  for (const f of liste) fs.writeFileSync(`${d}/${f.nom}`, Buffer.from(f.b64, 'base64'));
  return liste.map((f) => f.nom);
};
const ouvrirPanneau = async () => {
  await clic(await B.pos(`document.querySelector('.mf-bouton')`, false), { att: 400 });
  await clic(await B.pos(`[...document.querySelectorAll('.mf-item')].find(b=>b.innerText.startsWith('Export spécial IA'))`, false), { att: 600 });
};
const sonde = () => ev(`(()=>{window.__gaps=[];let t=performance.now();clearInterval(window.__iv);window.__iv=setInterval(()=>{const n=performance.now();window.__gaps.push(n-t);t=n},50);return 1})()`);
const blocage = () => ev(`(()=>{clearInterval(window.__iv);const g=window.__gaps||[];return {max:Math.round(Math.max(0,...g)),n:g.length,lents:g.filter(x=>x>250).length}})()`);

// 4. COURS DE 26 PAGES
console.log(ouvrirCours('Cours 26 pages IA'));
await intercepter();
await ouvrirPanneau();
await clic(await B.pos(`[...document.querySelectorAll('.eia-panneau .mep-pre')].find(b=>b.innerText.startsWith('Cours'))`, false), { att: 300 });
// 4a. Annuler en cours de route
let avant = await nbTel();
await clic(await B.bouton('Télécharger (PDF + JSON)'), { att: 50 });
let etat = '';
for (let i = 0; i < 300; i++) { etat = await ev(`(document.querySelector('.eia-progres')||{}).innerText||''`); const m = /Pages du PDF : (\d+) \/ 26/.exec(etat); if (m && +m[1] >= 4) break; await dormir(50); }
await B.capture('pdf-ia-progression');
const t0 = Date.now();
await clic(await B.pos(`[...document.querySelectorAll('.eia-progres button')].find(b=>b.innerText.trim()==='Annuler')`, false), { att: 50 });
let msgA = '';
for (let i = 0; i < 100 && !/annulé/.test(msgA); i++) { msgA = await ev(`(document.querySelector('.eia-panneau .ta-message')||{}).innerText||''`); await dormir(50); }
const delai = Date.now() - t0;
await dormir(1500);
ok(/Pages du PDF : \d+ \/ 26/.test(etat) && /Export annulé : aucun fichier/.test(msgA) && (await nbTel()) === avant && !(await ev(`!!document.querySelector('.eia-progres')`)), `4a. 26 pages : progression « ${etat.split('\n')[0]} », « Annuler » → arrêt en ${delai} ms, aucun fichier`, msgA);
// 4b. export complet, interface fluide pendant la génération
await sonde();
avant = await nbTel();
const debut = Date.now();
await clic(await B.bouton('Télécharger (PDF + JSON)'), { att: 50 });
// pendant la génération : le lecteur défile toujours
await dormir(1500);
const defile = await ev(`(()=>{const s=document.querySelector('.pdfr-scroll');const a=s.scrollTop;s.scrollTop=a+400;return s.scrollTop!==a})()`);
for (let i = 0; i < 1200 && (await nbTel()) < avant + 3; i++) await dormir(100);
const duree = Date.now() - debut;
const bl = await blocage();
const f4 = await recuperer(avant, 'cours26');
const taille26 = fs.statSync(`${DOSSIER}/cours26/${f4[0]}`).size;
const msg4 = await ev(`(document.querySelector('.eia-panneau .ta-message')||{}).innerText||''`);
ok(f4[0] === 'Cours-26-pages-IA-export-ia.pdf' && f4.length === 3, '4b. export complet : Cours-26-pages-IA-export-ia.pdf + annotations.json + LISEZMOI.txt', f4.join(', '));
ok(taille26 / 26 < 1024 * 1024 && taille26 < 40 * 1024 * 1024 && /26 pages/.test(msg4), `4c. 26 pages en ${(duree / 1000).toFixed(1)} s, ${(taille26 / 1024 / 1024).toFixed(2)} Mo (≈ ${Math.round(taille26 / 26 / 1024)} Ko par page)`, msg4);
ok(defile && bl.max < 1000, `4d. interface fluide pendant la génération : le lecteur défile ; plus long blocage du fil principal ${bl.max} ms (${bl.lents} pauses > 250 ms sur ${bl.n} mesures de 50 ms)`);
await B.touche('Escape', { vk: 27 }); await dormir(300);

// 5. le PDF exporté s'ouvre dans le PdfReader de l'app (cours de TEST « Retour export IA »)
const b64 = fs.readFileSync('../cap/pdf-ia-cours12.pdf').toString('base64');
await B.S(`const bin=atob(${JSON.stringify(b64)});const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
  const pdfId=await S.putBlob(new Blob([a],{type:'application/pdf'}));await S.put('fiches',{id:'ia-retour',matiereId:'mat-ia',dossierId:null,titre:'Retour export IA',type:'standard',pdfId,dateImport:'2026-10-11'});return 1`);
console.log(ouvrirCours('Retour export IA', true)); // nouveau cours : la Bibliothèque le voit après rechargement
await dormir(2500);
// (le lecteur ne monte que les pages visibles : le nombre de pages se lit dans sa barre, « 1 / 12 »)
const lecteur = await ev(`(()=>{const b=(document.querySelector('.pdfr-barre')||{}).innerText||'';return {barre:(/\\d+ \\/ \\d+/.exec(b)||[''])[0],canvas:document.querySelectorAll('.pdfr-page canvas').length,erreur:/erreur|impossible/i.test((document.querySelector('.pdfr-scroll')||{}).innerText||'')}})()`);
ok(lecteur.barre === '1 / 12' && lecteur.canvas > 0 && !lecteur.erreur, '5. le PDF de l’export s’ouvre dans le PdfReader de l’app : « 1 / 12 », pages rendues, aucune erreur', JSON.stringify(lecteur));
await B.capture('pdf-ia-dans-pdfreader');

// 6. RÉIMPORT d'un JSON modifié (cours de 12 pages) : seule la boîte visée change
console.log(ouvrirCours('Cours 12 pages IA'));
await intercepter(); // page rechargée à l'étape 5
const j = JSON.parse(fs.readFileSync(`${DOSSIER}/cours/annotations.json`, 'utf8'));
const cible = j.boxes.find((b) => b.text.startsWith('jumelle un'));
const retour = { ...j, boxes: j.boxes.map((b) => (b.id === cible.id ? { ...b, text: 'Jumelle un : corrigée par l’IA.' } : b)) };
const avantRecs = await B.S(`return (await S.getAll('annotations')).filter(a=>a.ficheId==='ia-12').sort((a,b)=>a.id.localeCompare(b.id))`);
await clic(await B.pos(`document.querySelector('.mf-bouton')`, false), { att: 400 });
await clic(await B.pos(`[...document.querySelectorAll('.mf-item')].find(b=>b.innerText.trim().startsWith('Importer des textes'))`, false), { att: 500 });
await ev(`(()=>{const t=document.querySelector('.ta-colle');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,${JSON.stringify(JSON.stringify(retour))});t.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
await dormir(200);
await clic(await B.bouton('Importer le collage'), { att: 900 });
const msgI = await ev(`(document.querySelector('.ta-message')||{}).innerText||''`);
await B.touche('Escape', { vk: 27 }); await dormir(400);
const apresRecs = await B.S(`return (await S.getAll('annotations')).filter(a=>a.ficheId==='ia-12').sort((a,b)=>a.id.localeCompare(b.id))`);
const changes = apresRecs.filter((a) => JSON.stringify(a) !== JSON.stringify(avantRecs.find((x) => x.id === a.id)));
ok(changes.length === 1 && changes[0].id === cible.id && changes[0].textAlt === 'Jumelle un : corrigée par l’IA.', `6. réimport du JSON de l’export (13 boîtes, 1 texte modifié) : seule la boîte ${cible.ref} change`, msgI.replace(/\n/g, ' '));
// remise à l'état d'avant (cours de TEST) : la boîte reprend son enregistrement d'origine
await B.S(`await S.put('annotations', ${JSON.stringify(avantRecs.find((x) => x.id === cible.id))});return 1`);

// 7. « Exporter en PDF annoté » : inchangé, sans repères ni couche cachée
await ev(`(()=>{window.__telecharges=window.__telecharges||[];return 1})()`);
avant = await nbTel();
await clic(await B.pos(`document.querySelector('.mf-bouton')`, false), { att: 400 });
await clic(await B.pos(`[...document.querySelectorAll('.mf-item')].find(b=>b.innerText.trim().startsWith('Exporter en PDF annoté'))`, false), { att: 400 });
for (let i = 0; i < 200 && (await nbTel()) === avant; i++) await dormir(150);
const f7 = await recuperer(avant, 'annote');
const s7 = fs.readFileSync(`${DOSSIER}/annote/${f7[0]}`).toString('latin1');
ok(f7.length === 1 && /\.pdf$/.test(f7[0]) && !/export-ia/.test(f7[0]) && !/DCTDecode/.test(s7) && !/ 3 Tr/.test(s7), '7. « Exporter en PDF annoté » : un PDF vectoriel comme avant (pas d’image de page, pas de texte invisible)', f7[0]);
ok(!B.erreurs.length, 'aucune exception JS', B.erreurs.join(' | '));
c.fermer();
