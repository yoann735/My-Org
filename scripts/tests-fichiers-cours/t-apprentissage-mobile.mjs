// Mode Apprentissage — tablette (au doigt) et téléphone : rangement, notes, note en session. Base LOCALE du banc.
// Préalable : t-apprentissage.mjs (laisse 3 cartes de Psychologie, une note sur « Stade de Piaget »).
import { banc } from '../tests-bibliotheque-fichier/commun.mjs';
const b = await banc(1180, 820, { tactile: true });
await b.c.send('Page.reload', { ignoreCache: true }); await b.dormir(4500);
await b.ev(`document.querySelector('.sb-appr').click(),1`); await b.dormir(900);
b.ok(await b.ev(`document.querySelector('.alib-note-apercu')?.innerText.startsWith('Piaget')`), 'tablette : la note s’affiche sous sa carte');
const c = await b.rect(`document.querySelector('.alib-crayon')`);
b.ok(c.h >= 40, 'tablette : crayon ≥ 40 px au doigt', Math.round(c.h) + ' px');
await b.capture('appr-tablette');
// téléphone : shell mobile
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await b.dormir(1800);
await b.tape(await b.pos(`[...document.querySelectorAll('button, [role=button]')].find(x=>/^Apprentissage/.test(x.innerText.trim())||/Ouvrir/.test(x.innerText)&&x.closest('*')&&x.parentElement.innerText.includes('Apprentissage'))`)); await b.dormir(1000);
b.ok(await b.ev(`!!document.querySelector('.alib-mobile') && [...document.querySelectorAll('.alib-mtitre')].map(x=>x.childNodes[0].textContent.trim()).join('|')==='Psychologie'`), 'téléphone : écran Apprentissage, rangé par matière');
const cr = await b.rect(`[...document.querySelectorAll('.alib-carte')].find(x=>x.innerText.includes('Muscle innervé')).querySelector('.alib-crayon')`);
b.ok(cr.h >= 44, 'téléphone : crayon ≥ 44 px', Math.round(cr.h) + ' px');
await b.tape([cr.cx, cr.cy]); await b.dormir(400);
await b.c.send('Input.insertText', { text: 'Axillaire → deltoïde + petit rond.' }); await b.dormir(1200);
const notes = await b.S(`return JSON.stringify((await S.getOne('learning_set','learning_set')).notes)`);
b.ok(/Axillaire → deltoïde/.test(notes), 'téléphone : note ajoutée au doigt, enregistrée', notes);
await b.capture('appr-telephone');
b.ok(await b.ev(`document.documentElement.scrollWidth<=innerWidth`), 'téléphone : pas de débordement horizontal');
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
process.exit(0);
