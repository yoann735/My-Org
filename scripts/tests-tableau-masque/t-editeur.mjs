// Éditeur d'une carte Tableau (31/10) — ordinateur C (1440×900) ou « tablette » (820×1180, tactile).
// Rejouer ../tests-par-cours-elements/seed.mjs avant. Création d'un tableau 4 × 5 : défaut (tout masqué, noms visibles),
// menu « Masquage » (Tout masquer / Tout afficher / Masquer la colonne / Masquer la ligne), œils de colonne, de ligne,
// de case et de nom ; saisie dans une case hachurée ; enregistrement ; réouverture (modification) ; planification inchangée.
import { banc, COURS, TITRE, COLS, LIGNES, MASQUE } from './commun.mjs';
const tab = process.argv[2] === 'tablette';
const b = await banc(false, 1440, 900);
const v = b.v, P = tab ? 'tab-' : '';
await b.semerTemoin();
const h0 = await b.temoins();
v(await b.ouvrirCours(COURS[0], { recharger: true }), 'cours « Cours 1 — Rein » ouvert');
if (tab) {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: false });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  b.toucher = async (js, att = 350) => {
    await b.ev(`(() => { const e = ${js}; e && e.scrollIntoView && e.scrollIntoView({ block: 'center', inline: 'center' }); return 1; })()`); await b.dormir(150);
    const r = await b.rect(js); if (!r) throw new Error('introuvable : ' + js);
    await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.cx, y: r.cy }] }); await b.dormir(50);
    await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await b.dormir(att); return r;
  };
  await b.dormir(1200);
  if (!(await b.ev(`!!document.querySelector('.pm-seg-btn')`))) { await b.ev(`(()=>{const x=[...document.querySelectorAll('button')].find(e=>/Panneau/.test(e.title||e.getAttribute('aria-label')||e.textContent||''));x&&x.click();return 1})()`); await b.dormir(900); }
} else {
  const t0 = b.toucher;
  b.toucher = async (js, att) => { await b.ev(`(() => { const e = ${js}; e && e.scrollIntoView && e.scrollIntoView({ block: 'center', inline: 'center' }); return 1; })()`); await b.dormir(100); return t0(js, att); };
}
await b.ongletFlashcards();
await b.toucher(`document.querySelector('.fcl-nouvelle')`, 800);
await b.sorte('tableau');
const F = `document.querySelector('.fc-carte [data-formulaire-tableau]')`;
const etat = (f = F) => b.ev(`(()=>{const f=${f};return {nl:f.querySelectorAll('tbody tr').length,nc:f.querySelectorAll('.tb-nom-col').length,
  cases:[...f.querySelectorAll('tbody td.tb-case')].map(td=>td.classList.contains('masquee')?1:0).join(''),
  noms:[...f.querySelectorAll('thead th:has(.tb-nom-col)')].map(th=>th.classList.contains('masquee')?1:0).join('')}})()`);
