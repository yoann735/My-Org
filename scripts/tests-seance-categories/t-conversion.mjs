// (24/10) Conversion « Nouvelles » sur les VRAIES données (copie restaurée dans un profil isolé, sans cloud) :
// au démarrage, la migration conversion-nouvelles-v1 fait un putBackup puis marque les cartes jamais notées.
// Contrôles : rapport en meta, sauvegarde présente et complète, aucune carte perdue, cartes révisées intactes
// (date comprise), idempotence (2e démarrage : rien), liste écrite dans ../cap/conversion-nouvelles.json.
// Usage : node t-conversion.mjs <export-avant (dossier export-idb)>
import fs from 'node:fs';
import { join } from 'node:path';
import { banc } from './commun.mjs';
const [EXPORT] = process.argv.slice(2);
const avant = JSON.parse(fs.readFileSync(join(EXPORT, 'idb/medrevise-questions/v1.json'), 'utf8')).entries.map((e) => e[1]);
const b = await banc(1440, 900);
await b.ouvrirApp();
await b.attendre(`(async () => !!(await ${b.mod('storage.js')}.getMeta('migration.conversion-nouvelles-v1')))()`, 30000);
const r = await b.S(`const m = await S.getMeta('migration.conversion-nouvelles-v1'); const migs = await S.getMeta('migrations');
  const sauv = await S.getBackup(m.sauvegarde); const qs = await S.getAll('questions');
  return { m, migs, sauv: sauv ? { cle: sauv.key, n: sauv.data.length, ids: sauv.data.map((q) => q.id), nouvelleAvant: sauv.data.filter((q) => q.nouvelle !== undefined).length } : null, qs };`);
const apres = r.qs;
b.ok(r.migs.includes('conversion-nouvelles-v1'), 'migration conversion-nouvelles-v1 appliquée au démarrage');
b.ok(r.m.convertis === 270, `cartes converties en Nouvelles : ${r.m.convertis}`, `gardent leur date : ${r.m.gardentLeurDate}`);
b.ok(r.sauv && r.sauv.n === r.m.convertis && r.sauv.nouvelleAvant === 0, `putBackup AVANT écriture : ${r.sauv && r.sauv.cle} (${r.sauv && r.sauv.n} cartes, état d’origine)`);
b.ok(apres.length === avant.length, `aucune carte perdue : ${apres.length} / ${avant.length} enregistrements « questions »`);
const parId = Object.fromEntries(apres.map((q) => [q.id, q]));
let manquantes = 0, champsModifies = 0, revisesTouchees = 0, nouvellesOk = 0;
const sans = (q) => { const { updatedAt, nouvelle, conversionNouvelles, ...x } = q; return x; }; // eslint-disable-line no-unused-vars
for (const q of avant) {
  const a = parId[q.id];
  if (!a) { manquantes++; continue; }
  if (JSON.stringify(sans(a)) !== JSON.stringify(sans(q))) champsModifies++;
  const notee = (q.historique || []).some((h) => h && h.qualite != null);
  if (q.type === 'flashcard' && notee && JSON.stringify(a) !== JSON.stringify(q)) revisesTouchees++;
  if (q.type === 'flashcard' && !notee && a.nouvelle === true && a.conversionNouvelles && a.conversionNouvelles.dueDateAvant === (q.dueDate ?? null) && a.dueDate === q.dueDate) nouvellesOk++;
}
b.ok(manquantes === 0 && champsModifies === 0, 'aucun champ retiré ni modifié (seuls nouvelle, conversionNouvelles et updatedAt ajoutés)', `${manquantes} manquantes, ${champsModifies} modifiées`);
b.ok(revisesTouchees === 0, `les ${r.m.gardentLeurDate} cartes déjà révisées sont strictement intactes (date comprise)`);
b.ok(nouvellesOk === r.m.convertis, `chaque Nouvelle garde sa date de départ en base (dueDate inchangé, copié dans conversionNouvelles.dueDateAvant)`, `${nouvellesOk}`);
fs.mkdirSync('../cap', { recursive: true });
fs.writeFileSync('../cap/conversion-nouvelles.json', JSON.stringify(r.m, null, 1));
// idempotence : 2e démarrage
const n0 = await b.S(`return (await S.getMeta('migration.conversion-nouvelles-v1.suivant')) || null`);
await b.ouvrirApp();
await b.dormir(4000);
const n1 = await b.S(`return (await S.getMeta('migration.conversion-nouvelles-v1.suivant')) || null`);
const qs2 = await b.S(`return (await S.getAll('questions')).filter((q) => q.nouvelle === true).length`);
b.ok(!n0 && !n1 && qs2 === r.m.convertis, `idempotente : 2e démarrage sans nouvelle conversion (${qs2} Nouvelles)`);
b.ok(b.erreurs.length === 0, 'aucune erreur JS', b.erreurs.slice(0, 3).join(' | '));
process.exit(0);
