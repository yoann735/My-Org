// 1) Scénario complet sur ORDINATEUR (souris) ou IPAD (tactile) : node t-lecteur.mjs ordi|ipad
//    Le 17 nov. à 10 h 30 : début p. 157 sur le PDF d'histologie (300 p.) → fenêtre sur le 17, Histologie proposé → lier ;
//    fin p. 192 → agenda « p. 157–192 » ; « Ouvrir le cours » → p. 157. Le 10 nov. : p. 120–156 liée (semaines distinctes).
//    Atlas : « Passer », puis « Lier à l'agenda » depuis le menu → deux lignes sur le créneau du 17, choix à l'ouverture ;
//    « Changer le cours lié » (→ Chimie) puis « Délier ». Créneau supprimé puis déplacé dans l'iCal de test.
//    Non-régression : « Ouvrir » d'un créneau non lié, étiquettes des tags, aucune erreur console.
import { appareil, fichiersPdf, F, ligne, dormir, BASE, LOCAL } from './commun.mjs';
import { UID_HISTO } from '../../tests/seances-agenda/agenda.mjs';
const type = process.argv[2] || 'ordi';
const b = await appareil(type, { base: type === 'ordi' ? BASE : LOCAL }); // l'ordinateur sert ensuite d'appareil A (t-synchro)
const sfx = type === 'ordi' ? 'ordinateur' : 'ipad';
const pdfs = await fichiersPdf();
await b.preparer({ pdfs });
await b.accueil();
if (type === 'ordi') await b.vue('semaine');
await b.aujourdhui();

// ---------- agenda de départ ----------
let blocs = await b.blocs();
b.ok(blocs.some((x) => x.titre === 'Histologie' && /17/.test(x.jour)) && blocs.some((x) => x.titre === 'Chimie' && /17/.test(x.jour)), 'agenda de test : Histologie et Chimie le 17 nov.', blocs.map((x) => `${x.titre} ${x.jour} ${x.h}`).join(' · '));
b.ok(blocs.every((x) => !x.lignes.length), 'aucune ligne de séance tant que rien n’est lié');
// non-régression : « Ouvrir » d'un créneau NON lié = le dernier cours de la matière, comme avant
await b.ouvrirFicheCours('Chimie', '17');
const actionsChimie = await b.ev(`[...document.querySelectorAll('[data-fiche-cours] .edt-actions button')].map((x) => x.textContent.trim() + '|' + x.title)`);
b.ok(actionsChimie.length === 1 && /^Ouvrir\|Ouvrir « Chimie générale »$/.test(actionsChimie[0]), 'créneau non lié : bouton « Ouvrir » inchangé (dernier cours de la matière)', actionsChimie.join(' ; '));
await b.clic(`[...document.querySelectorAll('[data-fiche-cours] .edt-actions button')][0]`, 1500);
b.ok(await b.attendrePdf(), 'Ouvrir → le lecteur s’ouvre');
b.ok(await b.attendre(`/1\\/${F.chimie.pages}$/.test(PAGES)`, 6000), 'c’est bien « Chimie générale » (8 pages), page 1', await b.ev(`PAGES`));
await b.fermerLecteur();

