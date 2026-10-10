// ANALYSE (lecture seule) des cartes d'une sauvegarde pour l'audit FSRS (docs/fsrs-etape1-audit.md).
// Utilise les VRAIS modules de l'app (planning.js, apprentissageFC.js, sm2.js), jamais une réimplémentation.
// Usage : node analyse-fsrs.mjs <dossier-sauvegarde> [date du jour YYYY-MM-DD]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { etatFC, planDuJour, estFlashcardJ } from '../../src/medrevise/lib/apprentissageFC.js';
import { index, isFicheScheduled, nextDate, addDays, scheduledQuestions } from '../../src/medrevise/lib/planning.js';

const [dossier, jour = '2026-10-10'] = process.argv.slice(2);
const ix = JSON.parse(readFileSync(join(dossier, 'idb', 'index.json'), 'utf8'));
const store = (db) => { const b = ix.bases.find((x) => x.db === db); return b ? b.stores[0].fichiers.flatMap((f) => JSON.parse(readFileSync(join(dossier, f.fichier), 'utf8')).entries.map((e) => e[1])) : []; };
const db = { sources: store('medrevise-sources'), matieres: store('medrevise-matieres'), fiches: store('medrevise-fiches'), questions: store('medrevise-questions'), dossiers: store('medrevise-dossiers') };
const cloud = JSON.parse(readFileSync(join(dossier, 'supabase', 'medrevise_records.json'), 'utf8')).lignes;
const compte = (l, f) => l.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const out = (t, v) => console.log(`\n## ${t}\n` + (typeof v === 'string' ? v : JSON.stringify(v, null, 1)));
const q = db.questions; const fc = q.filter(estFlashcardJ); const idx = index(db);
const planif = (x) => isFicheScheduled(db, idx.fById[x.ficheId], idx);

out('Types de questions', compte(q, (x) => x.type));
out('Flashcards : planifiées (cours/fiche avec rappels J, non archivés) / hors planning', compte(fc, (x) => (planif(x) ? 'planifiee' : 'hors-planning')));
out('Flashcards : état effectif (etatFC) × planifiée', compte(fc, (x) => `${etatFC(x, jour)}${planif(x) ? '' : ' (hors planning)'}`));
out('Flashcards : learnState stocké', compte(fc, (x) => String(x.learnState)));
const learning = fc.filter((x) => planif(x) && etatFC(x, jour) === 'learning');
out('En apprentissage : détail', compte(learning, (x) => `${x.learningIntroducedOn ? 'introduite' : 'pas encore introduite'} · source=${x.learningSource || '-'} · streak=${x.learningStreak || 0} · présentée=${!!x.learningPresented}`));
const plan = planDuJour(fc.filter(planif), null, jour, nextDate);
out(`Plan du jour ${jour} (planDuJour)`, { revisions: plan.revisions.length, enCours: plan.enCours.length, nouvelles: plan.nouvelles.length, aSortir: plan.aSortir.length });

// prochaine date : review → nextDate ; learning → learningDue (si introduite) sinon dueDate ; new → dueDate
const prochaine = (x) => { const e = etatFC(x, jour); if (e === 'review') return nextDate(x); if (e === 'learning') return x.learningIntroducedOn ? (x.learningDue || x.learningIntroducedOn) : x.dueDate; return x.dueDate; };
const fcp = fc.filter(planif);
const lignes = ['| Jour | Révision (J) | Apprentissage | Nouvelles (départ) | Total |', '|---|---|---|---|---|'];
const enRetard = { review: 0, learning: 0, new: 0 };
fcp.forEach((x) => { const d = prochaine(x); if (d && d < jour) enRetard[etatFC(x, jour)]++; });
lignes.push(`| avant le ${jour} (retard) | ${enRetard.review} | ${enRetard.learning} | ${enRetard.new} | ${enRetard.review + enRetard.learning + enRetard.new} |`);
let cumul = 0;
for (let i = 0; i < 30; i++) {
  const d = addDays(jour, i); const c = { review: 0, learning: 0, new: 0 };
  fcp.forEach((x) => { if (prochaine(x) === d) c[etatFC(x, jour)]++; });
  const t = c.review + c.learning + c.new; cumul += t;
  lignes.push(`| ${d} | ${c.review} | ${c.learning} | ${c.new} | ${t} |`);
}
const apres = fcp.filter((x) => { const d = prochaine(x); return d && d >= addDays(jour, 30); }).length;
const sansDate = fcp.filter((x) => !prochaine(x));
lignes.push(`| à partir du ${addDays(jour, 30)} | | | | ${apres} |`, `| sans date (terminée ou sans planning) | | | | ${sansDate.length} |`);
out('Distribution des prochaines dates (flashcards planifiées)', lignes.join('\n'));
out('Sans date : détail', compte(sansDate, (x) => `termine=${!!x.termine} dueDate=${x.dueDate == null ? 'null' : 'oui'} learnState=${x.learnState}`));

