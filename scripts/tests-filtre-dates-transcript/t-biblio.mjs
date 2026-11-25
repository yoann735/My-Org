// 1) Bibliothèque — bouton OFF identique à avant, dates, « +N », filtre, recherche, nouveau transcript, lecture seule.
//    node t-biblio.mjs ordi|ipad
import { appareil, dormir, APRES, AVANT, COURS, ATTENDU, HEURE_DUREE } from './commun.mjs';
const type = process.argv[2] || 'ordi';
const b = await appareil(type);
const sfx = '-' + type;
const tous = Object.values(COURS).map((c) => c.titre);
const txt = (titre, jour) => b.ev(`(() => { const p = ${b.pastille(titre, jour)}; return p ? p.innerText.replace(/\\s+/g, ' ').trim() : null; })()`);
const dateSet = (l) => (l || []).filter((x) => !x.startsWith('PLUS')).map((x) => x.replace('*', ''));

/* ---------- AVANT le chantier : la référence ---------- */
await b.preparer(AVANT);
b.ok(await b.biblio(), 'avant : Bibliothèque ouverte');
await b.sansAnim(); await dormir(300);
const NORM = `(() => { const t = document.querySelector('.lib-tree').cloneNode(true); t.querySelectorAll('.ltd-cal').forEach((x) => x.remove()); t.querySelectorAll('[style]').forEach((x) => x.removeAttribute('style')); t.querySelectorAll('[data-infobulle]').forEach((x) => { x.setAttribute('title', x.getAttribute('data-infobulle')); x.removeAttribute('data-infobulle'); }); return t.innerHTML; })()`;
const domAvant = await b.ev(NORM);
const zone = await b.zoneArbre();
const clip = { x: Math.floor(zone.x), y: Math.floor(zone.y), width: Math.floor(zone.w), height: Math.min(Math.floor(zone.h), b.H - Math.floor(zone.y)) };
const pngAvant = await b.capture('off-avant' + sfx, clip);

/* ---------- APRÈS, bouton éteint : strictement identique ---------- */
await b.preparer(APRES);
b.ok(await b.biblio(), 'après : Bibliothèque ouverte');
await b.sansAnim(); await dormir(300);
// la seule différence admise : le bouton calendrier lui-même, rangé dans les actions de la ligne de matière
const domApres = await b.ev(NORM);
b.ok(domApres === domAvant, 'bouton éteint : arbre identique à avant le chantier (HTML complet, hors le bouton calendrier)', domApres === domAvant ? '' : `${domAvant.length} / ${domApres.length} car.`);
const pngOff = await b.capture('off' + sfx, clip);
if (!b.tactile) {
  // le lissage du texte (anti-crénelage) peut varier d'une composition à l'autre : jusqu'à 3 prises « après »
  let d = { n: 0 }, essais = 0, png = pngOff;
  for (; essais < 3; essais++) {
    d = Buffer.compare(pngAvant, png) === 0 ? { n: 0 } : await b.diffPng(pngAvant, png);
    if (!d.n) break;
    await dormir(1000); await b.sansAnim(); png = await b.capture('off' + sfx, clip);
  }
  b.ok(d.n === 0, `bouton éteint : capture identique pixel pour pixel à avant (ordinateur, prise n° ${essais + 1})`, d.n ? JSON.stringify(d) : '');
}
else {
  // tactile : les actions des lignes sont toujours visibles (pas de survol) → l'icône calendrier y est la seule différence
  const r = await b.ev(`(() => { const m = ${b.qMat('Chimie')}; const c = m.querySelector('.ltd-cal').getBoundingClientRect(); const autres = [...document.querySelectorAll('.lt-rangee')].map((e) => Math.round(e.getBoundingClientRect().height)); return { w: Math.round(c.width), lignes: autres.join(',') }; })()`);
  b.ok(r.w > 0, 'tactile : l’icône calendrier est visible dans les actions de la matière (seule différence avec avant)', JSON.stringify(r).slice(0, 120));
}
b.ok(await b.ev(`!document.querySelector('.ltd-ligne, .ltd-rappel, .ltd-cal-fixe')`), 'bouton éteint : aucune pastille, aucun rappel');
b.ok((await b.fichesVisibles()).length === 7, 'bouton éteint : 7 cours à la racine + 1 dans « Chimie organique » (fermé)', (await b.fichesVisibles()).join(', '));
const tip = await b.ev(`(${b.qMat('Chimie')}).querySelector('.ltd-cal').title`);
b.ok(tip === 'Afficher les dates de transcript', 'infobulle du bouton : « Afficher les dates de transcript »', tip);
const hauteurAvant = await b.ev(`(${b.qFiche('Thermochimie')}).getBoundingClientRect().height`);

