// Finitions (11/10) — TABLETTE et TÉLÉPHONE (A, 9335, émulation tactile). Prérequis : t-bureau.mjs.
// Tablette 820×1180 puis 768×1024 (shell bureau, lecteur PDF) : badge au toucher, barre des boîtes à 36 px,
// toujours dans l'écran (boîte au bord gauche / droit), disparition au toucher ailleurs.
// Téléphone 390×844 (shell mobile, sans lecteur PDF) : accueil sans entrée retirée, ancienne adresse redirigée.
// Usage : node t-tactile.mjs <dossier-captures>
import { appareil, ok, bilan } from '../tests-collage/outils.mjs';

const captures = process.argv[2] || '/tmp/fin';
const ouvrir = async (A) => {
  if (!(await A.ev(`!!document.querySelector('[data-app="medrevise"]')`))) await A.toucher(await A.pos(`[...document.querySelectorAll('.hub-card')].find((c) => c.textContent.includes('MedRevise'))`));
  await A.attendre(`!!document.querySelector('[data-app="medrevise"]')`, 30000); await A.dormir(2500);
};
for (const [L, H] of [[820, 1180], [768, 1024]]) {
  const A = await appareil(9335, { captures, largeur: L, hauteur: H, tactile: true });
  await A.send('Page.navigate', { url: 'http://localhost:5199/medrevise' }); await A.dormir(3500);
  await ouvrir(A);
  // Bibliothèque › cours Myologie
  await A.ev(`(() => { const el = [...document.querySelectorAll('.sb-item, .bn-item')].find((b) => /Biblio/.test(b.title || b.textContent)); el && el.click(); return 1; })()`); await A.dormir(1500);
  // tablette : l'arbre est replié par défaut → vue « Liste »
  await A.ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Liste'); b && b.click(); return 1; })()`); await A.dormir(700);
  await A.toucher(await A.pos(`[...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent.trim() === 'Myologie — membre supérieur' && e.offsetParent).pop()`)); await A.dormir(3500);
  await A.ev(`(() => { const s = document.querySelector('.pdfr-scroll'); s && (s.scrollTop = 0); return 1; })()`); await A.dormir(500);
  const nb = await A.ev(`document.querySelectorAll('.note-box').length`);
  // badge au toucher
  const badge = () => A.ev(`(() => { const n = [...document.querySelectorAll('.note-box')].find((x) => /flexion du coude|biceps fléchit/.test(x.innerText)); return n.querySelector('.nb-version').innerText; })()`);
  const b0 = await badge();
  await A.toucher(await A.pos(`[...document.querySelectorAll('.note-box')].find((x) => /flexion du coude|biceps fléchit/.test(x.innerText)).querySelector('.nb-version')`)); await A.dormir(500);
  const b1 = await badge();
  await A.toucher(await A.pos(`[...document.querySelectorAll('.note-box')].find((x) => /flexion du coude|biceps fléchit/.test(x.innerText)).querySelector('.nb-version')`)); await A.dormir(500);
  ok(nb === 4 && b0 !== b1 && (await badge()) === b0, `${L} px : toucher le badge bascule la version (${b0} → ${b1} → ${b0})`);
  // barre : boîte au bord droit, puis au bord gauche
  const mesures = [];
  for (const txt of ['Triceps', 'Biceps brachial']) {
    await A.toucher(await A.pos(`[...document.querySelectorAll('.note-box')].find((x) => x.innerText.includes(${JSON.stringify(txt)})).querySelector('.nb-bar')`)); await A.dormir(500);
    mesures.push(await A.ev(`(() => { const b = document.querySelector('.nb-barre:not(.sortie)'); if (!b) return null; const r = b.getBoundingClientRect(); const z = document.querySelector('.pdfr-scroll').getBoundingClientRect();
      return { txt: ${JSON.stringify(txt)}, icones: [...b.querySelectorAll('button')].map((x) => Math.round(x.getBoundingClientRect().width)), dansEcran: r.left >= 0 && r.right <= innerWidth, dansZone: r.left >= z.left - 1 && r.right <= z.right + 1, h: Math.round(r.height) }; })()`));
    if (txt === 'Triceps') await A.capture(`apres-tablette-${L}-barre`);
  }
  ok(mesures.every((m) => m && m.icones.length === 7 && m.icones.every((w) => w === 36) && m.dansEcran && m.dansZone), `${L} px : barre à 36 px par icône, dans l’écran et dans la zone de lecture (boîte au bord droit et au bord gauche)`, JSON.stringify(mesures));
  await A.toucher(await A.ev(`(() => { const r = document.querySelector('.pdfr-page').getBoundingClientRect(); return [r.left + r.width * 0.5, r.top + Math.min(r.height * 0.9, innerHeight - r.top - 40)]; })()`)); await A.dormir(400);
  ok(!(await A.ev(`!!document.querySelector('.nb-barre:not(.sortie)')`)), `${L} px : toucher ailleurs sur la page → la barre disparaît`);
  ok(A.erreurs.length === 0, `${L} px : aucune exception`, A.erreurs.join(' | ').slice(0, 300));
  A.fermer();
}
// téléphone
const T = await appareil(9335, { captures, largeur: 390, hauteur: 844, tactile: true });
await T.send('Page.navigate', { url: 'http://localhost:5199/medrevise' }); await T.dormir(3500);
await T.attendre(`!!document.querySelector('.mrm-app')`, 30000); await T.dormir(2500);
const accueil = await T.ev(`document.querySelector('.mrm-app').innerText`);
ok(!/Prise de notes|Apprentissage \(exos\)|Prompts/.test(accueil) && /Apprentissage/.test(accueil), 'téléphone : accueil sans entrée retirée, « Apprentissage » présent');
await T.send('Page.navigate', { url: 'http://localhost:5199/medrevise/notes' }); await T.dormir(3500);
await T.attendre(`!!document.querySelector('.mrm-app')`, 30000); await T.dormir(800);
const avis = await T.ev(`({ avis: (document.querySelector('.avis-retire') || {}).innerText || '', adresse: location.pathname, deborde: document.documentElement.scrollWidth > innerWidth + 1, r: (() => { const e = document.querySelector('.avis-retire'); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; })() })`);
await T.capture('apres-mobile-ancienne-adresse');
ok(/Réglages → Archives/.test(avis.avis) && avis.adresse === '/medrevise' && !avis.deborde && avis.r && avis.r[0] >= 0 && avis.r[1] <= 390, 'téléphone : ancienne adresse /medrevise/notes → accueil + message discret dans l’écran', JSON.stringify(avis));
ok(T.erreurs.length === 0, 'téléphone : aucune exception', T.erreurs.join(' | ').slice(0, 300));
await T.send('Emulation.setTouchEmulationEnabled', { enabled: false });
await T.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
T.fermer();
process.exit(bilan() ? 1 : 0);
