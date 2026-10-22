// v1.1 — AJOUT DE FLASHCARDS AU TABLEAU DEPUIS LA CARTE (docs/compte-rendu-tableau-flashcards.md « v1.1 — corrections »).
// « → Tableau » sur une carte (tableau masqué : ajoutée à son enregistrement ; marquée ensuite ; déjà posée : le tableau
// s'ouvre et se recentre dessus), sur une sélection (grille), glisser-déposer RÉEL avec aperçu fantôme, « + Carte » et
// double-clic, plus aucun « Depuis les flashcards ».   Usage : node t-vers-tableau.mjs [ipad|mobile]
import { banc, semer, ouvrirFlashcards, COURS } from '../tests-flashcards-refonte/commun.mjs';
import { outilsGlisse } from '../tests-fichiers-cours/commun-appr.mjs';
const app = process.argv[2] || 'ordinateur';
const tactile = app !== 'ordinateur';
const b = await banc(1440, 900, { tactile });
await semer(b);
await b.S(`await S.remove('board','board:${COURS}').catch(()=>{});return 1`);
await b.ev(`localStorage.setItem('medrevise.disposition.${COURS}','pdf');1`);
const tape = await ouvrirFlashcards(b, { appareil: app });
const etat = () => b.S(`return await S.getOne('board','board:${COURS}')`);
const posees = async () => ((await etat()) || { objects: [] }).objects.filter((o) => o.source).map((o) => o.source.flashcardId);
const centrer = (js) => b.ev(`(()=>{const e=${js};if(!e)return 0;const z=e.closest('.pis-scroll');if(!z)return 0;const r=e.getBoundingClientRect(),q=z.getBoundingClientRect();z.scrollTop+=r.top+r.height/2-(q.top+q.bottom)/2;return 1})()`);
const survol = async (js) => { const p = await b.pos(js, false); if (p && !tactile) await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1] }); await b.dormir(200); };
const clic = async (js) => { await centrer(js); await b.dormir(250); const p = await b.pos(js, false); if (!p) throw new Error('introuvable : ' + js); await tape(p); await b.dormir(500); };
const btn = (id) => `document.querySelector('[data-item="${id}"] [data-act="vers-tableau"]')`;

// 1) l'action « → Tableau » sur chaque flashcard, discrète (dans la rangée d'actions), avec infobulle
const actions = await b.ev(`[...document.querySelectorAll('.fcl-carte')].map(c=>{const x=c.querySelector('[data-act="vers-tableau"]');return x?{dans:!!x.closest('.fcl-actions'),titre:x.title,marque:x.getAttribute('aria-pressed')}:null})`);
b.ok(actions.length >= 6 && actions.every((a) => a && a.dans && /Tableau/.test(a.titre) && a.marque === 'false'), '« → Tableau » sur chaque flashcard, dans la rangée d’actions, avec infobulle', JSON.stringify(actions.slice(0, 2)));
// 2) tableau masqué : la carte est ajoutée au tableau ; l'icône se marque
await survol(`document.querySelector('[data-item="fa-texte"]')`);
await clic(btn('fa-texte')); await b.dormir(600);
const p1 = await posees();
const marque = await b.ev(`(()=>{const x=${btn('fa-texte')};return {aria:x.getAttribute('aria-pressed'),actif:x.classList.contains('actif'),titre:x.title,fond:getComputedStyle(x).backgroundColor}})()`);
b.ok(p1.length === 1 && p1[0] === 'fa-texte' && marque.aria === 'true' && marque.actif && /Déjà sur le tableau/.test(marque.titre), 'tableau masqué : « → Tableau » ajoute la carte au tableau ; l’icône est marquée', JSON.stringify({ p1, marque }));
await survol(`document.querySelector('[data-item="fa-texte"]')`);
{ const r = await b.rect(`document.querySelector('[data-item="fa-texte"]')`); await b.capture('v11-vers-tableau-marque-' + app, { x: Math.round(r.x - 6), y: Math.round(r.y - 6), width: Math.round(r.w + 12), height: Math.round(Math.min(r.h, 160) + 12) }); }
// 3) un 2ᵉ clic sur la carte marquée : le tableau s'ouvre et se recentre dessus (rien n'est ajouté)
await clic(btn('fa-texte')); await b.dormir(1800);
const vue = await b.ev(`(()=>{const v=document.querySelector('.tb2-vue');if(!v)return null;const s=document.querySelector('.tb2-carte.sel');if(!s)return {vue:true};const a=v.getBoundingClientRect(),c=s.getBoundingClientRect();return {dx:Math.round(c.x+c.width/2-(a.x+a.width/2)),dy:Math.round(c.y+c.height/2-(a.y+a.height/2)),titre:s.innerText.split('\\n')[0]}})()`);
b.ok(vue && Math.abs(vue.dx) < 30 && Math.abs(vue.dy) < 30 && /néphron/i.test(vue.titre) && (await posees()).length === 1, 'déjà posée : le clic ouvre le tableau, sélectionne la carte et la recentre (rien n’est ajouté)', JSON.stringify(vue));
// rouvrir le panneau (le tableau garde sa place)
if (app === 'ordinateur') { for (let k = 0; k < 3 && !(await b.ev(`!!document.querySelector('.pis-body')`)); k++) { await b.dormir(600); await b.clic(await b.pos(`document.querySelector('.pis .split-handle')`, false), { att: 900 }); } }
else { const d = await b.pos(`[...document.querySelectorAll('.pdfr-dispo .seg-btn, .tab-dispo .tab-bt')].find(x=>/PDF|Le PDF seul/.test(x.innerText+(x.title||'')))`, false); if (d) await tape(d); await b.dormir(1500);
  if (!(await b.ev(`!!document.querySelector('[data-item="fa-muscle"]')`))) await (await import('../tests-flashcards-refonte/commun.mjs')).ouvrirFlashcards(b, { appareil: app }).catch(() => {}); }