/* ---------- empreinte des données (lecture seule) ---------- */
const empreinte = () => b.S(`const out = {}; for (const s of ['fiches', 'matieres', 'dossiers', 'sources', 'transcript_session', 'docs', 'annotations', 'highlights', 'questions']) { const l = (await S.getAll(s)) || []; out[s] = JSON.stringify(l.sort((a, b) => String(a.id).localeCompare(String(b.id)))); } return JSON.stringify(out)`);
const avantDonnees = await empreinte();

/* ---------- allumer ---------- */
b.ok(await b.cliquerCal('Chimie'), 'toucher le calendrier de « Chimie »');
await dormir(500);
b.ok(await b.ev(`(${b.qCal('Chimie')} || {}).getAttribute && ${b.qCal('Chimie')}.getAttribute('aria-pressed') === 'true'`), 'bouton actif (aria-pressed)');
const couleur = await b.ev(`getComputedStyle(${b.qCal('Chimie')}).color + ' / ' + getComputedStyle(document.documentElement).getPropertyValue('--accent')`);
b.ok(/rgb/.test(couleur), 'bouton actif : couleur d’accent', couleur);
for (const [k, c] of Object.entries(COURS)) {
  const p = await b.pastilles(c.titre);
  if (k === 'D') continue; // dans un dossier fermé
  if (!ATTENDU[k].length) b.ok(Array.isArray(p) && p.length === 0, `${c.titre} : pas de transcript → aucune ligne`, JSON.stringify(p));
  else if (k !== 'A') b.ok(JSON.stringify(dateSet(p)) === JSON.stringify(ATTENDU[k]), `${c.titre} : dates ${ATTENDU[k].join(', ')}`, JSON.stringify(p));
}
b.ok(await b.ev(`(${b.qFiche('Thermochimie')}).getBoundingClientRect().height`) === hauteurAvant, 'cours sans transcript : aucune hauteur ajoutée');
const pa = await b.pastilles('Acides et bases');
const vis = dateSet(pa), plus = (pa || []).find((x) => x.startsWith('PLUS'));
b.ok(vis.length >= 1 && vis.length < 9 && plus === `PLUS:+${9 - vis.length}`, `9 dates : ${vis.length} visibles + « +${9 - vis.length} »`, JSON.stringify(pa));
b.ok(JSON.stringify(vis) === JSON.stringify(ATTENDU.A.slice(0, vis.length)), 'de la plus récente à la plus ancienne', vis.join(', '));
const libelles = await b.ev(`[...(${b.qFiche('Acides et bases')}).querySelectorAll('.ltd-p[data-jour]')].map((p) => p.innerText.trim())`);
b.ok(libelles[0] === '24 nov.' && libelles.every((l) => /^\d{1,2} [a-zéû]+\.?$/.test(l)), 'format « 24 nov. » (année en cours sans année)', libelles.join(' · '));
// une seule ligne par cours, pastilles calées sous le titre
const geo = await b.ev(`(() => { const out = []; for (const f of document.querySelectorAll('.lt-fiche')) { const l = f.querySelector('.ltd-ligne'); if (!l) continue; const ps = [...l.querySelectorAll('.ltd-p')]; const tops = new Set(ps.map((p) => Math.round(p.getBoundingClientRect().top))); const nom = f.querySelector('.lt-rangee .lt-nom').getBoundingClientRect(); const box = l.querySelector('.ltd-pastilles').getBoundingClientRect(); const der = ps[ps.length - 1].getBoundingClientRect(); out.push({ t: f.querySelector('.lt-nom').innerText.trim(), lignes: tops.size, dx: Math.round((ps[0].getBoundingClientRect().left - nom.left) * 10) / 10, deborde: der.right > box.right + 0.5 }); } return out; })()`);
b.ok(geo.length >= 5 && geo.every((g) => g.lignes === 1 && !g.deborde), 'jamais plus d’une ligne par cours, rien ne déborde', JSON.stringify(geo).slice(0, 300));
b.ok(geo.every((g) => Math.abs(g.dx) <= 0.6), 'alignement : 1re pastille exactement sous la 1re lettre du titre', geo.map((g) => g.dx).join(','));
const hDate = await b.ev(`(${b.qFiche('Oxydoréduction')}).getBoundingClientRect().height - (${b.qFiche('Thermochimie')}).getBoundingClientRect().height`);
b.ok(hDate > 0 && hDate <= (b.tactile ? 30 : 24), `ligne de dates compacte (+${hDate} px)`);
b.ok(await b.ev(`!(${b.qFiche('Optique')}).querySelector('.ltd-ligne')`), 'état par matière : « Physique » (éteinte) n’a pas de dates');
await b.capture('on' + sfx, clip);

