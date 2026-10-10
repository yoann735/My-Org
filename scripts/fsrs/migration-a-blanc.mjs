// RÉPÉTITION À BLANC de la migration FSRS sur une COPIE de la sauvegarde pre-fsrs-2026-10-10.
// Lecture seule : les fichiers de la sauvegarde ne sont jamais écrits (empreintes vérifiées avant/après) ;
// tout se passe en mémoire. Aucune IndexedDB, aucun Supabase.
// Séquence identique à la vraie vie : (1) installation de l'étape 2 → conversion des cartes en
// apprentissage (lib/conversionApprentissage.js, migration automatique) ; (2) « Appliquer la
// migration » (scheduler/migration.js migrerVersFSRS) ; (3) bascule ON (basculerVersFSRS).
// Usage : node scripts/fsrs/migration-a-blanc.mjs [dossier-sauvegarde] [jour=2026-10-10] [rapport.md]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.VITEST = process.env.VITEST || ''; // fuzz : sans effet ici (aucune réponse simulée)
const racine = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const B = resolve(process.argv[2] || join(racine, '..', 'backups', 'pre-fsrs-2026-10-10'));
const JOUR = process.argv[3] || '2026-10-10';
const SORTIE = process.argv[4] || join(racine, 'docs', 'fsrs-migration-rapport.md');
const sha = (x) => createHash('sha256').update(x).digest('hex');

// empreintes de la sauvegarde AVANT (preuve qu'elle n'est pas modifiée)
const empreintes = () => { const m = new Map(); const tour = (d) => readdirSync(d).forEach((n) => { const p = join(d, n); if (statSync(p).isDirectory()) tour(p); else m.set(relative(B, p), sha(readFileSync(p))); }); tour(join(B, 'idb')); return m; };
const avantFichiers = empreintes();

const ix = JSON.parse(readFileSync(join(B, 'idb', 'index.json'), 'utf8'));
const store = (db) => { const b = ix.bases.find((x) => x.db === db); return b ? b.stores[0].fichiers.flatMap((f) => JSON.parse(readFileSync(join(B, f.fichier), 'utf8')).entries.map((e) => e[1])) : []; };
const db = JSON.parse(JSON.stringify({ sources: store('medrevise-sources'), matieres: store('medrevise-matieres'), fiches: store('medrevise-fiches'), questions: store('medrevise-questions') }));

// « aujourd'hui » des modules de l'app = JOUR, 10:00 à Bruxelles
const RealDate = Date;
const fige = new RealDate(`${JOUR}T08:00:00Z`).getTime();
globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fige])); } static now() { return fige; } };
process.env.TZ = 'Europe/Brussels';

const planning = await import(join(racine, 'src/medrevise/lib/planning.js'));
const { convertirApprentissage } = await import(join(racine, 'src/medrevise/lib/conversionApprentissage.js'));
const { migrerVersFSRS, basculerVersFSRS, chargeParJour, contenuCanonique } = await import(join(racine, 'src/medrevise/scheduler/migration.js'));
const { previsualiser, Rating } = await import(join(racine, 'src/medrevise/scheduler/fsrs.js'));
const { midi, ecartJours } = await import(join(racine, 'src/medrevise/scheduler/jours.js'));

const idx = planning.index(db);
const planifiee = (q) => planning.isFicheScheduled(db, idx.fById[q.ficheId], idx);
const fc0 = db.questions.filter((q) => q.type === 'flashcard');

// (1) conversion (installation)
const conv = convertirApprentissage(db.questions, planifiee, JOUR);
const convParId = new Map(conv.maj.map((q) => [q.id, q]));
const q1 = db.questions.map((q) => convParId.get(q.id) || q);
const fc1 = q1.filter((q) => q.type === 'flashcard');

// (2) migration FSRS
const mig = migrerVersFSRS(q1, JOUR, null);
const migParId = new Map(mig.maj.map((q) => [q.id, q]));
const q2 = q1.map((q) => migParId.get(q.id) || q);
const fc2 = q2.filter((q) => q.type === 'flashcard');

