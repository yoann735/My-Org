/* ============================================================
   MedRevise — CONTRÔLE D'INTÉGRITÉ (filet de sécurité, 11/10/2026). Fonction PURE, en lecture seule :
   elle ne corrige RIEN (les corrections ne se font que sur clic, écran Intégrité).
   Vérifie :
   - chaque flashcard a une date valide (dueDate 'YYYY-MM-DD', ou cycle terminé) — « sans date » ;
   - chaque carte appartient à une fiche, une matière et un cours existants — « orpheline » ;
   - aucune carte planifiée dont l'échéance est passée de plus de 60 jours sans avoir JAMAIS été
     revue — « enterrée » (les cours dont les rappels J sont coupés ne comptent pas : c'est voulu) ;
   - aucun id en double — « doublon » ;
   - nombre de questions par type ≥ celui de la veille — « baisse » (ids manquants listés) ;
   - empreinte cloud = empreinte locale ; journal : aucune réponse en attente depuis plus de 7 jours.
   ============================================================ */
import { index, isFicheScheduled } from '../lib/planning.js';

export const JOURS_ENTERREE = 60;
export const JOURS_JOURNAL = 7;
const estJour = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z'));
const moinsJours = (jour, n) => { const d = new Date(jour + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const texte = (v, n = 90) => String(v == null ? '' : v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** instantané du jour (comptes par type + ids des questions) */
export function instantane(questions, jour) {
  const comptesParType = {};
  for (const q of questions || []) if (q && q.type) comptesParType[q.type] = (comptesParType[q.type] || 0) + 1;
  return { jour, total: (questions || []).length, comptesParType, ids: (questions || []).map((q) => q && q.id).filter(Boolean).sort() };
}

/**
 * @param db         { sources, matieres, fiches, questions }
 * @param jour       'YYYY-MM-DD'
 * @param precedent  instantané de la veille (ou du dernier jour connu), ou null
 * @param cloud      { statut, empreinteLocale, empreinteCloud } ou null (pas de cloud / hors ligne)
 * @param journalPlusAncien  ISO de l'entrée de journal en attente la plus ancienne, ou null
 */
export function controlerIntegrite({ db, jour, precedent = null, cloud = null, journalPlusAncien = null }) {
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

  // baisse du nombre de questions depuis la veille
  const cour = instantane(questions, jour);
  let baisse = null;
  if (precedent && precedent.jour < jour) {
    const types = new Set([...Object.keys(precedent.comptesParType || {}), ...Object.keys(cour.comptesParType)]);
    const parType = {};
    for (const t of types) { const d = (precedent.comptesParType[t] || 0) - (cour.comptesParType[t] || 0); if (d > 0) parType[t] = d; }
    if (Object.keys(parType).length) {
      const actuels = new Set(cour.ids);
      baisse = { depuis: precedent.jour, total: Math.max(0, precedent.total - cour.total), parType, idsManquants: (precedent.ids || []).filter((id) => !actuels.has(id)) };
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
    anomalies, cartesAVerifier: new Set(anomalies.map((a) => a.carteId)).size, globales, baisse,
    instantane: cour, dureeMs,
  };
}
