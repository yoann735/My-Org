// Tablette (A, 820×1180, tactile — le panneau n'existe pas sous 760 px) : liste avec icônes toujours visibles au doigt,
// formulaire replié / déplié, Agrandir au doigt (retourner, champ Muscle révélé, ← →), étoile depuis la liste.
import { banc } from './commun.mjs';
process.env.CDP_PORT = '9335';
let echecs = 0;
const A = await banc();
const v = (c, m, d = '') => { if (!A.ok(c, m, d)) echecs++; };
await A.ouvrirCours(undefined, { recharger: true });
await A.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: true });
await A.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await A.dormir(1500);
const tap = async (js, att = 600) => { await A.ev(`(()=>{const e=${js};e&&e.scrollIntoView({block:'center'});return 1})()`); await A.dormir(200); const r = await A.rect(js); if (!r) throw new Error('introuvable ' + js);
  await A.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.cx, y: r.cy }] }); await A.dormir(60); await A.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await A.dormir(att); };
// panneau replié à cette largeur : on l'ouvre
if (!(await A.ev(`!!document.querySelector('.pis:not(.collapsed) .pm-exos')`))) {
  const b = await A.ev(`(()=>{const x=[...document.querySelectorAll('button')].find(b=>/Panneau/i.test(b.title||b.getAttribute('aria-label')||b.textContent));return x?1:0})()`);
  if (b) await tap(`[...document.querySelectorAll('button')].find(b=>/Panneau/i.test(b.title||b.getAttribute('aria-label')||b.textContent))`, 900);
}
await A.ongletFlashcards();
v(await A.ev(`!!document.querySelector('.fcl-nouvelle')`), 'tablette : ligne « + Nouvelle carte » en tête de la liste');
const op = await A.ev(`getComputedStyle(document.querySelector('.pis-item[data-item="aa003"] .fcl-actions')).opacity`);
v(op === '1', `au doigt : icônes des cartes toujours visibles (opacité ${op})`);
await tap(`document.querySelector('.fcl-nouvelle')`, 800);
v(await A.ev(`!!document.querySelector('.fc-carte')`), 'tablette : formulaire déplié au doigt');
await tap(`[...document.querySelectorAll('.fc-carte .imp-actions button')].find(b=>/Annuler/.test(b.textContent))`, 700);
v(await A.ev(`!!document.querySelector('.fcl-nouvelle') && !document.querySelector('.fc-carte')`), 'tablette : replié par « Annuler »');
await tap(`document.querySelector('.pis-item[data-item="aa003"] [data-act="agrandir"]')`, 900);
v(await A.ev(`(document.querySelector('.va .sfc-carte')||{dataset:{}}).dataset.carte`) === 'aa003', 'tablette : Agrandir au doigt (carte Muscle)');
await tap(`document.querySelector('.va .sfc-carte')`, 700);
const m0 = await A.ev(`document.querySelectorAll('.va .mu-masque').length`);
await tap(`document.querySelector('.va .mu-masque')`, 600);
v((await A.ev(`document.querySelectorAll('.va .mu-masque').length`)) === m0 - 1, `tablette : champ Muscle révélé au doigt (${m0} → ${m0 - 1})`);
await A.capture('aap-agrandie-tablette');
await tap(`document.querySelector('.va [data-va="suiv"]')`, 600);
v(await A.ev(`document.querySelector('.va .sfc-carte').dataset.carte`) === 'aa004', 'tablette : › carte suivante');
await tap(`document.querySelector('.va .aap-bt')`, 700);
const t4 = (await A.carteBase('aa004')).aApprendre;
await tap(`document.querySelector('.va .aap-bt')`, 700);
v(t4 !== (await A.carteBase('aa004')).aApprendre, 'tablette : étoile de la vue agrandie (posée puis retirée)');
await tap(`document.querySelector('.va-fond')`, 500); // le fond, hors de la fenêtre : coin haut gauche
const fond = await A.ev(`!!document.querySelector('.va')`);
if (fond) { await A.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 10, y: 10 }] }); await A.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await A.dormir(500); }
v(!(await A.ev(`!!document.querySelector('.va')`)), 'tablette : toucher dehors ferme');
await A.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await A.send('Emulation.setTouchEmulationEnabled', { enabled: false });
const errs = A.erreurs.filter((e) => !/validateDOMNesting/.test(e));
v(errs.length === 0, 'aucune erreur console', errs.join(' | ').slice(0, 300));
console.log(echecs ? `❌ ${echecs} échec(s)` : '✅ tout est vert');
process.exit(0);
