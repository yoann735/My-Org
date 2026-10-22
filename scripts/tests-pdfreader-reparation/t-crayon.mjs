// Crayon refait simple : rangée (couleur, Dessin/Surligneur, 3 épaisseurs, ligne droite), aperçu EN DIRECT dès le
// premier point et à chaque événement, 3 lignes d'écriture + un schéma, lissage, épaisseur constante à 3 zooms,
// surligneur (40 %, multiply, ligne droite), gomme Zone / Trait entier, Annuler / Rétablir.
// Usage : node t-crayon.mjs [ipad]   (iPad : au doigt avec « Dessiner au doigt », puis au stylet)
import { banc } from './commun.mjs';
const ipad = process.argv[2] === 'ipad';
const b = await banc(1440, 900, { tactile: ipad });
await b.preparer([]);
await b.ev(`localStorage.removeItem('medrevise.dessinDoigt');localStorage.removeItem('medrevise.px1000.crayon');localStorage.removeItem('medrevise.modeGomme');localStorage.setItem('medrevise.surligneurDroit','1');1`);
await b.ouvrirCours({ ipad });
await b.outil('Crayon'); await b.dormir(500);
const rangee = await b.ev(`[...document.querySelectorAll('.pdfr-contexte .pdfr-rangee-contenu button, .pdfr-contexte .pdfr-rangee-contenu label')].filter(e=>!e.closest('.sc-couleurs')).map(e=>e.innerText.trim())`);
const attendu = ['Dessin', 'Surligneur', '3', ...(ipad ? ['Dessiner au doigt : non'] : [])]; // (v1.1) le sélecteur commun d'épaisseur (3 px)
b.ok(JSON.stringify(rangee) === JSON.stringify(attendu), 'rangée du crayon : couleur, Dessin / Surligneur, le sélecteur d’épaisseur — rien d’autre', JSON.stringify(rangee));
const boutonRangee = async (js) => { await b.ev(`(()=>{const x=${js};x&&x.scrollIntoView({block:'nearest',inline:'nearest'});return 1})()`); await b.dormir(ipad ? 800 : 100); const p = await b.pos(js, false); if (ipad) await b.tape(p); else await b.clic(p, { att: 300 }); };
if (ipad) {
  await boutonRangee(`[...document.querySelectorAll('.pdfr-contexte button')].find(x=>x.innerText.startsWith('Dessiner au doigt'))`);
  b.ok(await b.ev(`localStorage.getItem('medrevise.dessinDoigt')==='1'`), 'iPad : « Dessiner au doigt » activé (réglage d’appareil d’avant le 20/10)');
}
const P = await b.page(1);
const pt = (fx, fy) => [P.x + P.w * fx, P.y + P.h * fy];
// un geste : souris (ou doigt / stylet) ; après CHAQUE événement on lit le pixel du canvas d'aperçu sous le pointeur
// au doigt, Chrome livre les touchmove calés sur l'image (rAF) : on lit le pixel après l'image suivante
const pixel = (x, y) => b.ev(`(async()=>{${ipad ? 'await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));' : ''}const c=document.querySelector('.pdfr-page[data-cle="1"] .pdfr-apercu-trait');if(!c||c.width<2)return 0;const r=c.getBoundingClientRect(),d=c.width/r.width;let m=0;const g=c.getContext('2d').getImageData(Math.round((${x}-r.left)*d)-2,Math.round((${y}-r.top)*d)-2,5,5).data;for(let i=3;i<g.length;i+=4)m=Math.max(m,g[i]);return m})()`);
let sousPointeur = 0, mesures = 0, premierPoint = 0;
const tracer = async (pts, type = ipad ? 'doigt' : 'souris') => {
  const ev = async (phase, [x, y]) => {
    if (type === 'doigt') await b.c.send('Input.dispatchTouchEvent', { type: { d: 'touchStart', m: 'touchMove', u: 'touchEnd' }[phase], touchPoints: phase === 'u' ? [] : [{ x, y, id: 1, radiusX: 4, radiusY: 4 }] });
    else await b.c.send('Input.dispatchMouseEvent', { type: { d: 'mousePressed', m: 'mouseMoved', u: 'mouseReleased' }[phase], x, y, button: 'left', buttons: phase === 'u' ? 0 : 1, clickCount: 1, ...(type === 'stylet' ? { pointerType: 'pen', force: 0.5 } : {}) });
  };
  if (type !== 'doigt') await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[0][0], y: pts[0][1], ...(type === 'stylet' ? { pointerType: 'pen' } : {}) });
  await ev('d', pts[0]);
  if ((await pixel(...pts[0])) > 0) premierPoint++;
  for (let i = 1; i < pts.length; i++) {
    await ev('m', pts[i]);
    if (i % 4 === 0) { mesures++; if ((await pixel(...pts[i])) > 0) sousPointeur++; }
    await b.dormir(8);
  }
  await ev('u', pts[pts.length - 1]); await b.dormir(250);
};
const ecriture = (fx, fy) => Array.from({ length: 60 }, (_, i) => pt(fx + i * 0.005, fy + 0.012 * Math.sin(i * 0.9) + (i % 2 ? 0.0015 : -0.0015)));
for (let l = 0; l < 3; l++) await tracer(ecriture(0.08, 0.62 + l * 0.05));
// schéma : un cercle, deux traits, une flèche
await tracer(Array.from({ length: 50 }, (_, i) => { const a = (2 * Math.PI * i) / 48; return pt(0.62 + 0.07 * Math.cos(a), 0.7 + 0.05 * Math.sin(a)); }));
await tracer(Array.from({ length: 20 }, (_, i) => pt(0.69 + i * 0.008, 0.7)));
await tracer(Array.from({ length: 20 }, (_, i) => pt(0.62, 0.75 + i * 0.006)));
await b.dormir(500);
let rec = (await b.enBase()).filter((a) => a.kind === 'trait');
b.ok(premierPoint === 6, 'aperçu visible dès le premier point (avant tout déplacement)', `${premierPoint}/6`);
b.ok(mesures > 0 && sousPointeur === mesures, 'trait en direct : le canvas est peint sous le pointeur à chaque mesure, dans l’événement', `${sousPointeur}/${mesures}`);
b.ok(rec.length === 6 && rec.every((t) => t.rendu === 'cr' && t.mode === 'dessin' && t.ep1000 === 3 && t.opacite === 1), '6 traits vectoriels (3 lignes + schéma), Catmull-Rom, épaisseur 3 px (page de 1000 px)', JSON.stringify(rec.map((t) => [t.rendu, t.ep1000, t.points.length])));
// lissage : le zigzag de ±0,15 % est atténué (rugosité des points enregistrés < brut)
const rug = (p) => p.slice(2).reduce((s, q, i) => s + Math.abs(q[1] - 2 * p[i + 1][1] + p[i][1]), 0);
const brut = ecriture(0.08, 0.62).map(([x, y]) => [(x - P.x) / P.w, (y - P.y) / P.h]);
const ligne1 = rec.find((t) => Math.abs(t.points[0][1] - 0.62) < 0.01);
b.ok(ligne1 && rug(ligne1.points) < rug(brut) * 0.75, 'lissage fixe (moyenne sur 3 points) : tremblement atténué', ligne1 && `${rug(brut).toFixed(4)} → ${rug(ligne1.points).toFixed(4)}`);
await b.capture('crayon' + (ipad ? '-ipad' : ''), { x: Math.round(P.x), y: Math.round(P.y + P.h * 0.55), width: Math.round(P.w), height: Math.round(Math.min(P.h * 0.32, 900 - P.y - P.h * 0.55)) });
// aperçu en cours de geste (capture au milieu d'un trait)
{
  const pts = ecriture(0.08, 0.8);
  await b.c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0][0], y: pts[0][1], button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i < 35; i++) { await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[i][0], y: pts[i][1], button: 'left', buttons: 1 }); await b.dormir(8); }
  await b.capture('crayon-direct' + (ipad ? '-ipad' : ''), { x: Math.round(pts[0][0] - 20), y: Math.round(pts[0][1] - 50), width: 360, height: 100 });
  await b.c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pts[34][0], y: pts[34][1], button: 'left', buttons: 0, clickCount: 1 }); await b.dormir(300);
}
// épaisseur constante en unités PDF à 3 zooms : largeur affichée / hauteur de page = epaisseur
const largeurs = [];
for (const z of [0.7, 1, 1.8]) {
  await b.ev(`window.__mrZoom(${z});1`); await b.dormir(1300);
  largeurs.push(await b.ev(`(()=>{const p=document.querySelector('.pdfr-page[data-cle="1"]');const t=p.querySelector('.pdfr-inklayer:not(.surligneur) path');return +(parseFloat(t.getAttribute('stroke-width'))/p.getBoundingClientRect().height).toFixed(5)})()`));
}
b.ok(largeurs.every((v) => Math.abs(v - 0.0042) < 0.0001), 'épaisseur constante en unités de page à 70 %, 100 % et 180 %', JSON.stringify(largeurs));
await b.ev(`window.__mrZoom(1);1`); await b.dormir(1300); await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;document.querySelector('.pdfr-scroll').scrollLeft=0;1`); await b.dormir(700);
// épaisseur 5 px (préréglage du sélecteur commun, v1.1)
await boutonRangee(`document.querySelector('.pdfr-contexte .ct-barre [data-option="epaisseur"]')`);
{ const p = await b.pos(`document.querySelector('.ct-pop .ct-preset[data-px="5"]')`, false); if (ipad) await b.tape(p); else await b.clic(p, { att: 300 }); }
await tracer(Array.from({ length: 20 }, (_, i) => pt(0.3 + i * 0.01, 0.9)));
rec = (await b.enBase()).filter((a) => a.kind === 'trait');
b.ok(rec.some((t) => t.ep1000 === 5), 'épaisseur 5 px appliquée au trait suivant');
// surligneur à main levée : ligne droite, 40 %, multiply
await boutonRangee(`document.querySelector('.pdfr-contexte [data-mode="surligneur"]')`);
const rs = await b.ev(`[...document.querySelectorAll('.pdfr-contexte .pdfr-rangee-contenu button')].filter(e=>!e.closest('.sc-couleurs')).map(e=>e.innerText.trim())`);
b.ok(rs.includes('Tracer en ligne droite : oui'), 'surligneur : « Tracer en ligne droite » présent (activé)', JSON.stringify(rs));
await tracer(Array.from({ length: 25 }, (_, i) => pt(0.07 + i * 0.012, 0.24 + (i % 3) * 0.001)));
rec = (await b.enBase()).filter((a) => a.kind === 'trait' && a.mode === 'surligneur');
const s0 = rec[0];
const fusion = await b.ev(`getComputedStyle(document.querySelector('.pdfr-page[data-cle="1"] .pdfr-inklayer.surligneur')).mixBlendMode`);
b.ok(s0 && s0.points.length === 2 && s0.rendu === 'droit' && s0.opacite === 0.4 && Math.abs(s0.points[0][1] - s0.points[1][1]) < 1e-9 && fusion === 'multiply', 'surligneur : même moteur, ligne droite horizontale, 40 %, multiply', JSON.stringify({ p: s0 && s0.points, op: s0 && s0.opacite, fusion }));
// gomme : zone (défaut) coupe un trait en deux, trait entier l'efface
await b.outil('Gomme'); await b.dormir(300);
const rg = await b.ev(`[...document.querySelectorAll('.pdfr-contexte [data-mode-gomme]')].map(e=>e.innerText.trim()+(e.classList.contains('actif')?'*':''))`);
b.ok(JSON.stringify(rg) === '["Zone*","Trait entier"]', 'gomme : Zone (défaut) et Trait entier', JSON.stringify(rg));
const nAvant = (await b.enBase()).filter((a) => a.kind === 'trait').length;
const cible = (await b.enBase()).find((a) => a.kind === 'trait' && a.ep1000 === 5);
const milieu = pt(cible.points[Math.floor(cible.points.length / 2)][0], cible.points[Math.floor(cible.points.length / 2)][1]);
await tracer([[milieu[0], milieu[1] - 15], [milieu[0], milieu[1]], [milieu[0], milieu[1] + 15]]);
let apres = (await b.enBase()).filter((a) => a.kind === 'trait');
const morceaux = apres.filter((a) => a.ep1000 === 5);
b.ok(apres.length === nAvant + 1 && morceaux.length === 2 && morceaux.every((m) => m.rendu === 'cr' && m.couleur === cible.couleur), 'gomme Zone : le trait est coupé en 2 morceaux (même style)', `${nAvant} → ${apres.length}`);
await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', modifiers: 4, windowsVirtualKeyCode: 90 }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 4, windowsVirtualKeyCode: 90 }); await b.dormir(600);
apres = (await b.enBase()).filter((a) => a.kind === 'trait');
b.ok(apres.length === nAvant && apres.some((a) => a.id === cible.id), 'Annuler : le trait gommé revient entier (une seule entrée)');
await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', modifiers: 12, windowsVirtualKeyCode: 90 }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 12, windowsVirtualKeyCode: 90 }); await b.dormir(600);
b.ok((await b.enBase()).filter((a) => a.kind === 'trait').length === nAvant + 1, 'Rétablir : de nouveau 2 morceaux');
await boutonRangee(`document.querySelector('.pdfr-contexte [data-mode-gomme="trait"]')`);
const l2 = (await b.enBase()).find((a) => a.kind === 'trait' && Math.abs(a.points[0][1] - 0.67) < 0.01);
const q = pt(l2.points[10][0], l2.points[10][1]);
await tracer([[q[0] - 3, q[1]], [q[0], q[1]], [q[0] + 3, q[1]]]);
b.ok(!(await b.enBase()).some((a) => a.id === l2.id) && (await b.enBase()).filter((a) => a.kind === 'trait').length === nAvant, 'gomme Trait entier : la 2ᵉ ligne d’écriture s’efface en entier');
if (ipad) {
  // stylet : il dessine même sans « Dessiner au doigt »
  await b.outil('Crayon'); await b.dormir(300);
  await boutonRangee(`document.querySelector('.pdfr-contexte [data-mode="dessin"]')`);
  const n0 = (await b.enBase()).filter((a) => a.kind === 'trait').length;
  await tracer(ecriture(0.4, 0.5), 'stylet');
  b.ok((await b.enBase()).filter((a) => a.kind === 'trait').length === n0 + 1, 'Apple Pencil (stylet simulé) : un trait');
}
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
