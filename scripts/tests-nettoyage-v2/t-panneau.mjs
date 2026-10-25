// §1 panneau latéral (cause : défilement horizontal de .pm-corps) + §2 onglets Tableau / Pages et « → Tableau » retirés
// + §3 tags dans la marge + §4 bande de prise de la boîte-tableau.   FX=… node t-panneau.mjs [ordinateur|tablette]
import { banc, outilsTableau } from '../tests-boites-tableaux/commun.mjs';
const app = process.argv[2] || 'ordinateur';
const b = await banc();
let echecs = 0; const v = (c, m, d = '') => { console.log((c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : '')); if (!c) echecs++; };
const G0 = { v: 1, cols: [0.5, 0.5], lignes: [['Muscle', 'Action'], ['Psoas', 'Flexion'], ['Iliaque', 'Flexion']] };
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
await b.preparer({ annotations: [b.boiteGrille('bt-1', G0, { x: 0.2, y: 0.5, width: 0.4 }),
  { ficheId: 'f-simpl', page: 1, kind: 'libre', type: 'boite', fond: 'plein', gabarit: 'carte', taille1000: 16, bord1000: 1.5, pad1000: [10, 8], couleur: 'jaune-franc', id: 'bx-1', x: 0.6, y: 0.2, width: 0.2, height: 0.05, content: doc('Boîte') }] });
await b.S(`for(const t of await S.getAll('page_tag')) if(t.courseId==='f-simpl') await S.put('page_tag',{...t,supprime:true}); return 1`);
await b.ev(`localStorage.setItem('medrevise.panneau.mode.f-simpl', JSON.stringify('exercices'));1`);
await b.ouvrirCours({ tablette: app === 'tablette' });
if (app === 'tablette') { await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); const pb = await b.pos(`[...document.querySelectorAll('button')].find(x=>/^(Afficher le panneau)/.test(x.getAttribute('aria-label')||x.title||''))`, false); if (pb) await b.clic(pb, { att: 900 }); }
// ---- §2 onglets et actions retirés ----
const modes = await b.ev(`[...document.querySelectorAll('.pm-seg-btn')].map(x=>x.innerText.split('\\n')[0].trim())`);
v(JSON.stringify(modes) === JSON.stringify(['Exercices', 'Transcript', 'Notes', 'Notions']), 'panneau : Exercices · Transcript · Notes · Notions (plus de Tableau ni de Pages)', modes.join(' · '));
// ---- §1 le panneau à 320 / 420 / 520 px : Exos à sa place, jamais décalé ----
const mesurer = () => b.ev(`(()=>{const c=document.querySelector('.pm-corps'),r=c.getBoundingClientRect(),ex=document.querySelector('.pm-vue[data-mode="exercices"]').getBoundingClientRect();return {corpsX:Math.round(r.x),corpsW:Math.round(r.width),exX:Math.round(ex.x),exW:Math.round(ex.width),scroll:c.scrollLeft}})()`);
const largeurs = app === 'tablette' ? [null] : [320, 420, 520];
for (const W of largeurs) {
  if (W) { await b.ev(`(()=>{const p=document.querySelector('.pis');const poignee=p.querySelector('.split-handle');const body=p.querySelector('.pis-body');const extra=p.getBoundingClientRect().width-body.getBoundingClientRect().width;p.style.width=(${W}+extra)+'px';p.style.flex='0 0 '+(${W}+extra)+'px';return 1})()`); await b.dormir(700); }
  // provoquer la cause : un scrollIntoView dans un volet HORS écran (Notions)
  await b.ev(`(()=>{const e=document.querySelector('.pm-vue[data-mode="notions"] *');e&&e.scrollIntoView({block:'nearest',inline:'nearest'});return 1})()`); await b.dormir(300);
  const m = await mesurer();
  v(m.scroll === 0 && m.exX === m.corpsX && Math.abs(m.exW - m.corpsW) <= 1, `panneau ${W ? W + ' px' : '(tablette)'} : Exos exactement dans le panneau, aucun décalage même après un scrollIntoView dans un volet caché`, JSON.stringify(m));
  await b.capRect(`nettoyage-${app}-panneau${W ? '-' + W : ''}`, `document.querySelector('.pis')`, 2);
}
v(!(await b.ev(`!!document.querySelector('.fcl-vers-tableau, [data-act="vers-tableau"], .alib-selectionner, [data-act="selection-vers-tableau"]')`)), 'flashcards : plus de « → Tableau » ni de sélection vers le tableau');
// mini barre d'une boîte
const bx = `document.querySelector('.note-box[data-boite="bx-1"]')`;
await b.ev(`${bx}.scrollIntoView({block:'center'});1`); await b.dormir(500);
await b.clic(await b.pos(bx, false), { att: 600 });
const opts = await b.ev(`[...document.querySelectorAll('.mini-barre [data-option]')].filter(e=>e.offsetParent).map(e=>e.dataset.option)`);
v(opts.length > 3 && !opts.includes('vers-tableau'), 'mini barre d’une boîte : plus de « → Tableau »', opts.join(','));
await b.T.Escape(); await b.dormir(300);
// ---- §3 tags dans la marge ----
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(600);
v(!(await b.ev(`!!document.querySelector('.pdfr-page-menu')`)), 'plus de bouton « … » en haut au centre de la page');
const g = await b.ev(`(()=>{const p=document.querySelector('.pdfr-page[data-cle="1"]'),i=p.querySelector('.pdfr-tag-ic'),r=p.getBoundingClientRect(),q=i.getBoundingClientRect();return {page:Math.round(r.left),icDroite:Math.round(q.right),icGauche:Math.round(q.left),visible:getComputedStyle(i).opacity>0.5&&getComputedStyle(i).visibility!=='hidden'}})()`);
v(g.icDroite <= g.page && g.icGauche >= 0 && g.visible, 'icône des tags toujours visible, dans la marge à gauche, hors de la page', JSON.stringify(g));
const valider = async (date) => { for (let i = 0; i < 20 && !(await b.ev(`!!document.querySelector('.tgp-fenetre')`)); i++) await b.dormir(150);
  await b.ev(`(()=>{const i=document.querySelector('.tgp-fenetre [data-champ=date]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'${date}');i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`); await b.dormir(200);
  await b.clic(await b.pos(`document.querySelector('.tgp-fenetre [data-action=valider]')`, false), { att: 700 }); };