// intervalles / capped / termine
out('intervalDays des flashcards en révision', compte(fcp.filter((x) => etatFC(x, jour) === 'review'), (x) => x.intervalDays));
out('capped / termine (flashcards)', { capped: fc.filter((x) => x.capped).length, termine: fc.filter((x) => x.termine).length, skippedOn: fc.filter((x) => x.skippedOn).length, j0Date: fc.filter((x) => x.j0Date).length });

// historique
const h = fc.flatMap((x) => (x.historique || []).map((e) => ({ ...e, id: x.id })));
const dates = h.map((e) => e.date).filter(Boolean).sort();
out('Historique des flashcards', { cartesAvecHistorique: fc.filter((x) => (x.historique || []).length).length, entrees: h.length, premiere: dates[0], derniere: dates[dates.length - 1],
  qualites: compte(h, (e) => e.qualite), avecTempsMs: h.filter((e) => e.tempsMs != null).length, champs: compte(h, (e) => Object.keys(e).sort().join(',')) });
out('Historique : entrées par mois', compte(h, (e) => (e.date || '?').slice(0, 7)));
const revSansHist = fcp.filter((x) => etatFC(x, jour) === 'review' && !(x.historique || []).length);
out('En révision SANS aucune entrée d\'historique (sorties d\'apprentissage jamais notées en J)', revSansHist.length);
// cohérence historique ↔ échéance : la dernière note + intervalle doit donner dueDate
let coherent = 0, incoherent = 0; const exInc = [];
fcp.filter((x) => etatFC(x, jour) === 'review' && (x.historique || []).length && x.dueDate && !x.learningDoneOn).forEach((x) => {
  const last = x.historique[x.historique.length - 1];
  if (addDays(last.date, x.intervalDays) === x.dueDate) coherent++; else { incoherent++; if (exInc.length < 5) exInc.push({ id: x.id, last, intervalDays: x.intervalDays, dueDate: x.dueDate, skippedOn: x.skippedOn }); }
});
out('Cohérence dernière note + intervalDays = dueDate (révision, hors sorties d\'apprentissage)', { coherent, incoherent, exemples: exInc });
// plusieurs notes le même jour
out('Cartes ayant ≥ 2 notes le même jour (relearning de séance)', fc.filter((x) => { const s = new Set(); return (x.historique || []).some((e) => { const k = e.date; if (s.has(k)) return true; s.add(k); return false; }); }).length);

// anomalies
const parRecto = compte(fc, (x) => `${x.ficheId}|${String(x.recto || '').trim().toLowerCase()}`);
const doublons = Object.entries(parRecto).filter(([, n]) => n > 1);
out('Doublons (même fiche, même recto)', { groupes: doublons.length, cartes: doublons.reduce((s, [, n]) => s + n, 0), exemples: doublons.slice(0, 5).map(([k, n]) => `${k.split('|')[1].slice(0, 50)} ×${n}`) });
out('Incohérences', {
  sansFiche: fc.filter((x) => !idx.fById[x.ficheId]).length,
  reviewSansIntervalle: fc.filter((x) => x.learnState === 'review' && x.intervalDays == null).length,
  learningSansDueDate: fc.filter((x) => x.learnState === 'learning' && !x.dueDate).length,
  dueDateMalFormee: fc.filter((x) => x.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(x.dueDate)).length,
  learningDueAvantIntroduction: fc.filter((x) => x.learningDue && x.learningIntroducedOn && x.learningDue < x.learningIntroducedOn).length,
  learningSortieMaisLearning: fc.filter((x) => x.learnState === 'learning' && x.learningDoneOn).length,
  noteeDansLeFutur: fc.filter((x) => (x.historique || []).some((e) => e.date > jour)).length,
  dueDatePasseeEnRevision: fcp.filter((x) => etatFC(x, jour) === 'review' && nextDate(x) && nextDate(x) < jour).length,
});

