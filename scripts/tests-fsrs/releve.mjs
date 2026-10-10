// Relevé d'un appareil (banc FSRS) : ouvre MedRevise, lit l'encart « Aujourd'hui », le calendrier
// (dueOn sur 14 jours), le rattrapage, les badges J+N, la migration, puis capture Accueil / Réviser.
// Usage : node releve.mjs <port> <nom> <dossier-sortie>
import { writeFileSync, mkdirSync } from 'node:fs';
import { appareil } from './banc.mjs';

const [port = '9335', nom = 'releve', dossier = '/tmp/releve-fsrs'] = process.argv.slice(2);
mkdirSync(dossier, { recursive: true });
const a = await appareil(port);
await a.send('Network.enable'); await a.send('Network.setCacheDisabled', { cacheDisabled: true });
await a.send('Page.enable');
await a.send('Emulation.setDeviceMetricsOverride', port === '9336' ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } : { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await a.send('Page.reload'); await a.dormir(2500);
if (!(await a.ev(`!!document.querySelector('[data-app="medrevise"]')`))) await a.clic('MedRevise', '.hub-card');
await a.attendre(`!!document.querySelector('[data-app="medrevise"]')`, 20000);
await a.dormir(6000); // synchro de démarrage + migrations + rechargement
const capture = async (n) => { const r = await a.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${dossier}/${nom}-${n}.png`, Buffer.from(r.data, 'base64')); };
const aller = async (titre) => { await a.ev(`(() => { const el = [...document.querySelectorAll('.sb-item, .mrm-tab, button, a')].find((b) => (b.getAttribute('title') || b.textContent || '').trim().startsWith(${JSON.stringify(titre)})); if (el) el.click(); return !!el; })()`); await a.dormir(1500); };

const donnees = await a.ev(`(async () => {
  const st = ${a.mod('storage.js')}; const pl = ${a.mod('planning.js')}; const sm2 = ${a.mod('sm2.js')};
  const [sources, matieres, fiches, questions, dossiers] = await Promise.all(['sources','matieres','fiches','questions','dossiers'].map((s) => st.getAll(s)));
  const db = { sources, matieres, fiches, questions, dossiers };
  const t = sm2.todayISO(); const ix = pl.index(db);
  const cal = []; for (let i = 0; i < 14; i++) { const d = pl.addDays(t, i); cal.push({ d, ids: pl.dueOn(db, d).map((q) => q.id).sort() }); }
  const badges = fiches.filter((f) => pl.isFicheScheduled(db, f, ix)).map((f) => ({ id: f.id, j: pl.ficheJ(db, f.id, ix).jLabel })).sort((x, y) => (x.id < y.id ? -1 : 1));
  const fc = questions.filter((q) => q.type === 'flashcard');
  return {
    jour: t,
    encart: (document.querySelector('.sfa') || {}).textContent || null,
    calendrier: cal,
    rattrapage: pl.overdueQuestions(db).map((q) => q.id).sort(),
    badges,
    flashcards: fc.length,
    learning: fc.filter((q) => q.learnState === 'learning').length,
    converties: fc.filter((q) => q.conversionApprentissage).length,
    conversionSeance: fc.filter((q) => q.conversionApprentissage && q.conversionApprentissage.seanceDuJour).length,
    avecBlocFsrs: fc.filter((q) => q.fsrs).length,
    migration: await st.getMeta('migration.conversion-apprentissage-v1'),
    reglagesFC: await st.getReglagesFC(),
    dueDates: Object.fromEntries(fc.map((q) => [q.id, q.dueDate || null])),
  };
})()`);
await aller('Accueil'); await capture('accueil');
await aller('Réviser'); await capture('reviser');
donnees.encartReviser = await a.texte('.sfa');
donnees.erreurs = a.erreurs;
writeFileSync(`${dossier}/${nom}.json`, JSON.stringify(donnees, null, 1));
console.log(nom, '· jour', donnees.jour, '· encart :', (donnees.encartReviser || '').slice(0, 90), '· rattrapage', donnees.rattrapage.length, '· learning', donnees.learning, '· converties', donnees.converties, '· erreurs', a.erreurs.length);
a.fermer();