const tag = async (cle, quoi) => {
  await b.ev(`(()=>{const s=document.querySelector('.pdfr-scroll');const p=document.querySelector('.pdfr-page[data-cle="${cle}"]');s.scrollTop+=p.getBoundingClientRect().top-s.getBoundingClientRect().top-30;return 1})()`); await b.dormir(600);
  await b.clic(await b.pos(`document.querySelector('.pdfr-page[data-cle="${cle}"] .pdfr-tag-ic')`, false), { att: 500 });
  await b.clic(await b.pos(`[...document.querySelectorAll('.ctx-menu-item')].find(x=>x.innerText.includes('${quoi}'))`, false), { att: 500 });
  await valider('2026-10-22');
};
await tag(1, 'Marquer début'); await tag(2, 'Marquer fin');
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(700);
const cadre = (cle) => b.ev(`(()=>{const p=document.querySelector('.pdfr-page[data-cle="${cle}"]');const l=p.querySelector('.pdfr-marge-tags .tgp-pastille');const r=p.getBoundingClientRect(),q=l?l.getBoundingClientRect():null;return {ombre:getComputedStyle(p).boxShadow,etiquette:l?l.textContent:null,hors:q?q.right<=r.left+0.5:false,sens:l?getComputedStyle(l).writingMode:null}})()`);
const c1 = await cadre(1), c2 = await cadre(2);
v(/rgb\(31, 157, 85\) 0px 0px 0px 3px/.test(c1.ombre) && c1.etiquette === '▶ Début · 22 oct.' && c1.hors, 'page 1 taguée « début » : cadre VERT + étiquette « ▶ Début · 22 oct. » dans la marge', JSON.stringify(c1));
v(/rgb\(217, 68, 59\) 0px 0px 0px 3px/.test(c2.ombre) && c2.etiquette === '■ Fin · 22 oct.' && c2.hors, 'page 2 taguée « fin » : cadre ROUGE + étiquette « ■ Fin · 22 oct. » dans la marge', JSON.stringify(c2));
await b.capture(`nettoyage-${app}-tags`);
// ---- §4 bande de prise de la boîte-tableau ----
const T = outilsTableau(b, `.note-box[data-boite="bt-1"]`);
const bt = `document.querySelector('.note-box[data-boite="bt-1"]')`;
await b.ev(`${bt}.scrollIntoView({block:'center'});1`); await b.dormir(600);
const r0 = await b.rect(bt);
await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r0.cx, y: r0.cy }); await b.dormir(300);
const prise = await b.ev(`(()=>{const p=${bt}.querySelector('.btab-prise');const s=getComputedStyle(p);return {op:+s.opacity,cur:s.cursor,haut:Math.round(p.getBoundingClientRect().height)}})()`);
v(prise.op === 1 && prise.cur === 'grab' && prise.haut <= 16, 'au survol : bande de prise fine visible, curseur main', JSON.stringify(prise));
// édition d'une cellule (2 clics) puis déplacement par la bande
await b.clic(await b.pos(bt, false), { att: 500 });
await b.clic(await T.posCell(1, 1), { att: 600 });
v((await T.focus()) === '1:1', 'clic dans une cellule : édition de la cellule (la bande ne gêne pas)');
const avant = (await b.enBase()).find((a) => a.id === 'bt-1');
const pp = await b.pos(`${bt}.querySelector('.btab-prise')`, false);
if (app === 'tablette') await b.doigt?.(pp, [pp[0] + 80, pp[1] + 60], 12);
if (app !== 'tablette' || !b.doigt) await b.glisser(pp, [pp[0] + 80, pp[1] + 60], 12);
await b.dormir(700);
const apres = (await b.enBase()).find((a) => a.id === 'bt-1');
v(apres.x > avant.x + 0.02 && apres.y > avant.y + 0.02 && JSON.stringify(apres.grille) === JSON.stringify(avant.grille), `glisser la bande : la boîte se déplace (${avant.x.toFixed(3)},${avant.y.toFixed(3)} → ${apres.x.toFixed(3)},${apres.y.toFixed(3)}), cellules intactes`);
await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (await b.rect(bt)).cx, y: (await b.rect(bt)).cy }); await b.dormir(300);
await b.capRect(`nettoyage-${app}-prise`, bt, 24);
v(!(b.erreurs && b.erreurs.length), 'console sans erreur', (b.erreurs || []).slice(0, 3).join(' | '));
console.log(echecs ? `❌ ${echecs} échec(s)` : '✅ tout est vert');
process.exit(0);