// ---------- 1. le 17 à 10 h 30 : début p. 157 sur l'histologie ----------
await b.accueil();
await b.ouvrirFicheCours('Histologie', '17');
await b.clic(`[...document.querySelectorAll('[data-fiche-cours] .edt-actions button')].find((x) => /Ouvrir/.test(x.textContent))`, 1500);
b.ok(await b.attendrePdf(), 'Histologie : le lecteur s’ouvre');
b.ok(await b.attendre(`/\\/${F.histo.pages}$/.test(PAGES)`, 8000), 'PDF d’histologie de 300 pages');
await b.marquer(157, 'debut');
b.ok(await b.attendreFenetre(), 'début de cours noté p. 157 → la fenêtre « Lier à un cours de l’agenda » s’ouvre');
let f = await b.fenetre();
b.ok(f && f.titre === 'Lier à un cours de l’agenda' && /page 157/.test(f.sous), 'titre et rappel « ▶ Début · page 157 »', f && `${f.titre} / ${f.sous}`);
b.ok(f && /17 nov\./.test(f.libJour), 'la fenêtre montre la journée du 17 nov. (date du marqueur = aujourd’hui)', f && f.libJour);
b.ok(f && f.blocs.map((x) => x.titre).join(',') === 'Histologie,Chimie', 'les deux cours du 17 au style de l’agenda', f && f.blocs.map((x) => x.titre).join(','));
const prop = f && f.blocs.find((x) => x.propose);
b.ok(prop && prop.titre === 'Histologie' && prop.uid.startsWith(UID_HISTO), 'Histologie (en cours, même matière) proposé d’office', JSON.stringify(prop));
b.ok(f && f.boutons.includes('Passer'), 'bouton « Passer »');
let t = (await b.tags(F.histo.id)).find((x) => x.page === 157);
b.ok(t && t.kind === 'debut' && !t.agenda, 'proposé ≠ validé : rien n’est lié tant qu’on n’a pas touché un créneau');
await b.capture(`fenetre-${sfx}`);
// jour précédent / suivant
await b.clic(`document.querySelector('.sea-fenetre [data-sea="prec"]')`, 400);
f = await b.fenetre();
b.ok(f && /16 nov\./.test(f.libJour) && f.blocs.length === 0, 'flèche « jour précédent » → 16 nov. (pas de cours)', f && f.libJour);
await b.clic(`document.querySelector('.sea-fenetre [data-sea="suiv"]')`, 400);
f = await b.fenetre();
b.ok(f && /17 nov\./.test(f.libJour), 'flèche « jour suivant » → retour au 17', f && f.libJour);
await b.toucherCreneau('Histologie');
b.ok(await b.attendre(`!document.querySelector('.sea-fenetre')`, 3000), 'toucher le créneau = confirmer : la fenêtre se ferme');
t = (await b.tags(F.histo.id)).find((x) => x.page === 157);
b.ok(t && t.agenda && t.agenda.cle === `${UID_HISTO}|2026-11-17T09:00:00.000Z` && t.agenda.titre === 'Histologie' && t.agenda.date === '2026-11-17'
  && t.agenda.debut === '2026-11-17T09:00:00.000Z' && t.agenda.fin === '2026-11-17T11:00:00.000Z' && /B12/.test(t.agenda.salle || ''), 'lien enregistré sur le tag Début : UID + début, copie (titre, date, heures, salle)', JSON.stringify(t && t.agenda));
b.ok(t && t.kind === 'debut' && t.page === 157 && t.document === 'original' && t.date === '2026-11-17', 'le tag Début garde ses champs (page, document, date)');
let m = await b.marge(157);
b.ok(m && m.lien.length === 1 && m.lien[0].texte === '17 nov. · Histologie', 'le marqueur lié affiche discrètement « 17 nov. · Histologie »', JSON.stringify(m));
b.ok(m && /10:00–12:00/.test(m.lien[0].title) && /mardi 17 nov\./.test(m.lien[0].title), 'infobulle : l’heure du créneau', m && m.lien[0] && m.lien[0].title);
await b.captureEl(`marqueur-lie-${sfx}`, `document.querySelector('.pdfr-page[data-cle="157"]').parentElement`, 0);
// fin p. 192 : pas de fenêtre (seul le début se lie)
await b.marquer(192, 'fin');
await dormir(500);
b.ok(!(await b.ev(`!!document.querySelector('.sea-fenetre')`)), 'fin de cours p. 192 : aucune fenêtre de liaison');
await b.fermerLecteur();
await b.accueil();
blocs = await b.blocs();
let h17 = blocs.find((x) => x.titre === 'Histologie' && /17/.test(x.jour));
b.ok(h17 && h17.lignes.length === 1 && h17.lignes[0] === ligne(157, 192, F.histo.titre), 'agenda du 17 : « p. 157–192 · Histologie — tissus »', h17 && h17.lignes.join(' | '));
b.ok(blocs.filter((x) => x.titre === 'Chimie').every((x) => !x.lignes.length), 'Chimie (non liée) : aucune ligne');
await b.capture(`agenda-${sfx}`);
// « Ouvrir le cours » → page 157
await b.ouvrirFicheCours('Histologie', '17');
const fc = await b.ev(`(() => { const f = document.querySelector('[data-fiche-cours]'); return { seances: [...f.querySelectorAll('.edtg-seance-fiche')].map((x) => x.textContent), boutons: [...f.querySelectorAll('.edt-actions button')].map((x) => x.textContent.trim() + '|' + x.title) }; })()`);
b.ok(fc.seances.join() === 'p. 157–192 · Histologie — tissus' && fc.boutons[0] === 'Ouvrir le cours|Ouvrir « Histologie — tissus » page 157', 'fiche du cours : la séance et « Ouvrir le cours »', JSON.stringify(fc));
await b.capture(`fiche-cours-${sfx}`);
await b.clic(`document.querySelector('[data-fiche-cours] [data-action="ouvrir-seance"]')`, 1500);
b.ok(await b.attendrePdf(), '« Ouvrir le cours » → le lecteur s’ouvre');
b.ok(await b.attendre(`PAGES.startsWith('157/')`, 8000), '… à la page 157 (début de la séance)', await b.ev(`PAGES`));

