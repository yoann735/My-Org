// TAILLE DU TEXTE (bug du 20/11) : taille demandée = taille rendue, au px près dans la référence 1000 px, et
// persistante après rechargement — document vierge, diapo (16:9), PDF classique (A4).
// node t-police.mjs ordi|tablette   (BASE=http://localhost:5321 : le code d'avant, pour les captures « avant »)
import { appareil, semer, pdfTest, dormir, AVANT } from './commun.mjs';

const type = process.argv[2] || 'ordi';
const b = await appareil(type);
const chiffres = {};
const T = (t, marks) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t, ...(marks ? { marks } : {}) }] }] });
const enDur = (px) => [{ type: 'textStyle', attrs: { fontSize: px, color: null, fontFamily: 'sans-serif' } }];
const c = '2026-11-20T08:00:00.000Z';
const objet = (id, ficheId, page, extra) => ({ id, ficheId, page, createdAt: c, x: 0.1, y: 0.3, width: 0.32, height: 0.08, ...extra });
const egal = (a, v) => a != null && Math.abs(a - v) <= 0.05;

await b.neuf();
await semer(b, [
  { id: 'pr-doc', matiereId: 'pr-mat', dossierId: null, titre: 'Doc vierge test', sousTitre: 'Document', type: 'standard', docNotes: true, dateImport: '2026-11-20' },
  { id: 'pr-dia', matiereId: 'pr-mat', dossierId: null, titre: 'Diapo test', type: 'standard', pdf64: await pdfTest(3), pdfName: 'diapo.pdf', dateImport: '2026-11-20' },
  { id: 'pr-a4', matiereId: 'pr-mat', dossierId: null, titre: 'PDF classique test', type: 'standard', pdf64: await pdfTest(2, { diapo: false, titre: 'Page' }), pdfName: 'cours-a4.pdf', dateImport: '2026-11-20' },
], [
  // diapo : boîte au texte collé (taille en dur, comme un copier depuis la couche texte), texte libre, post-it
  objet('bx-colle', 'pr-dia', 1, { kind: 'libre', type: 'boite', fond: 'plein', gabarit: 'carte', couleur: 'bleu-franc', taille1000: 18, tailleTexte: 1.8, bord1000: 1.5, pad1000: [10, 8], largeurFixe: true, content: T('Le nephron est l’unité du rein', enDur('23.4px')) }),
  objet('tx-libre', 'pr-dia', 1, { kind: 'texte', type: 'texte', couleur: 'noir', y: 0.55, gabarit: 'carte', taille1000: 15, tailleTexte: 1.5, content: T('Texte libre') }),
  objet('pi-1', 'pr-dia', 1, { kind: 'libre', type: 'boite', postit: true, fond: 'plein', largeurFixe: true, couleur: 'jaune-franc', x: 0.36, y: 0.08, width: 0.12, height: 0.15, taille1000: 18, tailleTexte: 1.8, content: T('Post-it') }),
  // PDF classique A4 : une boîte
  objet('bx-a4', 'pr-a4', 1, { kind: 'libre', type: 'boite', fond: 'plein', gabarit: 'carte', couleur: 'vert-franc', taille1000: 18, tailleTexte: 1.8, bord1000: 1.5, pad1000: [10, 8], largeurFixe: true, content: T('Glomérule et tubule') }),
]);
await b.ouvrir();
const corps = (id) => `[...document.querySelectorAll('[data-boite="${id}"] .nb-body *')].filter((x) => x.firstChild && x.firstChild.nodeType === 3).pop()`;
const flux = `[...document.querySelectorAll('.ProseMirror.pt-flux p *, .ProseMirror.pt-flux p')].filter((x) => x.firstChild && x.firstChild.nodeType === 3).pop()`;

