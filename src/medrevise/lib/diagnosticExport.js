/* ============================================================
   MedRevise — EXPORT DE DIAGNOSTIC (v1.2 de l'apprentissage des flashcards, 10/10/2026).

   Pourquoi : expliquer un écart de compteurs entre deux appareils
   (docs/diagnostic-divergence-apprentissage.md) a demandé de copier l'IndexedDB à la main, et
   restait impossible sur le téléphone — la séance en cours vit dans `meta` (local), que la
   sauvegarde (lib/backupExport.js, stores syncables seulement) ne contient pas.

   Contenu : chaque carte avec ses champs d'état (pas le contenu complet : recto tronqué), la
   séance du jour sauvegardée (`meta.seanceFC`) et les migrations, le plan du jour recalculé (ids),
   l'empreinte « à jour avec le cloud » (lib/syncStatus.js), l'heure, la date et le fuseau de
   l'appareil.

   STRICTEMENT EN LECTURE, comme backupExport.js : aucune écriture IndexedDB, aucun put/queuePush,
   aucune synchro. Seul appel réseau : la lecture du cloud faite par comparerAuCloud() (GET).
   ============================================================ */
import { getAll, getMeta, getReglagesFC } from './storage.js';
import { comparerAuCloud } from './syncStatus.js';
import { todayISO } from './sm2.js';
import { index, isFicheScheduled, nextDate } from './planning.js';
import { estFlashcardJ, etatFC, planDuJour, reglagesFC } from './apprentissageFC.js';
import { deliverFile, formatOctets } from './backupExport.js';

export const DIAGNOSTIC_SCHEMA = 'medrevise-diagnostic/1';

const pad = (n) => String(n).padStart(2, '0');
const texte = (v, n = 80) => String(v == null ? '' : v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** Construit l'objet de diagnostic. LECTURE SEULE. */
export async function construireDiagnostic() {
  const maintenant = new Date();
  const today = todayISO();
  const [sources, matieres, fiches, questions, reglages] = await Promise.all([
    getAll('sources'), getAll('matieres'), getAll('fiches'), getAll('questions'), getReglagesFC(),
  ]);
  const db = { sources: sources || [], matieres: matieres || [], fiches: fiches || [], questions: questions || [] };
  const ix = index(db);
  const planifiee = (q) => isFicheScheduled(db, ix.fById[q.ficheId], ix);

  const cartes = db.questions.map((q) => {
    const f = ix.fById[q.ficheId] || {};
    const m = ix.mById[f.matiereId] || {};
    const h = q.historique || [];
    return {
      id: q.id, type: q.type, ficheId: q.ficheId || null,
      cours: f.titre || f.title || f.nom || null, matiere: m.nom || m.name || null,
      recto: texte(q.recto || q.question),
      planifiee: planifiee(q),
      etatEffectif: estFlashcardJ(q) ? etatFC(q, today) : null,
      learnState: q.learnState ?? null, learningStreak: q.learningStreak ?? null,
      learningCriterion: q.learningCriterion ?? null, learningPresented: q.learningPresented ?? null,
      learningIntroducedOn: q.learningIntroducedOn ?? null, learningDue: q.learningDue ?? null,
      learningSource: q.learningSource ?? null, learningDoneOn: q.learningDoneOn ?? null,
      lastSeenAt: q.lastSeenAt ?? null,
      dueDate: q.dueDate ?? null, prochaineDate: nextDate(q), intervalDays: q.intervalDays ?? null,
      skippedOn: q.skippedOn ?? null, termine: !!q.termine,
      notationsJ: h.length, derniereNotation: h.length ? h[h.length - 1] : null,
      updatedAt: q.updatedAt ?? null,
    };
  });

  const fc = db.questions.filter((q) => estFlashcardJ(q) && planifiee(q));
  const plan = planDuJour(fc, reglages, today, nextDate);
  const ids = (l) => l.map((q) => q.id);

  const [seance, mesures, migrations, migV1, migV11] = await Promise.all([
    getMeta('seanceFC'), getMeta('seanceFC.mesures'), getMeta('migrations'),
    getMeta('migration.apprentissage-flashcards-v1'), getMeta('migration.apprentissage-flashcards-v1.1'),
  ]);

  let cloud;
  try {
    const c = await comparerAuCloud();
    cloud = {
      statut: c.statut, empreinteCloud: c.hash || null, empreinteLocale: c.hashLocal || (c.local && c.local.hash) || null,
      enregistrementsCloud: c.n ?? null, enregistrementsLocaux: c.local ? c.local.n : null,
      ecarts: c.ecarts ?? null, aTirer: c.aTirer ?? null, aPousser: c.aPousser ?? null, divergents: c.divergents ?? null,
      enAttente: c.enAttente ?? null, exemples: c.exemples || [], cause: c.cause || null,
    };
  } catch (e) { cloud = { statut: 'erreur', message: String((e && e.message) || e) }; }

  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return null; } })();
  return {
    schema: DIAGNOSTIC_SCHEMA,
    appareil: {
      maintenant: maintenant.toISOString(),
      heureLocale: maintenant.toLocaleString('fr-FR'),
      jour: today, fuseau: tz, decalageMinutes: -maintenant.getTimezoneOffset(),
      hote: typeof location !== 'undefined' ? location.host : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      ecran: typeof window !== 'undefined' ? { largeur: window.innerWidth, hauteur: window.innerHeight } : null,
      build: typeof document !== 'undefined' ? [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).filter((s) => /assets\//.test(s)) : [],
    },
    reglagesFC: { brut: reglages, effectifs: reglagesFC(reglages) },
    planDuJour: {
      compteurs: { revisions: plan.revisions.length, enCours: plan.enCours.length, nouvelles: plan.nouvelles.length, aSortir: plan.aSortir.length, aApprendre: plan.enCours.length + plan.nouvelles.length },
      revisions: ids(plan.revisions), enCours: ids(plan.enCours), nouvelles: ids(plan.nouvelles), aSortir: ids(plan.aSortir),
    },
    seanceEnregistree: seance || null,
    mesuresSeance: mesures || [],
    migrations: { appliquees: migrations || [], apprentissageV1: migV1 || null, apprentissageV11: migV11 || null },
    cloud,
    compteurs: { cartes: cartes.length, flashcards: cartes.filter((c) => c.type === 'flashcard').length },
    cartes,
  };
}

/** Bouton « Exporter un diagnostic » (Réglages → Synchronisation, accueil mobile). Ne lève jamais. */
export async function exporterDiagnostic() {
  try {
    const d = await construireDiagnostic();
    const blob = new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' });
    const t = new Date();
    const h = (d.appareil.hote || 'local').replace(/[^a-zA-Z0-9.-]+/g, '-');
    const nom = `medrevise-diagnostic-${h}-${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}-${pad(t.getHours())}h${pad(t.getMinutes())}.json`;
    const via = await deliverFile(blob, nom);
    if (via === 'annule') return { ok: false, message: 'Enregistrement annulé — rien n’a été modifié.' };
    const p = d.planDuJour.compteurs;
    return { ok: true, nom, message: `Diagnostic exporté (${formatOctets(blob.size)}) : ${d.compteurs.cartes} cartes · plan du jour ${p.revisions} à réviser, ${p.aApprendre} à apprendre · empreinte ${d.cloud.empreinteCloud || d.cloud.statut}. Fichier : ${nom}` };
  } catch (e) {
    return { ok: false, message: 'Export impossible : ' + String((e && e.message) || e) + '. Aucune donnée n’a été modifiée.' };
  }
}
