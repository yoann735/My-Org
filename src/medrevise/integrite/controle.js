/* ============================================================
   MedRevise — CONTRÔLE D'INTÉGRITÉ (filet de sécurité, 11/10/2026). Fonction PURE, en lecture seule :
   elle ne corrige RIEN (les corrections ne se font que sur clic, écran Intégrité).
   Vérifie :
   - chaque flashcard a une date valide (dueDate 'YYYY-MM-DD', ou cycle terminé) — « sans date » ;
   - chaque carte appartient à une fiche, une matière et un cours existants — « orpheline » ;
   - aucune carte planifiée dont l'échéance est passée de plus de 60 jours sans avoir JAMAIS été
     revue — « enterrée » (les cours dont les rappels J sont coupés ne comptent pas : c'est voulu) ;
   - aucun id en double — « doublon » ;
   - aucune question de la veille disparue SANS suppression volontaire — « baisse » (ids manquants
     listés ; les suppressions faites depuis l'interface sont exclues, voir ./suppressions.js) ;
   - empreinte cloud = empreinte locale ; journal : aucune réponse en attente depuis plus de 7 jours.
   ============================================================ */
import { index, isFicheScheduled } from '../lib/planning.js';

export const JOURS_ENTERREE = 60;
export const JOURS_JOURNAL = 7;
const estJour = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z'));
const moinsJours = (jour, n) => { const d = new Date(jour + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const texte = (v, n = 90) => String(v == null ? '' : v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** instantané du jour (comptes par type + ids des questions, et ids par type pour nommer le type d'une
 *  carte disparue — absent des instantanés d'avant le 31/10) */
export function instantane(questions, jour) {
  const comptesParType = {}; const idsParType = {};
  for (const q of questions || []) {
    if (!q || !q.type) continue;
    comptesParType[q.type] = (comptesParType[q.type] || 0) + 1;
    if (q.id) (idsParType[q.type] = idsParType[q.type] || []).push(q.id);
  }
  for (const t of Object.keys(idsParType)) idsParType[t].sort();
  return { jour, total: (questions || []).length, comptesParType, idsParType, ids: (questions || []).map((q) => q && q.id).filter(Boolean).sort() };
}

/**
 * @param db         { sources, matieres, fiches, questions }
 * @param jour       'YYYY-MM-DD'
 * @param precedent  instantané de la veille (ou du dernier jour connu), ou null
 * @param cloud      { statut, empreinteLocale, empreinteCloud } ou null (pas de cloud / hors ligne)
 * @param journalPlusAncien  ISO de l'entrée de journal en attente la plus ancienne, ou null
 * @param volontaires  Set des ids supprimés volontairement depuis l'interface (./suppressions.js#idsVolontaires)
 */
export function controlerIntegrite({ db, jour, precedent = null, cloud = null, journalPlusAncien = null, volontaires = null }) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const ix = index(db);
  const questions = db.questions || [];
  const anomalies = [];
  const coursDe = (q) => {
    const f = ix.fById[q.ficheId]; const m = f && ix.mById[f.matiereId]; const s = m && ix.sById[m.sourceId];
    return [s && (s.nom || s.titre), m && (m.nom || m.name), f && (f.titre || f.title)].filter(Boolean).join(' › ') || '(cours introuvable)';
  };
  const carte = (q, type, detail, reparable) => anomalies.push({ type, carteId: q.id, recto: texte(q.recto || q.question || q.consigne), cours: coursDe(q), ficheId: q.ficheId || null, detail, reparable });

  // doublons d'id
  const vus = new Map();
  for (const q of questions) { if (!q || !q.id) continue; vus.set(q.id, (vus.get(q.id) || 0) + 1); }
  for (const [id, n] of vus) if (n > 1) anomalies.push({ type: 'doublon', carteId: id, recto: texte((questions.find((q) => q.id === id) || {}).recto), cours: '', detail: `id présent ${n} fois`, reparable: false });

  const limite = moinsJours(jour, JOURS_ENTERREE);
  let flashcards = 0;
  for (const q of questions) {
    if (!q) continue;
    // orpheline (toute carte rattachée à une fiche ; les exercices de chapitre n'ont pas de fiche)
    if (q.ficheId) {
      const f = ix.fById[q.ficheId]; const m = f && ix.mById[f.matiereId]; const s = m && ix.sById[m.sourceId];
      if (!f || !m || !s) carte(q, 'orpheline', !f ? 'fiche introuvable' : !m ? 'matière introuvable' : 'cours introuvable', false);
    }
    if (q.type !== 'flashcard') continue;
    flashcards++;
    if (q.termine) continue;
    if (!estJour(q.dueDate)) { carte(q, 'sans-date', q.dueDate ? `date invalide « ${texte(q.dueDate, 30)} »` : 'aucune date (hors planning)', true); continue; }
    const planifiee = isFicheScheduled(db, ix.fById[q.ficheId], ix);
    const jamaisRevue = !(q.historique || []).some((h) => h && h.qualite != null);
    if (planifiee && jamaisRevue && q.dueDate < limite) carte(q, 'enterree', `due depuis le ${q.dueDate}, jamais revue`, true);
  }

  // questions de la veille disparues (31/10) : seules comptent celles qu'AUCUNE suppression volontaire
  // n'explique. Avant, la règle comparait les COMPTES par type et prenait donc chaque carte supprimée
  // à la main pour une perte (et laissait passer une perte masquée par des créations du jour).
  const cour = instantane(questions, jour);
  let baisse = null; let suppressionsVolontaires = 0;
  if (precedent && precedent.jour < jour) {
    const actuels = new Set(cour.ids);
    const manquants = (precedent.ids || []).filter((id) => !actuels.has(id));
    const inexpliques = volontaires ? manquants.filter((id) => !volontaires.has(id)) : manquants;
    suppressionsVolontaires = manquants.length - inexpliques.length;
    if (inexpliques.length) {
      const typeDe = {};
      for (const [t, ids] of Object.entries(precedent.idsParType || {})) for (const id of ids || []) typeDe[id] = t;
      const parType = {};
      for (const id of inexpliques) { const t = typeDe[id] || 'inconnu'; parType[t] = (parType[t] || 0) + 1; }
      baisse = { depuis: precedent.jour, total: inexpliques.length, parType, idsManquants: inexpliques };
    }
  }

  const globales = [];
  if (cloud && cloud.statut && cloud.statut !== 'ok' && cloud.statut !== 'hors-ligne' && cloud.statut !== 'desactive' && cloud.empreinteLocale && cloud.empreinteCloud && cloud.empreinteLocale !== cloud.empreinteCloud) {
    globales.push({ type: 'empreinte', detail: `empreinte locale ${cloud.empreinteLocale} ≠ cloud ${cloud.empreinteCloud}` });
  }
  if (journalPlusAncien && journalPlusAncien < new Date(Date.parse(jour + 'T12:00:00Z') - JOURS_JOURNAL * 86400000).toISOString()) {
    globales.push({ type: 'journal', detail: `réponses en attente d’envoi depuis le ${journalPlusAncien.slice(0, 10)}` });
  }

  const dureeMs = Math.round(((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) * 10) / 10;
  return {
    jour, ok: !anomalies.length && !baisse && !globales.length,
    flashcards, questions: questions.length, comptesParType: cour.comptesParType,
    anomalies, cartesAVerifier: new Set(anomalies.map((a) => a.carteId)).size, globales, baisse, suppressionsVolontaires,
    instantane: cour, dureeMs,
  };
}
