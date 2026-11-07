// Banc STATUT DE SYNCHRO UNIQUE (07/11) — ordinateur (souris), tablette (tactile), téléphone (tactile), faux Supabase, données de TEST
// (seed.mjs : 41 cartes + 19 cartes « Boîte → Flashcard » dont srcId = genId('bfc')). Jamais le vrai cloud.
//  1. les 19 cartes Boîte → Flashcard : « À jour » dans l'en-tête ET dans Réglages, 0 en attente (avant : 19 faux fichiers manquants)
//  2. modification hors ligne (tablette, téléphone) → « 1 en attente » partout ; retour du réseau → envoi → « À jour » partout, au même moment
//  3. élément refusé par le serveur (ordinateur) → jamais « À jour » : « 1 en attente » puis « Synchro en échec · 1 en attente »,
//     liste dépliée (type, titre, depuis, raison) ; serveur réparé + Réessayer → « À jour »
//  4. rafraîchissement : l'en-tête et Réglages disent la même chose (enregistreur à chaque mutation du DOM, aucune divergence)
//  5. non-régression : séance de flashcards (2 réponses), Bibliothèque, PdfReader (PDF de test), données intactes
import { dispositif, poste, FAUX_SB } from './commun.mjs';
const sortie = (x) => console.log(x);
await poste(FAUX_SB, '/__panne?code='); await poste(FAUX_SB, '/__refuser?stores=');
const A = await dispositif('ordi'); const C = await dispositif('tablette'); const B = await dispositif('tel');
const tous = [A, C, B];
const ouvrir = async (x) => { await x.recharger(); await x.attendrePhase(['ajour', 'echec', 'horsligne', 'incomplet'], 90000); await x.reglages(); await x.voirSynchro(); };
const attendreLigne = async (x, code, ms = 60000) => { const t0 = Date.now(); let l = null; while (Date.now() - t0 < ms) { l = await x.ligne(); if (l && l.code === code) return l; await x.dormir(150); } return l; };

// ---------- 1. les 19 cartes Boîte → Flashcard
for (const x of tous) { await ouvrir(x); }
for (const x of tous) {
  const l = await attendreLigne(x, 'ajour');
  const bfc = await x.S(`return (await S.getAll('questions')).filter((q) => String(q.srcId || '').startsWith('bfc')).length`);
  const ancien = await x.S(`let n = 0; for (const q of await S.getAll('questions')) if (/^b[0-9a-z]{6,}$/.test(q.srcId || '')) n++; return n;`);
  x.v(l && l.code === 'ajour' && l.n === 0 && bfc === 19, `${x.nom} — 19 cartes Boîte → Flashcard présentes : Réglages « ${l && l.texte} », 0 en attente`, `l'ancienne règle en comptait ${ancien} comme fichiers manquants`);
  const div = await x.divergences();
  x.v(div.length === 0, `${x.nom} — en-tête et Réglages jamais en désaccord depuis l'ouverture`, JSON.stringify(div.slice(0, 2)));
  const vus = [...new Set((await x.etats()).map(([, e]) => e.h).filter(Boolean))];
  x.v(vus.includes('ajour'), `${x.nom} — l'en-tête a affiché « À jour »`, vus.join(' → '));
}
await A.capture('apres-reglages-ordi-ajour'); await C.capture('apres-reglages-tablette-ajour'); await B.capture('apres-accueil-tel-ajour');

