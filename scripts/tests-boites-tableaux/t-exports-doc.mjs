// §4 EXPORTS (suite) : fiche jumelle (PDF annoté de la fiche) et document créé dans l'app (impression + .md), avec
// « 2-4, 7 », page courante et toutes.   node t-exports-doc.mjs [tablette]
import { banc } from './commun.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PDFDocument } = require('../../node_modules/pdf-lib');
const tablette = process.argv[2] === 'tablette';
const b = await banc();
const FX = process.env.FX;
const menu = async (js) => { await b.clic(await b.pos(`document.querySelector('.mf-bouton')`, false), { att: 400 }); await b.clic(await b.pos(js, false), { att: 700 }); };
const mode = async (m) => b.clic(await b.pos(`document.querySelector('.cp-fenetre .cp-mode[data-mode="${m}"]')`, false), { att: 300 });
const champ = async (c, v) => { await b.remplir(`document.querySelector('.cp [data-champ="${c}"]')`, v); await b.dormir(250); };
const dernier = async (attente = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < attente) { if (await b.ev(`window.__telecharges.length`)) { await b.dormir(400); return b.ev(`(async()=>{const t=window.__telecharges.splice(0);const bl=window.__dernierBlob;const buf=new Uint8Array(await bl.arrayBuffer());let s='';for(let i=0;i<buf.length;i+=0x8000)s+=String.fromCharCode.apply(null,buf.subarray(i,i+0x8000));return {t,b64:btoa(s)}})()`); } await b.dormir(300); } return null; };
const exporter = async () => { await b.clic(await b.pos(`document.querySelector('.cp-fenetre [data-action="exporter"]')`, false), { att: 500 }); };
const choisir = async (entree, c) => { await menu(entree); await mode(c.mode); if (c.mode === 'precises') await champ('liste', c.liste); };
// ---- A. FICHE JUMELLE ----
await b.preparer({ annotations: [] });
await b.S(`for(const r of await S.getAll('companion_pdf'))if(r.courseId==='f-simpl')await S.remove('companion_pdf',r.id);return 1`);
await b.ouvrirCours({ tablette });
const pris = b.choisirFichier(FX + '/fiche.pdf');
await menu(`document.querySelector('.mf-section[data-section=fiche] [data-entree=importer]:not([aria-disabled])')`);
await pris; await b.dormir(3000);
await b.clic(await b.pos(`[...document.querySelectorAll('.fj-resume button')].find(x=>x.innerText.includes('Voir la fiche'))`, false), { att: 2000 });
b.ok(await b.ev(`document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')?.innerText`) === 'Fiche', 'fiche jumelle importée et affichée');
await b.intercepter();
const pagesPdf = async (r) => (await PDFDocument.load(Buffer.from(r.b64, 'base64'))).getPageCount();
for (const [c, n, lib] of [[{ mode: 'precises', liste: '2-4, 7' }, 4, '« 2-4, 7 »'], [{ mode: 'courante' }, 1, 'page courante'], [{ mode: 'toutes' }, 30, 'toutes']]) {
  await choisir(`document.querySelector('.mf-doc.affiche [data-entree="pdfAnnote"]')`, c);
  const titre = await b.ev(`document.querySelector('.cp-fenetre .mep-titre').textContent`);
  await exporter();
  const r = await dernier();
  b.ok(r && (await pagesPdf(r)) === n && /-fiche-annote/.test(r.t[0].nom) && /fiche/.test(titre), `fiche jumelle, PDF annoté, ${lib} : ${n} page${n > 1 ? 's' : ''}`, r && r.t[0].nom + ' · ' + titre);
}
await b.S(`for(const r of await S.getAll('companion_pdf'))if(r.courseId==='f-simpl')await S.remove('companion_pdf',r.id);return 1`);
// ---- B. DOCUMENT créé dans l'app (plusieurs pages) ----
const TITRE = 'Doc export (test)';
const P = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
const flux = { type: 'doc', content: Array.from({ length: 140 }, (_, i) => P(`Paragraphe ${i + 1} — le néphron filtre le plasma, réabsorbe l’eau et les solutés, puis concentre l’urine.`)) };
const id = await b.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const im=(p)=>import(u.find(n=>n.includes(p))||('/src/medrevise/'+p));
  const S=await im('lib/storage.js');const D=await im('documents/lib/documents.js');const N=await im('documents/lib/notesDoc.js');
  for(const f of await S.getAll('fiches')) if(f.titre===${JSON.stringify(TITRE)}){ for(const r of await S.getAll('reading_position')) if(String(r.id).startsWith('rp:'+f.id)) await S.remove('reading_position',r.id); await S.remove('notes_doc',f.id); await S.remove('fiches',f.id); }
  await S.put('sources',{id:'src-so',nom:'Source outils',couleur:'#7c5cff'});await S.put('matieres',{id:'mat-so',nom:'Outils test',sourceId:'src-so'});
  const f=await D.createDocumentNotes({matiereId:'mat-so',titre:${JSON.stringify(TITRE)}});
  await N.majNotesDoc(f.id,{flux:${JSON.stringify(flux)},fluxMaj:Date.now(),fluxAppareil:'banc'});return f.id})()`);
await b.ev(`localStorage.setItem('medrevise.disposition.${id}','pdf');1`);
await b.biblio({ recharger: true });
await b.ouvrir(TITRE); await b.dormir(3000);
if (tablette) { await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true }); await b.dormir(1500); }
const pagesBlocs = await b.ev(`(document.querySelector('.pt-flux-cadre .ProseMirror').pagination||{res:{pages:[]}}).res.pages`); // page (0…) de chaque paragraphe
const nPages = Math.max(...pagesBlocs) + 1;
b.ok(nPages >= 7, 'document de ' + nPages + ' pages', String(nPages));
await b.intercepter();
// impression interceptée : on compte les pages recopiées dans le conteneur d'impression
await b.ev(`window.print=()=>{const c=document.querySelector('.pdfr-impression-pages');window.__imprime={n:c?c.children.length:-1,premiers:c?[...c.children].map(p=>(p.textContent.match(/Paragraphe (\\d+)/)||[])[1]||'').join(','):''}};1`);
const premierPara = async (k) => b.ev(`(()=>{const ps=[...document.querySelectorAll('.pt-flux-cadre .ProseMirror p')];const pages=[...document.querySelectorAll('.pdfr-page[data-cle]')].map(p=>p.getBoundingClientRect());const r=pages[${k}];const p=ps.find(e=>{const q=e.getBoundingClientRect();return q.top>=r.top-1&&q.top<r.bottom});return p?(p.textContent.match(/Paragraphe (\\d+)/)||[])[1]:null})()`);
for (const [c, n, lib] of [[{ mode: 'precises', liste: '2-4, 7' }, 4, '« 2-4, 7 »'], [{ mode: 'courante' }, 1, 'page courante'], [{ mode: 'toutes' }, nPages, 'toutes']]) {
  await b.ev(`window.__imprime=null;1`);
  await choisir(`document.querySelector('.mf-doc.affiche [data-entree="pdfAnnote"]')`, c);
  await exporter(); await b.dormir(2500);
  const im = await b.ev(`window.__imprime`);
  b.ok(im && im.n === n, `document, export (impression), ${lib} : ${n} page${n > 1 ? 's' : ''}`, JSON.stringify(im));
  await b.ev(`document.querySelectorAll('.pdfr-impression-pages').forEach(e=>e.remove());document.body.classList.remove('pdfr-impression');1`); await b.dormir(800);
}
// .md du document : les paragraphes des pages choisies seulement
const attendus = pagesBlocs.map((p, i) => ([1, 2, 3, 6].includes(p) ? i + 1 : null)).filter(Boolean);
await choisir(`document.querySelector('.mf-doc.affiche [data-entree="formats"] [data-choix="md"]')`, { mode: 'precises', liste: '2-4, 7' });
await exporter();
const r = await dernier();
const md = r ? Buffer.from(r.b64, 'base64').toString('utf8') : '';
const nums = [...md.matchAll(/Paragraphe (\d+)/g)].map((m) => +m[1]);
b.ok(r && JSON.stringify(nums) === JSON.stringify(attendus) && /p2-4_7/.test(r.t[0].nom), 'document, .md « 2-4, 7 » : exactement les paragraphes des pages 2, 3, 4 et 7', JSON.stringify({ n: nums.length, de: nums[0], a: nums[nums.length - 1], attendus: attendus.length, nom: r && r.t[0].nom }));
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
