// MÊME MOTEUR PARTOUT : crayon (aperçu direct, trait Catmull-Rom), boîte « un mot » + flèche (la boîte reste), gomme de
// zone — sur un PDF, sur la FICHE d'une fiche jumelle, sur un DOCUMENT éditable ; en ordinateur et en tablette 820 px
// (tactile : on crée au stylet, le doigt fait défiler). Cours des bancs fiche jumelle (tests-fiche-jumelle/tout.sh).
import { banc, TITRE } from './commun.mjs';
const b = await banc(1440, 900);
await b.ev(`localStorage.setItem('medrevise.modeGomme','zone');localStorage.setItem('medrevise.fondBoite','plein');1`);
const CONTEXTES = [
  { nom: 'PDF', titre: TITRE },
  { nom: 'fiche jumelle (vue Fiche)', titre: 'Physiologie rénale (jumelle)', vue: 'Fiche' },
  { nom: 'document éditable', titre: 'Myologie (document)' },
];
const souris = (type, [x, y], extra = {}) => b.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
for (const ctx of CONTEXTES) for (const tab of [false, true]) {
  const nom = `${ctx.nom}${tab ? ' · tablette 820 px' : ''}`;
  await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  // annotations du cours de test retirées (base locale du banc) : les clics tombent sur une page vide
  await b.S(`const f=(await S.getAll('fiches')).find(x=>x.titre===${JSON.stringify(ctx.titre)});if(!f)return 0;for(const a of await S.getAll('annotations'))if(a.ficheId===f.id||String(a.ficheId).startsWith(f.id+'::'))await S.remove('annotations',a.id);return 1`);
  if (!(await b.ouvrir(ctx.titre, { recharger: true }))) { b.ok(false, `${nom} : cours introuvable`); continue; }
  if (ctx.vue) { await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText===${JSON.stringify(ctx.vue)})`, false), { att: 2000 }); }
  if (tab) { await b.c.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 2, mobile: true }); await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await b.dormir(1800); }
  await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(900);
  const t0 = new Date().toISOString();
  const nouveaux = async () => (await b.S(`return (await S.getAll('annotations')).filter(a=>a.createdAt>${JSON.stringify(t0)})`));
  const vue = await b.rect(`document.querySelector('.pdfr-scroll')`);
  const P = await b.rect(`[...document.querySelectorAll('.pdfr-page')].find(p=>{const r=p.getBoundingClientRect();return r.height>200&&r.bottom>${vue.y}+300})`);
  const x0 = Math.max(P.x, vue.x) + 60, y0 = Math.max(P.y, vue.y) + 260;
  const ex = tab ? { pointerType: 'pen' } : {};
  // crayon : aperçu peint dès le 1er point, trait posé en Catmull-Rom
  await b.outil('Crayon');
  const pts = Array.from({ length: 30 }, (_, i) => [x0 + i * 6, y0 + 10 * Math.sin(i / 2)]);
  await souris('mouseMoved', pts[0], ex); await souris('mousePressed', pts[0], { ...ex, buttons: 1 });
  const peint = await b.ev(`(()=>{const c=[...document.querySelectorAll('.pdfr-apercu-trait')].find(c=>c.width>2);return !!c})()`);
  for (const p of pts.slice(1)) { await souris('mouseMoved', p, { ...ex, buttons: 1 }); await b.dormir(8); }
  await souris('mouseReleased', pts[pts.length - 1], ex); await b.dormir(600);
  let n = await nouveaux();
  const tr = n.find((a) => a.kind === 'trait');
  b.ok(peint && tr && tr.rendu === 'cr' && tr.opacite === 1 && [0.0024, 0.0042, 0.0075].includes(tr.epaisseur), `${nom} : crayon — aperçu dès le 1er point, trait Catmull-Rom, épaisseur prédéfinie`, JSON.stringify(tr && { rendu: tr.rendu, ep: tr.epaisseur }));
  // boîte « un mot » + flèche
  await b.outil('Boîte');
  const pb = [x0 + 40, y0 + 120];
  await souris('mouseMoved', pb, ex); await souris('mousePressed', pb, { ...ex, buttons: 1 }); await souris('mouseReleased', pb, ex); await b.dormir(600);
  await b.attendreFocus();
  await b.ecrire('Mot'); await b.dormir(200);
  await b.dormir(300);
  const pf = await b.pos(`document.querySelector('.mini-barre [data-option="fleche"]')`, false);
  if (pf) { if (tab) await b.tape(pf); else await b.clic(pf, { att: 350 }); }
  const vise = await b.ev(`!!document.querySelector('.pdfr-ancrage')`);
  const cible = [x0 + 260, y0 + 200];
  if (tab) await b.tape(cible); else await b.clic(cible, { att: 500 });
  n = await nouveaux();
  const bt = n.find((a) => a.kind === 'libre');
  const active = await b.ev(`!!document.querySelector('.note-box.mot.active')`);
  b.ok(bt && bt.gabarit === 'mot' && (bt.fleches || []).length === 1 && active, `${nom} : boîte « un mot » + flèche — la boîte reste affichée et sélectionnée`, JSON.stringify(bt && { gabarit: bt.gabarit, fleches: (bt.fleches || []).length, active }));
  await b.T.Escape(); await b.T.Escape(); await b.dormir(300);
  // gomme de zone : coupe le trait
  await b.outil('Gomme');
  const m = pts[15];
  await souris('mouseMoved', [m[0], m[1] - 20], ex); await souris('mousePressed', [m[0], m[1] - 20], { ...ex, buttons: 1 });
  for (let k = 1; k <= 8; k++) { await souris('mouseMoved', [m[0], m[1] - 20 + k * 5], { ...ex, buttons: 1 }); await b.dormir(10); }
  await souris('mouseReleased', [m[0], m[1] + 20], ex); await b.dormir(600);
  n = await nouveaux();
  const morceaux = n.filter((a) => a.kind === 'trait');
  b.ok(morceaux.length === 2 && !morceaux.some((a) => a.id === tr.id), `${nom} : gomme de zone — le trait est coupé en 2`, String(morceaux.length));
  await b.outil('Sélection');
  // nettoyage : retire ce que ce passage a créé (base locale du banc)
  await b.S(`for(const a of await S.getAll('annotations'))if(a.createdAt>${JSON.stringify(t0)})await S.remove('annotations',a.id);return 1`);
}
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: false });
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
