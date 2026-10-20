// (20/10 soir) Crayon v4 : écriture de 3 lignes et un schéma, aperçu sans latence, stabilisation, maintenir pour
// redresser (ligne, cercle, rectangle, triangle, flèche), surligneur en ligne droite, gomme de trait, griffonner
// pour effacer, lasso (déplacer, recolorer, supprimer, Annuler), épaisseur constante à 3 zooms, 3 épaisseurs.
// Cours « Rein v3 », base LOCALE.  Usage : node t-crayon.mjs [ipad]
import { banc } from './commun.mjs';
const ipad = process.argv[2] === 'ipad';
const b = await banc(1440, 900, { tactile: ipad });
await b.S(`for(const a of await S.getAll('annotations'))if(a.ficheId==='f-v3-rein')await S.remove('annotations',a.id);
  for(const r of await S.getAll('reading_position'))if(String(r.id).startsWith('rp:f-v3-rein'))await S.remove('reading_position',r.id);
  localStorage.removeItem('medrevise.stabilisation');localStorage.removeItem('medrevise.surligneurDroit');localStorage.removeItem('medrevise.griffonner');return 1`);
await b.biblio({ recharger: true });
await b.ouvrir('Rein v3'); await b.dormir(1500);
if (ipad) { await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true }); await b.dormir(1500); }
await b.ev(`window.__mrZoom(1);1`); await b.dormir(1000);
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(800);
const P = await b.rect(`document.querySelector('.pdfr-page[data-cle="1"]')`);
const pt = (fx, fy) => [P.x + P.w * fx, P.y + P.h * fy];
const traits = () => b.S(`return (await S.getAll('annotations')).filter(a=>a.ficheId==='f-v3-rein'&&a.kind==='trait').map(a=>({id:a.id,n:a.points.length,rendu:a.rendu||null,forme:a.formeReconnue||null,mode:a.mode,ep:a.epaisseur,couleur:a.couleur,points:a.points}))`);
const type = ipad ? 'pen' : 'mouse';
const appuyer = (p) => b.c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p[0], y: p[1], button: 'left', buttons: 1, clickCount: 1, pointerType: type, force: 0.5 });
const bouger = (p) => b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1], button: 'left', buttons: 1, pointerType: type, force: 0.5 });
const lacher = (p) => b.c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p[0], y: p[1], button: 'left', buttons: 0, clickCount: 1, pointerType: type });
const trace = async (pts, { tenir = 0, pause = 8 } = {}) => { await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[0][0], y: pts[0][1], pointerType: type, buttons: 0 }); await appuyer(pts[0]); for (const p of pts.slice(1)) { await bouger(p); await b.dormir(pause); } if (tenir) await b.dormir(tenir); await lacher(pts[pts.length - 1]); await b.dormir(450); };
const viser = async (sel) => { await b.ev(`(()=>{const x=${sel};x&&x.scrollIntoView({block:'nearest',inline:'nearest'});return 1})()`); await b.dormir(700); return b.pos(sel, false); };
const mode = async (m) => { await b.ev(`(()=>{const x=document.querySelector('.pdfr-contexte [data-mode="${m}"]');x&&x.scrollIntoView({block:'nearest',inline:'nearest'});return 1})()`); await b.dormir(ipad ? 700 : 150); await b.clic(await b.pos(`document.querySelector('.pdfr-contexte [data-mode="${m}"]')`, false), { att: 300 }); };
await b.outil('Crayon');
// --- 1. écrire 3 lignes (écriture cursive simulée) + aperçu synchrone
const ligneEcrite = (y0) => Array.from({ length: 70 }, (_, i) => pt(0.08 + i * 0.006, y0 + 0.012 * Math.sin(i / 1.6) + 0.006 * Math.sin(i / 0.7)));
{
  const pts = ligneEcrite(0.15);
  await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[0][0], y: pts[0][1], pointerType: type, buttons: 0 }); await appuyer(pts[0]);
  for (const p of pts.slice(1, 10)) await bouger(p);
  const px = await b.ev(`(()=>{const c=[...document.querySelectorAll('canvas.pdfr-apercu-trait')].find(c=>c.width>1);if(!c)return 0;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n})()`);
  b.ok(px > 30, 'aperçu en direct sur canvas, dès l’événement (aucune latence)', `${px} px`);
  for (const p of pts.slice(10)) { await bouger(p); await b.dormir(8); }
  await lacher(pts[pts.length - 1]); await b.dormir(450);
}
await trace(ligneEcrite(0.22)); await trace(ligneEcrite(0.29));
// schéma : une boucle libre et un trait de liaison
await trace(Array.from({ length: 50 }, (_, i) => pt(0.62 + 0.06 * Math.cos(i / 6) + 0.01 * Math.sin(i), 0.2 + 0.05 * Math.sin(i / 4))));
let T = await traits();
b.ok(T.length === 4 && T.every((t) => t.rendu === 'cr' && t.n > 10), '3 lignes écrites + un schéma : traits vectoriels (points), rendu en courbes Catmull-Rom', JSON.stringify(T.map((t) => [t.n, t.rendu])));
const dTrait = await b.ev(`document.querySelector('.pdfr-page[data-cle="1"] .pdfr-inklayer:not(.surligneur) path').getAttribute('d')`);
b.ok(/ C/.test(dTrait) && (await b.ev(`document.querySelector('.pdfr-page[data-cle="1"] .pdfr-inklayer:not(.surligneur) path').getAttribute('stroke-linecap')`)) === 'round', 'rendu : courbes de Bézier, extrémités arrondies', dTrait.slice(0, 60));
// --- 2. stabilisation : même tracé tremblé à 0 % puis à 80 %
const tremble = (y0) => Array.from({ length: 60 }, (_, i) => pt(0.1 + i * 0.007, y0 + 0.006 * Math.sin(i * 2.7) + 0.004 * Math.cos(i * 4.1)));
const rugosite = (pts) => { let a = 0, L = 0; for (let i = 2; i < pts.length; i++) { const u = [pts[i - 1][0] - pts[i - 2][0], pts[i - 1][1] - pts[i - 2][1]], v = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]; a += Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])); L += Math.hypot(...v); } return a / L; };
const stab = async (v) => { await b.ev(`(()=>{const i=document.querySelector('.ptb-stabilisation input');i.scrollIntoView({inline:'nearest'});const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'${v}');i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`); await b.dormir(200); };
await stab(0); await trace(tremble(0.38));
await stab(80); await trace(tremble(0.44));
T = await traits();
const [r0, r80] = T.slice(-2).map((t) => rugosite(t.points));
b.ok(r80 < r0 * 0.6, 'stabilisation 80 % : trait nettement plus lisse qu’à 0 % (même tracé tremblé)', `rugosité ${r0.toFixed(1)} → ${r80.toFixed(1)}`);
await stab(30);
b.ok(await b.ev(`localStorage.getItem('medrevise.stabilisation')`) === '0.3', 'stabilisation mémorisée (défaut 30 %)');
// --- 3. maintenir pour redresser
const formes = {
  ligne: Array.from({ length: 30 }, (_, i) => pt(0.1 + i * 0.01, 0.55 + 0.004 * Math.sin(i * 3))),
  cercle: Array.from({ length: 50 }, (_, i) => pt(0.5 + 0.05 * Math.cos((2 * Math.PI * i) / 48), 0.6 + 0.08 * Math.sin((2 * Math.PI * i) / 48))),
  rectangle: [...Array.from({ length: 12 }, (_, i) => pt(0.62 + i * 0.01, 0.52)), ...Array.from({ length: 8 }, (_, i) => pt(0.74, 0.52 + i * 0.015)), ...Array.from({ length: 12 }, (_, i) => pt(0.74 - i * 0.01, 0.64)), ...Array.from({ length: 9 }, (_, i) => pt(0.62, 0.64 - i * 0.015))],
  triangle: [...Array.from({ length: 10 }, (_, i) => pt(0.2 + i * 0.006, 0.85 - i * 0.015)), ...Array.from({ length: 10 }, (_, i) => pt(0.26 + i * 0.006, 0.7 + i * 0.015)), ...Array.from({ length: 13 }, (_, i) => pt(0.32 - i * 0.0093, 0.85))],
  fleche: [...Array.from({ length: 25 }, (_, i) => pt(0.4 + i * 0.01, 0.8)), ...Array.from({ length: 5 }, (_, i) => pt(0.64 - i * 0.008, 0.8 - i * 0.008)), ...Array.from({ length: 5 }, (_, i) => pt(0.6 + i * 0.008, 0.76 + i * 0.008)), ...Array.from({ length: 5 }, (_, i) => pt(0.64 - i * 0.008, 0.8 + i * 0.008))],
};
for (const [nom, pts] of Object.entries(formes)) {
  await trace(pts, { tenir: 650 });
  const t = (await traits()).slice(-1)[0];
  b.ok(t.forme === nom && (nom === 'cercle' ? t.rendu === 'cr' : t.rendu === 'droit'), `maintenir à la fin du trait : ${nom} redressé(e)`, `${t.forme} · ${t.rendu} · ${t.n} points`);
}
b.ok(await b.ev(`!!document.querySelector('.ptb-outil.actif[title^="Crayon"], .tab-outil.actif[aria-label="Crayon"]')`), 'l’outil reste le crayon');
await b.capture('crayon-formes' + (ipad ? '-ipad' : ''), { x: Math.round(P.x), y: Math.round(P.y), width: Math.round(Math.min(P.w, 1000)), height: Math.round(Math.min(P.h, 640)) });
// --- 4. surligneur en ligne droite (ON par défaut), sous le texte
await mode('surligneur');
const sp = await b.rect(`[...document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-textlayer span')].find(s=>s.textContent.includes('Capsule'))`);
await trace(Array.from({ length: 30 }, (_, i) => [sp.x + i * (sp.w / 30), sp.cy + 3 * Math.sin(i / 2)]));
let s1 = (await traits()).slice(-1)[0];
b.ok(s1.mode === 'surligneur' && s1.rendu === 'droit' && s1.n === 2 && Math.abs(s1.points[0][1] - s1.points[1][1]) < 1e-6, 'surligneur : ligne droite (2 points, horizontale)', JSON.stringify(s1.points));
b.ok((await b.ev(`getComputedStyle(document.querySelector('.pdfr-page[data-cle="1"] .pdfr-inklayer.surligneur')).mixBlendMode`)) === 'multiply', 'surligneur sous le texte (fusion « multiply » : le texte reste lisible)');
// --- 5. gomme de trait, depuis le crayon
await mode('gomme');
const n5 = (await traits()).length;
const cibleL = await b.ev(`(()=>{const t=${JSON.stringify((await traits()).find((x) => x.forme === 'ligne').points)};const r=document.querySelector('.pdfr-page[data-cle="1"]').getBoundingClientRect();return [r.x+r.width*(t[0][0]+t[1][0])/2,r.y+r.height*(t[0][1]+t[1][1])/2]})()`);
await trace([cibleL, [cibleL[0] + 2, cibleL[1] + 1]]);
b.ok((await traits()).length === n5 - 1 && !(await traits()).some((x) => x.forme === 'ligne'), 'mode Gomme du crayon : le trait touché est effacé en entier');
// --- 6. griffonner pour effacer (option OFF par défaut)
await mode('dessin');
b.ok(await b.ev(`localStorage.getItem('medrevise.griffonner')`) === null && (await b.ev(`document.querySelector('[data-reglage="griffonner"]').innerText`)).includes('non'), '« Griffonner pour effacer » désactivé par défaut');
await b.clic(await viser(`document.querySelector('[data-reglage="griffonner"]')`), { att: 300 });
const tri = (await traits()).find((x) => x.forme === 'triangle');
const centre = await b.ev(`(()=>{const t=${JSON.stringify(tri.points)};const r=document.querySelector('.pdfr-page[data-cle="1"]').getBoundingClientRect();const xs=t.map(p=>p[0]),ys=t.map(p=>p[1]);return [r.x+r.width*(Math.min(...xs)+Math.max(...xs))/2,r.y+r.height*Math.max(...ys)]})()`);
const n6 = (await traits()).length;
await trace(Array.from({ length: 30 }, (_, i) => [centre[0] - 30 + (i % 2 ? 60 : 0), centre[1] - 8 + i * 0.6]), { pause: 4 });
b.ok((await traits()).length === n6 - 1 && !(await traits()).some((x) => x.forme === 'triangle'), 'griffonner sur le triangle : effacé, aucun trait ajouté');
await b.clic(await viser(`document.querySelector('[data-reglage="griffonner"]')`), { att: 300 });
// --- 7. lasso : entourer les 2 premières lignes écrites, déplacer, recolorer, supprimer, Annuler
await mode('lasso');
await trace([pt(0.05, 0.1), pt(0.55, 0.1), pt(0.55, 0.255), pt(0.05, 0.255), pt(0.05, 0.1)], { pause: 30 });
const nSel = await b.ev(`(document.querySelector('.pdfr-lasso-n')||{}).innerText||''`);
b.ok(/^2 traits$/.test(nSel), 'lasso : les 2 lignes entourées sélectionnées', nSel);
const avantPts = (await traits()).filter((t) => t.rendu === 'cr' && t.points.length > 45 && t.points[0][1] < 0.255).map((t) => t.points[0]);
const cadre = await b.rect(`document.querySelector('.pdfr-lasso-sel')`);
await (ipad ? b.doigt([cadre.cx, cadre.cy], [cadre.cx + 80, cadre.cy + 60], 8) : b.glisser([cadre.cx, cadre.cy], [cadre.cx + 80, cadre.cy + 60], 8));
await b.dormir(400);
const apresPts = (await traits()).filter((t) => t.rendu === 'cr' && t.points.length > 45).slice(0, 2).map((t) => t.points[0]);
b.ok(apresPts.length === 2 && apresPts.every((p, i) => p[0] > avantPts[i][0] + 0.04), 'sélection déplacée d’un glisser (points translatés)', JSON.stringify([avantPts[0], apresPts[0]]));
await b.clic(await b.pos(`document.querySelector('.pdfr-lasso-barre .sc-bouton')`, false), { att: 400 });
await b.clic(await b.pos(`document.querySelector('.scw-panneau .scw-cellule[data-valeur="rouge"]')`, false), { att: 500 });
b.ok((await traits()).filter((t) => t.couleur === 'rouge').length === 2, 'sélection recolorée en rouge (2 traits)');
const n7 = (await traits()).length;
await b.clic(await b.pos(`document.querySelector('.pdfr-lasso-barre .nb-act.danger')`, false), { att: 500 });
b.ok((await traits()).length === n7 - 2, 'supprimée d’un clic');
await b.touche('z', { meta: true }); await b.dormir(600);
b.ok((await traits()).length === n7, 'Annuler : les 2 traits reviennent');
// --- 8. épaisseur constante (unités PDF) à 3 zooms ; 3 épaisseurs prédéfinies
await mode('dessin');
for (const [e, v] of [['fin', 0.0024], ['moyen', 0.0042], ['epais', 0.0075]]) {
  await b.clic(await viser(`document.querySelector('.pdfr-contexte [data-epaisseur="${e}"]')`), { att: 200 });
  await trace([pt(0.8, 0.88), pt(0.86, 0.9), pt(0.9, 0.88)]);
  b.ok(Math.abs((await traits()).slice(-1)[0].ep - v) < 1e-6, `épaisseur prédéfinie « ${e} »`, String((await traits()).slice(-1)[0].ep));
}
const ratios = [];
for (const z of [0.7, 1, 1.8]) {
  await b.ev(`window.__mrZoom(${z});1`); await b.dormir(900);
  ratios.push(await b.ev(`(()=>{const p=[...document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-inklayer:not(.surligneur) path')].pop();const pg=document.querySelector('.pdfr-page[data-cle="1"]').getBoundingClientRect();return +(parseFloat(p.getAttribute('stroke-width'))/pg.height).toFixed(5)})()`));
}
b.ok(ratios.every((r) => Math.abs(r - 0.0075) < 1e-4), 'épaisseur constante en unités PDF à 70 %, 100 % et 180 %', ratios.join(' / '));
await b.ev(`window.__mrZoom(1);1`); await b.dormir(600);
await b.outil('Sélection');
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
process.exit(0);
