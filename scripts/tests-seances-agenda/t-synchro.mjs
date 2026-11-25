// 3) DEUX APPAREILS par le faux Supabase (après t-lecteur.mjs ordi) : B (ordinateur, profil neuf, rien d'écrit) reçoit
//    les fiches, les PDF et les tags de A → le lien est visible sur B (agenda + marqueur) ; B délie l'Atlas → A le voit.
import { appareil, F, ligne, dormir } from './commun.mjs';
const A = await appareil('ordi');
const B = await appareil('ordiB');
await A.ouvrirApp(); await A.attendreSynchro(); await A.synchro(); await dormir(3000);
const avantA = (await A.tags(F.histo.id)).concat(await A.tags(F.atlas.id)).filter((t) => t.agenda).map((t) => `${t.courseId}:${t.page}:${t.agenda.cle}`).sort();
A.ok(avantA.length === 3, 'A : trois séances liées (histo 157 et 120, atlas 12)', avantA.join(' | '));
await B.preparer({ avecDonnees: false });
await B.attendreSynchro(40000); await B.synchro(); await dormir(1500);
const recuB = (await B.tags(F.histo.id)).concat(await B.tags(F.atlas.id)).filter((t) => t.agenda).map((t) => `${t.courseId}:${t.page}:${t.agenda.cle}`).sort();
B.ok(JSON.stringify(recuB) === JSON.stringify(avantA), 'B : les mêmes liens arrivent par la synchro (champ `agenda` du tag Début)', recuB.join(' | '));
await B.recharger();
B.ok(await B.accueil(), 'B : agenda');
await B.vue('semaine'); await B.aujourdhui();
const h17 = (await B.blocs()).find((x) => x.titre === 'Histologie' && /17/.test(x.jour));
B.ok(h17 && h17.lignes.includes(ligne(157, 192, F.histo.titre)) && h17.lignes.includes(ligne(12, null, F.atlas.titre)), 'B : « p. 157–192 » et « à partir de p. 12 » sur le créneau du 17', h17 && h17.lignes.join(' | '));
await B.capture('agenda-appareil-b');
await B.ouvrirFicheCours('Histologie', '17');
await B.clic(`document.querySelector('[data-fiche-cours] [data-action="ouvrir-seance"]')`, 500);
await B.clic(`[...document.querySelectorAll('.edt-choix-seance')].find((x) => x.textContent.includes(${JSON.stringify(F.histo.titre)}))`, 1500);
B.ok(await B.attendrePdf() && await B.attendre(`PAGES.startsWith('157/')`, 20000), 'B : « Ouvrir le cours » → histologie p. 157 (PDF reçu du cloud)', await B.ev(`PAGES`));
const m = await B.marge(157);
B.ok(m && m.lien.length === 1 && m.lien[0].texte === '17 nov. · Histologie', 'B : le marqueur lié affiche « 17 nov. · Histologie »', JSON.stringify(m));
await B.fermerLecteur();
// B délie l'Atlas → A
await B.S(`const T = await __imp('/src/medrevise/lib/seancesAgenda.js'); const t = (await S.getAll('page_tag')).find((x) => x.courseId === ${JSON.stringify(F.atlas.id)} && x.page === 12 && !x.supprime); await T.delierSeance(t); return 1`);
await B.synchro(); await dormir(2500);
await A.synchro(); await dormir(1500);
const tA = (await A.tags(F.atlas.id)).find((x) => x.page === 12);
A.ok(tA && tA.agenda === null && tA.kind === 'debut', 'A : « Délier » fait sur B arrive (le marqueur reste)');
await A.recharger(); await A.accueil(); await A.vue('semaine'); await A.aujourdhui();
const a17 = (await A.blocs()).find((x) => x.titre === 'Histologie' && /17/.test(x.jour));
A.ok(a17 && a17.lignes.join() === ligne(157, 192, F.histo.titre), 'A : agenda à jour (une seule ligne)', a17 && a17.lignes.join(' | '));
// remise du lien pour les captures suivantes
await A.S(`const T = await __imp('/src/medrevise/lib/seancesAgenda.js'); const E = await __imp('/src/medrevise/lib/emploiDuTemps.js'); const t = (await S.getAll('page_tag')).find((x) => x.courseId === ${JSON.stringify(F.atlas.id)} && x.page === 12 && !x.supprime); const e = E.lireEtat().donnees.events.find((x) => x.title === 'Histologie' && x.start === '2026-11-17T09:00:00.000Z'); await T.lierSeance(t, e); return 1`);
const ea = A.fin(); const eb = B.fin();
process.exit(ea || eb ? 1 : 0);