// contrôles par carte
let ecartsDate = 0, ecartsDue = 0, ecartsContenu = 0, ecartsSha = 0;
const shaCarte = (c) => sha(contenuCanonique(c));
for (const c of fc1) {
  const m = migParId.get(c.id);
  if ((m.dueDate ?? null) !== (c.dueDate ?? null)) ecartsDate++;
  if ((m.fsrs.due ?? null) !== (c.dueDate ?? null)) ecartsDue++;
  if (contenuCanonique(m) !== contenuCanonique(c)) ecartsContenu++;
  if (shaCarte(m) !== shaCarte(c)) ecartsSha++;
}
const autres = q1.filter((q) => q.type !== 'flashcard');
const autresIntacts = autres.every((q) => JSON.stringify(q2.find((x) => x.id === q.id)) === JSON.stringify(q));
// contenu riche : Muscle, molécules, images, occlusions
const riches = fc1.filter((c) => c.muscle || c.molecule || c.imageId || c.occlusion);
const richesIntacts = riches.every((c) => shaCarte(migParId.get(c.id)) === shaCarte(c));
const empreinteGlobale = (l) => sha(l.map((c) => c.id + ':' + shaCarte(c)).sort().join('\n'));

// charge par jour (cartes planifiées), avant / après migration
const plan1 = fc1.filter(planifiee), plan2 = fc2.filter(planifiee);
const chAv = chargeParJour(plan1, planning.nextDate, JOUR), chAp = chargeParJour(plan2, planning.nextDate, JOUR);
const chargeIdentique = JSON.stringify(chAv) === JSON.stringify(chAp);

// (3) bascule ON juste après
const bas = basculerVersFSRS(q2, JOUR, { planificateur: 'fsrs', fsrsMigration: {} }, planifiee);

