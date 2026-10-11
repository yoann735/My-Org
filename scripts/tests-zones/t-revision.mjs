// Zones image v2 (11/10) — RÉVISION et autres écrans, après t-zones.mjs (carte « m. Test zones v2 » du profil de TEST) :
// 1. bureau : séance du jour → verso, vignettes des lignes à la même taille (≤ 96 px), cliquables (visionneuse),
//    la carte ne se retourne pas ; image générale ;
// 2. tablette 820 px tactile : formulaire Muscle, icônes d'action 36 px, bouton « Coller », rien ne déborde ;
// 3. téléphone 390 px : séance du jour → verso, vignettes ≤ 72 px cliquables, rien ne déborde.
// Usage : node t-revision.mjs <dossier-captures>
import { writeFileSync } from 'node:fs';
import { appareil, ok, bilan } from '../tests-collage/outils.mjs';
import { ouvrirFormulaire } from '../tests-collage/ouvrir.mjs';

const captures = process.argv[2] || '/tmp/zones';
const NOM = 'm. Test zones v2';
const coupe = async (A, nom, sel, marge = 10) => {
  const r = await A.ev(`(() => { const e = ${sel}; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`);
  await A.dormir(250);
  const s = await A.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r[0] - marge), y: Math.max(0, r[1] - marge), width: r[2] + 2 * marge, height: r[3] + 2 * marge, scale: 2 } });
  writeFileSync(`${captures}/${nom}.png`, Buffer.from(s.data, 'base64'));
};
const remettreDuJour = (A) => A.ev(`(async () => { const s = ${A.st}; const q = (await s.getAll('questions')).find((x) => x.recto === ${JSON.stringify(NOM)}); const j = new Date().toLocaleDateString('fr-CA'); await s.put('questions', { ...q, dueDate: j }); return q.id; })()`);
// séance du jour jusqu'à la carte (les cartes précédentes du profil de TEST sont passées « Correct »)
async function jusquALaCarte(A, id, geste) {
  await A.attendre(`!!document.querySelector('.sfa-btn')`, 30000);
  await geste(await A.pos(`document.querySelector('.sfa-btn')`));
  await A.attendre(`!!document.querySelector('.sfc-carte')`);
  for (let i = 0; i < 300; i++) {
    const cur = await A.ev(`(document.querySelector('.sfc-carte') || {}).dataset?.carte || null`);
    if (!cur) return false;
    if (cur === id) return true;
    await A.ev(`(() => { const b = [...document.querySelectorAll('.sfc-bas button')].find((x) => /Voir la réponse/.test(x.textContent)); b && b.click(); return 1; })()`); await A.dormir(100);
    await A.ev(`(document.querySelectorAll('.sfc-notes.quatre button')[2] || { click() {} }).click(), true`); await A.dormir(220);
  }
  return false;
}
async function verso(A, geste, maxH) {
  await A.ev(`(() => { const b = [...document.querySelectorAll('.sfc-bas button')].find((x) => /Voir la réponse/.test(x.textContent)); b && b.click(); return 1; })()`); await A.dormir(1500);
  await A.ev(`(() => { const b = [...document.querySelectorAll('.sfc-carte span[role=button], .sfc-carte button')].find((x) => /Tout révéler/.test(x.textContent)); b && b.click(); return 1; })()`); await A.dormir(1500);
  const r = await A.ev(`(() => { const c = document.querySelector('.sfc-carte');
    const lignes = [...c.querySelectorAll('.mu-ligne')].filter((l) => l.querySelector('.mu-ligne-image .zim-vignette img'));
    const g = c.querySelector('.mu-image-generale .zim-vignette');
    return { lignes: lignes.map((l) => l.querySelector('.mu-etiquette').textContent.trim() + ':' + Math.round(l.querySelector('.zim-vignette').getBoundingClientRect().height)),
      generale: g ? Math.round(g.getBoundingClientRect().height) : null, deborde: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      etiquetteEnHaut: lignes.every((l) => Math.abs(l.querySelector('.mu-etiquette').getBoundingClientRect().top - l.querySelector('.mu-contenu').getBoundingClientRect().top) < 6) }; })()`);
  const tailles = r.lignes.map((x) => +x.split(':').pop());
  ok(r.lignes.length === 2 && tailles.every((h) => h > 0 && h <= maxH) && r.generale && !r.deborde && r.etiquetteEnHaut, `verso : vignettes Insertion / Origine ≤ ${maxH} px, image générale, étiquettes alignées en haut, rien ne déborde`, JSON.stringify(r));
  await geste(await A.pos(`document.querySelector('.sfc-carte .mu-ligne-image .zim-vignette')`));
  await A.dormir(400);
  const lb = await A.ev(`({ ouverte: !!document.querySelector('.mui-visionneuse img'), toujoursVerso: !!document.querySelector('.sfc-carte .mu-ligne-image') })`);
  ok(lb.ouverte && lb.toujoursVerso, 'vignette du verso cliquable → aperçu plein écran (la carte reste au verso)', JSON.stringify(lb));
  return lb;
}

