// §2 MINI BARRES : plus de grande barre de format ; la mini barre de chaque objet, complète et triée ; mise en forme
// depuis la mini barre (boîte non ouverte : tout le texte ; ouverte : la sélection) ; « … » ; verrou.  node t-mini-barres.mjs [tablette]
import { banc, FICHE } from './commun.mjs';
const tablette = process.argv[2] === 'tablette';
const b = await banc();
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const base = { ficheId: FICHE, page: 1, createdAt: '2026-10-22T08:00:00.000Z' };
const A = [
  { ...base, id: 'mb-boite', kind: 'libre', type: 'boite', x: 0.55, y: 0.6, width: 0.3, height: 0.08, couleur: 'jaune-franc', fond: 'plein', gabarit: 'carte', taille1000: 18, tailleTexte: 1.8, bord1000: 1.5, pad1000: [10, 8], content: doc('Néphron : unité fonctionnelle') },
  { ...base, id: 'mb-texte', kind: 'texte', type: 'texte', x: 0.08, y: 0.86, width: 0.3, height: 0.05, couleur: 'noir', gabarit: 'carte', taille1000: 18, tailleTexte: 1.8, content: doc('Texte libre du cours') },
  { ...base, id: 'mb-forme', kind: 'forme', type: 'forme', forme: 'rectangle', x: 0.62, y: 0.3, width: 0.2, height: 0.12, couleur: '#e5383b', epaisseur: 0.0025 },
  { ...base, id: 'mb-trait', kind: 'trait', type: 'trait', mode: 'dessin', points: [[0.62, 0.48], [0.7, 0.5], [0.8, 0.47]], couleur: 'bleu-franc', epaisseur: 0.0042 },
  { ...base, id: 'mb-bloc', type: 'bloc', x: 0.08, y: 0.74, width: 0.4, height: 0.05, originalText: 'Texte remplacé', fontSize: 0.035, fontFamily: 'sans-serif', content: doc('Texte remplacé du cours') },
];
await b.preparer({ annotations: A });
await b.ouvrirCours({ tablette });
const page = await b.rect(`document.querySelector('.pdfr-page[data-cle="1"]')`);
const capBarre = async (nom) => { const r = await b.rect(`[...document.querySelectorAll('.mini-barre')].find(e=>e.offsetParent&&getComputedStyle(e).visibility!=='hidden')`); if (r) await b.capture(nom, { x: Math.round(r.x - 6), y: Math.round(r.y - 6), width: Math.round(r.w + 12), height: Math.round(r.h + 12) }); return r; };
const selectionner = async (sel) => { await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(300); await b.clic(await b.pos(sel, false), { att: 600 }); };
const vider = async () => { await b.T.Escape(); await b.T.Escape(); await b.dormir(300); };
// plus de grande barre
b.ok(!(await b.ev(`!!document.querySelector('.pdfr-edit-toolbar, .pdfr-rangee-texte')`)), 'plus de grande barre de format (rangée texte) au-dessus de la diapo');
// BOÎTE sélectionnée
await selectionner(`document.querySelector('[data-boite="mb-boite"]')`);
const ob = (await b.optionsBarre())[0];
console.log('boîte :', JSON.stringify(ob));
const attendu = ['taille', 'couleur-texte', 'couleur', 'fond', '|', 'gras', 'italique', 'align', '|', 'image', 'fleche', 'vers-flashcard', 'vers-tableau', '…', 'supprimer'];
b.ok(JSON.stringify(ob.filter((x) => !/^sc-|^ct/.test(x))) === JSON.stringify(attendu) || JSON.stringify(ob) === JSON.stringify(attendu), 'boîte : taille · couleur du texte · fond · G · I · alignement · flèche · → Tableau · … · supprimer', JSON.stringify(ob));
await capBarre('so-mini-boite' + (tablette ? '-tablette' : ''));
await b.cliqueOption('plus');
const plus = await b.optionsPlus();
console.log('boîte « … » :', JSON.stringify(plus));
b.ok(['police', 'souligne', 'barre', 'fond-texte', 'puces', 'numeros', 'reduire', 'verrou'].every((k) => plus.some((p) => p.startsWith(k + ' :'))), '« … » : police, souligné, barré, surligneur de fond, listes, réduire, verrouiller (+ bordure pour un fond transparent / teinté)');
{ const r = await b.rect(`document.querySelector('.mb-plus-pop')`), rb = await b.rect(`[...document.querySelectorAll('.mini-barre')].find(e=>e.offsetParent)`);
  if (r) await b.capture('so-mini-boite-plus' + (tablette ? '-tablette' : ''), { x: Math.round(Math.min(r.x, rb.x) - 6), y: Math.round(Math.min(r.y, rb.y) - 6), width: Math.round(Math.max(r.r, rb.r) - Math.min(r.x, rb.x) + 12), height: Math.round(Math.max(r.b, rb.b) - Math.min(r.y, rb.y) + 12) }); }