/* ---------- « +N » : déplier / replier ---------- */
b.ok(await b.clic(b.plus('Acides et bases'), 400), 'toucher « +N »');
const dep = await b.pastilles('Acides et bases');
b.ok(JSON.stringify(dateSet(dep)) === JSON.stringify(ATTENDU.A), 'déplié : les 9 dates, dans l’ordre', JSON.stringify(dep));
b.ok(JSON.stringify(dateSet(await b.pastilles('Oxydoréduction'))) === JSON.stringify(ATTENDU.C), 'déplié juste pour ce cours');
b.ok(await b.ev(`(${b.qFiche('Acides et bases')}).querySelector('.ltd-pastilles').innerText.includes('2025')`), 'date d’une autre année : « 3 déc. 2025 »');
b.ok(/^24 nov\. 9h00 · < 1 min$/.test(await txt('Acides et bases', '2026-11-24')), 'déplié : heure et durée sur chaque pastille (24 nov. · 9h00 : reprise du 20 nov. le 24)', await txt('Acides et bases', '2026-11-24'));
b.ok(/10h00 · 50 min/.test(await txt('Acides et bases', '2026-11-17')), 'déplié : 17 nov. · 10h00 · 50 min (deux sessions ce jour-là)', await txt('Acides et bases', '2026-11-17'));
b.ok(await b.ev(`/2 sessions/.test((${b.pastille('Acides et bases', '2026-11-17')}).title) && /10h00, 50 min/.test((${b.pastille('Acides et bases', '2026-11-17')}).title)`), 'infobulle : jour complet, heure, durée, nombre de sessions', await b.ev(`(${b.pastille('Acides et bases', '2026-11-17')}).title.split(String.fromCharCode(10)).join(' / ')`));
await b.capture('plus-deplie' + sfx, clip);
b.ok(await b.clic(b.plus('Acides et bases'), 400), 'toucher à nouveau');
b.ok(JSON.stringify(await b.pastilles('Acides et bases')) === JSON.stringify(pa), 'replié comme avant');

