// §2 BOÎTE → FLASHCARD : titre + explication + « Ex : », passage en gras, boîte avec image, boîte-tableau (couleurs,
// fusion), aperçu modifiable, thème et date de départ, lien retour (page + boîte), conversion déjà faite.
//   node t-flashcard.mjs [tablette]
import { banc, imagesTest } from './commun.mjs';
import fs from 'node:fs';
const tablette = process.argv[2] === 'tablette';
const b = await banc();
const IM = await imagesTest(b);
const T = (t, m) => ({ type: 'text', text: t, ...(m ? { marks: m.map((x) => ({ type: x })) } : {}) });
const P = (...c) => ({ type: 'paragraph', content: c });
const doc = (...c) => ({ type: 'doc', content: c });
const imgId = await b.S(`const bin=atob(${JSON.stringify(fs.readFileSync(IM.schema).toString('base64'))});const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return await S.putBlob(new Blob([a],{type:'image/png'}))`);
const base = { ficheId: 'f-simpl', kind: 'libre', type: 'boite', fond: 'plein', gabarit: 'carte', taille1000: 15, bord1000: 1.5, pad1000: [10, 8], couleur: 'jaune-franc', largeurFixe: true, createdAt: '2026-10-25T08:00:00.000Z' };
const G = { v: 2, cols: [0.4, 0.6], entete: true, lignes: [['Segment', 'Rôle'], ['Glomérule', 'Filtration'], ['Tubule proximal', 'Réabsorption'], ['', '']], fusions: [{ i: 2, j: 1, rs: 2, cs: 1 }], formats: [[{ fond: 'cyan' }, { fond: 'cyan' }], [null, { couleur: 'rouge', gras: true }], [null, null], [null, null]], bordures: { mode: 'toutes', couleur: null, ep: 1 } };
await b.preparer({ annotations: [
  { ...base, id: 'bf-txt', page: 3, x: 0.08, y: 0.15, width: 0.45, height: 0.1, content: doc(P(T('Néphron')), P(T('Unité fonctionnelle du rein : '), T('filtration', ['bold']), T(', réabsorption, sécrétion.')), P(T('Ex : '), T('le glomérule filtre 180 L/j', ['italic'])), { type: 'bulletList', content: [{ type: 'listItem', content: [P(T('1 million par rein'))] }] }) },
  { ...base, id: 'bf-gras', page: 3, x: 0.55, y: 0.15, width: 0.4, height: 0.1, couleur: 'vert-franc', content: doc(P(T('Clairance', ['bold']), T(' : volume de plasma épuré par unité de temps.')), P(T('Déf : C = U × V / P'))) },
  { ...base, id: 'bf-img', page: 3, x: 0.08, y: 0.55, width: 0.35, height: 0.1, couleur: 'bleu-franc', image: { blobId: imgId, ratio: 0.5778, position: 'dessus' }, content: doc(P(T('Schéma du néphron'))) },
  { ...base, id: 'bf-tab', page: 3, x: 0.5, y: 0.55, width: 0.45, height: 0.1, couleur: 'blanc', grille: G, content: doc(P(T('Segment | Rôle'))) },
] });
await b.S(`for(const q of await S.getAll('questions'))if(q.ficheId==='f-simpl')await S.remove('questions',q.id);return 1`);
await b.ouvrirCours({ tablette });
// recharger les données de l'app (les cartes retirées ne doivent plus être en mémoire)
await b.allerPage(3); await b.dormir(800);
const cartes = () => b.S(`return (await S.getAll('questions')).filter(q=>q.ficheId==='f-simpl')`);
const box = (id) => `document.querySelector('.note-box[data-boite="${id}"]')`;
const convertir = async (id) => {
  await b.ev(`${box(id)}.scrollIntoView({block:'center'});1`); await b.dormir(500);
  await b.clic(await b.pos(box(id), false), { att: 500 });
  await b.clic(await b.pos(`[...document.querySelectorAll('.mini-barre [data-option="vers-flashcard"]')].find(e=>e.offsetParent)`, false), { att: 700 });
};
const champ = (c) => b.ev(`(document.querySelector('.bfc-fenetre [data-champ="${c}"]')||{}).value`);
const creer = async () => { await b.clic(await b.pos(`document.querySelector('.bfc-fenetre [data-action="creer"]')`, true), { att: 2500 }); };
// 1. titre + explication + « Ex : »
await convertir('bf-txt');
b.ok(await b.ev(`!!document.querySelector('.bfc-fenetre')`), '« → Flashcard » (mini barre de la boîte) ouvre l’aperçu');
const r1 = { recto: await champ('recto'), verso: await champ('verso'), depart: await champ('depart'), theme: await champ('theme') };
b.ok(r1.recto === 'Néphron' && r1.verso === 'Unité fonctionnelle du rein : **filtration**, réabsorption, sécrétion.\nEx : *le glomérule filtre 180 L/j*\n- 1 million par rein', 'découpage : 1re ligne = recto ; explication, « Ex : », liste = verso (gras, italique, puce gardés)', JSON.stringify(r1));
b.ok(r1.depart === new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10), 'date de départ : aujourd’hui par défaut', r1.depart);
b.ok(await b.ev(`!!document.querySelector('.bfc-fenetre [data-apercu] strong') && !!document.querySelector('.bfc-fenetre [data-apercu] em')`), 'aperçu du verso mis en forme');
await b.capRect('bt-flashcard-apercu', `document.querySelector('.bfc-fenetre')`, 6);
// modifier l'aperçu : recto, thème
await b.remplir(`document.querySelector('.bfc-fenetre [data-champ="recto"]')`, 'Néphron : définition');
await b.remplir(`document.querySelector('.bfc-fenetre [data-champ="theme"]')`, 'Rein');
await creer();
let C = await cartes();
const c1 = C.find((q) => q.source && q.source.boiteId === 'bf-txt');
b.ok(c1 && c1.recto === 'Néphron : définition' && c1.theme === 'Rein' && c1.versoFormat === 'leger' && /\*\*filtration\*\*/.test(c1.verso) && c1.ficheId === 'f-simpl' && c1.type === 'flashcard' && c1.nouvelle === true,
  'carte créée, rattachée au cours, recto modifié, thème, verso mis en forme', JSON.stringify(c1 && { recto: c1.recto, theme: c1.theme, source: c1.source, due: c1.dueDate }));