const attendu = (m) => ({ cases: m.cellules.flat().map((x) => (x ? 1 : 0)).join(''), noms: m.noms.map((x) => (x ? 1 : 0)).join('') });
let e = await etat();
v(e.nl === 3 && e.nc === 3 && e.cases === '111111111' && e.noms === '000', 'nouveau tableau 3 × 3 : toutes les cases masquées (hachurées), noms de colonnes visibles', JSON.stringify(e));
const hach = await b.ev(`getComputedStyle(${F}.querySelector('td.masquee .tb-cellule')).backgroundImage`);
v(/repeating-linear-gradient/.test(hach), 'case masquée : léger hachurage', hach.slice(0, 60));
// 4 × 5
await b.toucher(`${F}.querySelector('[data-act="colonne"]')`, 250); await b.toucher(`${F}.querySelector('[data-act="colonne"]')`, 250);
await b.toucher(`${F}.querySelector('[data-act="ligne"]')`, 300);
e = await etat();
v(e.nl === 4 && e.nc === 5 && e.cases === '1'.repeat(20), 'lignes et colonnes ajoutées : 4 × 5, nées masquées', JSON.stringify(e));
await b.focusEcrire(`${F}.querySelector('[data-champ="titre"]')`, TITRE);
for (let k = 0; k < 5; k++) await b.focusEcrire(`${F}.querySelector('[data-col="${k}"]')`, COLS[k]);
for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) await b.focusEcrire(`${F}.querySelector('[data-cellule="${r}:${c}"]')`, LIGNES[r][c]);
const valeurs = () => b.ev(`[...${F}.querySelectorAll('[data-cellule]')].map(x=>x.value).join('|')`);
v((await valeurs()) === LIGNES.flat().join('|'), 'saisie des 20 cases (cases hachurées : la saisie n’est pas gênée)');
// menu « Masquage »
const menu = async (quoi) => { await b.toucher(`${F}.querySelector('[data-act="masquage"]')`, 300); await b.toucher(`${F}.querySelector('[data-menu="${quoi}"]')`, 300); };
await b.toucher(`${F}.querySelector('[data-act="masquage"]')`, 300);
const lib = await b.ev(`[...${F}.querySelectorAll('.tb-menu-liste [role=menuitem]')].map(x=>x.textContent.trim()+(x.disabled?' (grisé)':''))`);
await b.capture(P + 'tm-menu', await b.ev(`(()=>{const r=${F}.querySelector('.tb-saisie').getBoundingClientRect();return {x:r.x-6,y:Math.max(0,r.y-6),width:r.width+12,height:Math.min(${tab ? 1180 : 900}-r.y,330)}})()`));
v(lib.length === 4 && /Tout masquer \(grisé\)/.test(lib[0]) && /Tout afficher/.test(lib[1]) && /colonne/.test(lib[2]) && /ligne/.test(lib[3]), 'menu « Masquage » : Tout masquer (grisé : déjà tout masqué), Tout afficher, colonne, ligne', lib.join(' · '));
await b.echap();
v(await b.ev(`!${F}.querySelector('.tb-menu-liste')`) && await b.form(), 'Échap ferme le menu, pas le formulaire');
await menu('tout-afficher');
v((await etat()).cases === '0'.repeat(20), 'menu › Tout afficher : 0 case masquée');
await menu('tout-masquer');
v((await etat()).cases === '1'.repeat(20), 'menu › Tout masquer : 20 cases masquées');
await menu('tout-afficher');
await b.toucher(`${F}.querySelector('[data-cellule="0:1"]')`, 200);
await menu('colonne');
e = await etat();
v(e.cases === [0, 1, 2, 3].map(() => '01000').join(''), 'menu › Masquer la colonne (case touchée en colonne 2) : ses 4 cases', e.cases);
await menu('colonne');
v((await etat()).cases === '0'.repeat(20), 'menu › Afficher la colonne : rétabli');
await b.toucher(`${F}.querySelector('[data-cellule="2:3"]')`, 200);
await menu('ligne');
v((await etat()).cases === '0000000000' + '11111' + '00000', 'menu › Masquer la ligne (ligne 3) : ses 5 cases');
await menu('ligne');
v((await etat()).cases === '0'.repeat(20), 'menu › Afficher la ligne : rétabli');
// le masque visé, aux œils
await b.toucher(`${F}.querySelector('[data-oeil="col:2"]')`, 250);
v((await etat()).cases === '00100'.repeat(4), 'œil de colonne « Insertion » : la colonne masquée');
await b.toucher(`${F}.querySelector('[data-oeil="lig:1"]')`, 250);
for (const k of ['0:4', '2:0', '3:3']) await b.toucher(`${F}.querySelector('[data-oeil="case:${k}"]')`, 250);
await b.toucher(`${F}.querySelector('[data-oeil="case:3:2"]')`, 250);
await b.toucher(`${F}.querySelector('[data-oeil="nom:1"]')`, 250);
e = await etat();
v(e.cases === attendu(MASQUE).cases && e.noms === attendu(MASQUE).noms, 'œils : ligne 2, 3 cases isolées, case 3:2 rendue visible dans la colonne masquée, nom « Origine » masqué', JSON.stringify(e));
// (l'infobulle maison de l'app range le title dans data-infobulle le temps du survol)
const bulles = await b.ev(`['col:2','case:3:2','nom:1','col:0'].map(k=>{const x=${F}.querySelector('[data-oeil="'+k+'"]');return x.getAttribute('title')||x.getAttribute('data-infobulle')||''})`);
v(/masquée en révision/.test(bulles[0]) === false && /en partie masquée/.test(bulles[0]) && /visible en révision/.test(bulles[1]) && /masqué en révision/.test(bulles[2]) && /en partie/.test(bulles[3]), 'infobulles : « en partie masquée », « visible en révision », « masqué en révision »', bulles.join(' / '));
// saisie dans une case masquée, focus gardé
await b.toucher(`${F}.querySelector('[data-cellule="1:1"]')`, 200);
await b.ev(`(()=>{const t=${F}.querySelector('[data-cellule="1:1"]');t.focus();t.setSelectionRange(t.value.length,t.value.length);return 1})()`);
await b.send('Input.insertText', { text: ' (ext.)' }); await b.dormir(250);
v((await b.ev(`${F}.querySelector('[data-cellule="1:1"]').value`)) === LIGNES[1][1] + ' (ext.)' && (await etat()).cases === attendu(MASQUE).cases, 'écrire dans une case masquée : texte ajouté, masque inchangé');
await b.ev(`(()=>{const t=${F}.querySelector('[data-cellule="1:1"]');const s=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;s.call(t,${JSON.stringify(LIGNES[1][1])});t.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
await b.ev(`${F}.querySelector('.tb-saisie').scrollIntoView({block:'start'});1`); await b.dormir(300);
await b.capture(P + 'tm-editeur', await b.ev(`(()=>{const r=${F}.querySelector('.tb-saisie').getBoundingClientRect();return {x:r.x-6,y:Math.max(0,r.y-6),width:r.width+12,height:r.height+12}})()`));
// enregistrer
await b.toucher(`${F}.querySelector('[data-act="ajouter"]')`, 1400);
const id = await b.S(`return ((await S.getAll('questions')).find(q=>q.recto===${JSON.stringify(TITRE)})||{}).id`);
let c = await b.carteBase(id);
v(!!c && JSON.stringify(c.tableau.masque) === JSON.stringify(MASQUE) && JSON.stringify(c.tableau.lignes) === JSON.stringify(LIGNES) && JSON.stringify(c.tableau.colonnes) === JSON.stringify(COLS), 'base : tableau 4 × 5 et son masque (champ additif tableau.masque)', JSON.stringify(c && c.tableau.masque));
v(!!c && /Muscle : Grand glutéal · Origine : Ilium, sacrum/.test(c.verso), 'verso texte (mise à plat) inchangé dans son format');
await b.toucher(`[...document.querySelectorAll('.fc-carte .imp-actions button')].find(x=>/Annuler|Terminer/.test(x.textContent)&&x.offsetParent)`, 500);
// réouverture (modification)
const plan0 = JSON.stringify({ d: c.dueDate, j: c.j0Date, h: c.historique, n: c.nouvelle });
if (!tab) await b.survol(b.carteListe(id));
await b.toucher(`${b.carteListe(id)}.querySelector('[data-act="modifier"]')`, 900);
const FE = `document.querySelector('.fc-carte.edition [data-formulaire-tableau]')`;
e = await etat(FE);
v(e.cases === attendu(MASQUE).cases && e.noms === attendu(MASQUE).noms, 'réouverture : chaque case, ligne, colonne et nom retrouve son état', JSON.stringify(e));
const yeux = await b.ev(`[...${FE}.querySelectorAll('[data-oeil^="lig:"],[data-oeil^="col:"]')].map(x=>x.dataset.oeil+'='+(x.classList.contains('masquee')?'M':x.classList.contains('partiel')?'p':'v')).join(' ')`);
v(/lig:1=M/.test(yeux) && /col:2=p/.test(yeux) && /lig:0=p/.test(yeux), 'œils de ligne / colonne : masquée (M), en partie (p)', yeux);
await b.ev(`${FE}.querySelector('.tb-saisie').scrollIntoView({block:'start'});1`); await b.dormir(300);
await b.capture(P + 'tm-modification', await b.ev(`(()=>{const r=${FE}.querySelector('.tb-saisie').getBoundingClientRect();return {x:r.x-6,y:Math.max(0,r.y-6),width:r.width+12,height:r.height+12}})()`));
await b.toucher(`${FE}.querySelector('[data-act="ajouter"]')`, 1400);
c = await b.carteBase(id);
v(JSON.stringify(c.tableau.masque) === JSON.stringify(MASQUE), 'enregistrer sans changement : masque identique');
v(JSON.stringify({ d: c.dueDate, j: c.j0Date, h: c.historique, n: c.nouvelle }) === plan0, 'modification : planification de la carte inchangée');
v((await b.temoins()) === h0, `cartes témoins (Texte, Muscle, Tableau d’avant) identiques (${h0})`);
console.log('ID', id);
b.fin();