for (let i = 0; i < 15 && !(await b.ev(`!!document.querySelector('[data-item="fa-muscle"] [data-act="vers-tableau"]')`)); i++) await b.dormir(300);
const tableauVisible = await b.ev(`!!document.querySelector('.tb2-vue')`);
// 4) une autre carte (tableau visible sur ordinateur : par la pile d'annulation du tableau)
await survol(`document.querySelector('[data-item="fa-muscle"]')`);
await clic(btn('fa-muscle')); await b.dormir(900);
let p2 = await posees();
let annulable = null;
if (tableauVisible) {
  const vis = await b.ev(`[...document.querySelectorAll('.tb2-carte.sorte-muscle')].length`);
  await b.clic(await b.pos(`document.querySelector('.tb2-barre [data-act="annuler"]')`, false), { att: 700 });
  const apresAnnuler = (await posees()).includes('fa-muscle');
  await b.clic(await b.pos(`document.querySelector('.tb2-barre [data-act="retablir"]')`, false), { att: 700 });
  annulable = { vis, apresAnnuler, retabli: (await posees()).includes('fa-muscle') };
  p2 = await posees();
}
b.ok(p2.includes('fa-muscle') && p2.length === 2 && (!annulable || (annulable.vis === 1 && !annulable.apresAnnuler && annulable.retabli)), `« → Tableau » sur une 2ᵉ carte${tableauVisible ? ' (tableau affiché : la carte y apparaît, ⌘Z l’annule, rétablir la remet)' : ''}`, JSON.stringify({ p2, annulable }));
// 5) sélection multiple : « → Tableau » pose les cartes cochées en grille
await clic(`document.querySelector('[aria-label="Sélectionner"]')`);
for (const id of ['fa-trou', 'fa-tableau', 'fa-molecule', 'fa-texte']) await clic(`document.querySelector('[data-item="${id}"] .alib-case')`);
const libelle = await b.ev(`(document.querySelector('[data-act="selection-vers-tableau"]')||{}).innerText`);
{ const r = await b.rect(`document.querySelector('.alib-selbar')`); if (r) await b.capture('v11-selection-vers-tableau-' + app, { x: Math.round(r.x - 4), y: Math.round(r.y - 4), width: Math.round(r.w + 8), height: Math.round(r.h + 8) }); }
await clic(`document.querySelector('[data-act="selection-vers-tableau"]')`); await b.dormir(1000);
const B5 = await etat();
const grille = B5.objects.filter((o) => o.source && ['fa-trou', 'fa-tableau', 'fa-molecule'].includes(o.source.flashcardId)).sort((a, c) => a.x - c.x);
b.ok(grille.length === 3 && /Tableau \(3\)/.test(libelle) && grille[0].y === grille[1].y && grille[1].y === grille[2].y && grille[0].x < grille[1].x && grille[1].x < grille[2].x
  && B5.objects.filter((o) => o.source && o.source.flashcardId === 'fa-texte').length === 1,
  'sélection : « → Tableau (3) » pose les 3 cartes cochées non posées, en grille (la déjà posée n’est pas doublée)', JSON.stringify({ libelle, g: grille.map((o) => [o.x, o.y]) }));