const vue1 = await b.ev(`(()=>{const e=document.querySelector('.pis-item[data-item="${c1 && c1.id}"]');return e?{strong:!!e.querySelector('strong'),em:!!e.querySelector('em'),texte:e.textContent.slice(0,160)}:null})()`);
b.ok(vue1 && vue1.strong && vue1.em, 'le panneau ouvre la nouvelle carte, verso affiché avec sa mise en forme', JSON.stringify(vue1));
await b.capRect('bt-flashcard-panneau', `document.querySelector('.pis-item[data-item="${c1 && c1.id}"]')`, 6);
// 2. conversion déjà faite : la carte existante s'ouvre, aucune carte en plus
await convertir('bf-txt');
const actif = await b.ev(`(document.querySelector('.mini-barre [data-option="vers-flashcard"]')||{}).getAttribute?.('aria-pressed')`);
C = await cartes();
b.ok(!(await b.ev(`!!document.querySelector('.bfc-fenetre')`)) && C.filter((q) => q.source && q.source.boiteId === 'bf-txt').length === 1 && (await b.ev(`!!document.querySelector('.pis-item[data-item="${c1.id}"]')`)), 'boîte déjà convertie : l’action ouvre la carte existante (pas de doublon)', String(actif));
// 3. premier passage en gras
await convertir('bf-gras');
b.ok((await champ('recto')) === 'Clairance' && (await champ('verso')) === 'volume de plasma épuré par unité de temps.\nDéf : C = U × V / P', 'premier passage en gras = recto, le reste (« Déf : ») = verso', JSON.stringify([await champ('recto'), await champ('verso')]));
await creer();
// 4. boîte avec image
await convertir('bf-img');
b.ok(await b.ev(`!!document.querySelector('.bfc-fenetre .bfc-image img')`) && (await b.ev(`document.querySelector('.bfc-fenetre [data-place="recto"]').getAttribute('aria-checked')`)) === 'true', 'boîte avec image : l’image est dans l’aperçu (au recto, comme au-dessus du texte)');
// la boîte n'a qu'une ligne : verso vide → « Créer » attend la réponse
b.ok((await b.ev(`document.querySelector('.bfc-fenetre [data-action="creer"]').disabled`)) && /verso est vide/.test(await b.ev(`(document.querySelector('.bfc-fenetre [data-manque]')||{}).textContent||''`)), 'verso vide : création bloquée, message « écris la réponse »');
await b.remplir(`document.querySelector('.bfc-fenetre [data-champ="verso"]')`, 'Glomérule, tubule, anse de Henle');
await creer();
C = await cartes();
const c3 = C.find((q) => q.source && q.source.boiteId === 'bf-img');
b.ok(c3 && c3.imageId === imgId && c3.imagePlace === 'recto' && c3.recto === 'Schéma du néphron', 'carte avec l’image de la boîte', JSON.stringify(c3 && { imageId: c3.imageId, place: c3.imagePlace }));
// 5. boîte-tableau → carte Tableau (couleurs, fusion, bordures)
await convertir('bf-tab');
b.ok(await b.ev(`document.querySelector('.bfc-fenetre .bfc-type').dataset.type === 'tableau' && !!document.querySelector('.bfc-fenetre [data-grille] td[rowspan="2"]')`), 'boîte-tableau : aperçu « Tableau » avec la fusion');
await b.capRect('bt-flashcard-tableau-apercu', `document.querySelector('.bfc-fenetre')`, 6);
await creer();
C = await cartes();
const c4 = C.find((q) => q.source && q.source.boiteId === 'bf-tab');
b.ok(c4 && c4.tableau && c4.tableau.colonnes.join('|') === 'Segment|Rôle' && c4.tableau.lignes.length === 2 && c4.grille && c4.grille.fusions.length === 1, 'carte de type Tableau (colonnes = en-tête) + tableau complet', JSON.stringify(c4 && c4.tableau));
const rendu = await b.ev(`(()=>{const e=document.querySelector('.pis-item[data-item="${c4 && c4.id}"]');if(!e)return null;const td=e.querySelector('[data-grille] td');const r=e.querySelector('[data-grille] td[rowspan="2"]');return {fond:td&&getComputedStyle(td).backgroundColor,fusion:!!r,bord:td&&getComputedStyle(td).borderTopStyle}})()`);
b.ok(rendu && rendu.fond && !/rgba\(0, 0, 0, 0\)|transparent/.test(rendu.fond) && rendu.fusion && rendu.bord === 'solid', 'la carte Tableau garde couleurs, fusion et bordures', JSON.stringify(rendu));
await b.capRect('bt-flashcard-tableau', `document.querySelector('.pis-item[data-item="${c4 && c4.id}"]')`, 6);
// 6. lien retour : depuis la carte, la page et la boîte
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(800);
const avant = await b.ev(`document.querySelector('.pdfr-scroll').scrollTop`);
await b.clic(await b.pos(`document.querySelector('.pis-item[data-item="${c1.id}"] [data-act="vers-boite"]')`, true), { att: 1200 });
const apres = await b.ev(`(()=>{const e=${box('bf-txt')};const s=document.querySelector('.pdfr-scroll').getBoundingClientRect();const r=e&&e.getBoundingClientRect();return {top:document.querySelector('.pdfr-scroll').scrollTop,visible:!!r&&r.top>=s.top&&r.bottom<=s.bottom,selection:!!e&&e.classList.contains('selectionnee'),signal:!!e&&e.classList.contains('nb-signalee')}})()`);
b.ok(apres.top > avant + 200 && apres.visible && apres.selection, 'icône de la carte → la page de la boîte, boîte visible, sélectionnée et signalée', JSON.stringify({ avant, ...apres }));
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
