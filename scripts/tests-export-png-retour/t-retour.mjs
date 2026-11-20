// Barre « Transcription en cours » → retour au cours : vraie session (faux Deepgram, micro simulé) lancée dans un
// cours ouvert à la page 7, on quitte le cours, on passe par 2 autres écrans, on touche la barre → même cours, même
// page, même endroit, panneau Transcript ouvert ; la session n'est jamais coupée ni redémarrée (une seule connexion,
// même id), aucun trou dans le texte (mots consécutifs du script du faux Deepgram), crédits Deepgram toujours lus.
//   Micro simulé : le périphérique factice par défaut de Chrome (--use-fake-device-for-media-stream, des bips :
//   le faux Deepgram les prend pour de la parole). node t-retour.mjs ordi|tablette|tel
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appareil, semer, dormir } from './commun.mjs';
import { pdfTest } from '../tests-police-duplication-remplacement/commun.mjs';

const profil = process.argv[2] || 'ordi';
const b = await appareil(profil);
const DG = 'http://localhost:54400';
const etatDg = async () => (await fetch(DG + '/__etat')).json();
const src = fs.readFileSync(fileURLToPath(new URL('../faux-deepgram.mjs', import.meta.url)), 'utf8');
const SCRIPT = eval(/const SCRIPT = \(([\s\S]*?)\)\.split/.exec(src)[1]).split(/\s+/).filter(Boolean); // eslint-disable-line no-eval
const norm = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9']/g, '');

// isolement : aucune session d'un passage précédent ne doit encore parler au faux Deepgram (les mots se mêleraient)
if ((await etatDg()).connexions) { console.log('Une connexion Deepgram est encore ouverte (passage précédent) : relancer les Chrome du banc.'); process.exit(2); }
await b.vider(); await b.ouvrir();
await semer(b, [{ id: 'rt-c1', matiereId: 'pr-mat', titre: 'Rein retour', type: 'standard', ordre: 0, pdf64: await pdfTest(12) },
  { id: 'rt-c2', matiereId: 'pr-mat', titre: 'Autre cours', type: 'standard', ordre: 1, pdf64: await pdfTest(3) }]);
await b.ouvrir();
const phase = () => b.ev(`window.__transcription.lireEtat().phase`);

if (profil === 'tel') {
  // TÉLÉPHONE : pas de lecteur de cours dans ce shell — une session (démarrée par le moteur, comme si elle venait
  // de l'ordinateur avant une bascule de shell) affiche la barre, sans bouton de retour qui ne mènerait nulle part
  await b.ev(`(async () => { const E = await __imp('/src/medrevise/transcription/engine.js'); await E.demarrer({ courseId: 'rt-c1', source: 'micro' }); return 1; })()`);
  b.ok(await b.attendre(`window.__transcription.lireEtat().phase === 'live'`, 15000), 'session en direct (moteur)');
  b.ok(await b.attendre(`!!document.querySelector('[data-trx-flottant]')`, 3000), 'barre « Transcription en cours » affichée');
  b.ok(await b.ev(`!document.querySelector('[data-trx-retour]')`), 'shell du téléphone : pas de bouton « Revenir au cours » (aucun lecteur ici)');
  await b.capture('barre');
  await b.clicFixe(`document.querySelector('.trx-stop')`, 3500);
  b.ok((await phase()) === 'idle', 'Arrêter : la barre garde son rôle');
  const n = b.fin(); b.fermerWs(); process.exit(n ? 1 : 0);
}

// ---- ouvrir le cours dans la Bibliothèque, aller à la page 7 (35 % de la page) ----
await b.aller('Biblio'); await dormir(800);
// tablette : la liste de la Bibliothèque est repliée — la déplier par sa poignée
if (!(await b.ev(`!!document.querySelector('.lt-fiche')`))) await b.clic(`document.querySelector('.lib-master.collapsed .split-handle')`, 900);
await b.clic(`[...document.querySelectorAll('.lt-fiche')].find((e) => e.innerText.trim().startsWith('Rein retour'))`, 2500);
b.ok(await b.attendre(`!!document.querySelector('.pdfr-page canvas[data-rendu]')`, 15000), 'cours ouvert dans la Bibliothèque');
await dormir(1200);
const position = () => b.ev(`(() => { const el = document.querySelector('.pdfr-scroll'); const r = el.getBoundingClientRect();
  const pages = [...document.querySelectorAll('.pdfr-page[data-cle]')]; const y = r.top + 1;
  const p = pages.find((x) => { const q = x.getBoundingClientRect(); return q.top <= y && q.bottom > y; }) || pages[0]; const q = p.getBoundingClientRect();
  return { page: Number(p.dataset.cle), fraction: +((y - q.top) / q.height).toFixed(3), scrollTop: Math.round(el.scrollTop), lue: parseInt((document.querySelector('.ptb-pages .tnum') || {}).innerText) }; })()`);
