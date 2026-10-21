// Après t-bureau.mjs : ROUVRIR la carte Muscle créée (panneau › Éditer) et la RÉVISER (séance du jour) —
// images aux bonnes lignes. Puis non-régression du formulaire (bouton « Image » classique toujours là).
// Usage : node t-relecture.mjs <dossier-captures>
import { appareil, ok, bilan } from './outils.mjs';

const captures = process.argv[2] || '/tmp/collage';
const A = await appareil(9335, { captures });
const NOM = 'm. Test collage';
// 1. rouvrir : l'élément de la liste du panneau → Éditer
const item = `[...document.querySelectorAll('.pis-item')].find((x) => x.textContent.includes(${JSON.stringify(NOM)}))`;
await A.ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.offsetParent && /Fermer|Terminer|Annuler/.test(x.textContent) && x.closest('.pis-scroll, .pm-exos')); b && b.click(); return 1; })()`);
await A.dormir(600);
const trouve = await A.ev(`!!(${item})`);
ok(trouve, 'carte « m. Test collage » dans la liste du cours');
await A.ev(`(${item}).scrollIntoView({ block: 'center' }), true`); await A.dormir(300);
await A.survoler(await A.pos(item));
await A.clic(await A.pos(`(${item}).querySelector('button[title="Éditer"]')`));
await A.dormir(1500);
const rouvert = await A.ev(`(() => { const f = [...document.querySelectorAll('.mu-form')].find((x) => x.getClientRects().length && x.querySelector('.mu-nom-champ').value === ${JSON.stringify(NOM)}); if (!f) return null;
  return Object.fromEntries([...f.querySelectorAll('[data-zone-image]')].map((z) => [z.getAttribute('data-zone-image'), !!z.querySelector('.zim-vignette img')])); })()`);
ok(rouvert && rouvert.insertion && rouvert.origine && rouvert.trajet && rouvert.generale && !rouvert.action && !rouvert.innervation, 'rouverte : images dans Insertion, Origine, Trajet et image générale ; Action / Innervation sans image', JSON.stringify(rouvert));
const boutonClassique = await A.ev(`!![...document.querySelectorAll('.mu-form .zim-ajout')].find((b) => b.getClientRects().length)`);
ok(boutonClassique, 'non-régression : le bouton « Image » (parcourir) est toujours là');
await A.capture('06-carte-rouverte');
await A.ev(`(() => { const b = [...document.querySelectorAll('.mu-form .imp-actions button')].find((x) => x.getClientRects().length && /Annuler/.test(x.textContent)); b && b.click(); return 1; })()`);
await A.dormir(600);

// 2. réviser : séance du jour jusqu'à la carte, verso → images aux bonnes lignes
const id = await A.ev(`(async () => ((await ${A.st}.getAll('questions')).find((q) => q.recto === ${JSON.stringify(NOM)}) || {}).id)()`);
await A.ev(`(() => { const el = [...document.querySelectorAll('.sb-item')].find((b) => (b.getAttribute('title') || '').startsWith('Réviser')); el && el.click(); return true; })()`);
await A.attendre(`!!document.querySelector('.sfa-btn')`);
await A.clic(await A.pos(`document.querySelector('.sfa-btn')`));
await A.attendre(`!!document.querySelector('.sfc-carte')`);
let vu = false;
for (let i = 0; i < 160; i++) {
  const cur = await A.ev(`(document.querySelector('.sfc-carte') || {}).dataset?.carte || null`);
  if (!cur) break;
  if (cur === id) { vu = true; break; }
  await A.ev(`(() => { const b = [...document.querySelectorAll('.sfc-bas button')].find((x) => /Voir la réponse/.test(x.textContent)); b && b.click(); return 1; })()`); await A.dormir(120);
  await A.ev(`(document.querySelectorAll('.sfc-notes.quatre button')[2] || { click() {} }).click(), true`); await A.dormir(260);
}
ok(vu, 'carte trouvée dans la séance du jour');
if (vu) {
  await A.ev(`(() => { const b = [...document.querySelectorAll('.sfc-bas button')].find((x) => /Voir la réponse/.test(x.textContent)); b && b.click(); return 1; })()`); await A.dormir(1500);
  await A.ev(`(() => { const b = [...document.querySelectorAll('.sfc-carte button, .sfc-carte span[role=button]')].find((x) => /Tout révéler/.test(x.textContent)); b && b.click(); return 1; })()`); await A.dormir(1200);
  const rev = await A.ev(`(() => { const lignes = [...document.querySelectorAll('.sfc-carte tr, .sfc-carte .mu-ligne, .sfc-carte [class*=mu-tab] > *')];
    const avecImage = lignes.filter((l) => l.querySelector('.zim-vignette img')).map((l) => l.textContent.replace(/\\s+/g, ' ').trim().slice(0, 22));
    return { avecImage, generale: !!document.querySelector('.sfc-carte .mu-image-generale .zim-vignette img, .sfc-carte .mu-generale img') }; })()`);
  ok(rev.avecImage.length >= 3 && rev.avecImage.some((t) => /^Origine/i.test(t)) && rev.avecImage.some((t) => /^Insertion/i.test(t)) && rev.avecImage.some((t) => /^Direction|^Trajet/i.test(t)), 'révision : images sur les lignes Origine, Direction des fibres / trajet, Insertion', JSON.stringify(rev));
  await A.capture('07-revision-images');
  await A.ev(`document.querySelector('.sfc-quitter').click(), true`); await A.dormir(800);
}
ok(A.erreurs.length === 0, 'aucune erreur JavaScript', A.erreurs.join(' | ').slice(0, 300));
A.fermer();
process.exit(bilan() ? 1 : 0);