// ---------- 2. modification hors ligne (tablette puis téléphone)
for (const x of [C, B]) {
  await x.viderEtats();
  await x.horsLigne(true);
  await x.S(`const f = await S.getOne('fiches', 'f1'); await S.put('fiches', { ...f, titre: 'Cours 1 — Rein (modifié hors ligne sur ${x.nom})' }); return 1;`);
  const l = await attendreLigne(x, 'enattente', 15000);
  const h = await x.entete();
  x.v(l && l.n === 1 && h && h.code === 'enattente' && h.texte === '1 en attente' && l.texte === '1 en attente', `${x.nom} hors ligne, une modification : « 1 en attente » dans l'en-tête ET dans Réglages`, `en-tête « ${h && h.texte} » · Réglages « ${l && l.texte} »`);
  await x.capture(`apres-${x.type}-hors-ligne-1-en-attente`);
  await x.horsLigne(false);
  const l2 = await attendreLigne(x, 'ajour', 30000);
  const et = await x.etats();
  const iH = et.findIndex(([, e]) => e.h === 'ajour'); const iR = et.findIndex(([, e]) => e.r === 'ajour');
  x.v(l2 && l2.code === 'ajour' && iH >= 0 && iH === iR, `${x.nom} retour du réseau : envoi puis « À jour » dans l'en-tête et Réglages AU MÊME MOMENT (même mutation du DOM)`, `${l2 && l2.texte} · indices ${iH}/${iR}`);
  const cloud = (await (await fetch(FAUX_SB + '/__etat')).json()).rows.find((r) => r.store === 'fiches' && r.record_id === 'f1');
  x.v(cloud && cloud.data.titre.includes(x.nom), `${x.nom} : la modification est au cloud`, cloud && cloud.data.titre);
  x.v((await x.divergences()).length === 0, `${x.nom} — aucune divergence en-tête / Réglages pendant le scénario`);
}

// ---------- 3. élément refusé par le serveur (ordinateur)
await A.viderEtats();
await poste(FAUX_SB, '/__refuser?stores=matieres');
await A.S(`const m = await S.getOne('matieres', 'mB'); await S.put('matieres', { ...m, nom: 'Pneumo (refusé par le serveur)' }); return 1;`);
const l3 = await attendreLigne(A, 'enattente', 15000);
A.v(l3 && l3.n === 1, 'ordinateur : élément refusé par le serveur → « 1 en attente », pas « À jour »', l3 && l3.texte);
await A.ev(`(window.dispatchEvent(new Event('focus')), 1)`);
const l3b = await attendreLigne(A, 'echec', 30000);
const h3 = await A.entete();
A.v(l3b && h3 && h3.code === 'echec' && h3.texte.startsWith('Synchro en échec · 1 en attente') && l3b.texte === 'Synchro en échec · 1 en attente', 'nouvelle passe : « Synchro en échec · 1 en attente » dans l’en-tête et Réglages', `en-tête « ${h3 && h3.texte} »`);
await A.toucher(`document.querySelector('[data-act="voir-en-attente"]')`, 500);
const liste = await A.ev(`[...document.querySelectorAll('[data-liste-en-attente] li')].map((li) => li.innerText.replace(/\\s+/g, ' ').trim())`);
A.v(liste.length === 1 && /Matière/i.test(liste[0]) && /Pneumo \(refusé par le serveur\)/.test(liste[0]) && /depuis le \d\d\/\d\d/.test(liste[0]) && /refusé par le serveur/.test(liste[0]), 'tap sur « 1 en attente » : la liste dit le type, le titre, depuis quand et la raison', liste[0]);
await A.voirSynchro(); await A.capture('apres-reglages-ordi-refus-liste');
A.v(!(await A.etats()).some(([, e]) => e.h === 'ajour' || e.r === 'ajour'), 'pendant tout le refus : jamais « À jour »');
await poste(FAUX_SB, '/__refuser?stores=');
await A.toucher(`document.querySelector('[data-act="reessayer-synchro"]')`, 500);
const l3c = await attendreLigne(A, 'ajour', 30000);
A.v(l3c && l3c.code === 'ajour', 'serveur réparé + Réessayer : « À jour »', l3c && l3c.texte);
// même liste sur la tablette (tactile) : tap sur la ligne
await poste(FAUX_SB, '/__refuser?stores=matieres');
await C.S(`const m = await S.getOne('matieres', 'mC'); await S.put('matieres', { ...m, nom: 'Hépato (refusé, tablette)' }); return 1;`);
await attendreLigne(C, 'enattente', 15000);
await C.toucher(`document.querySelector('[data-act="voir-en-attente"]')`, 500);
const listeC = await C.ev(`[...document.querySelectorAll('[data-liste-en-attente] li')].map((li) => li.innerText.replace(/\\s+/g, ' ').trim())`);
C.v(listeC.length === 1 && /Hépato \(refusé, tablette\)/.test(listeC[0]), 'tablette : tap sur « 1 en attente » → la liste s’ouvre', listeC[0]);
await C.voirSynchro(); await C.capture('apres-reglages-tablette-refus-liste');
await poste(FAUX_SB, '/__refuser?stores='); await C.ev(`(window.dispatchEvent(new Event('focus')), 1)`); await attendreLigne(C, 'ajour', 30000);

