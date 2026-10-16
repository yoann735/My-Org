// Captures du menu Fichier sur les 4 pages (PDF, document, fiche jumelle, onglet Notes) — préfixe en argument
import { banc } from './commun.mjs';
const pre = process.argv[2] || 'mf';
const b = await banc(1440, 900);
const ouvrirMenu = async () => { await b.clic(await b.pos(`document.querySelector('.mf-bouton')`, false), { att: 500 }); };
const fermerMenu = async () => { await b.T.Escape(); await b.dormir(200); };
const zone = async () => { const r = await b.rect(`document.querySelector('.mf-menu')`); const e = await b.rect(`document.querySelector('.lecteur-entete')`); return { x: e.x, y: e.y, width: Math.max(560, (r ? r.r : 0) - e.x + 20), height: Math.max(e.h, (r ? r.b : 0) - e.y + 12) }; };
const vue = (v) => b.ev(`(()=>{const x=[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText===${JSON.stringify(v)});x&&x.click();return !!x})()`);
const pages = [
  ['pdf', 'Membre supérieur — repères', null],
  ['document', 'Conformité doc', null],
  ['jumelle', 'Physiologie rénale (jumelle)', 'Fiche'],
  ['notes', 'Physiologie rénale (jumelle)', 'Original'],
];
const sortie = {};
for (const [nom, titre, v] of pages) {
  await b.biblio();
  await b.ouvrir(titre, { recharger: nom === 'pdf' });
  if (v) { await vue(v); await b.dormir(1500); }
  if (nom === 'notes') { await b.ev(`(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.innerText.trim()==='Notes');t&&t.click();return 1})()`); await b.dormir(800); }
  await ouvrirMenu();
  sortie[nom] = await b.ev(`[...document.querySelectorAll('.mf-menu .mf-item')].map(x=>(x.disabled||x.getAttribute('aria-disabled')==='true'?'(grisé) ':'')+x.innerText.replace(/\\n/g,' ').trim())`);
  sortie[nom + ':entete'] = await b.ev(`[...document.querySelector('.lecteur-entete').querySelectorAll('.titre-renommable, .tr-titre, .mf-bouton, .seg, button')].filter(e=>e.offsetParent).map(e=>e.className.split(' ')[0]+':'+(e.innerText||e.title||'').replace(/\\n/g,' ').trim().slice(0,30))`);
  await b.capture(`${pre}-${nom}`, await zone());
  await fermerMenu();
}
console.log(JSON.stringify(sortie, null, 1));
await b.fermerLecteur();
process.exit(0);