// aperçu : intervalle si « Correct » le jour d'échéance (information, rien n'est appliqué)
const parIntervalle = new Map();
for (const c of plan2.filter((x) => x.fsrs && x.fsrs.state === 2 && x.dueDate)) {
  const p = previsualiser(c.fsrs, midi(c.dueDate < JOUR ? JOUR : c.dueDate), { ...(await import(join(racine, 'src/medrevise/scheduler/config.js'))).configPlanificateur({}), fuzz: false });
  const k = c.intervalDays || 1; const g = parIntervalle.get(k) || { n: 0, good: [], hard: [], again: [] };
  g.n++; g.good.push(p[Rating.Good].jours); g.hard.push(p[Rating.Hard].jours); g.again.push(p[Rating.Again].jours);
  parIntervalle.set(k, g);
}
const mediane = (l) => { const s = l.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const stab = fc2.filter((c) => c.fsrs.state === 2).map((c) => c.fsrs.stability);
const diff = fc2.filter((c) => c.fsrs.state === 2).map((c) => c.fsrs.difficulty);

const apresFichiers = empreintes();
const sauvegardeIntacte = avantFichiers.size === apresFichiers.size && [...avantFichiers].every(([k, v]) => apresFichiers.get(k) === v);

const ok = ecartsDate === 0 && ecartsDue === 0 && ecartsContenu === 0 && ecartsSha === 0 && chargeIdentique && autresIntacts && richesIntacts
  && fc2.length === fc1.length && bas.rapport.datesModifiees === 0 && conv.rapport.converties === 297 && conv.rapport.enRattrapageApres === 0 && sauvegardeIntacte;

const ligne = (cols) => '| ' + cols.join(' | ') + ' |';
const md = `# Migration FSRS — répétition à blanc (${JOUR})

Exécutée le ${new RealDate().toISOString().replace('T', ' ').slice(0, 16)} UTC par \`scripts/fsrs/migration-a-blanc.mjs\`, sur une **copie en mémoire**
de la sauvegarde \`pre-fsrs-2026-10-10\` (${relative(racine, B)}). Aucune vraie donnée n'a été migrée : ni IndexedDB, ni Supabase.
Les fichiers de la sauvegarde ont les mêmes empreintes SHA-256 avant et après (${avantFichiers.size} fichiers) : **${sauvegardeIntacte ? 'oui' : 'NON'}**.

## Verdict : ${ok ? '**RAPPORT PARFAIT**' : '**ÉCHEC**'}

| Contrôle | Attendu | Obtenu |
|---|---|---|
| Flashcards avant = après | ${fc1.length} | ${fc2.length} |
| Cartes dont \`dueDate\` change (migration) | 0 | **${ecartsDate}** |
| Cartes dont l'échéance FSRS ≠ \`dueDate\` | 0 | **${ecartsDue}** |
| Cartes dont le contenu change (tout sauf \`fsrs\`/\`updatedAt\`, SHA-256 par carte) | 0 | **${ecartsSha}** |
| Contenu riche intact (Muscle, molécules, images, masques : ${riches.length} cartes) | oui | **${richesIntacts ? 'oui' : 'NON'}** |
| Autres questions (QCM, exercices, Feynman : ${autres.length}) identiques | oui | **${autresIntacts ? 'oui' : 'NON'}** |
| Charge par jour sur 30 jours avant = après | oui | **${chargeIdentique ? 'oui' : 'NON'}** |
| Bascule ON juste après : dates modifiées | 0 | **${bas.rapport.datesModifiees}** (étalement : ${bas.rapport.etalement.length}) |

Empreinte globale du contenu des flashcards (hors \`fsrs\`) : avant \`${empreinteGlobale(fc1).slice(0, 16)}…\`, après \`${empreinteGlobale(fc2).slice(0, 16)}…\`.

## 1. Installation de l'étape 2 : conversion des cartes en apprentissage

${ligne(['En apprentissage', 'Converties', 'Séance du jour → ' + JOUR, 'Date future gardée', 'Demain', 'Hors planning', 'En rattrapage après'])}
${ligne(['---', '---', '---', '---', '---', '---', '---'])}
${ligne([conv.rapport.enApprentissage, conv.rapport.converties, conv.rapport.seanceDuJour, conv.rapport.dateFutureGardee, conv.rapport.demain, conv.rapport.horsPlanning, conv.rapport.enRattrapageApres])}

Les ${conv.rapport.horsPlanning} cartes « demain » sont toutes hors planning (cours Rattrapage aux rappels J coupés, fiches archivées) : elles n'apparaissent nulle part tant qu'on ne les replanifie pas.

## 2. Migration FSRS (bloc \`fsrs\` initialisé, \`dueDate\` inchangée)

${ligne(['Source de l’état', 'Cartes'])}
${ligne(['---', '---'])}
${ligne(['Historique rejoué (notes J, répétitions du même jour fusionnées, difficulté de départ 7)', mig.rapport.parSource.historique || 0])}
${ligne(['Estimation (vue mais jamais notée : stabilité ≈ intervalle, difficulté 7)', mig.rapport.parSource.estimation || 0])}
${ligne(['Nouvelle (jamais vue : paramètres FSRS par défaut à la 1re réponse)', mig.rapport.parSource.nouvelle || 0])}
${ligne(['État ombre conservé', mig.rapport.parSource.ombreConservee || 0])}
${ligne(['**Total**', mig.rapport.migrees])}

Cartes en révision après migration : stabilité médiane ${mediane(stab).toFixed(1)} j (min ${Math.min(...stab).toFixed(1)}, max ${Math.max(...stab).toFixed(1)}), difficulté médiane ${mediane(diff).toFixed(2)}.

## 3. Charge par jour sur 30 jours (flashcards planifiées)

${ligne(['Jour', 'Avant migration', 'Après migration'])}
${ligne(['---', '---', '---'])}
${ligne(['en retard', chAv.retard, chAp.retard])}
${chAv.lignes.map((l, i) => ligne([l.jour, l.n, chAp.lignes[i].n])).join('\n')}
${ligne(['au-delà de 30 j', chAv.apres, chAp.apres])}
${ligne(['sans date', chAv.sansDate, chAp.sansDate])}

## 4. Pour information : prochaine échéance si « Correct » le jour prévu (FSRS ON, sans fuzz, plafond 45 j)

Rien de ceci n'est appliqué par la migration : c'est ce qui se passerait à la **prochaine** réponse.

${ligne(['Intervalle maison actuel', 'Cartes', 'À revoir (médiane)', 'Difficile (médiane)', 'Correct (médiane)'])}
${ligne(['---', '---', '---', '---', '---'])}
${[...parIntervalle].sort((a, b) => a[0] - b[0]).map(([k, g]) => ligne([k + ' j', g.n, mediane(g.again) + ' j', mediane(g.hard) + ' j', mediane(g.good) + ' j'])).join('\n')}
`;
writeFileSync(SORTIE, md);
console.log(ok ? 'RAPPORT PARFAIT' : 'ÉCHEC', '→', relative(racine, SORTIE));
console.log(JSON.stringify({ conversion: conv.rapport, migration: { ...mig.rapport, exemplesEcarts: undefined }, ecartsDate, ecartsDue, ecartsSha, chargeIdentique, bascule: bas.rapport.datesModifiees, sauvegardeIntacte }));
process.exit(ok ? 0 : 1);
