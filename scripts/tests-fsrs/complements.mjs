// Compléments (banc FSRS, profil de TEST restauré + faux cloud — jamais les vraies données) :
// 1. série d'une fiche (Session.jsx) : 4 boutons pour les flashcards, 3 pour les QCM ;
// 2. carte Muscle dans la séance (contenu riche) ;
// 3. table du journal absente au cloud : avertissement, réponses en attente, puis rattrapage ;
// 4. migration FSRS appliquée sur ce profil de test, interrupteur ON (aucune date ne bouge), une réponse
//    décidée par FSRS, puis OFF (retour au maison, dates gardées).
// Usage : node complements.mjs <dossier-captures>
import { writeFileSync, mkdirSync } from 'node:fs';
import { appareil } from './banc.mjs';

const dossier = process.argv[2] || '/tmp/complements-fsrs';
mkdirSync(dossier, { recursive: true });
const A = await appareil('9335');
await A.send('Page.enable');
await A.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const capture = async (n) => { const r = await A.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${dossier}/${n}.png`, Buffer.from(r.data, 'base64')); };
const aller = async (titre) => { await A.ev(`(() => { const el = [...document.querySelectorAll('.sb-item')].find((b) => (b.getAttribute('title') || '').startsWith(${JSON.stringify(titre)})); if (el) el.click(); return !!el; })()`); await A.dormir(1200); };
const st = A.mod('storage.js');
const J = A.mod('journal.js').replace('/src/medrevise/lib/journal.js', '/src/medrevise/journal/journal.js');
const SY = A.mod('synchro.js').replace('/src/medrevise/lib/synchro.js', '/src/medrevise/journal/synchro.js');
const r = {};

// 1. série d'une fiche contenant QCM + flashcards (Session.jsx)
r.serie = await A.ev(`(async () => {
  const q = await ${st}.getAll('questions');
  const parFiche = {}; q.forEach((x) => { (parFiche[x.ficheId] ||= { qcm: [], fc: [] })[x.type === 'qcm' ? 'qcm' : x.type === 'flashcard' ? 'fc' : 'autre']?.push(x); });
  const f = Object.entries(parFiche).find(([, v]) => v.qcm.length && v.fc.length);
  return f ? { ficheId: f[0], qcm: f[1].qcm.length, fc: f[1].fc.length } : null;
})()`);
await aller('Réviser');
// lancement par le même chemin que « Réviser toute cette fiche » (ctx.startSession) via l'arbre : clic sur le bouton visible
const lance = await A.clic('Réviser toute cette fiche');
await A.dormir(1500);
r.serie.lancee = lance;
const boutons = async () => A.ev(`(() => { const z = document.querySelector('.rev-rate'); return z ? { quatre: z.classList.contains('quatre'), libelles: [...z.querySelectorAll('button')].map((b) => b.textContent.replace(/\\s+/g, ' ').trim()) } : null; })()`);
r.serie.cartes = [];
for (let i = 0; i < 12 && lance; i++) {
  // QCM : cocher une réponse puis valider ; flashcard : retourner
  await A.ev(`(() => { const c = document.querySelector('.flash-card, .flash-face, .ff-zone'); if (c) c.click(); return true; })()`);
  await A.ev(`(() => { const o = document.querySelector('.qcm-opt, .rev-opt, [data-opt]'); if (o) o.click(); const v = [...document.querySelectorAll('button')].find((b) => /Valider/.test(b.textContent)); if (v) v.click(); return true; })()`);
  await A.dormir(500);
  const b = await boutons();
  if (!b) break;
  r.serie.cartes.push(b);
  if (b.quatre && !r.serie.captureFait) { await capture('1-serie-flashcard-4-boutons'); r.serie.captureFait = true; }
  if (!b.quatre && !r.serie.captureQcm) { await capture('1b-serie-qcm-3-boutons'); r.serie.captureQcm = true; }
  await A.ev(`document.querySelectorAll('.rev-rate button')[2].click(), true`); // Correct (flashcard) / Facile (QCM)
  await A.dormir(900);
  await A.clic('Passer');
}

// 2. carte Muscle dans la séance
await aller('Réviser');
const idMuscle = await A.ev(`(async () => { const q = await ${st}.getAll('questions'); const m = q.find((x) => x.muscle && x.muscle.lignes && x.dueDate && x.dueDate <= '2026-10-10'); return m ? m.id : null; })()`);
r.muscle = { id: idMuscle };
if (idMuscle) {
  await A.clic('Reprendre', '.sfa-btn') || await A.clic('Démarrer', '.sfa-btn');
  await A.attendre(`!!document.querySelector('.sfc-carte')`);
  for (let i = 0; i < 120; i++) {
    const id = await A.ev(`(document.querySelector('.sfc-carte') || {}).dataset?.carte || null`);
    if (!id) break;
    if (id === idMuscle) {
      await A.clic('Voir la réponse'); await A.dormir(600);
      r.muscle.tableau = await A.ev(`!!document.querySelector('.sfc-muscle .mu-tableau, .sfc-muscle table, .sfc-muscle [class*=mu-]')`);
      await capture('2-seance-muscle-verso');
      break;
    }
    await A.clic('Voir la réponse'); await A.dormir(150);
    await A.ev(`document.querySelectorAll('.sfc-notes.quatre button')[2].click(), true`); await A.dormir(350);
  }
  await A.ev(`(document.querySelector('.sfc-quitter') || { click() {} }).click(), true`); await A.dormir(800);
}

// 3. table du journal absente au cloud
await fetch('http://localhost:54399/__journal?actif=0', { method: 'POST' });
await A.ev(`(async () => { const q = (await ${st}.getAll('questions')).find((x) => x.type === 'flashcard' && x.dueDate === '2026-10-12'); const rep = await import(performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('/scheduler/repondre.js')));
  await rep.repondreFlashcard(q, 3, { reglages: await ${st}.getReglagesFC(), sauver: async (c) => ${st}.put('questions', c) }); await ${SY}.synchroniserJournal(); return true; })()`);
await aller('Réglages');
await A.ev(`document.querySelector('.sj').scrollIntoView({ block: 'center' }), true`); await A.dormir(1500);
r.tableAbsente = await A.texte('.sj');
await capture('3-journal-table-absente');
await fetch('http://localhost:54399/__journal?actif=1', { method: 'POST' });
await A.clic('Synchroniser maintenant'); await A.dormir(6000);
r.tableRetablie = await A.texte('.sj');

// 4. migration (profil de test) + bascule ON / OFF
const dates = () => A.ev(`(async () => Object.fromEntries((await ${st}.getAll('questions')).filter((x) => x.type === 'flashcard').map((x) => [x.id, x.dueDate || null])))()`);
const d0 = await dates();
await A.ev(`document.querySelector('.fsrs-reg').scrollIntoView({ block: 'start' }), true`);
await A.clic('Appliquer la migration'); await A.dormir(1500);
r.migrationRapport = await A.texte('.fsrs-prep');
await A.clic('Confirmer : migrer', '.fsrs-prep button'); await A.dormir(4000);
const d1 = await dates();
r.migration = { message: await A.texte('.fsrs-reg .hint[style]'), datesModifiees: Object.keys(d0).filter((k) => d0[k] !== d1[k]).length, sauvegarde: await A.ev(`(async () => { const { getAllEntries } = ${st}; return (await getAllEntries('backups')).map(([k]) => k).filter((k) => String(k).startsWith('pre-fsrs-migration')).length; })()`) };
await A.ev(`(() => { const s = document.querySelector('.fsrs-reg .switch, .fsrs-reg [role=switch], .fsrs-reg button[aria-checked]'); if (s) s.click(); return !!s; })()`); await A.dormir(4000);
const d2 = await dates();
r.basculeOn = { planificateur: (await A.ev(`(async () => (await ${st}.getReglagesFC()).planificateur)()`)), datesModifiees: Object.keys(d1).filter((k) => d1[k] !== d2[k]).length, message: await A.texte('.fsrs-reg .hint[style]') };
await capture('4-fsrs-on');
// une réponse décidée par FSRS : dueDate = échéance FSRS, intervalle affiché = appliqué
r.reponseOn = await A.ev(`(async () => { const q = (await ${st}.getAll('questions')).find((x) => x.type === 'flashcard' && x.dueDate === '2026-10-12' && x.fsrs);
  const nt = await import(performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('/scheduler/noter.js')));
  const rep = await import(performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('/scheduler/repondre.js')));
  const reg = await ${st}.getReglagesFC(); const prevu = nt.intervallesPrevus(q, reg)[3];
  const s = await rep.repondreFlashcard(q, 3, { reglages: reg, sauver: async (c) => ${st}.put('questions', c) });
  return { prevu, dueDate: s.dueDate, fsrsDue: s.fsrs.due, maison: (nt.intervallesPrevus(q, null)[3] || {}).due }; })()`);
await A.ev(`(() => { const s = document.querySelector('.fsrs-reg .switch, .fsrs-reg [role=switch], .fsrs-reg button[aria-checked]'); if (s) s.click(); return !!s; })()`); await A.dormir(3000);
const d3 = await dates();
r.basculeOff = { planificateur: (await A.ev(`(async () => (await ${st}.getReglagesFC()).planificateur)()`)), datesModifiees: Object.keys(d2).filter((k) => d2[k] !== d3[k]).length };
r.erreurs = A.erreurs;
writeFileSync(`${dossier}/complements.json`, JSON.stringify(r, null, 1));
console.log(JSON.stringify(r, null, 1).slice(0, 4000));
A.fermer();
