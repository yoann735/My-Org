import { banc } from './commun-doc.mjs';
const P = process.argv[2];
const b = await banc(1440, 900);
const c = b.c;
const app = () => b.ev(`document.body.innerText.includes('Choisis ton espace') ? 'hub' : document.body.innerText.includes('PLANNING REPAS') || document.body.innerText.includes('Planning repas') ? 'mealweek' : 'medrevise'`);
if ((await app()) === 'medrevise') { await b.ev(`(()=>{const e=[...document.querySelectorAll('button,a,.sb-item')].find(x=>/changer d.app/i.test(x.title||x.getAttribute('aria-label')||''));e&&e.click();return 1})()`); await b.dormir(1500); }
if ((await app()) === 'hub') { await b.ev(`[...document.querySelectorAll('.hub-card')].find(x=>/MealWeek/i.test(x.innerText))?.click();1`); await b.dormir(2500); }
console.log('app :', await app());
for (const [W, H, nom] of [[1440, 900, 'ordi'], [390, 844, 'tel']]) {
  await c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 760 });
  await b.dormir(1500);
  await b.ev(`window.scrollTo(0,0);document.querySelectorAll('*').forEach(e=>{if(e.scrollTop)e.scrollTop=0});document.activeElement&&document.activeElement.blur&&document.activeElement.blur();1`);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: W - 2, y: H - 2 }); await b.dormir(900);
  await b.capture(`mw-${P}-${nom}`);
  console.log(nom, (await b.ev(`document.body.innerText.slice(0,70).replace(/\\n/g,' · ')`)));
}
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
c.fermer();
