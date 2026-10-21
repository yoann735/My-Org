// SÉLECTION / DÉPLACEMENT / OPTIONS : une seule règle pour chaque type d'objet, dans chaque contexte.
// Pour chaque objet : clic = sélection (cadre 1,5 px + 4 coins, rien d'autre), mini barre avec les options attendues,
// 10 glisser depuis un point quelconque de l'objet (taille identique à CHAQUE image, barre qui ne recouvre jamais
// l'objet), clic ailleurs = désélection ; boîte et zone de texte : double-clic = édition, Échap = sortie, Échap = désélection.
// Usage : node t-objets.mjs [contexte] [appareil]   contexte : pdf | document | jumelle ; appareil : ordinateur | ipad | mobile
import { banc, TITRE, FICHE } from './commun.mjs';
import { objets, blobImage } from './commun.mjs';
import fs from 'node:fs';
const contexte = process.argv[2] || 'pdf', appareil = process.argv[3] || 'ordinateur';
const tactile = appareil !== 'ordinateur';
const b = await banc(1440, 900, { tactile });
const CTX = { pdf: { titre: TITRE }, document: { titre: 'Myologie (document)', vue: 'Original' }, jumelle: { titre: 'Physiologie rénale (jumelle)', vue: 'Fiche' } }[contexte];
await b.ev(`localStorage.setItem('medrevise.dessinDoigt','0');1`);
// ouvrir le cours, trouver la fiche (ou la fiche jumelle) et sa 1re page, y semer un objet de chaque type
await b.ouvrir(CTX.titre, { recharger: true });
const versVue = async () => { if (!CTX.vue) return; const p = await b.pos(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText===${JSON.stringify(CTX.vue)}&&!x.classList.contains('active'))`, false); if (p) await b.clic(p, { att: 2000 }); };
await versVue();
const ficheId = contexte === 'pdf' ? FICHE : await b.S(`return (await S.getAll('fiches')).find(f=>f.titre===${JSON.stringify(CTX.titre)}).id`);
// le calque d'annotations affiché : celui de la fiche jumelle (companion_pdf.nsAnnot), sinon celui du cours
const ns = contexte === 'jumelle' ? await b.S(`return (await S.getAll('companion_pdf')).find(r=>r.courseId===${JSON.stringify(ficheId)}).nsAnnot`) : ficheId;
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(1200);
const page = await b.ev(`document.querySelector('.pdfr-page[data-cle]').dataset.cle`);
const blob = await blobImage(b);
// document : une image collée devient un bloc du texte (conversion du 01/10), pas un objet posé sur la page
const OBJ = objets(ns, isNaN(+page) ? page : +page, contexte === 'document' ? null : blob);
// seuls les objets du banc (ids « o- ») sont remplacés : les pages d'un document sont aussi des annotations du cours
// PDF : le cours du banc, vidé de tout ce que les autres bancs y ont laissé (boîtes, flèches, pages insérées)
if (contexte === 'pdf') await b.S(`for(const a of await S.getAll('annotations'))if(a.ficheId===${JSON.stringify(FICHE)})await S.remove('annotations',a.id);return 1`);
await b.S(`for(const a of await S.getAll('annotations'))if(String(a.id).startsWith('o-'))await S.remove('annotations',a.id);for(const a of ${JSON.stringify(OBJ)})await S.put('annotations',a);return 1`);
await b.ouvrir(CTX.titre, { recharger: true });
await versVue();
if (appareil === 'ipad') { await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true }); await b.dormir(1800); }
if (appareil === 'mobile') { await b.c.send('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 2, mobile: true }); await b.dormir(1800); }
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(900);
if (!(await b.ev(`!!document.querySelector('.ptb-outil.actif[title^="Sélection"], .tab-outil.actif[aria-label="Sélection"]')`))) await b.outil('Sélection');
await b.dormir(500);
const ATTENDU = {
  'o-boite': ['couleur', 'taille', 'fond', 'fleche', 'reduire', 'supprimer'], 'o-texte': ['couleur', 'taille', 'supprimer'], 'o-question': ['supprimer'],
  'o-rect': ['trait', 'remplir', 'epaisseur', 'couleur', 'supprimer'], 'o-ellipse': ['trait', 'remplir', 'epaisseur', 'couleur', 'supprimer'], 'o-triangle': ['trait', 'remplir', 'epaisseur', 'couleur', 'supprimer'],
  'o-fleche': ['type', 'debut', 'fin', 'trait', 'epaisseur', 'couleur', 'supprimer'], 'o-ligne': ['type', 'debut', 'fin', 'trait', 'epaisseur', 'couleur', 'supprimer'],
  'o-trait': ['couleur', 'epaisseur', 'supprimer'], 'o-image': ['rogner', 'verrou', 'supprimer'],
};
// élément de prise et rectangle de l'objet (à l'écran)
const sel = (id) => id === 'o-trait' ? `document.querySelector('.pdfr-traits-prise path[data-trait="${id}"]')` : `document.querySelector('[data-objet="${id}"]')`;
const point = (id) => b.ev(`(()=>{const e=${sel(id)};if(!e)return null;const fl=e.matches('.pdfr-forme[data-forme="fleche"],.pdfr-forme[data-forme="ligne"]')?e.querySelector('.pf-hit'):e.tagName==='path'?e:null;
  if(fl){const L=fl.getTotalLength(),q=fl.getPointAtLength(L*0.4),m=fl.getScreenCTM();return [q.x*m.a+m.e,q.y*m.d+m.f]}
  const r=(e.querySelector('.pq-rond')||e).getBoundingClientRect();return [r.x+r.width*0.6,r.y+r.height*0.55]})()`);
const rectObj = (id) => b.ev(`(()=>{let e=${sel(id)};if(!e)return null;if(e.tagName==='path')e=document.querySelector('.pdfr-trait-sel')||e;
  let r=(e.querySelector('.pq-rond')||e).getBoundingClientRect();const fl=e.querySelector&&e.querySelector('.pf-trace');if(fl&&e.matches('.pdfr-forme[data-forme="fleche"],.pdfr-forme[data-forme="ligne"]'))r=fl.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
const etat = () => b.ev(`(()=>{const mb=[...document.querySelectorAll('.mini-barre')];const m=mb[0];const r=m&&m.getBoundingClientRect();
  return {barres:mb.length,options:m?[...m.querySelectorAll('[data-option],.sc-bouton')].map(x=>x.dataset.option||'couleur'):[],barre:r?{x:r.x,y:r.y,w:r.width,h:r.height}:null,
  cadres:document.querySelectorAll('.sel-cadre').length,coins:document.querySelectorAll('.sel-cadre .sel-coin').length,edition:!!(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('.note-box .ProseMirror'))}})()`);
const recouvre = (a, c) => a && c && a.x < c.x + c.w - 0.5 && a.x + a.w > c.x + 0.5 && a.y < c.y + c.h - 0.5 && a.y + a.h > c.y + 0.5;
const souris = (type, [x, y], ex = {}) => b.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...ex });
const toucher = async (p) => { if (tactile) await b.tape(p); else await b.clic(p, { att: 350 }); };
const glisser = async (de, a) => {
  if (tactile) { await b.doigt(de, a, 8); return; }
  await souris('mouseMoved', de); await souris('mousePressed', de, { buttons: 1 });
  for (let k = 1; k <= 8; k++) { await souris('mouseMoved', [de[0] + (a[0] - de[0]) * k / 8, de[1] + (a[1] - de[1]) * k / 8], { buttons: 1 }); await b.dormir(25); }
  await souris('mouseReleased', a); await b.dormir(250);
};
// une zone vide connue : la marge basse de la page 1, à gauche
// une zone vide connue : la colonne de droite de la page 1, à la hauteur du centre de l'écran (aucun objet n'y est posé)
const vide = async () => { const p = await b.rect(`document.querySelector('.pdfr-page[data-cle]')`); const v = await b.rect(`document.querySelector('.pdfr-scroll')`); // document : un toucher dans le texte éditable y place le curseur (et, au doigt, défile jusqu'à la fin : défaut
  // préexistant, hors chantier) — on touche la marge gauche de la page, hors du texte
  await toucher(contexte === 'document' ? [p.x + p.w * 0.02, v.y + v.h * 0.12] : [p.x + p.w * 0.56, v.y + v.h * 0.5]); await b.dormir(300); };
const centrer = async (id) => { await b.ev(`(()=>{const e=${sel(id)};const z=document.querySelector('.pdfr-scroll');if(!e||!z)return 0;const r=e.getBoundingClientRect(),q=z.getBoundingClientRect();z.scrollTop+=r.y+r.height/2-(q.y+q.height*0.55);return 1})()`); await b.dormir(500); };
const resultats = {};
const trace = async (m) => { if (process.env.TRACE) console.log('  ·', m, await b.ev(`document.querySelector('.pdfr-scroll').scrollTop+' '+[...document.querySelectorAll('.pdfr-page[data-cle]')].map(p=>p.dataset.cle.slice(-3)).join(',')+' obj '+document.querySelectorAll('[data-objet]').length`)); };
for (const o of OBJ) {
  const id = o.id;
  // l'objet au centre de la zone de lecture (une page plus haute que l'écran : il peut être dessous)
  await trace('avant '+id); await centrer(id); await trace('centré');
  const p0 = await point(id);
  if (!p0) { b.ok(false, `${id} : introuvable`); continue; }
  await toucher(p0); await b.dormir(350);
  let e = await etat();
  const attendu = ATTENDU[id];
  const fleche = ['o-fleche', 'o-ligne'].includes(id);
  const bouts = await b.ev(`document.querySelectorAll('.fl-bout').length`);
  // une flèche n'a pas de cadre : son trait s'éclaire, ses deux bouts (et ses points) apparaissent
  const cadreOk = fleche ? e.cadres === 0 && bouts === 2 : e.cadres === 1 && e.coins === 4;
  b.ok(cadreOk && e.barres === 1 && JSON.stringify(e.options) === JSON.stringify(attendu), `${id} : un clic sélectionne — ${['o-fleche', 'o-ligne'].includes(id) ? 'trait éclairé, points' : 'cadre + 4 coins'}, mini barre ${attendu.join(' · ')}`, JSON.stringify({ cadres: e.cadres, coins: e.coins, options: e.options }));
  // 10 glisser depuis un point quelconque de l'objet ; taille mesurée à chaque image ; barre jamais sur l'objet
  await b.ev(`(()=>{window.__t=[];const f=()=>{const e=${sel(id)};if(e){const x=(e.tagName==='path'?e:(e.querySelector('.pq-rond')||e)).getBoundingClientRect();window.__t.push([+x.width.toFixed(1),+x.height.toFixed(1)])}if(window.__go)requestAnimationFrame(f)};window.__go=true;requestAnimationFrame(f);return 1})()`);
  let recouvrements = 0, deplace = 0;
  const r0 = await rectObj(id);
  for (let i = 0; i < 10; i++) {
    const p = await point(id);
    await glisser(p, [p[0] + (i % 2 ? -36 : 40), p[1] + (i % 3 ? 22 : -18)]);
    await b.dormir(150);
    e = await etat();
    const ro = await rectObj(id);
    if (e.barre && recouvre(e.barre, ro)) recouvrements++;
  }
  await b.ev(`window.__go=false;1`);
  const t = await b.ev(`window.__t`);
  const r1 = await rectObj(id);
  deplace = Math.hypot(r1.x - r0.x, r1.y - r0.y);
  const ws = t.map((x) => x[0]), hs = t.map((x) => x[1]);
  const varie = Math.max(Math.max(...ws) - Math.min(...ws), Math.max(...hs) - Math.min(...hs));
  b.ok(deplace > 5 && varie <= 1 && recouvrements === 0 && e.barres === 1, `${id} : 10 glisser n'importe où — déplacé, taille constante à chaque image, mini barre jamais sur l'objet`, JSON.stringify({ deplace: Math.round(deplace), varie, images: t.length, recouvrements, barres: e.barres }));
  if (id === 'o-boite' || id === 'o-texte') {
    const p = await point(id);
    for (const n of [1, 2]) for (const type of ['mousePressed', 'mouseReleased']) await b.c.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', clickCount: n });
    await b.dormir(500);
    const ed = (await etat()).edition;
    await b.T.Escape(); await b.dormir(250);
    const e1 = await etat();
    await b.T.Escape(); await b.dormir(250);
    const e2 = await etat();
    b.ok(ed && !e1.edition && e1.cadres === 1 && e2.cadres === 0, `${id} : double-clic = édition, Échap = sortie (reste sélectionnée), Échap = désélection`, JSON.stringify({ ed, apresEchap: e1.cadres, apres2: e2.cadres }));
  }
  await trace('avant vide'); await vide(); await trace('après vide');
  e = await etat();
  b.ok(e.cadres === 0 && e.barres === 0, `${id} : clic ailleurs = désélection, la mini barre disparaît`);
  resultats[id] = { options: attendu.join(' · '), sel: 'clic', depl: 'glisser n’importe où', redim: ['o-fleche', 'o-ligne'].includes(id) ? 'bouts + points' : '4 coins' };
}
if (contexte === 'pdf' && appareil === 'ordinateur') {
  // capture : sélection d'une boîte et de chaque mini barre
  for (const id of ['o-boite', 'o-rect', 'o-fleche', 'o-image', 'o-trait', 'o-texte']) {
    await centrer(id); const p = await point(id); await toucher(p); await b.dormir(400);
    const r = await b.ev(`(()=>{const m=document.querySelector('.mini-barre').getBoundingClientRect();const o=${sel(id)};const x=(o.tagName==='path'?document.querySelector('.pdfr-trait-sel'):o).getBoundingClientRect();
      const L=Math.min(m.x,x.x)-14,T=Math.min(m.y,x.y)-14,R=Math.max(m.right,x.right)+14,B=Math.max(m.bottom,x.bottom)+14;return {x:Math.max(0,L),y:Math.max(0,T),w:R-L,h:B-T}})()`);
    await b.capture('mini-barre-' + id.slice(2), { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.w), height: Math.round(r.h) });
    await vide();
  }
}
fs.writeFileSync(`../cap/objets-${contexte}-${appareil}.json`, JSON.stringify(resultats, null, 1));
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
process.exit(0);
