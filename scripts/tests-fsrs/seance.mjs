// Scénario séance (banc FSRS) : Démarrer → 20 réponses (les 4 boutons) → vérifications :
// boutons et intervalles affichés, astuce une seule fois, dates = planificateur maison (OFF),
// bloc FSRS écrit (ombre), 20 entrées de journal, reprise après interruption.
// Usage : node seance.mjs <port> <dossier-captures> [nombre=20]
import { writeFileSync, mkdirSync } from 'node:fs';
import { appareil } from './banc.mjs';

const [port = '9335', dossier = '/tmp/seance-fsrs', nStr = '20'] = process.argv.slice(2);
const N = Number(nStr);
mkdirSync(dossier, { recursive: true });
const a = await appareil(port);
const mobile = port === '9336';
await a.send('Page.enable');
await a.send('Emulation.setDeviceMetricsOverride', mobile ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } : { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
if (mobile) await a.send('Emulation.setTouchEmulationEnabled', { enabled: true });
const capture = async (n) => { const r = await a.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${dossier}/${port}-${n}.png`, Buffer.from(r.data, 'base64')); };
const journalN = () => a.ev(`(async () => (await ${a.mod('journal.js').replace('/src/medrevise/lib/journal.js', '/src/medrevise/journal/journal.js')}).compteJournal())()`);
const rapport = { erreurs: [], reponses: [] };

if (!mobile) await a.ev(`(() => { const el = [...document.querySelectorAll('.sb-item')].find((b) => (b.getAttribute('title') || '').startsWith('Réviser')); if (el) el.click(); return !!el; })()`);
await a.attendre(`!!document.querySelector('.sfa')`);
rapport.encart = await a.texte('.sfa');
const j0 = await journalN();
await a.clic('Démarrer', '.sfa-btn') || await a.clic('Reprendre', '.sfa-btn');
await a.attendre(`!!document.querySelector('.sfc-carte') || /terminée|Rien/.test(document.querySelector('.sfc')?.textContent || '')`);
rapport.progression0 = await a.texte('.sfc-prog');
await capture('1-recto');
for (let i = 0; i < N; i++) {
  if (!(await a.ev(`!!document.querySelector('.sfc-carte')`))) break;
  const id = await a.ev(`document.querySelector('.sfc-carte').dataset.carte`);
  const avant = await a.ev(`(async () => { const q = await ${a.mod('storage.js')}.getOne('questions', ${JSON.stringify(id)}); return { dueDate: q.dueDate, intervalDays: q.intervalDays, h: (q.historique||[]).length, fsrs: !!q.fsrs }; })()`);
  await a.clic('Voir la réponse'); await a.dormir(250);
  const boutons = await a.ev(`[...document.querySelectorAll('.sfc-notes.quatre button')].map((b) => b.textContent.replace(/\\s+/g, ' ').trim())`);
  const astuce = await a.ev(`(document.querySelector('.bf-astuce') || {}).textContent || null`);
  if (i === 0) await capture('2-verso-4-boutons');
  const note = [3, 2, 3, 1, 4][i % 5];
  await a.ev(`document.querySelectorAll('.sfc-notes.quatre button')[${note - 1}].click(), true`);
  await a.dormir(500);
  const apres = await a.ev(`(async () => { const q = await ${a.mod('storage.js')}.getOne('questions', ${JSON.stringify(id)}); return { dueDate: q.dueDate, intervalDays: q.intervalDays, h: (q.historique||[]).length, fsrsDue: q.fsrs && q.fsrs.due, fsrsSource: q.fsrs && q.fsrs.source }; })()`);
  rapport.reponses.push({ id, note, boutons, astuce, avant, apres });
}
rapport.progressionFin = await a.texte('.sfc-prog');
await capture('3-apres-reponses');
rapport.journalAjoutes = (await journalN()) - j0;
// interruption puis reprise
await a.ev(`document.querySelector('.sfc-quitter').click(), true`); await a.dormir(1200);
rapport.encartReprise = await a.texte('.sfa');
await capture('4-reprise');
rapport.erreurs = a.erreurs;
writeFileSync(`${dossier}/${port}-seance.json`, JSON.stringify(rapport, null, 1));
const r0 = rapport.reponses[0];
console.log('encart :', rapport.encart, '| prog', rapport.progression0, '→', rapport.progressionFin);
console.log('boutons carte 1 :', r0 && r0.boutons.join(' · '), '| astuce 1re carte :', r0 && r0.astuce, '| astuce 2e :', rapport.reponses[1] && rapport.reponses[1].astuce);
console.log('réponses', rapport.reponses.length, '· journal +', rapport.journalAjoutes, '· reprise :', rapport.encartReprise, '· erreurs', a.erreurs.length);
a.fermer();