// ---------- 2. Atlas : « Passer », puis lier depuis le menu ; deux documents sur le même créneau ----------
await b.fermerLecteur();
// l'Atlas devient le « dernier cours ouvert » de l'histologie : le créneau du 10 (pas encore lié) l'ouvre par « Ouvrir »
await b.S(`localStorage.setItem('medrevise.derniersCours.v1', JSON.stringify({ m_sea_histo: { ficheId: ${JSON.stringify(F.atlas.id)}, at: new Date().toISOString() } })); return 1`);
await b.accueil();
for (let i = 0; i < 4 && !(await b.ev(`!!(${b.bloc('Histologie', '10')})`)); i++) await b.precedent();
await b.ouvrirFicheCours('Histologie', '10');
const act10 = await b.ev(`[...document.querySelectorAll('[data-fiche-cours] .edt-actions button')].map((x) => x.textContent.trim() + '|' + x.title)`);
b.ok(act10.length === 1 && act10[0] === `Ouvrir|Ouvrir « ${F.atlas.titre} »`, 'créneau du 10 non lié : « Ouvrir » (comportement actuel)', act10.join(' ; '));
await b.clic(`[...document.querySelectorAll('[data-fiche-cours] .edt-actions button')][0]`, 1500);
b.ok(await b.attendrePdf(), 'Atlas d’histologie ouvert');
b.ok(await b.attendre(`/\\/${F.atlas.pages}$/.test(PAGES)`, 8000), 'Atlas : 40 pages');
await b.marquer(12, 'debut');
b.ok(await b.attendreFenetre(), 'Atlas : début p. 12 → fenêtre');
await b.clic(`document.querySelector('.sea-fenetre [data-action="passer"]')`, 600);
b.ok(!(await b.ev(`!!document.querySelector('.sea-fenetre')`)), '« Passer » ferme la fenêtre');
t = (await b.tags(F.atlas.id)).find((x) => x.page === 12);
b.ok(t && t.kind === 'debut' && !('agenda' in t), '« Passer » : marqueur créé comme avant, sans aucun champ ajouté', JSON.stringify(t));
m = await b.marge(12);
b.ok(m && m.lien.length === 0 && m.pastilles.length === 1, 'aucune mention d’agenda sur un marqueur non lié', JSON.stringify(m));
await b.menuPage(12);
let items = await b.itemsMenu();
b.ok(items.includes('Lier à l’agenda') && !items.includes('Délier'), 'menu du marqueur non lié : « Lier à l’agenda »', items.join(' | '));
await b.item('Lier à l’agenda');
b.ok(await b.attendreFenetre(), '« Lier à l’agenda » ouvre la fenêtre');
await b.toucherCreneau('Histologie');
t = (await b.tags(F.atlas.id)).find((x) => x.page === 12);
b.ok(t && t.agenda && t.agenda.cle === `${UID_HISTO}|2026-11-17T09:00:00.000Z`, 'Atlas lié au même créneau (17 nov. Histologie)');
await b.menuPage(12);
items = await b.itemsMenu();
b.ok(items.includes('Changer le cours lié') && items.includes('Délier') && !items.includes('Lier à l’agenda'), 'menu du marqueur lié : « Changer le cours lié », « Délier »', items.join(' | '));
await b.touche('Escape', 'Escape', 27);
await b.fermerLecteur();
await b.accueil(); await b.aujourdhui();
h17 = (await b.blocs()).find((x) => x.titre === 'Histologie' && /17/.test(x.jour));
b.ok(h17 && h17.lignes.length === 2 && h17.lignes.includes(ligne(157, 192, F.histo.titre)) && h17.lignes.includes(ligne(12, null, F.atlas.titre)), 'deux documents liés au même créneau → deux lignes (« à partir de p. 12 » sans fin)', h17 && h17.lignes.join(' | '));
await b.capture(`agenda-deux-${sfx}`);
await b.ouvrirFicheCours('Histologie', '17');
await b.clic(`document.querySelector('[data-fiche-cours] [data-action="ouvrir-seance"]')`, 500);
const choix = await b.ev(`[...document.querySelectorAll('.edt-choix-seance')].map((x) => x.textContent)`);
b.ok(choix.length === 2 && choix.some((x) => x.includes(F.atlas.titre)) && choix.some((x) => x.includes(F.histo.titre)), '« Ouvrir le cours » : petit choix du document', choix.join(' | '));
await b.capture(`choix-document-${sfx}`);
await b.clic(`[...document.querySelectorAll('.edt-choix-seance')].find((x) => x.textContent.includes(${JSON.stringify(F.atlas.titre)}))`, 1500);
b.ok(await b.attendrePdf() && await b.attendre(`PAGES === '12/${F.atlas.pages}'`, 8000), 'choix « Atlas » → Atlas ouvert à la page 12', await b.ev(`PAGES`));

