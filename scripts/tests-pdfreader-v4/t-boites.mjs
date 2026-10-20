// (20/10 soir) Boîtes et zones de texte : taille IDENTIQUE pendant et après un glisser (mesurée à chaque image),
// boîte vide compacte (une ligne, ~120 px à 100 %), minimum 48 × 24 px, croissance avec le texte seulement,
// anciennes boîtes inchangées. Cours « Rein v3 », zoom 100 %, base LOCALE.  Usage : node t-boites.mjs [ipad]
import { banc } from './commun.mjs';
const ipad = process.argv[2] === 'ipad';
const b = await banc(1440, 900, { tactile: ipad });
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const ANCIENNES = [
  { id: 'an-b-1', x: 0.05, y: 0.62, width: 0.3, height: 0.05, t: 'Ancienne courte' },
  { id: 'an-b-2', x: 0.45, y: 0.62, width: 0.2, height: 0.12, t: 'Ancienne boîte avec un texte nettement plus long qui passe à la ligne' },
  { id: 'an-b-3', x: 0.75, y: 0.62, width: 0.18, height: 0.04, t: 'Anc. 3' },
].map((a) => ({ ...a, ficheId: 'f-v3-rein', page: 1, kind: 'libre', type: 'boite', couleur: 'jaune', content: doc(a.t), createdAt: '2026-10-01T10:00:00.000Z' }));
await b.S(`for(const a of await S.getAll('annotations'))if(a.ficheId==='f-v3-rein')await S.remove('annotations',a.id);
  for(const r of await S.getAll('reading_position'))if(String(r.id).startsWith('rp:f-v3-rein'))await S.remove('reading_position',r.id);
  for(const a of ${JSON.stringify(ANCIENNES)})await S.put('annotations',a);return 1`);
