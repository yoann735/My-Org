/* ============================================================
   MedRevise — PLANIFICATEUR : point d'entrée UNIQUE de la notation d'une flashcard (étape 2).
   Les 3 écrans qui notent une flashcard (session/SeanceFC.jsx, session/Session.jsx,
   mobile/MobileSession.jsx) passent tous par `noterFlashcard`. Les QCM et les schémas restent sur
   lib/sm2.js advanceQuestion, inchangé.

   4 boutons → notes FSRS : À revoir = Again (1) · Difficile = Hard (2) · Correct = Good (3) ·
   Facile = Easy (4).
   Interrupteur OFF (défaut) : le planificateur MAISON décide (lib/sm2.js, inchangé). Correspondance :
     À revoir → Raté (1) · Difficile → Difficile (3) · Correct → Facile (5) · Facile → Facile (5)
   (le maison n'a pas d'équivalent de « Correct » : sa réussite normale était « Facile »).
   Dans les deux cas, FSRS calcule aussi (MODE OMBRE) : son état et sa date sont écrits dans le bloc
   `fsrs` de la carte et dans le journal, sans jamais toucher `dueDate` quand l'interrupteur est OFF.
   Interrupteur ON (+ migration appliquée) : `dueDate` = échéance FSRS ; les champs maison continuent
   d'être tenus (historique, intervalDays) pour qu'un retour à OFF reparte proprement.
   ============================================================ */
import { advanceQuestion, recordRelearnAttempt, QUALITY, todayISO } from '../lib/sm2.js';
import { appliquer, previsualiser, initialiser, NOTES, Rating } from './fsrs.js';
import { configPlanificateur, planificateurActif, VERSION_PLANIFICATEUR, VERSION_TS_FSRS } from './config.js';
import { jourDeRevision, ecartJours } from './jours.js';

export const BOUTONS = [
  { note: Rating.Again, cle: 'again', libelle: 'À revoir', classe: 'fail' },
  { note: Rating.Hard, cle: 'hard', libelle: 'Difficile', classe: 'hard' },
  { note: Rating.Good, cle: 'good', libelle: 'Correct', classe: 'good' },
  { note: Rating.Easy, cle: 'easy', libelle: 'Facile', classe: 'easy' },
];
export const QUALITE_MAISON = { [Rating.Again]: QUALITY.rate, [Rating.Hard]: QUALITY.difficile, [Rating.Good]: QUALITY.facile, [Rating.Easy]: QUALITY.facile };
/** étiquettes historiques des écrans ('fail'|'hard'|'good'|'easy') → note 1..4 */
export const NOTE_DEPUIS_ETIQUETTE = { fail: Rating.Again, again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy };
/** qualité maison déduite d'un score (cloze en saisie, qualityFromRatio : 5|3|1) → note FSRS */
export const NOTE_DEPUIS_QUALITE_SCORE = { 5: Rating.Good, 3: Rating.Hard, 1: Rating.Again };

const champsPrives = (c) => { const { _fiche, _matiere, _j, _relearn, ...reste } = c; return reste; }; // eslint-disable-line no-unused-vars

/** intervalle prévu sous chaque bouton : FSRS si l'interrupteur est ON, maison sinon.
   { [note]: { jours: n | null (terminée), due } } */
export function intervallesPrevus(carte, reglages, maintenant = new Date()) {
  const config = configPlanificateur(reglages);
  if (planificateurActif(reglages) === 'fsrs') {
    const jour = jourDeRevision(maintenant, config.bascule, config.fuseau);
    return previsualiser(carte.fsrs || initialiser(carte, jour, config), maintenant, config);
  }
  const today = todayISO();
  const out = {};
  for (const n of NOTES) {
    const r = advanceQuestion(champsPrives(carte), QUALITE_MAISON[n]);
    out[n] = { due: r.dueDate, jours: r.dueDate ? ecartJours(today, r.dueDate) : null };
  }
  return out;
}

/** libellé court d'un intervalle : « demain », « 3 j », « 2 mois » */
export function libelleIntervalle(jours) {
  if (jours == null) return 'terminée';
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return 'demain';
  if (jours < 31) return jours + ' j';
  if (jours < 365) return Math.round(jours / 30.4) + ' mois';
  return (Math.round(jours / 36.5) / 10).toString().replace('.', ',') + ' an';
}

const uuid = () => (globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));

/**
 * Note une flashcard. Pur : renvoie la carte à enregistrer et l'entrée de journal à ajouter.
 * @param carte    flashcard (peut porter des champs d'affichage _fiche/_matiere : retirés)
 * @param note     1..4 (Rating) — ou étiquette 'fail'|'hard'|'good'|'easy'
 * @param options  { reglages, maintenant, relearn (répétition de séance), tempsMs, appareil }
 */
export function noterFlashcard(carte, note, options = {}) {
  const { reglages = null, maintenant = new Date(), relearn = false, tempsMs, appareil = null } = options;
  const n = typeof note === 'string' ? NOTE_DEPUIS_ETIQUETTE[note] : note;
  if (!(n >= 1 && n <= 4)) throw new Error('note invalide : ' + note);
  const config = configPlanificateur(reglages);
  const actif = planificateurActif(reglages);
  const avant = champsPrives(carte);
  const jour = jourDeRevision(maintenant, config.bascule, config.fuseau);
  const qualite = QUALITE_MAISON[n];
  const extra = Number.isFinite(tempsMs) ? { tempsMs } : {};

  // planificateur maison : inchangé (même fonction, même qualité qu'avant pour Raté/Difficile/Facile)
  const maison = relearn ? recordRelearnAttempt(avant, qualite, extra) : advanceQuestion(avant, qualite, extra);

  // FSRS (ombre ou réel). Une répétition de séance ne change pas l'état FSRS (pas d'étapes de réapprentissage).
  const blocAvant = avant.fsrs || initialiser(avant, jour, config);
  const blocApres = relearn ? blocAvant : appliquer(blocAvant, maintenant, n, config).bloc;
  const blocFinal = { ...blocApres, majLe: maintenant.toISOString() };

  // ON : la date est celle de FSRS. OFF (ombre) ou répétition de séance : la date reste celle du maison.
  const apres = actif === 'fsrs' && !relearn
    ? { ...maison, dueDate: blocFinal.due, capped: false, termine: false, fsrs: blocFinal }
    : { ...maison, fsrs: blocFinal };

  const resume = (c) => ({ dueDate: c.dueDate == null ? null : c.dueDate, intervalDays: c.intervalDays == null ? null : c.intervalDays, termine: !!c.termine, fsrs: c.fsrs ? { ...c.fsrs, base: undefined } : null });
  const entree = {
    id: uuid(), card_id: avant.id, rating: n,
    reviewed_at: maintenant.toISOString(), jour,
    device: appareil, scheduler_version: `${VERSION_PLANIFICATEUR}+ts-fsrs@${VERSION_TS_FSRS}`,
    planificateur: actif,
    state_before: resume({ ...avant, fsrs: avant.fsrs || null }),
    state_after: resume(apres),
    details: { ancienneQualite: qualite, relearn: !!relearn, ...(Number.isFinite(tempsMs) ? { tempsMs: Math.round(tempsMs) } : {}), dueFsrs: blocFinal.due, dueMaison: maison.dueDate == null ? null : maison.dueDate },
  };
  return { carte: apres, entree };
}