// ---------- 3. « Changer le cours lié » puis « Délier » ----------
await b.menuPage(12); await b.item('Changer le cours lié');
b.ok(await b.attendreFenetre(), '« Changer le cours lié » ouvre la fenêtre');
f = await b.fenetre();
b.ok(f && f.titre === 'Changer le cours lié' && f.blocs.find((x) => x.lie && x.titre === 'Histologie') && f.boutons.includes('Délier'), 'fenêtre de changement : le cours lié marqué « Lié », bouton « Délier »', JSON.stringify(f && f.blocs));
await b.capture(`fenetre-changer-${sfx}`);
await b.toucherCreneau('Chimie');
t = (await b.tags(F.atlas.id)).find((x) => x.page === 12);
b.ok(t && t.agenda && t.agenda.titre === 'Chimie', 'lien changé → Chimie');
m = await b.marge(12);
b.ok(m && m.lien[0] && m.lien[0].texte === '17 nov. · Chimie', 'mention « 17 nov. · Chimie »', JSON.stringify(m));
await b.menuPage(12); await b.item('Délier');
await dormir(500);
t = (await b.tags(F.atlas.id)).find((x) => x.page === 12);
b.ok(t && t.agenda === null && t.kind === 'debut' && t.page === 12, '« Délier » : agenda = null, le marqueur reste');
m = await b.marge(12);
b.ok(m && m.lien.length === 0 && m.pastilles.length === 1, 'plus de mention, l’étiquette « Début » reste', JSON.stringify(m));
const sauvegardes = await b.S(`const r = await new Promise((res) => { const q = indexedDB.open('medrevise-backups'); q.onsuccess = () => { try { const db = q.result; const st = db.transaction(db.objectStoreNames[0]).objectStore(db.objectStoreNames[0]); const k = st.getAllKeys(); k.onsuccess = () => res(k.result); k.onerror = () => res([]); } catch (e) { res(['ERR ' + e.message]); } }; q.onerror = () => res([]); }); return r.filter((x) => /^pre-(lien|delier)-agenda-/.test(x))`);
b.ok(sauvegardes.filter((x) => /^pre-lien-agenda-/.test(x)).length === 3 && sauvegardes.filter((x) => /^pre-delier-agenda-/.test(x)).length === 1, 'putBackup avant chaque écriture du lien (3 liaisons, 1 « Délier » jusqu’ici)', `${sauvegardes.length} copies`);
await b.fermerLecteur();
await b.accueil(); await b.aujourdhui();
blocs = await b.blocs();
h17 = blocs.find((x) => x.titre === 'Histologie' && /17/.test(x.jour));
b.ok(h17 && h17.lignes.join() === ligne(157, 192, F.histo.titre) && blocs.find((x) => x.titre === 'Chimie').lignes.length === 0, 'agenda : Atlas délié → plus de ligne (ni Histologie ni Chimie)', h17 && h17.lignes.join(' | '));
// retour à l'histologie (seule séance liée au 17 : « Ouvrir le cours » l'ouvre directement à la p. 157)
await b.ouvrirFicheCours('Histologie', '17');
await b.clic(`document.querySelector('[data-fiche-cours] [data-action="ouvrir-seance"]')`, 1500);
await b.attendrePdf(); await b.attendre(`PAGES.startsWith('157/')`, 8000);
// ---------- 4. le 10 nov. : séance p. 120–156 liée → semaines distinctes ----------
await b.marquer(120, 'debut', '2026-11-10');
b.ok(await b.attendreFenetre(), 'début p. 120 daté du 10 nov. → fenêtre');
f = await b.fenetre();
b.ok(f && /10 nov\./.test(f.libJour), 'la fenêtre s’ouvre sur le 10 nov. (date du marqueur)', f && f.libJour);
const prop10 = f && f.blocs.find((x) => x.propose);
b.ok(prop10 && prop10.titre === 'Histologie', 'Histologie du 10 proposé (même matière, même jour)', JSON.stringify(prop10));
await b.toucherCreneau('Histologie');
await b.marquer(156, 'fin', '2026-11-10');
t = (await b.tags(F.histo.id)).find((x) => x.page === 120);
b.ok(t && t.agenda && t.agenda.cle === `${UID_HISTO}|2026-11-10T09:00:00.000Z`, 'clé du 10 : même UID iCal, autre date → autre créneau', t && t.agenda && t.agenda.cle);
await b.fermerLecteur();
await b.accueil();
h17 = (await b.blocs()).find((x) => x.titre === 'Histologie' && /17/.test(x.jour));
b.ok(h17 && h17.lignes.join() === ligne(157, 192, F.histo.titre), 'le 17 garde « p. 157–192 » seul', h17 && h17.lignes.join(' | '));
for (let i = 0; i < 4 && !(await b.ev(`!!(${b.bloc('Histologie', '10')})`)); i++) await b.precedent();
const h10 = (await b.blocs()).find((x) => x.titre === 'Histologie' && /10/.test(x.jour));
b.ok(h10 && h10.lignes.join() === ligne(120, 156, F.histo.titre), 'le 10 nov. : « p. 120–156 » (les deux semaines restent distinctes)', h10 && h10.lignes.join(' | '));
await b.capture(`agenda-10nov-${sfx}`);
await b.aujourdhui();