// verrouiller depuis « … »
await b.clic(await b.pos(`document.querySelector('.mb-plus-pop [data-option="verrou"]')`, false), { att: 600 });
const v1 = (await b.enBase()).find((a) => a.id === 'mb-boite');
const avantPos = [v1.x, v1.y];
const pb = await b.pos(`document.querySelector('[data-boite="mb-boite"]')`, false);
await b.glisser(pb, [pb[0] - 120, pb[1] - 60], 10); await b.dormir(600);
const v2 = (await b.enBase()).find((a) => a.id === 'mb-boite');
b.ok(v1.verrouille === true && v2.x === avantPos[0] && v2.y === avantPos[1], 'Verrouiller : la boîte ne bouge plus au glisser', JSON.stringify({ verrouille: v1.verrouille, avant: avantPos, apres: [v2.x, v2.y] }));
b.ok(!(await b.ev(`!!document.querySelector('[data-boite="mb-boite"] .sel-coin')`)), 'boîte verrouillée : pas de poignées de redimension');
// déverrouiller
await b.cliqueOption('plus'); await b.clic(await b.pos(`document.querySelector('.mb-plus-pop [data-option="verrou"]')`, false), { att: 600 });
// MISE EN FORME sans ouvrir la boîte : G, alignement, couleur du texte
await b.cliqueOption('gras', 700);
await b.cliqueOption('align', 700);
const v3 = (await b.enBase()).find((a) => a.id === 'mb-boite');
const json3 = JSON.stringify(v3.content);
b.ok(/"bold"/.test(json3) && /"textAlign":"center"/.test(json3) && !v3.verrouille, 'boîte sélectionnée : G et alignement s’appliquent à tout son texte (une entrée d’annuler chacun)', json3.slice(0, 220));
const boldDom = await b.ev(`!!document.querySelector('[data-boite="mb-boite"] .nb-body strong')`);
b.ok(boldDom, 'le texte affiché est en gras');
// annuler (barre principale) : le centrage disparaît
await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-barre button')].find(e=>(e.title||e.getAttribute('aria-label')||'').startsWith('Annuler'))`, false), { att: 700 });
const v4 = (await b.enBase()).find((a) => a.id === 'mb-boite');
b.ok(!/"textAlign":"center"/.test(JSON.stringify(v4.content)) && /"bold"/.test(JSON.stringify(v4.content)), '⌘Z (Annuler) défait seulement le dernier réglage (alignement)', JSON.stringify(v4.content).slice(0, 200) + ' · titre annuler : ' + (await b.ev(`[...document.querySelectorAll('.pdfr-barre button')].filter(e=>/^(Annuler|Rétablir)/.test(e.title||'')).map(e=>e.title).join(' | ')`)));
// taille de la boîte (re-sélectionnée : le clic sur « Annuler » de la barre la désélectionne)
if (!(await b.ev(`!!(${b.option('taille')})`))) await selectionner(`document.querySelector('[data-boite="mb-boite"]')`);
await b.cliqueOption('taille', 500);
await b.clic(await b.pos(`document.querySelector('.ct-pop .ct-preset:last-child')`, false), { att: 600 });
const v5 = (await b.enBase()).find((a) => a.id === 'mb-boite');
b.ok(v5.taille1000 !== 18, 'taille du texte de la boîte changée depuis la mini barre', String(v5.taille1000));
// ÉDITION : sélection d'un mot puis Italique → seulement ce mot
await vider();
await selectionner(`document.querySelector('[data-boite="mb-boite"]')`);
await b.clic(await b.pos(`document.querySelector('[data-boite="mb-boite"]')`, false), { att: 900 });
b.ok(await b.attendreFocus(), 'boîte en édition (2e clic)');
await b.ev(`(()=>{const ed=document.querySelector('[data-boite="mb-boite"] .ProseMirror').editor;ed.commands.setTextSelection({from:1,to:8});return 1})()`); await b.dormir(300);
await b.cliqueOption('italique', 600);
await vider(); await b.dormir(700);
const v6 = (await b.enBase()).find((a) => a.id === 'mb-boite');
const runs = JSON.stringify(v6.content);
b.ok(/"italic"/.test(runs) && (runs.match(/"italic"/g) || []).length === 1 && /"text":"Néphron"/.test(runs), 'en édition : l’italique ne vaut que pour la sélection', runs.slice(0, 300));
// TEXTE LIBRE
await selectionner(`document.querySelector('[data-boite="mb-texte"]')`);
const ot = (await b.optionsBarre())[0];
b.ok(JSON.stringify(ot) === JSON.stringify(['taille', 'couleur', '|', 'gras', 'italique', 'align', '|', '…', 'supprimer']), 'texte libre : taille · couleur · G · I · alignement · … · supprimer', JSON.stringify(ot));
await capBarre('so-mini-texte-libre');
await vider();
// FORME, TRAIT : même composant, options inchangées
await selectionner(`document.querySelector('.pdfr-forme[data-objet="mb-forme"]')`);
const of = (await b.optionsBarre())[0]; b.ok(of && of.includes('supprimer') && of.includes('epaisseur'), 'forme : sa mini barre (style, remplir, épaisseur, couleur, supprimer)', JSON.stringify(of));
await capBarre('so-mini-forme');
await vider();
{ const p = await b.ev(`(()=>{const e=document.querySelector('.pdfr-traits-prise path[data-trait="mb-trait"]');const L=e.getTotalLength();const q=e.getPointAtLength(L/2);const m=e.ownerSVGElement.getScreenCTM();return [q.x*m.a+m.e,q.y*m.d+m.f]})()`); await b.clic(p, { att: 600 }); }
const otr = (await b.optionsBarre())[0]; b.ok(otr && otr.includes('epaisseur') && otr.includes('supprimer'), 'trait : couleur · épaisseur · supprimer', JSON.stringify(otr));
await vider();
// BLOC REMPLACÉ : sa mini barre en édition (plus de rangée de format)
await b.clic(await b.pos(`document.querySelector('.edit-block-static')`, false), { att: 900 });
const obl = (await b.optionsBarre())[0];
b.ok(obl && JSON.stringify(obl) === JSON.stringify(['taille', 'couleur-texte', '|', 'gras', 'italique', 'align', '|', '…', 'reinitialiser']), 'bloc de texte remplacé : taille · couleur · G · I · alignement · … · Réinitialiser', JSON.stringify(obl));
await capBarre('so-mini-bloc');
await vider();
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