// 6) glisser-déposer RÉEL d'une flashcard du panneau sur le tableau, aperçu fantôme pendant le glisser
if (tableauVisible && !tactile) {
  const { glisserVers } = outilsGlisse(b);
  await centrer(`document.querySelector('[data-item="fa-image"]')`); await b.dormir(300);
  const src = await b.pos(`document.querySelector('[data-item="fa-image"] .card-body')`, false);
  const V = await b.rect(`document.querySelector('.tb2-vue')`);
  const cible = [Math.round(V.x + V.w * 0.5), Math.round(V.y + V.h * 0.75)];
  const r = await glisserVers(src, cible, { pendant: async () => {
    const f = await b.ev(`(()=>{const f=document.querySelector('.tb2-fantome');if(!f)return null;const r=f.getBoundingClientRect();return {n:document.querySelectorAll('.tb2-fantome').length,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),texte:f.innerText}})()`);
    await b.capture('v11-glisser-fantome', { x: Math.round(V.x), y: Math.round(V.y), width: Math.round(V.w), height: Math.round(V.h) });
    return f;
  } });
  const B6 = await etat();
  const c6 = B6.objects.find((o) => o.source && o.source.flashcardId === 'fa-image');
  const ecran = c6 && (await b.rect(`document.querySelector('[data-objet="${c6.id}"]')`));
  b.ok(r.ok && r.pendant && r.pendant.n === 1 && /Déposer ici/.test(r.pendant.texte) && c6 && ecran && Math.abs(ecran.x - r.pendant.x) < 3 && Math.abs(ecran.y - r.pendant.y) < 3 && !(await b.ev(`!!document.querySelector('.tb2-fantome')`)),
    'glisser-déposer réel : aperçu fantôme pendant le glisser, la carte tombe exactement à sa place, le fantôme disparaît', JSON.stringify({ fantome: r.pendant, carte: ecran && { x: ecran.x, y: ecran.y } }));
}
// 7) création manuelle : « + Carte » et double-clic sur le fond ; plus aucun « Depuis les flashcards »
if (!tableauVisible) { await b.ev(`localStorage.setItem('medrevise.disposition.${COURS}','tableau');1`); await clic(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Tableau'))`); await tape(await b.pos(`document.querySelector('.ptb2 [data-act="plein"]')`, false)); await b.dormir(1500); }
const n7 = (await etat()).objects.length;
await tape(await b.pos(`document.querySelector('.tb2-barre [data-act="carte"]')`, false)); await b.dormir(500);
await b.T.Escape(); await b.dormir(300);
let ok7 = (await etat()).objects.length === n7 + 1;
if (!tactile) {
  const V = await b.rect(`document.querySelector('.tb2-vue')`);
  const p = [Math.round(V.x + V.w * 0.12), Math.round(V.y + V.h * 0.9)];
  for (const n of [1, 2]) for (const type of ['mousePressed', 'mouseReleased']) await b.c.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', clickCount: n });
  await b.dormir(500); await b.T.Escape(); await b.dormir(300);
  ok7 = ok7 && (await etat()).objects.length === n7 + 2;
}
const depuis = await b.ev(`[...document.querySelectorAll('button')].filter(x=>/Depuis les flashcards/.test(x.innerText)).length`);
b.ok(ok7 && depuis === 0, `création manuelle : « + Carte »${tactile ? '' : ' et double-clic sur le fond'} ; aucun bouton « Depuis les flashcards »`, JSON.stringify({ ok7, depuis }));
{ const V = await b.rect(`document.querySelector('.tb2-vue')`); await b.clic(await b.pos(`document.querySelector('.tb2-barre [data-act="recadrer"]')`, false), { att: 700 }).catch(() => {});
  await b.capture('v11-tableau-' + app, { x: Math.round(V.x), y: Math.round(V.y), width: Math.round(V.w), height: Math.round(V.h) }); }
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
await b.ev(`localStorage.setItem('medrevise.disposition.${COURS}','pdf');1`);
process.exit(0);
