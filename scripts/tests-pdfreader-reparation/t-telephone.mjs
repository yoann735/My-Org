// Téléphone 390 × 844 tactile — dessin mobile : le crayon est le même moteur que celui du lecteur
// (lissage sur 3 points, Catmull-Rom, épaisseur constante, sans pression ni réglage « Lissage », 3 épaisseurs).
import { banc } from './commun.mjs';
const b = await banc();
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await b.c.send('Page.reload', { ignoreCache: true }); await b.dormir(5000);
if (await b.ev(`document.body.innerText.includes('Choisis ton espace')`)) { await b.ev(`[...document.querySelectorAll('.hub-card')].find(x=>/MedRevise/i.test(x.innerText))?.click();1`); await b.dormir(2000); }
await b.tape(await b.pos(`[...document.querySelectorAll('.mrm-dessin button')].pop()`)); await b.dormir(1200);
b.ok(await b.ev(`!!document.querySelector('.md-surface')`), 'écran Dessin ouvert');
const n0 = await b.ev(`document.querySelectorAll('.md-surface g[data-id]').length`);
const S = await b.rect(`document.querySelector('.md-surface')`);
const pts = Array.from({ length: 40 }, (_, i) => [S.x + 60 + i * 6, S.y + S.h * 0.4 + 18 * Math.sin(i / 3)]);
const t = (type, p) => b.c.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: p[0], y: p[1], id: 1, radiusX: 4, radiusY: 4 }] });
await t('touchStart', pts[0]);
let apercuCourbe = false;
for (let i = 1; i < pts.length; i++) { await t('touchMove', pts[i]); await b.dormir(12); if (i === 20) apercuCourbe = await b.ev(`(()=>{const p=document.querySelector('.md-surface path[d^="M"]:not([data-id])');return [...document.querySelectorAll('.md-surface path')].some(x=>/^M[\\d.]+ [\\d.]+ C/.test(x.getAttribute('d')||'')&&!x.closest('g[data-id]'))})()`); }
await t('touchEnd', pts[pts.length - 1]); await b.dormir(600);
b.ok(apercuCourbe, 'aperçu en direct : le même chemin Catmull-Rom (courbes C) que le trait posé');
const g = await b.ev(`(()=>{const l=[...document.querySelectorAll('.md-surface g[data-id]')];const x=l[l.length-1].querySelector('path');return {n:l.length,d:(x.getAttribute('d')||'').slice(0,40),fill:x.getAttribute('fill'),sw:x.getAttribute('stroke-width')}})()`);
b.ok(g.n === n0 + 1 && /^M[\d.]+ [\d.]+ C/.test(g.d) && g.fill === 'none' && g.sw === '4', 'trait posé : Catmull-Rom, épaisseur constante (4 px, « moyen »), pas un contour à épaisseur variable', JSON.stringify(g));
const reglages = await b.ev(`document.body.innerText.includes('Lissage')`);
b.ok(!reglages, 'plus de réglage « Lissage »');
const nEp = await b.ev(`document.querySelectorAll('.md-tailles .md-taille').length`);
b.ok(nEp === 3 || nEp === 0, '3 épaisseurs (ou rangée repliée)', String(nEp));
await b.capture('telephone-crayon');
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
// retour au format ordinateur (sinon les bancs suivants démarrent en téléphone)
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }); await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: false });
process.exit(0);