// 1. BUREAU
let A = await appareil(9335, { captures });
await A.send('Page.reload', { ignoreCache: true }); await A.dormir(3000);
const ouvert = `!!(document.querySelector('[data-app="medrevise"]') || document.querySelector('.sfa'))`;
if (!(await A.ev(ouvert))) await A.clic(await A.pos(`[...document.querySelectorAll('.hub-card')].find((c) => c.textContent.includes('MedRevise'))`));
await A.attendre(ouvert, 30000); await A.dormir(5000);
const id = await remettreDuJour(A);
await A.ev(`(() => { const el = [...document.querySelectorAll('.sb-item')].find((b) => (b.getAttribute('title') || '').startsWith('Réviser')); el && el.click(); return true; })()`);
ok(await jusquALaCarte(A, id, A.clic), 'bureau : carte « m. Test zones v2 » dans la séance du jour');
await verso(A, A.clic, 96);
await A.capture('apres-revision-visionneuse');
await A.touche('Escape', { code: 'Escape', vk: 27 }); await A.dormir(300);
await coupe(A, 'apres-revision-verso', `document.querySelector('.sfc-carte')`);
await A.ev(`(document.querySelector('.sfc-quitter') || { click() {} }).click(), true`); await A.dormir(800);
ok(A.erreurs.length === 0, 'bureau : aucune erreur JavaScript', A.erreurs.join(' | ').slice(0, 300));
A.fermer();

// 2. TABLETTE : formulaire Muscle, cibles tactiles
A = await appareil(9335, { captures });
await ouvrirFormulaire(A);
A.fermer();
A = await appareil(9335, { captures, largeur: 820, hauteur: 1180, tactile: true });
await A.dormir(1500);
const F = `[...document.querySelectorAll('.mu-form')].find((f) => f.getClientRects().length)`;
await A.pressePapierImage(380, 150, '#af601a', 'TABLETTE|insertion');
await A.toucher(await A.pos(`(${F}).querySelector('[data-zone-image="insertion"] .zi-coller')`));
await A.dormir(2500);
const tab = await A.ev(`(() => { const f = ${F}; const z = f.querySelector('[data-zone-image="insertion"]'); return { img: !!z.querySelector('.zim-vignette img'), acts: [...z.querySelectorAll('.zim-act')].map((b) => Math.round(b.getBoundingClientRect().width)), coller: [...f.querySelectorAll('.zi-coller')].filter((b) => b.getClientRects().length).length,
  deborde: f.scrollWidth > f.clientWidth + 1 || document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, survol: !!f.querySelector('.zi-survol') }; })()`);
ok(tab.img && tab.acts.length >= 2 && tab.acts.every((w) => w === 36) && tab.coller >= 6 && !tab.deborde && !tab.survol, 'tablette : « Coller » → vignette ; icônes d’action 36 px ; un « Coller » par zone ; rien ne déborde', JSON.stringify(tab));
await coupe(A, 'apres-tablette', `(${F}).querySelector('.mu-saisie')`);
await A.ev(`(() => { const b = [...(${F}).querySelectorAll('.imp-actions button')].find((x) => /Annuler/.test(x.textContent)); b && b.click(); return 1; })()`);
A.fermer();

// 3. TÉLÉPHONE : séance du jour, verso
A = await appareil(9335, { captures, largeur: 390, hauteur: 844, tactile: true });
await A.send('Page.reload'); await A.dormir(3000);
const ouvertM = `!!document.querySelector('.sfa, .mrm-app')`;
if (!(await A.ev(ouvertM))) await A.toucher(await A.pos(`[...document.querySelectorAll('.hub-card')].find((c) => c.textContent.includes('MedRevise'))`));
await A.attendre(ouvertM, 30000); await A.dormir(6000);
await remettreDuJour(A);
await A.send('Page.reload'); await A.dormir(3000); await A.attendre(ouvertM, 30000); await A.dormir(5000);
ok(await jusquALaCarte(A, id, A.toucher), 'téléphone : carte dans la séance du jour');
await verso(A, A.toucher, 72);
await A.touche('Escape', { code: 'Escape', vk: 27 }); await A.dormir(300);
await coupe(A, 'apres-mobile-verso', `document.querySelector('.sfc-carte')`, 4);
await A.ev(`(document.querySelector('.sfc-quitter') || { click() {} }).click(), true`); await A.dormir(500);
ok(A.erreurs.length === 0, 'téléphone : aucune erreur JavaScript', A.erreurs.join(' | ').slice(0, 300));
await A.send('Emulation.setTouchEmulationEnabled', { enabled: false });
await A.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
A.fermer();
process.exit(bilan() ? 1 : 0);
