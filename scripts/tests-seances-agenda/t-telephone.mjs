// 2) TÉLÉPHONE (390×844, tactile) : le téléphone n'a pas de lecteur (révision seulement) — on n'y note pas de début de
//    cours. Les séances liées (écrites ici par l'API de l'app, comme après une synchro) s'affichent sur le créneau de
//    l'agenda (« p. 157–192 · … », « à partir de p. 12 · … ») et dans sa fiche ; pas de bouton « Ouvrir » (inchangé).
//    Créneau supprimé : copie + mention. Créneau non lié : fiche identique à avant.
import { appareil, F, ligne, dormir, LOCAL } from './commun.mjs';
const b = await appareil('tel', { base: LOCAL });
await b.preparer();
const lier = (courseId, page, fin, quand) => b.S(`const T = await __imp('/src/medrevise/lib/seancesAgenda.js'); const E = await __imp('/src/medrevise/lib/emploiDuTemps.js');
  for (let i = 0; i < 40 && !(E.lireEtat().donnees); i++) await new Promise((r) => setTimeout(r, 200));
  const e = E.lireEtat().donnees.events.find((x) => x.title === 'Histologie' && x.start === ${JSON.stringify(quand)});
  const t = await S.put('page_tag', { id: S.genId('pt'), courseId: ${JSON.stringify(courseId)}, document: 'original', kind: 'debut', page: ${page}, pageCle: '${page}', date: e.start.slice(0, 10), transcriptSessionId: null });
  ${fin ? `await S.put('page_tag', { id: S.genId('pt'), courseId: ${JSON.stringify(courseId)}, document: 'original', kind: 'fin', page: ${fin}, pageCle: '${fin}', date: e.start.slice(0, 10), transcriptSessionId: null });` : ''}
  await T.lierSeance(t, e); return 1`);
await lier(F.histo.id, 157, 192, '2026-11-17T09:00:00.000Z');
await lier(F.atlas.id, 12, null, '2026-11-17T09:00:00.000Z');
await lier(F.histo.id, 120, 156, '2026-11-10T09:00:00.000Z');
await b.recharger();
b.ok(await b.accueil(), 'téléphone : agenda « École » de l’accueil');
await dormir(800);
let blocs = await b.blocs();
let h17 = blocs.find((x) => x.titre === 'Histologie' && /17/.test(x.jour));
b.ok(h17 && h17.lignes.length >= 1 && h17.lignes[0] === ligne(157, 192, F.histo.titre), 'vue Jour du 17 : « p. 157–192 · Histologie — tissus » sur le créneau', h17 && h17.lignes.join(' | '));
b.ok(h17 && /p\. 157–192 Histologie — tissus/.test(h17.aria) && /à partir de p\. 12 Atlas/.test(h17.aria), 'les deux séances dans le libellé du bloc (lecteur d’écran)', h17 && h17.aria);
const debord = await b.ev(`(() => { const d = document.scrollingElement; return d.scrollWidth <= innerWidth + 1; })()`);
b.ok(debord, 'aucun débordement horizontal');
await b.ev(`(${b.bloc('Histologie', '17')}).scrollIntoView({ block: 'center' }), 1`); await dormir(400);
await b.capture('agenda-telephone');
await b.ouvrirFicheCours('Histologie', '17');
const fc = await b.ev(`(() => { const f = document.querySelector('[data-fiche-cours]'); return { seances: [...f.querySelectorAll('.edtg-seance-fiche')].map((x) => x.textContent), boutons: f.querySelectorAll('.edt-actions button').length }; })()`);
b.ok(fc.seances.length === 2 && fc.seances.includes('p. 157–192 · Histologie — tissus') && fc.seances.includes('à partir de p. 12 · Atlas d’histologie'), 'fiche du créneau : les deux séances', fc.seances.join(' | '));
b.ok(fc.boutons === 0, 'téléphone sans lecteur : pas de bouton « Ouvrir » (comme avant)');
await b.capture('fiche-cours-telephone');
await b.fermerModale();
await b.ouvrirFicheCours('Chimie', '17');
const fChimie = await b.ev(`(() => { const f = document.querySelector('[data-fiche-cours]'); return { seances: f.querySelectorAll('.edtg-seance-fiche').length, mention: !!f.querySelector('[data-mention]') }; })()`);
b.ok(fChimie.seances === 0 && !fChimie.mention, 'créneau non lié : fiche inchangée');
await b.fermerModale();
// le 10 nov.
for (let i = 0; i < 8 && !(await b.ev(`!!(${b.bloc('Histologie', '10')})`)); i++) await b.precedent();
const h10 = (await b.blocs()).find((x) => x.titre === 'Histologie' && /10/.test(x.jour));
b.ok(h10 && h10.lignes.join() === ligne(120, 156, F.histo.titre), 'le 10 nov. : « p. 120–156 » (semaine distincte)', h10 && h10.lignes.join(' | '));
// créneau supprimé
b.variante = 'supprime';
await b.recharger(); await b.accueil(); await dormir(800);
blocs = await b.blocs();
h17 = blocs.find((x) => x.titre === 'Histologie' && /17/.test(x.jour));
b.ok(h17 && /copie/.test(h17.cls) && /cours retiré de l’agenda/.test(h17.heure) && h17.lignes.length >= 1, 'créneau supprimé : copie affichée, « cours retiré de l’agenda »', JSON.stringify(h17));
await b.ev(`(${b.bloc('Histologie', '17')}).scrollIntoView({ block: 'center' }), 1`); await dormir(400);
await b.capture('agenda-retire-telephone');
b.variante = 'v1';
process.exit(b.fin() ? 1 : 0);
