// Finitions (11/10) — export spécial IA : seule l'étiquette de repère (#…) existe, aucun badge
// « IA » / « orig. » (ni dans l'image de page, ni dans la couche texte). Profil de TEST (A, 9335).
import { appareil, ok, bilan } from '../tests-collage/outils.mjs';
import { ouvrirMedRevise, ouvrirFiche } from '../tests-apprentissage-libre/commun.mjs';
const A = await appareil(9335, { captures: process.argv[2] || '/tmp/fin' });
await A.send('Page.reload', { ignoreCache: true }); await A.dormir(3000);
await ouvrirMedRevise(A); await ouvrirFiche(A, 'Myologie'); await A.dormir(1200);
await A.ev(`(() => { window.__tel = []; const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__tel.push({ nom: this.download, href: this.href }); return; } return o.call(this); }; return 1; })()`);
await A.clic(await A.pos(`document.querySelector('.mf-bouton')`)); await A.dormir(400);
await A.clic(await A.pos(`[...document.querySelectorAll('.mf-item')].find((b) => b.innerText.startsWith('Export spécial IA'))`)); await A.dormir(700);
await A.clic(await A.pos(`[...document.querySelectorAll('.eia-panneau button')].find((b) => b.innerText.startsWith('Télécharger (PDF + JSON)'))`));
for (let i = 0; i < 200 && (await A.ev(`window.__tel.length`)) < 3; i++) await A.dormir(150);
const r = await A.ev(`(async () => {
  const t = window.__tel.find((x) => /\\.pdf$/.test(x.nom)); const buf = await (await fetch(t.href)).arrayBuffer();
  const url = performance.getEntriesByType('resource').map((x) => x.name).find((n) => n.includes('/src/medrevise/pdf/pdfjsSetup.js')) || '/src/medrevise/pdf/pdfjsSetup.js';
  const P = await import(url); const doc = await P.openPdf(new Uint8Array(buf));
  const p = await doc.getPage(1); const mots = (await p.getTextContent()).items.map((i) => i.str).filter((s) => s.trim());
  try { doc.loadingTask.destroy(); } catch (e) {}
  return { nom: t.nom, mots, refs: mots.filter((s) => /^#\\w+ — /.test(s)).length, badge: mots.some((s) => /^\\s*(IA|orig\\.)\\s*$/.test(s)) };
})()`);
ok(r.refs >= 4 && !r.badge, `export spécial IA : ${r.refs} repères « #ref — texte », aucun badge`, `${r.nom} — ${r.mots.slice(0, 3).join(' | ')}`);
ok(A.erreurs.length === 0, 'aucune exception', A.erreurs.join(' | '));
A.fermer();
process.exit(bilan() ? 1 : 0);