// Atlas relié de nouveau au 17 (deux documents sur le même créneau pour la suite ; le geste a été testé plus haut)
await b.S(`const T = await __imp('/src/medrevise/lib/seancesAgenda.js'); const E = await __imp('/src/medrevise/lib/emploiDuTemps.js'); const t = (await S.getAll('page_tag')).find((x) => x.courseId === ${JSON.stringify(F.atlas.id)} && x.page === 12 && !x.supprime); const e = E.lireEtat().donnees.events.find((x) => x.title === 'Histologie' && x.start === '2026-11-17T09:00:00.000Z'); await T.lierSeance(t, e); return 1`);
await dormir(600);

// ---------- 5. créneau supprimé, puis déplacé, dans l'iCal de test ----------
b.variante = 'supprime';
await b.recharger(); await b.accueil(); await b.aujourdhui();
blocs = await b.blocs();
const copie = blocs.find((x) => x.titre === 'Histologie' && /17/.test(x.jour));
b.ok(copie && /copie/.test(copie.cls) && !/en-cours/.test(copie.cls) && copie.h === '10:00–12:00' && /cours retiré de l’agenda/.test(copie.heure) && copie.lignes.length === 2, 'créneau supprimé : la séance garde sa copie (10:00–12:00), mention « cours retiré de l’agenda », jamais « en cours »', JSON.stringify(copie));
await b.capture(`agenda-retire-${sfx}`);
await b.ouvrirFicheCours('Histologie', '17');
const fRet = await b.ev(`(() => { const f = document.querySelector('[data-fiche-cours]'); return { mention: (f.querySelector('[data-mention]') || {}).textContent, seances: f.querySelectorAll('.edtg-seance-fiche').length, ouvrir: !!f.querySelector('[data-action="ouvrir-seance"]') }; })()`);
b.ok(fRet.mention === 'cours retiré de l’agenda' && fRet.seances === 2 && fRet.ouvrir, 'fiche de la copie : mention, deux séances, « Ouvrir le cours »', JSON.stringify(fRet));
await b.fermerModale();
b.variante = 'deplace';
await b.recharger(); await b.accueil(); await b.aujourdhui();
blocs = await b.blocs();
const dep = blocs.find((x) => x.titre === 'Histologie' && /17/.test(x.jour));
b.ok(dep && !/copie/.test(dep.cls) && dep.h === '15:00–17:00' && /horaire modifié/.test(dep.heure) && dep.lignes.length === 2, 'créneau déplacé (15 h–17 h) : les séances suivent le cours, mention « horaire modifié »', JSON.stringify(dep));
b.ok(blocs.filter((x) => x.titre === 'Histologie' && /17/.test(x.jour)).length === 1, 'pas de copie en double quand le cours a seulement bougé');
await b.capture(`agenda-deplace-${sfx}`);
await b.ouvrirFicheCours('Histologie', '17');
const fDep = await b.ev(`(() => { const f = document.querySelector('[data-fiche-cours]'); return { mention: (f.querySelector('[data-mention]') || {}).textContent, txt: f.innerText }; })()`);
b.ok(fDep.mention === 'horaire modifié' && /Horaire au moment du lien : 17 nov\. · 10:00–12:00/.test(fDep.txt), 'fiche : « horaire modifié » + horaire d’origine gardé', fDep.mention);
await b.fermerModale();
t = (await b.tags(F.histo.id)).find((x) => x.page === 157);
b.ok(t.agenda.debut === '2026-11-17T09:00:00.000Z' && t.agenda.fin === '2026-11-17T11:00:00.000Z', 'rien n’est réécrit : la copie stockée reste celle du lien');
b.variante = 'v1';
await b.recharger(); await b.accueil(); await b.aujourdhui();
h17 = (await b.blocs()).find((x) => x.titre === 'Histologie' && /17/.test(x.jour));
b.ok(h17 && !/copie/.test(h17.cls) && !/horaire modifié|retiré/.test(h17.heure) && h17.lignes.length === 2, 'iCal revenu à l’identique : plus aucune mention');

// ---------- non-régression des tags ----------
await b.ouvrirFicheCours('Chimie', '17');
await b.clic(`[...document.querySelectorAll('[data-fiche-cours] .edt-actions button')][0]`, 1500);
b.ok(await b.attendrePdf() && await b.attendre(`/\\/${F.chimie.pages}$/.test(PAGES)`, 8000), 'créneau non lié : « Ouvrir » ouvre toujours le dernier cours de la matière');
await b.fermerLecteur();
const tous = await b.tags(F.histo.id);
b.ok(tous.map((x) => `${x.kind}${x.page}`).join(',') === 'debut120,fin156,debut157,fin192', 'tags de l’histologie : 120, 156, 157, 192 (rien d’autre créé ni modifié)', tous.map((x) => `${x.kind}${x.page}`).join(','));
b.ok(tous.filter((x) => x.kind === 'fin').every((x) => !('agenda' in x)), 'les tags Fin n’ont aucun champ ajouté');
process.exit(b.fin() ? 1 : 0);
