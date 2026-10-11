// Zones image v2 (11/10) — CAPTURES AVANT / APRÈS, mêmes gestes : formulaire Muscle (zone vide survolée,
// image collée dans une ligne, image générale), carte standard avec image, tablette.
// Profil de TEST (copie restaurée) + faux Supabase local : jamais le vrai cloud. Rien n'est enregistré.
// Usage : node captures.mjs <dossier-captures> <préfixe : avant | apres>
import { appareil } from '../tests-collage/outils.mjs';
import { ouvrirFormulaire } from '../tests-collage/ouvrir.mjs';

const captures = process.argv[2] || '/tmp/zones';
const pre = process.argv[3] || 'avant';
let A = await appareil(9335, { captures });
await ouvrirFormulaire(A);
const F = `[...document.querySelectorAll('.mu-form')].find((f) => f.getClientRects().length)`;
const coupe = async (nom, sel, marge = 24) => {
  const r = await A.ev(`(() => { const e = ${sel}; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`);
  await A.dormir(250);
  const s = await A.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r[0] - marge), y: Math.max(0, r[1] - marge), width: r[2] + 2 * marge, height: r[3] + 2 * marge, scale: 2 } });
  const { writeFileSync, mkdirSync } = await import('node:fs'); mkdirSync(captures, { recursive: true });
  writeFileSync(`${captures}/${pre}-${nom}.png`, Buffer.from(s.data, 'base64'));
};
// 1. zone vide survolée (ligne Insertion)
await A.survoler(await A.pos(`(${F}).querySelector('[data-zone-image="insertion"] [data-zone-visuel]')`));
await A.dormir(300);
await coupe('01-zone-vide-survol', `(${F}).querySelector('.mu-saisie')`);
// 2. image collée dans Insertion (survol + ⌘V), OCR terminé
await A.pressePapierImage(420, 160, '#1f618d', 'Grand trochanter|face latérale');
await A.cmdV(); await A.dormir(6000);
await A.survoler([5, 5]);
await coupe('02-zone-avec-image', `(${F}).querySelector('[data-zone-image="insertion"]')`);
// 3. image générale (survol + ⌘V)
await A.survoler(await A.pos(`(${F}).querySelector('[data-zone-image="generale"]')`));
await A.pressePapierImage(360, 240, '#7d3c98', 'Vue postérieure');
await A.cmdV(); await A.dormir(5000);
await A.survoler([5, 5]);
await coupe('03-image-generale', `(${F}).querySelector('[data-zone-image="generale"]')`);
await coupe('04-formulaire-muscle', `(${F}).querySelector('.mu-saisie')`, 12);
// 4. carte standard : image (survol de la zone Image + ⌘V)
await A.clic(await A.pos(`[...document.querySelectorAll('button')].find((b) => b.offsetParent && /Carte standard/.test(b.textContent))`)); await A.dormir(700);
const S = `[...document.querySelectorAll('.fci-champ')].find((f) => f.getClientRects().length)`;
await A.survoler(await A.pos(S));
await A.pressePapierImage(320, 160, '#117a65', 'Carte standard');
await A.cmdV(); await A.dormir(5000);
await A.survoler([5, 5]);
await coupe('05-standard-image', S);
A.fermer();
// 5. tablette (820 px tactile) : formulaire Muscle avec image
A = await appareil(9335, { captures, largeur: 820, hauteur: 1180, tactile: true });
await A.dormir(1500);
await A.ev(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.offsetParent && /Tableau muscle/.test(b.textContent)); b && b.click(); return 1; })()`);
await A.dormir(800);
const F2 = `[...document.querySelectorAll('.mu-form')].find((f) => f.getClientRects().length)`;
if (await A.ev(`!!(${F2})`)) await coupe('06-tablette', `(${F2}).querySelector('.mu-saisie')`, 12);
A.fermer();
console.log('captures', pre, '→', captures);
process.exit(0);
