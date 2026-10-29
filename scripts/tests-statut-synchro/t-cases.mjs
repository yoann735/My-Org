// Banc « cases à cocher » (29/10, docs/compte-rendu-statut-synchro.md) : composant unique mesuré dans le vrai rendu.
// Usage : node t-cases.mjs [tel]   (même installation que cap-cases.mjs)
import { appareil } from '../tests-synchro-affichage/commun.mjs';
const tel = process.argv[2] === 'tel';
const b = await appareil(tel);
await b.send('Page.navigate', { url: 'http://localhost:5300/' }); await b.dormir(3000);
await b.ouvrirApp({ recharger: false });
await b.attendrePhase(['ajour', 'incomplet', 'echec', 'horsligne'], 30000);
const natives = () => b.ev(`[...document.querySelectorAll('input[type=checkbox]')].filter((i) => !i.classList.contains('mr-case-input') && i.getAttribute('role') !== 'switch').length`);
const mesure = (sel) => b.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const s = getComputedStyle(e); const r = e.getBoundingClientRect();
  return { w: r.width, h: r.height, rayon: s.borderTopLeftRadius, bord: s.borderTopWidth, fond: s.backgroundColor }; })()`);

if (!tel) await b.reviser();
await b.attendre(`!!document.querySelector('[data-sfa="lanceur"] .mr-case')`, 15000);
b.v(await natives() === 0, 'séance : aucune case native visible');
const m = await mesure('[data-sfa="lanceur"] .mr-case-boite');
b.v(m && m.w === 18 && m.h === 18 && m.rayon === '5px', 'boîte 18 × 18 px, coins 5 px', JSON.stringify(m));
const accent = await b.ev(`getComputedStyle(document.querySelector('[data-sfa="lanceur"] .mr-case-boite.coche')).backgroundColor === getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || getComputedStyle(document.querySelector('[data-sfa="lanceur"] .mr-case-boite.coche')).backgroundColor`);
b.v(accent !== 'rgba(0, 0, 0, 0)' && accent !== 'rgb(0, 0, 0)', 'cochée : fond couleur d’accent', String(accent));
b.v(await b.ev(`getComputedStyle(document.querySelector('.mr-case-coche')).transitionDuration`) === '0.12s', 'coche animée en 120 ms');
// clic → état visuel et input natif concordent
await b.toucher(`document.querySelector('[data-sfa="lanceur"] [data-cat="nouvelles"] .mr-case')`, 400);
const apres = await b.ev(`(() => { const c = document.querySelector('[data-sfa="lanceur"] [data-cat="nouvelles"]'); return { input: c.querySelector('input').checked, boite: c.querySelector('.mr-case-boite').classList.contains('coche') }; })()`);
b.v(apres.input === apres.boite, 'clic : la boîte suit la case native', JSON.stringify(apres));
await b.toucher(`document.querySelector('[data-sfa="lanceur"] [data-cat="nouvelles"] .mr-case')`, 400); // remis comme avant

// Apprentissage : partiel, focus clavier, zone de clic
await b.apprentissage(); await b.deplier(); await b.dormir(300);
b.v(await natives() === 0, 'Apprentissage : aucune case native visible');
await b.cocherCarte('c1-retard1'); await b.dormir(250);
b.v(await b.ev(`(() => { const c = document.querySelector('.alib2-cours[data-cours="f1"] [data-case-groupe] '); return c.querySelector('input').indeterminate && c.querySelector('.mr-case-boite').classList.contains('partiel'); })()`), 'cours à moitié coché : tiret (état partiel)');
await b.cocherCarte('c1-retard1'); await b.dormir(250);
if (!tel) {
  // Tab depuis l'élément qui précède la case (la case de groupe du cours) → la 1ʳᵉ case de carte reçoit le focus clavier
  await b.ev(`(() => { document.querySelector('.alib2-cours[data-cours="f1"] [data-case-groupe] input').focus(); return 1; })()`);
  let essais = 0;
  while (essais++ < 6 && !(await b.ev(`!!document.activeElement && document.activeElement.closest('.alib2-carte') && document.activeElement.classList.contains('mr-case-input')`))) {
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await b.dormir(120);
  }
  await b.dormir(200);
  const f = await b.ev(`(() => { const a = document.activeElement; if (!a || !a.classList.contains('mr-case-input')) return { ok: false, el: a && a.className }; return { ok: true, ombre: getComputedStyle(a.nextElementSibling).boxShadow }; })()`);
  b.v(f.ok && f.ombre && f.ombre !== 'none', 'focus clavier (Tab) visible sur la case', JSON.stringify(f));
  // survol : le filet prend l'accent
  const r = await b.rect(`document.querySelector('.alib2-carte[data-carte="c1-rev1"] .alib2-case')`);
  const avant = await b.ev(`getComputedStyle(document.querySelector('.alib2-carte[data-carte="c1-rev1"] .mr-case-boite')).borderTopColor`);
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.cx, y: r.cy }); await b.dormir(250);
  const pendant = await b.ev(`getComputedStyle(document.querySelector('.alib2-carte[data-carte="c1-rev1"] .mr-case-boite')).borderTopColor`);
  b.v(avant !== pendant, 'survol : filet de la case à l’accent', avant + ' → ' + pendant);
} else {
  const z = await b.ev(`[...document.querySelectorAll('.alib2-case')].slice(0, 6).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })`);
  b.v(z.every(([w, h]) => w >= 40 && h >= 40), 'téléphone : zone de clic ≥ 40 × 40 px', JSON.stringify(z));
  await b.toucher(`document.querySelector('[data-puce="filtres"]')`, 700);
  const o = await b.ev(`[...document.querySelectorAll('.alib2-feuille .mr-case')].map((e) => Math.round(e.getBoundingClientRect().height))`);
  b.v(o.length > 0 && o.every((h) => h >= 40), 'téléphone : options du filtre ≥ 40 px de haut', JSON.stringify(o));
  await b.toucher(`document.querySelector('.alib2-fpied .btn')`, 500);
}
b.fin();