/* ---------- filtre 17 nov. ---------- */
b.ok(await b.clic(b.pastille('Oxydoréduction', '2026-11-17'), 500), 'toucher « 17 nov. » sur Oxydoréduction');
let v = await b.fichesVisibles();
b.ok(JSON.stringify(v.sort()) === JSON.stringify(['Acides aminés', 'Acides et bases', 'Cinétique chimique', 'Oxydoréduction']), 'filtre 17 nov. : seulement les 4 bons cours (dont celui rangé dans un dossier, et celui de 0 h 30 heure de Bruxelles)', v.join(', '));
b.ok(await b.ev(`[...document.querySelectorAll('.lt-fiche')].filter((f) => f.querySelector('.ltd-p.actif')).every((f) => f.querySelector('.ltd-p.actif').dataset.jour === '2026-11-17') && document.querySelectorAll('.ltd-p.actif').length === 4`), 'dans chacun, la pastille du 17 nov. est en évidence');
const rappel = await b.ev(`(document.querySelector('.ltd-rappel') || {}).innerText`);
b.ok((rappel || '').trim() === '17 nov.', 'rappel « 17 nov. ✕ » en tête de la liste', rappel);
for (const [k, t] of [['A', 'Acides et bases'], ['C', 'Oxydoréduction'], ['D', 'Cinétique chimique'], ['F', 'Acides aminés']]) {
  const x = await txt(t, '2026-11-17');
  b.ok(x && x.replace(/\s/g, '').endsWith(HEURE_DUREE[k + '|2026-11-17'].replace(/\s/g, '')), `${t} : pastille filtrée « 17 nov. · ${HEURE_DUREE[k + '|2026-11-17']} »`, x);
}
b.ok(!(await txt('Oxydoréduction', '2026-11-12')).includes('·'), 'les autres pastilles restent une simple date');
const geoF = await b.ev(`[...document.querySelectorAll('.lt-fiche .ltd-ligne')].map((l) => new Set([...l.querySelectorAll('.ltd-p')].map((p) => Math.round(p.getBoundingClientRect().top))).size)`);
b.ok(geoF.every((n) => n === 1), 'filtré : toujours une seule ligne par cours', geoF.join(','));
b.ok(await b.ev(`(${b.qFiche('Optique')}) && !document.querySelector('.ltd-rappel').closest('.lt-enfants').contains(${b.qFiche('Optique')})`), 'les autres matières ne sont pas filtrées');
await b.capture('filtre' + sfx, clip);
// jour caché derrière « +N » : déplier, toucher 13 nov., replier → la pastille filtrée reste visible sur la ligne
await b.clic(b.pastille('Oxydoréduction', '2026-11-17'), 400); // retire le filtre
await b.clic(b.plus('Acides et bases'), 400);
await b.clic(b.pastille('Acides et bases', '2026-11-13'), 500);
await b.clic(b.plus('Acides et bases'), 400);
const p13 = await b.pastilles('Acides et bases');
b.ok((p13 || []).includes('2026-11-13*') && JSON.stringify(await b.fichesVisibles()) === '["Acides et bases"]', 'jour caché derrière « +N » : filtré, sa pastille reste visible sur la ligne repliée', JSON.stringify(p13));
b.ok(await b.ev(`new Set([...(${b.qFiche('Acides et bases')}).querySelectorAll('.ltd-p')].map((p) => Math.round(p.getBoundingClientRect().top))).size === 1`), '… toujours sur une seule ligne');
await b.capture('filtre-cache' + sfx, clip);
await b.clic(`document.querySelector('.ltd-rappel-p')`, 400);
await b.clic(b.pastille('Oxydoréduction', '2026-11-17'), 500);
// changer de date
b.ok(await b.clic(b.pastille('Oxydoréduction', '2026-11-12'), 500), 'toucher « 12 nov. » : remplace le filtre');
v = await b.fichesVisibles();
b.ok(JSON.stringify(v) === JSON.stringify(['Oxydoréduction']) && (await b.ev(`document.querySelector('.ltd-rappel').innerText.trim()`)) === '12 nov.', 'une seule date à la fois : 12 nov. → Oxydoréduction', v.join(', '));
// re-toucher la même pastille retire le filtre
b.ok(await b.clic(b.pastille('Oxydoréduction', '2026-11-12'), 500), 'toucher à nouveau « 12 nov. »');
b.ok((await b.fichesVisibles()).length === 7 && !(await b.ev(`document.querySelector('.ltd-rappel')`)), 'filtre retiré (même pastille)');
// ✕
await b.clic(b.pastille('Acides et bases', '2026-11-17'), 500);
b.ok(await b.clic(`document.querySelector('.ltd-rappel-p')`, 500), 'toucher le ✕ du rappel');
b.ok((await b.fichesVisibles()).length === 7 && !(await b.ev(`document.querySelector('.ltd-rappel')`)), '✕ : filtre retiré, tous les cours reviennent');
// combiné avec la recherche
await b.clic(b.pastille('Acides et bases', '2026-11-17'), 500);
await b.clic(`document.querySelector('.lib-barre-recherche input')`, 200);
await b.ecrire('acide'); await dormir(500);
v = await b.fichesVisibles();
b.ok(JSON.stringify(v.sort()) === JSON.stringify(['Acides aminés', 'Acides et bases']), 'filtre 17 nov. + recherche « acide » : les deux critères', v.join(', '));
await b.capture('filtre-recherche' + sfx, clip);
await b.ev(`(() => { const i = document.querySelector('.lib-barre-recherche input'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`); await dormir(400);
b.ok(JSON.stringify((await b.fichesVisibles()).sort()) === JSON.stringify(['Acides aminés', 'Acides et bases', 'Cinétique chimique', 'Oxydoréduction']), 'recherche effacée : le filtre par date reste');
// tri par date (filtre existant de la bibliothèque) : se combine aussi
// désactiver le bouton retire le filtre
b.ok(await b.cliquerCal('Chimie'), 'éteindre le calendrier');
await dormir(400);
b.ok(!(await b.ev(`document.querySelector('.ltd-ligne, .ltd-rappel, .ltd-cal-fixe')`)) && (await b.fichesVisibles()).length === 7, 'éteint : plus de dates, plus de filtre, tous les cours');
await b.sansAnim(); await dormir(200);
const domReoff = await b.ev(NORM);
// le dossier « Chimie organique » a pu être déplié pendant le filtre : l'état mémorisé de repli n'a pas changé
b.ok(domReoff === domAvant, 'éteint : arbre de nouveau identique à avant le chantier');
if (domReoff !== domAvant) { let i = 0; while (domReoff[i] === domAvant[i]) i++; console.log('DIFF avant:', domAvant.slice(i - 200, i + 200), '\nAPRES:', domReoff.slice(i - 200, i + 200)); }

