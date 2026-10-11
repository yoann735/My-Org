// Finitions (11/10) — captures AVANT / APRÈS sur le profil de TEST (A, 9335) :
// barre latérale (étendue), boîtes avec badge IA, boîte sélectionnée avec sa barre d'outils.
// Usage : node captures.mjs <dossier> <prefixe avant|apres>
import { writeFileSync, mkdirSync } from 'node:fs';
import { appareil } from '../tests-collage/outils.mjs';
import { ouvrirMedRevise, ouvrirFiche } from '../tests-apprentissage-libre/commun.mjs';
const [dossier = '/tmp/fin', pre = 'avant'] = process.argv.slice(2);
mkdirSync(dossier, { recursive: true });
const A = await appareil(9335, { captures: dossier });
await A.send('Network.enable'); await A.send('Network.setCacheDisabled', { cacheDisabled: true });
await A.send('Page.reload', { ignoreCache: true }); await A.dormir(3000);
await ouvrirMedRevise(A);
const coupe = async (nom, sel, marge = 12) => {
  const r = await A.ev(`(() => { const e = ${sel}; if (!e) return null; let r = e.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) { e.scrollIntoView({ block: 'center' }); r = e.getBoundingClientRect(); } return [r.x, r.y, r.width, r.height]; })()`);
  if (!r) { console.log('introuvable', nom); return; }
  const s = await A.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r[0] - marge), y: Math.max(0, r[1] - marge), width: r[2] + 2 * marge, height: r[3] + 2 * marge, scale: 2 } });
  writeFileSync(`${dossier}/${pre}-${nom}.png`, Buffer.from(s.data, 'base64'));
};
// barre latérale étendue
const etendue = await A.ev(`!!document.querySelector('.sidebar.expanded')`);
if (!etendue) { await A.ev(`document.querySelector('.sb-toggle').click(), 1`); await A.dormir(500); }
await coupe('barre-laterale', `document.querySelector('.sidebar')`, 0);
await A.ev(`document.querySelector('.sb-toggle').click(), 1`); await A.dormir(500);
// boîtes
await ouvrirFiche(A, 'Myologie');
await A.dormir(1500);
await A.ev(`document.querySelector('.note-box').scrollIntoView({ block: 'center' }), 1`); await A.dormir(600);
await coupe('boites', `document.querySelector('.pdfr-page')`, 0);
await A.ev(`document.querySelector('.pdfr-scroll').scrollTop = 0, 1`); await A.dormir(500);
for (const id of ['anPetite', 'anMoyenne']) await coupe('badge-' + id, `[...document.querySelectorAll('.note-box')].find((n) => n.innerText.includes(${JSON.stringify(id === 'anPetite' ? 'Biceps brachial' : 'flexion du coude')}))`, 16);
// sélectionner la boîte moyenne (clic sur son bandeau) → barre d'outils
const p = await A.pos(`[...document.querySelectorAll('.note-box')].find((n) => n.innerText.includes('flexion du coude')).querySelector('.nb-bar')`);
await A.clic(p); await A.dormir(600);
await coupe('barre-boite', `(() => { const a = document.querySelector('.nb-actions'); const n = [...document.querySelectorAll('.note-box')].find((x) => x.classList.contains('active')); if (!a || !n) return a || n; const r1 = a.getBoundingClientRect(), r2 = n.getBoundingClientRect(); const d = document.createElement('div'); d.style.cssText = 'position:fixed;pointer-events:none;left:' + Math.min(r1.left, r2.left) + 'px;top:' + Math.min(r1.top, r2.top) + 'px;width:' + (Math.max(r1.right, r2.right) - Math.min(r1.left, r2.left)) + 'px;height:' + (Math.max(r1.bottom, r2.bottom) - Math.min(r1.top, r2.top)) + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 2000); return d; })()`, 14);
await A.capture(pre + '-lecteur');
console.log('captures', pre, 'erreurs', A.erreurs);
A.fermer();