// ---------- 4. rafraîchissement : même chose partout
for (const x of tous) {
  await x.viderEtats(); await ouvrir(x);
  const l = await attendreLigne(x, 'ajour');
  const div = await x.divergences();
  const paires = (await x.etats()).filter(([, e]) => e.h && e.r).length;
  x.v(l && l.code === 'ajour' && div.length === 0 && paires > 0, `${x.nom} — rafraîchi : en-tête et Réglages identiques à chaque instant (${paires} instants comparés)`, JSON.stringify(div.slice(0, 2)));
}

// ---------- 5. non-régression
const avant = await A.S(`const r = {}; for (const n of ['sources','matieres','fiches','questions','highlights']) r[n] = (await S.getAll(n)).length; r.pdfDeja = !!(await S.getOne('fiches', 'f-pdf')); return r;`);
await A.reviser();
const k = await A.repondre(2);
A.v(k === 2, 'séance de flashcards (Révisions J) : 2 réponses données', String(k));
await A.dormir(1500);
const journal = await A.ev(`(async () => (await (await import('/src/medrevise/journal/journal.js')).compteJournal()))()`);
A.v(journal >= 4, 'réponses journalisées', String(journal));
// PdfReader : un PDF de test minimal rattaché au cours témoin, ouvert depuis la Bibliothèque
await A.S(`const pdf = '%PDF-1.4\\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj 4 0 obj<</Length 44>>stream\\nBT /F1 18 Tf 40 100 Td (Banc PdfReader) Tj ET\\nendstream endobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\\ntrailer<</Root 1 0 R>>\\n%%EOF';
  const id = await S.putBlob(new Blob([pdf], { type: 'application/pdf' }));
  await S.put('fiches', { id: 'f-pdf', matiereId: 'mA', titre: 'Cours PDF de test', type: 'standard', pdfId: id, pdfName: 'banc.pdf', ordre: 9 }); return id;`);
await A.ev(`(window.dispatchEvent(new Event('focus')), 1)`); await A.attendrePhase(['ajour'], 60000); await A.dormir(1500);
const ouvert = await A.ouvrirCours('Cours PDF de test');
A.v(ouvert, 'PdfReader : le cours PDF s’ouvre (lecteur affiché)');
await A.dormir(2500);
const page = await A.ev(`!!document.querySelector('.pdfr-scroll canvas, .pdfr-scroll .pdf-page, .pdfr-scroll [data-page]')`);
A.v(page, 'PdfReader : page rendue');
await A.capture('non-regression-pdfreader');
const apres = await A.S(`const r = {}; for (const n of ['sources','matieres','fiches','questions','highlights']) r[n] = (await S.getAll(n)).length; return r;`);
A.v(apres.questions === avant.questions && apres.sources === avant.sources && apres.fiches === avant.fiches + (avant.pdfDeja ? 0 : 1), 'données intactes (seule la fiche PDF de test s’ajoute)', JSON.stringify({ avant, apres }));
// synchro normale après tout ça : file vide, « À jour »
await A.ev(`(window.dispatchEvent(new Event('focus')), 1)`); await A.reglages(); await A.voirSynchro();
const lf = await attendreLigne(A, 'ajour', 60000);
A.v(lf && lf.code === 'ajour', 'synchro normale ensuite : « À jour » (PDF envoyé au cloud compris)', lf && lf.texte);

for (const x of tous) { const errs = x.erreurs.filter((e) => !/validateDOMNesting|Failed to load resource|refus/.test(e)); x.v(errs.length === 0, `${x.nom} : aucune erreur console`, errs.join(' | ').slice(0, 300)); }
const n = tous.reduce((s, x) => s + x.echecs, 0);
sortie(n ? `❌ ${n} échec(s)` : '✅ tout est vert');
process.exit(0);