await b.biblio({ recharger: true });
await b.ouvrir('Rein v3'); await b.dormir(1500);
if (ipad) { await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true }); await b.dormir(1500); }
await b.ev(`window.__mrZoom(1);1`); await b.dormir(1200);
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(800);
const P = await b.rect(`document.querySelector('.pdfr-page[data-cle="1"]')`);
const boites = () => b.ev(`[...document.querySelectorAll('.pdfr-page[data-cle="1"] .note-box')].map(n=>{const r=n.getBoundingClientRect();return {t:n.innerText.trim().slice(0,24),w:+r.width.toFixed(2),h:+r.height.toFixed(2),x:r.x,y:r.y,compacte:n.classList.contains('compacte')}})`);
const avantPx = await boites();
// --- création : 1 clic (vide) + boîtes tracées de tailles variées, avec des textes de longueurs variées
await b.outil('Boîte');
const pt = (fx, fy) => [P.x + P.w * fx, P.y + P.h * fy];
// taper seulement quand l'éditeur de la boîte a le focus (sinon l'espace ferait défiler la page)
const attendreFocus = async () => { for (let i = 0; i < 20; i++) { if (await b.ev(`!!(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('.note-box .ProseMirror'))`)) return true; await b.dormir(100); } return false; };
await b.clic(pt(0.08, 0.1), { att: 600 });
const vide = await b.ev(`(()=>{const n=document.querySelector('.note-box.active');const r=n.getBoundingClientRect();return {w:+r.width.toFixed(1),h:+r.height.toFixed(1),compacte:n.classList.contains('compacte'),zoom:(document.querySelector('[data-zoom-libelle]')||{}).textContent}})()`);
b.ok(vide.compacte && vide.w >= 110 && vide.w <= 130 && vide.h >= 23 && vide.h <= 27, 'boîte vide à la création : compacte, une ligne (~120 × 24 px à 100 %)', JSON.stringify(vide));
await b.capture('boite-vide' + (ipad ? '-ipad' : ''), { x: Math.round(P.x + P.w * 0.08) - 30, y: Math.round(P.y + P.h * 0.1) - 40, width: 260, height: 90 });
await attendreFocus(); await b.ecrire('A'); await b.dormir(200);
const uneLettre = await b.ev(`(()=>{const r=document.querySelector('.note-box.active').getBoundingClientRect();return {w:+r.width.toFixed(1),h:+r.height.toFixed(1)}})()`);
b.ok(uneLettre.h <= 27 && uneLettre.w >= 47.5, 'une lettre : toujours une ligne, jamais sous 48 px de large', JSON.stringify(uneLettre));
await b.ecrire(' — le néphron filtre le plasma, réabsorbe le sodium et concentre les urines grâce à l’anse de Henlé'); await b.dormir(300);
await b.dormir(300);
const long = await b.ev(`(()=>{const n=document.querySelector('.note-box.active');const r=n.getBoundingClientRect();const p=n.closest('.pdfr-page').getBoundingClientRect();return {w:+r.width.toFixed(1),h:+r.height.toFixed(1),partPage:+(r.width/p.width).toFixed(3)}})()`);
b.ok(long.partPage <= 0.46 && long.partPage > 0.3 && long.h > 30, 'texte long : la boîte s’élargit avec le texte (≤ 45 % de la page) puis passe à la ligne', JSON.stringify(long));
await b.T.Escape(); await b.dormir(200);
const traces = [[0.3, 0.2, 0.42, 0.26, 'Rectangle moyen'], [0.5, 0.2, 0.56, 0.23, 'Petit'], [0.62, 0.06, 0.9, 0.22, 'Grande boîte tracée'], [0.08, 0.32, 0.2, 0.36, 'Rein'], [0.3, 0.33, 0.6, 0.4, 'Boîte large avec un peu de texte'], [0.66, 0.36, 0.74, 0.46, 'Haute']];
for (const [x0, y0, x1, y1, t] of traces) {
  // l'outil Boîte reste actif pour enchaîner : un re-clic l'arrêterait
  if (!(await b.ev(`!!document.querySelector('.ptb-outil.actif[title^="Boîte"], .tab-outil.actif[aria-label="Boîte"]')`))) await b.outil('Boîte');
  await b.glisser(pt(x0, y0), pt(x1, y1), 8); await b.dormir(400);
  if (!(await attendreFocus())) { b.ok(false, `boîte « ${t} » : éditeur sans focus`); continue; }
  await b.ecrire(t); await b.dormir(200); await b.T.Escape(); await b.dormir(250);
}
await b.T.Escape(); await b.outil('Sélection'); await b.dormir(300);
// zone de texte (outil Texte) : compacte aussi
await b.outil('Texte'); await b.clic(pt(0.08, 0.5), { att: 600 }); await attendreFocus();
const zt = await b.ev(`(()=>{const n=document.querySelector('.note-box.active');const r=n.getBoundingClientRect();return {w:+r.width.toFixed(1),h:+r.height.toFixed(1),compacte:n.classList.contains('compacte')}})()`);
b.ok(zt.compacte && zt.w >= 110 && zt.w <= 130 && zt.h <= 30, 'zone de texte vide : compacte (~120 px, une ligne)', JSON.stringify(zt));
await b.ecrire('Zone de texte'); await b.T.Escape(); await b.dormir(300); await b.outil('Sélection');
// --- 10 glisser : taille mesurée à CHAQUE image pendant le geste
let toutes = (await boites());
b.ok(toutes.length >= 10, `${toutes.length} boîtes et zones sur la page`);
const echantillonner = () => b.ev(`(()=>{window.__tailles=[];const f=()=>{const l=[...document.querySelectorAll('.pdfr-page[data-cle="1"] .note-box')].map(n=>{const r=n.getBoundingClientRect();return [+r.width.toFixed(2),+r.height.toFixed(2)]});window.__tailles.push(l);if(window.__ech)requestAnimationFrame(f)};window.__ech=true;requestAnimationFrame(f);return 1})()`);
const resultats = [];
for (let i = 0; i < Math.min(10, toutes.length); i++) {
  toutes = await boites();
  const avant = toutes[i];
  const poignee = await b.ev(`(()=>{const n=[...document.querySelectorAll('.pdfr-page[data-cle="1"] .note-box')][${i}];const g=n.querySelector('.nb-bar');const r=g.getBoundingClientRect();return [r.x+Math.min(30,r.width/2),r.y+r.height/2]})()`);
  await echantillonner();
  const dest = [poignee[0] + (i % 2 ? -1 : 1) * 40, poignee[1] + 25];
  if (ipad) await b.doigt(poignee, dest, 10); else await b.glisser(poignee, dest, 10);
  await b.dormir(300);
  await b.ev(`window.__ech=false;1`);
  const tailles = (await b.ev(`window.__tailles`)).map((l) => l[i]).filter(Boolean);
  const apres = (await boites())[i];
  const dev = Math.max(...tailles.map(([w, h]) => Math.max(Math.abs(w - avant.w), Math.abs(h - avant.h))), Math.abs(apres.w - avant.w), Math.abs(apres.h - avant.h));
  const bouge = Math.hypot(apres.x - avant.x, apres.y - avant.y);
  resultats.push({ t: avant.t, w: avant.w, h: avant.h, images: tailles.length, ecartMax: +dev.toFixed(2), deplace: +bouge.toFixed(1) });
}
console.log(JSON.stringify(resultats));
b.ok(resultats.every((r) => r.ecartMax <= 0.5 && r.deplace > 20), `10 glisser${ipad ? ' au doigt' : ''} : taille identique pendant (chaque image) et après (≤ 0,5 px), boîte bien déplacée`, resultats.map((r) => `${r.t.slice(0, 10)}:${r.ecartMax}`).join(' | '));
// --- minimum : redimension vers le tout petit
const compacte = await b.ev(`(()=>{const l=[...document.querySelectorAll('.pdfr-page[data-cle="1"] .note-box.compacte:not(.texte-libre)')];const n=l.find(x=>/Petit/.test(x.innerText));n.querySelector('.nb-bar').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:0,clientY:0}));window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));return 1})()`);
await b.dormir(400);
const coin = await b.ev(`(()=>{const n=[...document.querySelectorAll('.note-box.compacte')].find(x=>/Petit/.test(x.innerText));const c=n.querySelector('.nb-corner');if(!c)return null;const r=c.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
if (coin) {
  await b.glisser(coin, [coin[0] - 300, coin[1] - 200], 10); await b.dormir(400);
  const mini = await b.ev(`(()=>{const n=[...document.querySelectorAll('.note-box.compacte')].find(x=>/Petit/.test(x.innerText));const r=n.getBoundingClientRect();return {w:+r.width.toFixed(1),h:+r.height.toFixed(1)}})()`);
  b.ok(mini.w >= 47.5 && mini.h >= 23.5, 'redimension vers le tout petit : jamais sous 48 × 24 px (à 100 %)', JSON.stringify(mini));
  b.ok(mini.h <= 60, '… et pas d’espace vide inutile (le texte « Petit » tient)', JSON.stringify(mini));
} else b.ok(false, 'poignée de redimension introuvable');
// --- anciennes boîtes : rendu inchangé (même taille qu'au chargement, hors glisser)
const anc = (await boites()).filter((x) => /Ancienne|Anc\. 3/.test(x.t));
const ref = avantPx.filter((x) => /Ancienne|Anc\. 3/.test(x.t));
b.ok(anc.length === 3 && anc.every((a) => { const r = ref.find((q) => q.t === a.t); return r && Math.abs(r.w - a.w) < 0.6 && Math.abs(r.h - a.h) < 0.6 && !a.compacte; }), 'anciennes boîtes : même taille, pas de gabarit compact', JSON.stringify(anc.map((a) => [a.t.slice(0, 8), a.w, a.h])));
await b.capture('boites' + (ipad ? '-ipad' : ''), { x: Math.round(P.x), y: Math.round(P.y), width: Math.round(Math.min(P.w, ipad ? 1000 : 1100)), height: Math.round(Math.min(P.h, 560)) });
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
process.exit(0);
