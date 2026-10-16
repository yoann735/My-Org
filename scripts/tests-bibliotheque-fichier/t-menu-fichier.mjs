// Menu « Fichier » unique (15/10) — même liste, même ordre, mêmes places, entrées grisées avec raison,
// en-têtes identiques, raccourcis. Base LOCALE du banc (préalable : seed-menu.mjs).
import { banc } from './commun.mjs';
const b = await banc(1440, 900);
await b.c.send('Runtime.evaluate', { expression: `localStorage.setItem('medrevise.biblio.tri','manuel')` });
await b.biblio({ recharger: true });
const ORDRE = ['renommer', 'fichiers', 'miseEnPage', 'ocr', 'pdfAnnote', 'exporter', 'exportIA', 'textes', 'supprimer'];
const PAGES = {
  pdf: { titre: 'Membre supérieur — repères', gris: ['miseEnPage'], raison: 'Non disponible pour un cours PDF' },
  document: { titre: 'Conformité doc', gris: ['ocr', 'exportIA', 'exporter.png'], raison: 'Non disponible pour un document' },
  jumelle: { titre: 'Physiologie rénale (jumelle)', vue: 'Fiche', gris: ['miseEnPage'], raison: 'Non disponible pour la fiche jumelle' },
  notes: { titre: 'Membre supérieur — repères', notes: true, gris: ['miseEnPage'], raison: 'Non disponible pour un cours PDF' },
  html: { titre: 'Cours HTML seul (test)', html: true, gris: ['miseEnPage', 'ocr', 'pdfAnnote', 'exporter.md', 'exporter.png', 'exportIA', 'textes.exporter', 'textes.importer'], raison: 'Non disponible pour une fiche HTML' },
};
const ouvrirMenu = async () => { if (!(await b.ev(`!!document.querySelector('.mf-menu')`))) await b.clic(await b.pos(`document.querySelector('.mf-bouton')`, false), { att: 450 }); };
const fermerMenu = async () => { if (await b.ev(`!!document.querySelector('.mf-menu')`)) { await b.T.Escape(); await b.dormir(200); } };
const lireMenu = () => b.ev(`(()=>{const m=document.querySelector('.mf-menu');const top=m.getBoundingClientRect().top;
  return [...m.querySelectorAll('[data-entree]')].map(e=>{const r=e.getBoundingClientRect();
    const choix=[...e.querySelectorAll('[data-choix]')].map(c=>({id:c.dataset.choix,gris:c.getAttribute('aria-disabled')==='true',titre:c.title,txt:c.innerText.trim()}));
    return {id:e.dataset.entree,gris:e.getAttribute('aria-disabled')==='true'||e.classList.contains('indispo'),titre:e.title,y:Math.round(r.top-top),h:Math.round(r.height),
      label:(e.querySelector('.mf-label')||e).innerText.trim(),ic:(e.querySelector('.mf-ic svg')||{}).outerHTML?.length||0,kbd:(e.querySelector('.mf-kbd')||{}).innerText||'',choix};});})()`);