/* ---------- état retenu par matière (rechargement) ---------- */
await b.cliquerCal('Chimie'); await dormir(300);
await b.ouvrir(APRES); await b.biblio(); await dormir(800);
b.ok(await b.ev(`!!(${b.qFiche('Oxydoréduction')}).querySelector('.ltd-ligne') && !(${b.qFiche('Optique')}).querySelector('.ltd-ligne')`), 'rechargé : Chimie toujours allumée, Physique éteinte (préférence par matière)');
b.ok(!(await b.ev(`document.querySelector('.ltd-rappel')`)), 'rechargé : le filtre par date n’est pas retenu');

/* ---------- un transcript ajouté aujourd'hui : apparaît sans recharger ---------- */
const aujourdhui = await b.ev(`new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date())`);
await b.S(`await S.put('transcript_session', { id: 'ts_banc_live', kind: 'session', courseId: '${COURS.B.id}', startedAt: new Date(Date.now() - 60000).toISOString(), endedAt: null, source: 'micro', keyterms: [], notes: [], fontSize: 'm', durationS: 30, createdAt: new Date().toISOString(), segments: [{ id: 'x1', t0: 5, t1: 9, text: 'Enthalpie de réaction.', status: 'final' }] }); return 1`);
b.ok(await b.attendre(`(() => { const f = ${b.qFiche('Thermochimie')}; return f && !!f.querySelector('.ltd-p[data-jour="${aujourdhui}"]'); })()`, 4000), `nouveau transcript aujourd’hui (${aujourdhui}) : la date apparaît sur Thermochimie sans recharger`);
b.ok(JSON.stringify(dateSet(await b.pastilles('Thermochimie'))) === JSON.stringify([aujourdhui]), 'Thermochimie : une seule date (aujourd’hui)');
await b.S(`await S.put('transcript_session', { id: 'ts_banc_live2', kind: 'session', courseId: '${COURS.A.id}', startedAt: new Date(Date.now() - 30000).toISOString(), endedAt: null, source: 'micro', keyterms: [], notes: [], fontSize: 'm', durationS: 30, createdAt: new Date().toISOString(), segments: [{ id: 'x1', t0: 2, t1: 4, text: 'pH.', status: 'final' }] }); return 1`);
b.ok(await b.attendre(`(() => { const f = ${b.qFiche('Acides et bases')}; const p = f && f.querySelector('.ltd-p[data-jour]'); return p && p.dataset.jour === '${aujourdhui}'; })()`, 4000), 'Acides et bases : la nouvelle date passe en tête, le « +N » se recalcule');
const pa2 = await b.pastilles('Acides et bases');
b.ok((pa2 || []).find((x) => x.startsWith('PLUS')) === `PLUS:+${10 - dateSet(pa2).length}`, '« +N » juste avec 10 dates', JSON.stringify(pa2));
await b.S(`await S.remove('transcript_session', 'ts_banc_live'); await S.remove('transcript_session', 'ts_banc_live2'); return 1`); await dormir(900);
b.ok(JSON.stringify(await b.pastilles('Thermochimie')) === '[]', 'session de test retirée : Thermochimie sans ligne');
await b.capture('on-final' + sfx, clip);

/* ---------- lecture seule ---------- */
const apresDonnees = await empreinte();
if (apresDonnees !== avantDonnees) { const a = JSON.parse(avantDonnees), c = JSON.parse(apresDonnees); for (const k of Object.keys(a)) if (a[k] !== c[k]) console.log('STORE DIFFÉRENT', k, a[k].slice(0, 300), '\n=>', c[k].slice(0, 300)); }
b.ok(apresDonnees === avantDonnees, 'lecture seule : cours, documents, transcripts, annotations inchangés après tout le parcours');
/* ---------- non-régression : ouvrir un cours depuis la bibliothèque ---------- */
await b.clic(`(${b.qFiche('Acides et bases')}).querySelector('.lt-rangee')`, 1200);
b.ok(await b.attendre(`!!document.querySelector('.lib-detail .pdfr-page, .lib-detail [data-lecteur]')`, 15000), 'ouvrir un cours (document) depuis l’arbre : le lecteur s’affiche');
b.ok(await b.attendre(`[...document.querySelectorAll('button')].some((x) => /Transcri/.test(x.title || x.innerText || ''))`, 5000), 'le lecteur propose la transcription');
await b.capture('cours-ouvert' + sfx);

process.exitCode = b.fin();
b.fermerWs();