// exemples réels (champs de planification seulement)
const champs = ['id', 'learnState', 'dueDate', 'intervalDays', 'capped', 'termine', 'j0Date', 'skippedOn', 'missed', 'learningStreak', 'learningCriterion', 'learningPresented', 'learningIntroducedOn', 'learningDue', 'learningSource', 'learningDoneOn', 'lastSeenAt', 'historique', 'updatedAt'];
const ex = (x) => Object.fromEntries(champs.filter((k) => x[k] !== undefined).map((k) => [k, x[k]]));
const pick = (f) => fcp.find(f);
out('Exemples réels', {
  revisionNotee: ex(pick((x) => etatFC(x, jour) === 'review' && (x.historique || []).length >= 3)),
  sortieApprentissage: ex(pick((x) => x.learningDoneOn)),
  apprentissageEnCours: ex(pick((x) => x.learningIntroducedOn && x.learnState === 'learning' && x.learningStreak > 0) || pick((x) => x.learningIntroducedOn && x.learnState === 'learning')),
  redescendueApresRate: ex(pick((x) => x.learningSource === 'rate') || {}),
  nouvelleFuture: ex(pick((x) => etatFC(x, jour) === 'new') || {}),
});

// Mac ↔ cloud — comparaison CANONIQUE (le jsonb de Postgres réordonne les clés des objets)
const tri = (v) => (Array.isArray(v) ? v.map(tri) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, tri(v[k])])) : v);
const canon = (v) => JSON.stringify(tri(v));
const cq = new Map(cloud.filter((r) => r.store === 'questions' && !r.deleted).map((r) => [r.record_id, r]));
let identiques = 0, diff = 0, absentsCloud = 0, plusRecentCloud = 0;
q.forEach((x) => { const c = cq.get(x.id); if (!c) { absentsCloud++; return; } const a = canon(x), b = canon(c.data); if (a === b) identiques++; else { diff++; if ((c.data.updatedAt || '') > (x.updatedAt || '')) plusRecentCloud++; } });
out('Questions Mac ↔ cloud', { mac: q.length, cloudVivantes: cq.size, identiques, differentes: diff, dontPlusRecentesAuCloud: plusRecentCloud, absentesDuCloud: absentsCloud, absentesDuMac: [...cq.keys()].filter((id) => !q.some((x) => x.id === id)).length });
// QCM / schémas sur le même moteur
out('Autres items sur le moteur sm2 (non concernés par FSRS)', { qcm: q.filter((x) => x.type === 'qcm').length, qcmPlanifies: scheduledQuestions(db, idx).filter((x) => x.type === 'qcm').length, anatSchema: db.fiches.filter((f) => f.type === 'anat_schema').length, flashcardErreur: q.filter((x) => x.type === 'flashcard_erreur').length });
// sessionsLog
const sl = store('medrevise-sessionsLog');
out('sessionsLog (un point par série terminée)', { n: sl.length, exemple: sl[0] && Object.keys(sl[0]), dates: [sl.map((x) => x.date || x.at).sort()[0], sl.map((x) => x.date || x.at).sort().pop()] });

// hors planning : pourquoi
const raison = (x) => { const f = idx.fById[x.ficheId]; if (!f) return 'fiche absente'; if (f.archive) return 'fiche archivée'; if (f.rappelsJ === false) return 'fiche sans rappels J';
  const m = idx.mById[f.matiereId]; if (!m) return 'matière absente'; if (m.archive) return 'matière archivée'; const so = idx.sById[m.sourceId]; if (!so) return 'cours absent'; if (so.archive) return 'cours archivé'; if (so.rappelsJ === false) return 'cours sans rappels J (' + (so.titre || so.nom || so.id) + ')'; return '?'; };
out('Flashcards hors planning : raison × état', compte(fc.filter((x) => !planif(x)), (x) => `${raison(x)} · ${etatFC(x, jour)}${x.learningIntroducedOn ? ' introduite' : ''}`));
out('Cours (sources)', db.sources.map((so) => ({ id: so.id, titre: so.titre || so.nom, rappelsJ: so.rappelsJ, archive: !!so.archive })));
// historique rejouable ? vie complète enregistrée = jamais passée par l'apprentissage (pas de learningIntroducedOn) et 1re note = j0Date
const rejouable = (x) => (x.historique || []).length && !x.learningIntroducedOn && !x.learningDoneOn;
out('Historique rejouable (cas A) vs partiel (cas B) — flashcards', compte(fc, (x) => (!(x.historique || []).length ? 'B : aucune note J (état seul)' : rejouable(x) ? 'A : vie entière en notes J (rejouable)' : 'mixte : notes J + passage par l\'apprentissage non journalisé')));