const ouvrirPage = async (nom) => {
  const P = PAGES[nom];
  await b.biblio();
  await b.ouvrir(P.titre);
  if (P.vue) { await b.ev(`(()=>{const x=[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText===${JSON.stringify(P.vue)});x&&x.click();return 1})()`); await b.dormir(1800); }
  if (P.notes) { await b.ev(`(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.innerText.trim()==='Notes');t&&t.click();return 1})()`); await b.dormir(900); }
  if (P.html) await b.dormir(1500); // (16/10) fiche HTML seule : son document principal
};
const res = {};
for (const nom of Object.keys(PAGES)) {
  await ouvrirPage(nom);
  const P = PAGES[nom];
  if (P.notes) b.ok(await b.ev(`[...document.querySelectorAll('[role=tab][aria-selected=true]')].some(x=>x.innerText.trim()==='Notes')`), 'notes : l’onglet Notes est ouvert');
  if (P.html) b.ok(await b.ev(`!!document.querySelector('.pdfr-html-frame, iframe')`), 'html : la fiche HTML (document principal) est affichée');
  const entete = await b.ev(`(()=>{const e=document.querySelector('.lecteur-entete');const f=e.querySelector('.mf-bouton');const r=f.getBoundingClientRect();const cs=getComputedStyle(f);
    const t=e.querySelector('.titre-fiche-nom, .tr-titre, h1, h2');const d=e.querySelector('.lecteur-entete-droite');
    const ordre=t&&(t.compareDocumentPosition(f)&4)&&(!d||(f.compareDocumentPosition(d)&4));
    return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),font:cs.fontSize+' '+cs.fontWeight+' '+cs.color,txt:f.innerText.trim(),ordre:!!ordre,pages:/\\d+ pages?/.test(e.innerText)||${nom === 'html'}}})()`);
  await ouvrirMenu();
  const m = await lireMenu();
  res[nom] = { entete, m };
  b.ok(JSON.stringify(m.map((x) => x.id)) === JSON.stringify(ORDRE), `${nom} : les 9 entrées, dans l’ordre fixe (+ séparateur avant Supprimer)`, m.map((x) => x.id).join(' · '));
  const gris = [];
  m.forEach((x) => { if (x.choix.length) x.choix.forEach((c) => { if (c.gris) gris.push(`${x.id}.${c.id}`); }); else if (x.gris) gris.push(x.id); });
  b.ok(JSON.stringify(gris.sort()) === JSON.stringify([...P.gris].sort()), `${nom} : entrées grisées = ${P.gris.join(', ')}`, gris.join(', '));
  const titres = [];
  m.forEach((x) => { if (x.choix.length) x.choix.forEach((c) => { if (c.gris) titres.push(c.titre); }); else if (x.gris) titres.push(x.titre); });
  b.ok(titres.length && titres.every((t) => t === P.raison), `${nom} : infobulle « ${P.raison} »`, [...new Set(titres)].join(' / '));
  b.ok(entete.txt === 'Fichier' && entete.ordre && entete.pages, `${nom} : en-tête « titre, pages, Fichier, puis les modes »`, JSON.stringify(entete));
  await b.capture(`mf-${nom}`, await b.ev(`(()=>{const e=document.querySelector('.lecteur-entete').getBoundingClientRect();const r=document.querySelector('.mf-menu').getBoundingClientRect();return {x:Math.max(0,e.x-4),y:Math.max(0,e.y-4),width:430,height:Math.round(r.bottom-e.y+14)}})()`));
  await fermerMenu();
  await b.capture(`mf-entete-${nom}`, await b.ev(`(()=>{const e=document.querySelector('.lecteur-entete').getBoundingClientRect();return {x:0,y:Math.max(0,e.y-6),width:innerWidth,height:Math.round(e.height+12)}})()`));
}
// mêmes places, mêmes libellés, mêmes icônes partout
const ref = res.pdf;
for (const nom of Object.keys(PAGES)) {
  const r = res[nom];
  b.ok(JSON.stringify(r.m.map((x) => [x.id, x.y, x.h])) === JSON.stringify(ref.m.map((x) => [x.id, x.y, x.h])), `${nom} : chaque entrée à la même position (y, hauteur) que sur un PDF`);
  b.ok(JSON.stringify(r.m.map((x) => [x.label, x.ic, x.kbd, x.choix.map((c) => c.txt)])) === JSON.stringify(ref.m.map((x) => [x.label, x.ic, x.kbd, x.choix.map((c) => c.txt)])), `${nom} : mêmes libellés, icônes et raccourcis`);
  b.ok(JSON.stringify(r.entete.x + ',' + r.entete.y + ',' + r.entete.w + ',' + r.entete.h + ',' + r.entete.font) === JSON.stringify(ref.entete.x + ',' + ref.entete.y + ',' + ref.entete.w + ',' + ref.entete.h + ',' + ref.entete.font), `${nom} : bouton Fichier au même endroit, même taille, même style`, `${r.entete.x},${r.entete.y} ${r.entete.w}×${r.entete.h}`);
}
b.ok(res.jumelle.m[1].label === 'Fichiers du cours…' && res.pdf.m[1].label === 'Fichiers du cours…', 'entrée 2 (16/10) : « Fichiers du cours… » partout (principal + fiche jumelle)');
await b.assembler(['mf-pdf', 'mf-document', 'mf-jumelle', 'mf-notes'], 'mf-4-pages', ['Cours PDF', 'Document', 'Fiche jumelle', 'Onglet Notes']);
await b.assembler(['mf-entete-pdf', 'mf-entete-document', 'mf-entete-jumelle', 'mf-entete-notes', 'mf-entete-html'], 'mf-entetes', ['Cours PDF', 'Document', 'Fiche jumelle', 'Onglet Notes', 'Fiche HTML'], true);
console.log(JSON.stringify(res.pdf.m.map((x) => `${x.id}@${x.y}`)));
b.ok(!b.erreurs.length, 'aucune erreur dans la page', b.erreurs.join(' / '));
await b.fermerLecteur();
process.exit(0);
