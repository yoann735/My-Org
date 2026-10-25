// §4 EXPORTS : choix des pages (Toutes · Page courante · Plage · Pages précises) pour le PDF annoté, PNG par page, .md,
// l'export spécial IA, la fiche jumelle, le document (impression) et son .md ; validation, aperçu, mémoire par cours.
//   node t-exports.mjs [tablette]
import { banc } from './commun.mjs';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PDFDocument } = require('../../node_modules/pdf-lib');
const tablette = process.argv[2] === 'tablette';
const b = await banc();
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const base = { ficheId: 'f-simpl', kind: 'libre', type: 'boite', fond: 'plein', gabarit: 'carte', taille1000: 16, couleur: 'jaune-franc', x: 0.1, y: 0.7, width: 0.2, height: 0.05, largeurFixe: true, createdAt: '2026-10-25T08:00:00.000Z' };
await b.preparer({ annotations: [2, 3, 4, 7, 9].map((p) => ({ ...base, id: 'be-' + p, page: p, content: doc('Boîte page ' + p) })) });
await b.ev(`localStorage.removeItem('medrevise.export.pages.f-simpl');1`);
await b.ouvrirCours({ tablette });
await b.allerPage(5); await b.dormir(800);
const courante = +(await b.ev(`(document.querySelector('.tab-page, .ptb-page, [data-page-courante]')||{}).innerText||''`)).replace(/\D.*$/, '') || null;
await b.intercepter();
const menu = async (js) => { await b.clic(await b.pos(`document.querySelector('.mf-bouton')`, false), { att: 400 }); await b.clic(await b.pos(js, false), { att: 600 }); };
const ENTREE = { pdf: `document.querySelector('.mf-doc.affiche [data-entree="pdfAnnote"]')`, png: `document.querySelector('.mf-doc.affiche [data-entree="formats"] [data-choix="png"]')`, md: `document.querySelector('.mf-doc.affiche [data-entree="formats"] [data-choix="md"]')` };
const mode = async (m) => b.clic(await b.pos(`document.querySelector('.cp-fenetre .cp-mode[data-mode="${m}"], .eia-panneau .cp-mode[data-mode="${m}"]')`, false), { att: 300 });
const champ = async (c, v) => { await b.remplir(`document.querySelector('.cp [data-champ="${c}"]')`, v); await b.dormir(250); };
const resume = () => b.ev(`(document.querySelector('.cp [data-resume]')||{}).textContent||null`);
const dernier = async (attente = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < attente) { const n = await b.ev(`window.__telecharges.length`); if (n) { await b.dormir(400); return b.ev(`(async()=>{const t=window.__telecharges.splice(0);const bl=window.__dernierBlob;const buf=new Uint8Array(await bl.arrayBuffer());let s='';for(let i=0;i<buf.length;i+=0x8000)s+=String.fromCharCode.apply(null,buf.subarray(i,i+0x8000));return {t,b64:btoa(s)}})()`); } await b.dormir(300); } return null; };
const pagesPdf = async (b64) => (await PDFDocument.load(Buffer.from(b64, 'base64'))).getPageCount();
const ouvrirEtChoisir = async (type, choix) => {
  await menu(ENTREE[type]);
  if (!(await b.ev(`!!document.querySelector('.cp-fenetre')`))) return false;
  await mode(choix.mode);
  if (choix.mode === 'plage') { await champ('de', choix.de); await champ('a', choix.a); }
  if (choix.mode === 'precises') await champ('liste', choix.liste);
  return true;
};
const exporter = async () => { await b.clic(await b.pos(`document.querySelector('.cp-fenetre [data-action="exporter"]')`, false), { att: 500 }); return dernier(); };
// 1. la fenêtre : 4 modes, validation, aperçu du nombre de pages
await ouvrirEtChoisir('pdf', { mode: 'precises', liste: '2-4, 7' });
await b.capRect('bt-export-plage', `document.querySelector('.cp-fenetre')`, 8);
b.ok((await resume()) === '4 pages : 2-4, 7', 'Pages précises « 2-4, 7 » : aperçu « 4 pages : 2-4, 7 »', await resume());
await champ('liste', '2-40');
b.ok(/n’existe pas/.test(await resume()) && (await b.ev(`document.querySelector('.cp-fenetre [data-action="exporter"]').disabled`)), 'validation : page inexistante → message, Exporter désactivé', await resume());
await champ('liste', '4-2');
b.ok(/envers/.test(await resume()), 'validation : plage à l’envers', await resume());
await champ('liste', '2-4, 7');
let r = await exporter();
b.ok(r && (await pagesPdf(r.b64)) === 4 && /-annote-p2-4_7\.pdf$/.test(r.t[0].nom), 'PDF annoté, « 2-4, 7 » : 4 pages, nom de fichier explicite', r && JSON.stringify(r.t));
// le texte de la page 7 exportée est bien celui de la diapo 7
const txt = await b.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const P=await import(u.find(n=>n.includes('/pdf/pdfjsSetup.js')));const bin=atob(${JSON.stringify(r ? r.b64 : '')});const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);const d=await P.openPdf(a);const out=[];for(let p=1;p<=d.numPages;p++){const c=await (await d.getPage(p)).getTextContent();out.push((c.items.map(i=>i.str).join(' ').match(/Diapositive (\\d+)/)||[])[1])}return out.join(',')})()`);
b.ok(txt === '2,3,4,7', 'les pages exportées sont les diapos 2, 3, 4 et 7 (dans l’ordre)', txt);
// mémoire par cours : la fenêtre se rouvre sur le dernier choix
await menu(ENTREE.pdf);
b.ok((await b.ev(`document.querySelector('.cp-fenetre .cp-mode.actif').dataset.mode`)) === 'precises' && (await resume()) === '4 pages : 2-4, 7', 'dernier choix mémorisé (même cours)', await resume());
await mode('courante');
const pc = await resume();
r = await exporter();
b.ok(r && (await pagesPdf(r.b64)) === 1 && /1 page : \d+/.test(pc), 'PDF annoté, page courante : 1 page', pc);
await ouvrirEtChoisir('pdf', { mode: 'toutes' });
r = await exporter();
b.ok(r && (await pagesPdf(r.b64)) === 26 && /-annote\.pdf$/.test(r.t[0].nom), 'PDF annoté, toutes : 26 pages', r && r.t[0].nom);
await ouvrirEtChoisir('pdf', { mode: 'plage', de: '3', a: '6' });
r = await exporter();
b.ok(r && (await pagesPdf(r.b64)) === 4, 'PDF annoté, plage de 3 à 6 : 4 pages');
// 2. PNG par page
const nPng = (b64) => (Buffer.from(b64, 'base64').toString('latin1').match(/page-\d+\.png/g) || []).filter((v, i, a) => a.indexOf(v) === i).length;
await ouvrirEtChoisir('png', { mode: 'precises', liste: '2-4, 7' });
r = await exporter();
b.ok(r && nPng(r.b64) === 4 && /p2-4_7/.test(r.t[0].nom), 'PNG par page, « 2-4, 7 » : 4 PNG dans le .zip', r && r.t[0].nom + ' ' + nPng(r.b64));
await ouvrirEtChoisir('png', { mode: 'courante' }); r = await exporter();
b.ok(r && nPng(r.b64) === 1, 'PNG par page, page courante : 1 PNG');
await ouvrirEtChoisir('png', { mode: 'toutes' }); r = await exporter(40000);
b.ok(r && nPng(r.b64) === 26, 'PNG par page, toutes : 26 PNG', r && String(nPng(r.b64)));
// 3. .md
const mdDiapos = (b64) => [...Buffer.from(b64, 'base64').toString('utf8').matchAll(/Diapositive (\d+) \/ 26/g)].map((m) => m[1]).join(',');
await ouvrirEtChoisir('md', { mode: 'precises', liste: '2-4, 7' }); r = await exporter();
b.ok(r && mdDiapos(r.b64) === '2,3,4,7', '.md, « 2-4, 7 » : le texte des diapos 2, 3, 4, 7 seulement', r && mdDiapos(r.b64));
await ouvrirEtChoisir('md', { mode: 'courante' }); r = await exporter();
b.ok(r && mdDiapos(r.b64).split(',').length === 1, '.md, page courante', r && mdDiapos(r.b64));
await ouvrirEtChoisir('md', { mode: 'toutes' }); r = await exporter();
b.ok(r && mdDiapos(r.b64).split(',').length === 26, '.md, toutes : 26 diapos');
// 4. export spécial IA
await menu(`document.querySelector('.mf-doc.affiche [data-entree="exportIA"]')`);
b.ok(await b.ev(`!!document.querySelector('.eia-panneau .cp')`), 'export spécial IA : le même choix des pages');
await mode('precises'); await champ('liste', '2-4, 7');
const nBoites = await b.ev(`document.querySelector('.eia-panneau .ta-aide').textContent.match(/^(\\d+)/)[1]`);
b.ok(nBoites === '4', 'IA « 2-4, 7 » : 4 boîtes comptées (une par page 2, 3, 4, 7)', nBoites);
await b.clic(await b.pos(`[...document.querySelectorAll('.eia-panneau .btn.primary')].find(x=>/Télécharger/.test(x.textContent))`, false), { att: 500 });
const t0 = Date.now(); let fichiers = [];
while (Date.now() - t0 < 40000 && fichiers.length < 3) { await b.dormir(800); fichiers = fichiers.concat(await b.ev(`window.__telecharges.splice(0)`)); }
const pdfIA = fichiers.find((f) => /\.pdf$/.test(f.nom));
b.ok(pdfIA && /p2-4_7/.test(pdfIA.nom) && fichiers.some((f) => f.nom === 'annotations.json'), 'IA : PDF + JSON des pages 2-4, 7', JSON.stringify(fichiers.map((f) => f.nom)));
await mode('courante');
b.ok(await b.ev(`[...document.querySelectorAll('.eia-panneau button')].some(x=>/Copier l’image/.test(x.textContent))`), 'IA, page courante : « Copier l’image » proposé');
await mode('toutes');
b.ok((await b.ev(`document.querySelector('.eia-panneau .ta-aide').textContent.match(/^(\\d+)/)[1]`)) === '5', 'IA, toutes : 5 boîtes');
await b.T.Escape(); await b.dormir(400);
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
