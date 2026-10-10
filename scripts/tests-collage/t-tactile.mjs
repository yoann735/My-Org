// Collage d'image — TABLETTE TACTILE (820×1180, toucher émulé, pas de survol) : bouton « Coller » de chaque
// zone (navigator.clipboard.read), règle 2 (focus) au clavier externe, refus du navigateur → message clair.
// (Le téléphone n'a pas de formulaire de carte : shell mobile sans lecteur ni panneau.)
// Usage : node t-tactile.mjs <dossier-captures>
import { appareil, ok, bilan } from './outils.mjs';
import { ouvrirFormulaire } from './ouvrir.mjs';

const captures = process.argv[2] || '/tmp/collage';
let A = await appareil(9335, { captures });
ok(await ouvrirFormulaire(A), 'formulaire Muscle ouvert (1 440 px), passage en tablette');
A.fermer();
A = await appareil(9335, { captures, largeur: 820, hauteur: 1180, tactile: true });
await A.dormir(1500);
// en tablette le panneau peut se replier : le rouvrir si besoin
if (!(await A.ev(`!!([...document.querySelectorAll('.mu-form')].find((f) => f.getClientRects().length))`))) {
  const p = await A.pos(`[...document.querySelectorAll('button')].find((b) => b.offsetParent && /Panneau/.test(b.textContent + (b.title || '')))`);
  if (p) await A.toucher(p);
  await A.dormir(1200);
}
const F = `[...document.querySelectorAll('.mu-form')].find((f) => f.getClientRects().length)`;
const media = await A.ev(`({ survol: matchMedia('(hover: hover) and (pointer: fine)').matches, aucunSurvol: matchMedia('(hover: none)').matches, grossier: matchMedia('(pointer: coarse)').matches })`);
const boutons = await A.ev(`[...(${F}).querySelectorAll('.zi-coller')].filter((b) => b.getClientRects().length).length`);
ok(!media.survol && (media.aucunSurvol || media.grossier) && boutons >= 6, `écran tactile : un bouton « Coller » visible par zone (${boutons})`, JSON.stringify(media));

// 1. « Coller » dans la zone Insertion (toucher) → image d'Insertion
await A.pressePapierImage(380, 150, '#af601a', 'TABLETTE|insertion');
await A.toucher(await A.pos(`(${F}).querySelector('[data-zone-image="insertion"] .zi-coller')`));
await A.dormir(1600);
const img = (z) => A.ev(`(() => { const i = (${F}).querySelector('[data-zone-image="${z}"] .mui-vignette img'); return i && i.complete ? i.naturalWidth + 'x' + i.naturalHeight : null; })()`);
ok(await img('insertion') === '380x150', 'tablette : bouton « Coller » de la ligne Insertion → image dans Insertion', await img('insertion'));
const survolTactile = await A.ev(`!!(${F}).querySelector('.zi-survol')`);
ok(!survolTactile, 'aucun contour de survol au doigt');
await A.capture('08-tablette-coller');

// 2. règle 2 au clavier externe : focus dans Action (toucher), ⌘V → image d'Action
await A.toucher(await A.pos(`document.getElementById('mu-action')`));
await A.pressePapierImage(200, 200, '#0e6655', 'CLAVIER|action');
await A.cmdV(); await A.dormir(1400);
ok(await img('action') === '200x200', 'tablette + clavier : focus dans Action, ⌘V → image d’Action (pas de survol)', await img('action'));

// 3. règle 3 : rien de focalisé → image générale
await A.ev(`document.activeElement && document.activeElement.blur(), true`);
await A.pressePapierImage(260, 180, '#5b2c6f', 'GENERALE');
await A.cmdV(); await A.dormir(1400);
ok(await img('generale') === '260x180', 'tablette : aucun champ focalisé, ⌘V → image générale', await img('generale'));

// 4. refus du navigateur → message clair, aucune image
await A.send('Browser.setPermission', { permission: { name: 'clipboard-read' }, setting: 'denied', origin: 'http://localhost:5199' });
await A.toucher(await A.pos(`(${F}).querySelector('[data-zone-image="innervation"] .zi-coller')`));
await A.dormir(1200);
const msg = await A.ev(`((${F}).querySelector('[data-zone-image="innervation"] .zi-coller-erreur') || {}).textContent || ''`);
ok(/refusé/.test(msg) && !(await img('innervation')), 'refus du navigateur : message clair dans la zone, aucune image', msg);
await A.capture('09-tablette-refus');
await A.send('Browser.setPermission', { permission: { name: 'clipboard-read' }, setting: 'granted', origin: 'http://localhost:5199' });

// 5. presse-papiers sans image → message
await A.pressePapierTexte('du texte seulement');
await A.toucher(await A.pos(`(${F}).querySelector('[data-zone-image="innervation"] .zi-coller')`));
await A.dormir(1000);
const msg2 = await A.ev(`((${F}).querySelector('[data-zone-image="innervation"] .zi-coller-erreur') || {}).textContent || ''`);
ok(/ne contient pas d’image/.test(msg2), 'presse-papiers sans image : « ne contient pas d’image »', msg2);

ok(A.erreurs.length === 0, 'aucune erreur JavaScript', A.erreurs.join(' | ').slice(0, 300));
await A.send('Emulation.setTouchEmulationEnabled', { enabled: false });
A.fermer();
process.exit(bilan() ? 1 : 0);
