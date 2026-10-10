// Réglages → FSRS (ombre) et Synchronisation (journal) : lecture + captures. « Appliquer la migration… »
// est seulement PRÉPARÉ (rapport affiché) puis annulé : aucune écriture (vérifié).
// Usage : node reglages.mjs <port> <dossier-captures>
import { writeFileSync, mkdirSync } from 'node:fs';
import { appareil } from './banc.mjs';

const [port = '9335', dossier = '/tmp/reglages-fsrs'] = process.argv.slice(2);
mkdirSync(dossier, { recursive: true });
const a = await appareil(port);
await a.send('Page.enable');
const capture = async (n) => { const r = await a.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${dossier}/${port}-${n}.png`, Buffer.from(r.data, 'base64')); };
await a.ev(`(() => { const el = [...document.querySelectorAll('.sb-item')].find((b) => (b.getAttribute('title') || '').startsWith('Réglages')); if (el) el.click(); return !!el; })()`);
await a.attendre(`!!document.querySelector('.fsrs-reg')`);
await a.dormir(800);
const carte = `[...document.querySelectorAll('.card, [class*=card]')].find((c) => c.querySelector('.fsrs-reg'))`;
await a.ev(`(${carte}).scrollIntoView({ block: 'start' }), true`); await a.dormir(400);
await capture('1-fsrs-ombre');
const lu = { ombre: await a.texte('.fsrs-reg .hint'), lignesDiff: await a.ev(`document.querySelectorAll('.fsrs-ligne.diff').length`), exemples: await a.ev(`document.querySelectorAll('.fsrs-ex').length`),
  interrupteur: await a.ev(`(() => { const s = document.querySelector('.fsrs-reg [role=switch], .fsrs-reg button[aria-checked]'); return s ? s.getAttribute('aria-checked') : null; })()`) };
await a.clic('Appliquer la migration'); await a.dormir(1500);
lu.rapportMigration = await a.texte('.fsrs-prep');
await a.ev(`document.querySelector('.fsrs-prep').scrollIntoView({ block: 'center' }), true`); await a.dormir(300);
await capture('2-migration-preparee');
await a.clic('Annuler', '.fsrs-prep button'); await a.dormir(500);
lu.apresAnnuler = await a.ev(`(async () => { const r = await ${a.mod('storage.js')}.getReglagesFC(); const q = await ${a.mod('storage.js')}.getAll('questions'); return { fsrsMigration: r ? r.fsrsMigration || null : null, planificateur: r ? r.planificateur || 'maison' : 'maison', migrees: q.filter((x) => x.fsrs && x.fsrs.migre).length }; })()`);
await a.ev(`document.querySelector('.sj').scrollIntoView({ block: 'center' }), true`); await a.dormir(300);
lu.journal = await a.texte('.sj');
await capture('3-synchro-journal');
lu.erreurs = a.erreurs;
writeFileSync(`${dossier}/${port}-reglages.json`, JSON.stringify(lu, null, 1));
console.log(JSON.stringify(lu, null, 1).slice(0, 2500));
a.fermer();