// les pages hors écran ne sont pas montées : défiler par pas jusqu'à ce que la page 7 existe, puis s'y caler
for (let k = 0; k < 40; k++) {
  const fait = await b.ev(`(() => { const p = document.querySelector('.pdfr-page[data-cle="7"]'); const s = document.querySelector('.pdfr-scroll');
    if (p) { s.scrollTop += p.getBoundingClientRect().top - s.getBoundingClientRect().top + 0.35 * p.getBoundingClientRect().height; return true; }
    const vus = [...document.querySelectorAll('.pdfr-page[data-cle]')].map((e) => +e.dataset.cle); s.scrollTop += (7 > Math.max(...vus, 0) ? 1 : -1) * s.clientHeight * 0.8; return false; })()`);
  await dormir(fait ? 700 : 250);
  if (fait) break;
}
await dormir(1800);
const avant = await position();
b.ok(avant.page === 7, 'lecteur sur la page 7', JSON.stringify(avant));

// ---- démarrer une transcription (panneau › Transcript › Transcrire le cours › Démarrer) ----
for (let k = 0; k < 4 && !(await b.ev(`!!document.querySelector('.trx-feuille')`)); k++) {
  if (!(await b.ev(`/^Transcript/.test(document.querySelector('.pm-seg-btn.actif')?.innerText.trim() || '')`))) await b.clicFixe(`[...document.querySelectorAll('.pm-seg-btn')].find((x) => x.innerText.trim().startsWith('Transcript'))`, 900);
  await b.clicFixe(`[...document.querySelectorAll('.trx-accueil button')].find((x) => /Transcrire le cours/.test(x.innerText))`, 1500);
}
for (let i = 0; i < 25 && !(await b.ev(`(() => { const x = [...document.querySelectorAll('.trx-feuille button')].filter((x) => /Démarrer/.test(x.innerText)).pop(); return !!x && !x.disabled; })()`)); i++) await dormir(300);
// « Démarrer » est au bas de la feuille, qui défile : l'amener dans la vue, puis le toucher
await b.ev(`([...document.querySelectorAll('.trx-feuille button')].filter((x) => /Démarrer/.test(x.innerText)).pop().scrollIntoView({ block: 'center' }), 1)`); await dormir(500);
await b.clicFixe(`[...document.querySelectorAll('.trx-feuille button')].filter((x) => /Démarrer/.test(x.innerText)).pop()`, 3000);
b.ok(await b.attendre(`window.__transcription.lireEtat().phase === 'live'`, 15000), 'session en direct démarrée (faux Deepgram, micro simulé)');
await dormir(7000);
const s0 = await b.ev(`(() => { const e = window.__transcription.lireEtat(); return { id: e.session.id, n: e.session.segments.filter((s) => s.status === 'final').length }; })()`);
const dg0 = await etatDg();
const ouvertures0 = dg0.journal.filter((j) => /ouvert|connexion|listen/i.test(j.m)).length;
b.ok(s0.n >= 1 && dg0.connexions === 1, 'des segments arrivent, une connexion Deepgram ouverte', `${s0.n} segments`);
// (la position est enregistrée en continu par le lecteur ; on n'y touche plus)

