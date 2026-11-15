// Téléphone (390×844, tactile) : node t-telephone.mjs
// Le téléphone n'a pas de lecteur de documents (accueil, séances, dessins) : on y vérifie que les annotations écrites
// ailleurs arrivent intactes, que la FILE D'ENVOI des documents (même moteur) survit à un rechargement hors ligne et
// part au retour du réseau, que l'état unique d'enregistrement est juste, et qu'une séance de flashcards fonctionne.
import { appareil, dormir, FAUX_SB } from './commun.mjs';
const b = await appareil('tel');
await b.ouvrirApp();
b.ok(await b.attendre(`!!document.querySelector('.mrm-app, .mrm-home, .mrm-cta')`, 20000), 'accueil du téléphone affiché');
await b.attendreSynchro(40000);
const etat = await (await fetch(FAUX_SB + '/__etat')).json();
const vivantsCloud = etat.rows.filter((r) => r.store === 'annotations' && !r.deleted && r.data && r.data.ficheId === 'f-enr').map((r) => [r.record_id, r.updated_at]);
const locaux = await b.S(`return (await S.getAll('annotations')).filter((a) => a.ficheId === 'f-enr').map((a) => a.id)`);
b.ok(vivantsCloud.length > 0 && vivantsCloud.every(([id]) => locaux.includes(id)) && locaux.length === vivantsCloud.length,
  `les annotations écrites sur l'ordinateur et la tablette sont arrivées (${locaux.length}/${vivantsCloud.length})`);
const contenusCloud = Object.fromEntries(etat.rows.filter((r) => r.store === 'annotations' && !r.deleted && r.data && r.data.ficheId === 'f-enr').map((r) => [r.record_id, JSON.stringify(r.data.content || null)]));
const contenusLoc = await b.S(`return Object.fromEntries((await S.getAll('annotations')).filter((a) => a.ficheId === 'f-enr').map((a) => [a.id, JSON.stringify(a.content || null)]))`);
b.ok(Object.keys(contenusCloud).every((k) => contenusLoc[k] === contenusCloud[k]), 'chaque boîte a exactement le texte du serveur');

// file d'envoi hors ligne (même moteur que les documents)
await b.horsLigne(true);
const id = await b.S(`const r = S.newNoteBox({ ficheId: 'f-enr', page: 2, x: 0.1, y: 0.9, width: 0.2, height: 0.04 });
  const d = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Depuis le téléphone hors ligne' }] }] };
  await S.put('annotations', { ...r, content: d }); return r.id;`);
await dormir(800);
const e1 = await b.ev(`(async () => { const E = await __imp('/src/medrevise/lib/enregistrement.js'); await E.rafraichirFile(); return E.etatEnregistrement('f-enr'); })()`);
b.ok(e1.code === 'attente', 'hors ligne : état « En attente d’envoi »', e1.detail);
await b.send('Page.reload'); await b.attendre(`document.readyState === 'complete'`, 20000); await dormir(2500);
const garde = await b.ev(`(async () => { const y = await __imp('/src/medrevise/data/sync.js'); return (await y.outboxEntries()).some(([, v]) => v.record_id === ${JSON.stringify(id)}); })()`);
const loc = await b.S(`return !!(await S.getOne('annotations', ${JSON.stringify(id)}))`);
b.ok(garde && loc, 'rechargé hors ligne : l’annotation et son entrée de file d’envoi sont toujours là');
await b.horsLigne(false);
let arrive = false;
for (let i = 0; i < 60 && !arrive; i++) { arrive = (await (await fetch(FAUX_SB + '/__etat')).json()).rows.some((r) => r.record_id === id && !r.deleted); if (!arrive) await dormir(500); }
b.ok(arrive, 'retour du réseau : envoyée automatiquement au serveur');
const e2 = await b.ev(`(async () => { const E = await __imp('/src/medrevise/lib/enregistrement.js'); await E.rafraichirFile(); return E.etatEnregistrement('f-enr'); })()`);
b.ok(e2.code === 'envoye', 'état : « Enregistré et envoyé »', e2.detail);
await b.S(`await S.remove('annotations', ${JSON.stringify(id)}); return 1;`);

// séance de flashcards (non-régression)
// seed.mjs ne sème ses 6 flashcards qu'une fois et chaque passage des bancs en note une : sans carte fraîche, au 7e passage
// plus rien n'est dû (bouton désactivé, journal inchangé). On ajoute donc une carte de test due aujourd'hui, retirée à la fin.
const idCarte = 'fc-tel-' + Date.now();
await b.S(`const t = (await __imp('/src/medrevise/lib/sm2.js')).todayISO();
  await S.put('questions', { id: ${JSON.stringify(idCarte)}, type: 'flashcard', ficheId: 'f-enr', theme: 'Glandes', recto: 'Question téléphone ?', verso: 'Réponse téléphone',
    historique: [{ date: t, qualite: 3 }], nouvelle: false, intervalDays: 2, dueDate: t, j0Date: t }); return 1;`);
await b.ouvrirApp();
await b.attendreSynchro(30000);
const cta = await b.ev(`(() => { const x = document.querySelector('.mrm-cta'); return x ? { txt: x.innerText, off: x.disabled } : null; })()`);
b.ok(!!cta && !cta.off, 'accueil : séance disponible', cta && cta.txt.replace(/\n/g, ' '));
// machine chargée : on attend (et on retente le clic) plutôt que de dormir un temps fixe
let carte = false;
for (let essai = 0; essai < 3 && !carte; essai++) {
  await b.attendre(`(() => { const x = document.querySelector('.mrm-cta'); return !!x && !x.disabled; })()`, 10000);
  await b.clic(`document.querySelector('.mrm-cta')`, 1500);
  carte = await b.attendre(`!!document.querySelector('.mrm-flash-card')`, 20000);
}
b.ok(carte, 'séance lancée : une carte s’affiche');
await b.clic(`document.querySelector('.mrm-flash-card')`, 800);
await b.attendre(`!!document.querySelector('.mrm-rate-btn.hard, .mrm-rate-btn')`, 5000);
const avant = await b.ev(`(async () => { const J = await __imp('/src/medrevise/journal/journal.js'); return (await J.toutLeJournal()).length; })()`);
await b.clic(`[...document.querySelectorAll('.mrm-rate-btn')].find((x) => /Correct|Bien|Facile|Difficile/.test(x.innerText)) || document.querySelector('.mrm-rate-btn')`, 1200);
await b.attendre(`(async () => { const J = await __imp('/src/medrevise/journal/journal.js'); return (await J.toutLeJournal()).length > ${avant}; })()`, 10000, 250);
const apres = await b.ev(`(async () => { const J = await __imp('/src/medrevise/journal/journal.js'); return (await J.toutLeJournal()).length; })()`);
b.ok(apres === avant + 1, 'une réponse notée : journal +1', `${avant} → ${apres}`);
await b.capture('telephone-seance');
await b.S(`await S.remove('questions', ${JSON.stringify(idCarte)}); return 1;`);
process.exitCode = b.fin();
b.fermerWs();