/* 1. DOCUMENT VIERGE : texte sélectionné, plusieurs tailles */
b.ok(await b.ouvrirCours('Doc vierge test'), 'document vierge ouvert');
b.ok(await b.attendre(`!!document.querySelector('.ProseMirror.pt-flux')`, 20000), 'page d’écriture affichée');
await dormir(1500);
await b.clicFixe(`document.querySelector('.ProseMirror.pt-flux')`, 400);
await b.taper('Le rein filtre le sang');
chiffres.docDefaut = await b.px1000(flux);
await b.touche('a', { code: 'KeyA', vk: 65, mod: 4 }); await dormir(500);
const tailleDoc = async (v) => {
  if (AVANT) { // l'ancienne liste (« … » › Taille du texte) : valeurs en px de la page de MISE EN PAGE
    if (!(await b.ev(`!!document.querySelector('select[aria-label="Taille du texte"]')`))) await b.clicFixe(`[...document.querySelectorAll('.barre-texte-doc button')].find((x) => /Plus/.test(x.title || ''))`, 500);
    await b.ev(`(() => { const s = document.querySelector('select[aria-label="Taille du texte"]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, '${v}px'); s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await dormir(500); return;
  }
  await b.ouvrirTaille(`document.querySelector('.barre-texte-doc .ct-bouton')`);
  await b.saisirTaille(v);
};
for (const v of [14, 24, 32]) {
  await tailleDoc(v);
  const r = await b.px1000(flux);
  chiffres['doc' + v] = r;
  b.ok(egal(r, v), `document : ${v} px demandés → ${r} px rendus (référence 1000 px)`);
  if (v === 24) await b.capture('police-doc-24');
}
b.ok(AVANT || (await b.ev(`(document.querySelector('.barre-texte-doc .ct-bouton') || {}).ariaLabel`) || '').includes('32 px'), 'le sélecteur affiche la taille du texte sélectionné (32 px)');
await dormir(1200);

/* 2. DIAPO : boîte au texte collé, texte libre, post-it */
const tailleObjet = async (id, v) => {
await b.clicFixe(`[...document.querySelectorAll('[data-outil="main"]')].find((e) => e.offsetParent)`, 300);
await b.clicFixe(`document.querySelector('[data-boite="${id}"]')`, 700);
  if (!(await b.ouvrirTaille(`[...document.querySelectorAll('.mini-barre .ct-bouton')].find((e) => e.offsetParent)`))) console.log('mini barre', await b.ev(`[...document.querySelectorAll('.mini-barre')].map((m) => m.className + ':' + [...m.querySelectorAll('[data-option]')].map((x) => x.dataset.option).join(',')).join(' / ')`));
  await b.saisirTaille(v);
  await b.touche('Escape', { code: 'Escape', vk: 27 }); await dormir(300);
  await b.touche('Escape', { code: 'Escape', vk: 27 }); await dormir(400);
};
b.ok(await b.ouvrirCours('Diapo test'), 'diapo ouverte');
b.ok(await b.attendre(`!!document.querySelector('[data-boite="bx-colle"] .nb-body')`, 20000), 'boîtes du diapo affichées');
await dormir(1200);
const casDiapo = [['bx-colle', 24, 'boîte au texte collé (taille en dur 23,4 px)'], ['tx-libre', 32, 'texte libre'], ['pi-1', 20, 'post-it']];
for (const [id, v, nom] of casDiapo) {
  await tailleObjet(id, v);
  const r = await b.px1000(corps(id));
  chiffres[id] = r;
  b.ok(egal(r, v), `diapo — ${nom} : ${v} px demandés → ${r} px rendus`);
}
await b.capture('police-diapo');
// sélection dans une boîte en écriture : la taille ne vaut que pour la sélection
await b.ev(`(() => { const e = document.querySelector('[data-boite="pi-1"]'); e.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return 1; })()`);
await dormir(800);
const enEdition = await b.ev(`!!document.querySelector('[data-boite="pi-1"] .ProseMirror')`);
if (enEdition) {
  await b.touche('a', { code: 'KeyA', vk: 65, mod: 4 });
  await b.ouvrirTaille(`[...document.querySelectorAll('.mini-barre .ct-bouton')].find((e) => e.offsetParent)`);
  await b.saisirTaille(28);
  const r = await b.px1000(`document.querySelector('[data-boite="pi-1"] .ProseMirror span') || document.querySelector('[data-boite="pi-1"] .ProseMirror p')`);
  chiffres.selection28 = r;
  b.ok(egal(r, 28), `boîte en écriture, texte sélectionné : 28 px demandés → ${r} px rendus`);
  await b.touche('Escape', { code: 'Escape', vk: 27 }); await dormir(400); await b.touche('Escape', { code: 'Escape', vk: 27 }); await dormir(600);
} else b.ok(false, 'double-clic : la boîte passe en écriture');

/* 3. PDF CLASSIQUE (A4) */
b.ok(await b.ouvrirCours('PDF classique test'), 'PDF classique ouvert');
b.ok(await b.attendre(`!!document.querySelector('[data-boite="bx-a4"] .nb-body')`, 20000), 'boîte du PDF affichée');
await dormir(1000);
await tailleObjet('bx-a4', 28);
chiffres.a4 = await b.px1000(corps('bx-a4'));
b.ok(egal(chiffres.a4, 28), `PDF classique — boîte : 28 px demandés → ${chiffres.a4} px rendus`);
await dormir(1500);

/* 4. PERSISTANCE : rechargement complet, puis relecture */
await b.ouvrir();
b.ok(await b.ouvrirCours('Diapo test') && await b.attendre(`!!document.querySelector('[data-boite="bx-colle"] .nb-body')`, 20000), 'diapo rouverte après rechargement');
await dormir(1200);
for (const [id, v] of [['bx-colle', 24], ['tx-libre', 32]]) { const r = await b.px1000(corps(id)); b.ok(egal(r, v), `après rechargement — ${id} : ${r} px (attendu ${v})`); }
const pi = await b.px1000(`document.querySelector('[data-boite="pi-1"] .nb-body span') || document.querySelector('[data-boite="pi-1"] .nb-body p')`);
b.ok(!enEdition || egal(pi, 28), `après rechargement — post-it (texte sélectionné à 28 px) : ${pi} px`);
b.ok(await b.ouvrirCours('Doc vierge test') && await b.attendre(`!!document.querySelector('.ProseMirror.pt-flux p')`, 20000), 'document rouvert après rechargement');
await dormir(1500);
const rd = await b.px1000(flux);
b.ok(egal(rd, 32), `après rechargement — document : ${rd} px (attendu 32)`);
b.ok(await b.ouvrirCours('PDF classique test') && await b.attendre(`!!document.querySelector('[data-boite="bx-a4"] .nb-body')`, 20000), 'PDF classique rouvert');
await dormir(800);
const ra = await b.px1000(corps('bx-a4'));
b.ok(egal(ra, 28), `après rechargement — PDF classique : ${ra} px (attendu 28)`);
console.log('CHIFFRES', JSON.stringify(chiffres));
const echecs = b.fin();
b.fermerWs(); process.exit(echecs ? 1 : 0);