// ---- quitter le cours, passer par 2 autres écrans ----
// quitter le cours : « Retour » du lecteur (sur tablette, le lecteur occupe tout l'écran), puis l'Accueil
await b.clicFixe(`[...document.querySelectorAll('button')].find((x) => x.title === 'Revenir à la liste' && x.getBoundingClientRect().width > 0)`, 1200);
await b.aller('Accueil'); await dormir(2500);
b.ok(await b.ev(`!!document.querySelector('[data-trx-flottant]') && !document.querySelector('.pdfr-scroll')`), 'cours quitté (Accueil) : barre « Transcription en cours » affichée');
b.ok(await b.ev(`!!document.querySelector('[data-trx-retour]') && !!document.querySelector('[data-trx-retour]').title`), 'la barre est un bouton « Revenir au cours », avec infobulle', await b.ev(`document.querySelector('[data-trx-retour]')?.title`));
await b.aller('Réviser'); await dormir(2500);
await b.aller('Carnet'); await dormir(3000);
b.ok((await phase()) === 'live', 'après 2 autres écrans (Réviser, Carnet) : transcription toujours en direct');
await b.capture('barre');
const r = await b.ev(`(() => { const r = document.querySelector('[data-trx-flottant]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
const sEloigne = await b.ev(`window.__transcription.lireEtat().session.segments.filter((s) => s.status === 'final').length`);
b.ok(sEloigne > s0.n, 'la transcription a continué pendant l’absence', `${s0.n} → ${sEloigne} segments`);

// ---- toucher la barre ----
await b.clicFixe(`document.querySelector('[data-trx-retour]')`, 400);
b.ok(await b.attendre(`!!document.querySelector('.pdfr-page canvas[data-rendu]')`, 15000), 'toucher la barre : le lecteur se rouvre');
await dormir(2500);
const titre = await b.ev(`(document.querySelector('.pdfr-v2 .lecteur-titre, .pdfr-v2 [class*="titre"]') || {}).innerText || document.querySelector('.lib-screen')?.innerText.slice(0, 200)`);
b.ok(await b.ev(`!!document.querySelector('.lib-screen.doc-ouvert')`) && /Rein retour/.test(titre || ''), 'retour dans la Bibliothèque, sur le bon cours (« Rein retour »)', String(titre).slice(0, 60));
const apres = await position();
b.ok(apres.page === avant.page && Math.abs(apres.fraction - avant.fraction) < 0.02, 'même page et même endroit', `avant p.${avant.page} ${avant.fraction} → après p.${apres.page} ${apres.fraction}`);
const panneau = await b.ev(`(() => { const a = document.querySelector('.pm-seg-btn.actif'); return { onglet: a ? a.innerText.trim() : null, direct: !!document.querySelector('.trx-liste'), barre: !!document.querySelector('[data-trx-flottant]') }; })()`);
b.ok(/^Transcript/.test(panneau.onglet || '') && panneau.direct, 'panneau Transcript ouvert sur la session en direct', JSON.stringify(panneau));
b.ok(!panneau.barre, 'la barre flottante disparaît (le cours affiche sa propre session)');
await b.capture('retour-cours');
await dormir(6000);
const s1 = await b.ev(`(() => { const e = window.__transcription.lireEtat(); return { phase: e.phase, id: e.session.id, n: e.session.segments.filter((s) => s.status === 'final').length }; })()`);
const dg1 = await etatDg();
const ouvertures1 = dg1.journal.filter((j) => /ouvert|connexion|listen/i.test(j.m)).length;
b.ok(s1.phase === 'live' && s1.id === s0.id && s1.n > sEloigne, 'même session, toujours en direct, le texte continue', `${s1.id === s0.id ? 'même id' : 'id changé'} — ${s1.n} segments`);
b.ok(dg1.connexions === 1 && ouvertures1 === ouvertures0, 'jamais coupée ni redémarrée : une seule connexion Deepgram tout du long', `${dg1.connexions} connexion(s), ${ouvertures0} → ${ouvertures1} ouvertures au journal`);
// crédits Deepgram toujours lus (carte du panneau)
b.ok(await b.attendre(`/crédit|solde|\\$|€/i.test(document.querySelector('.trx-carte-credits')?.innerText || document.querySelector('.trx-panneau')?.innerText || '')`, 4000), 'crédits Deepgram : carte toujours affichée', (await b.ev(`(document.querySelector('.trx-carte-credits')?.innerText || '').replace(/\\s+/g, ' ').slice(0, 80)`)));

// ---- arrêter, puis vérifier le texte enregistré : aucun trou ----
await b.clicFixe(`document.querySelector('.trx-stop')`, 3500);
b.ok(await b.attendre(`window.__transcription.lireEtat().phase === 'idle'`, 8000), 'session arrêtée et enregistrée');
const rec = await b.S(`const l = (await S.getAll('transcript_session')).filter((r) => r.courseId === 'rt-c1' && r.kind === 'session'); return l.map((r) => ({ id: r.id, segs: r.segments.map((s) => ({ t0: s.t0, t1: s.t1, text: s.text, status: s.status })) }));`);
b.ok(rec.length === 1 && rec[0].id === s0.id, 'une seule session enregistrée pour ce cours (pas de redémarrage)', rec.map((x) => x.id).join(', '));
const segs = rec[0].segs;
b.ok(!segs.some((s) => s.status === 'gap'), 'aucun segment « trou » (gap)');
const mots = segs.filter((s) => s.status === 'final').flatMap((s) => s.text.split(/\s+/)).map(norm).filter(Boolean);
const script = SCRIPT.map(norm);
// point de départ : l'occurrence du premier mot qui aligne le plus de mots suivants (« entre », « le périoste »…
// figurent plusieurs fois dans le cours dicté)
const aligne = (j) => { let n = 0; for (let k = 1; k < Math.min(8, mots.length); k++) if (script[(j + k) % script.length] === mots[k]) n++; else break; return n; };
const departs = script.map((w, j) => (w === mots[0] ? j : -1)).filter((j) => j >= 0);
let i = departs.reduce((m, j) => (aligne(j) > aligne(m) ? j : m), departs[0]), ecarts = 0;
for (let k = 1; k < mots.length; k++) {
  const suivant = script[(i + 1) % script.length];
  if (mots[k] === suivant) { i = (i + 1) % script.length; continue; }
  if (suivant === 'osteoclastes' && mots[k] === 'osteo' && mots[k + 1] === 'classe') { i = (i + 1) % script.length; k++; continue; }
  ecarts++; console.log(`  rupture au mot ${k}/${mots.length} : attendu « ${suivant} », reçu « ${mots[k]} » — contexte : ${mots.slice(Math.max(0, k - 4), k + 3).join(' ')}`);
  const j = script.indexOf(mots[k], i); i = j >= 0 ? j : i;
}
b.ok(mots.length >= 10 && ecarts === 0, 'aucun trou dans le texte transcrit : mots consécutifs du cours dicté, du début à la fin', `${mots.length} mots, ${ecarts} rupture(s)`);
const n = b.fin(); b.fermerWs(); process.exit(n ? 1 : 0);
