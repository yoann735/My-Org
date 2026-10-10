/* ============================================================
   MedRevise — PLANIFICATEUR FSRS-6 (ts-fsrs 5.4.2). SEUL fichier de l'app qui importe ts-fsrs.

   L'état FSRS d'une flashcard vit dans un champ AJOUTÉ `fsrs` (le « bloc FSRS ») ; aucun champ
   existant n'est lu ni écrit ici. Forme du bloc (jours civils, jamais de millisecondes) :
     { v: 1, state: 0|1|2|3, stability, difficulty, reps, lapses,
       derniere: 'YYYY-MM-DD'|null,   // jour de la dernière révision prise en compte
       due: 'YYYY-MM-DD'|null,        // prochaine échéance selon FSRS
       intervalle,                    // jours prévus entre `derniere` et `due`
       source: 'nouvelle'|'estimation'|'historique'|'reponse'|'journal',
       base: { …mêmes champs d'état… , depuis }  // état de départ du journal (voir reconstruire)
       majLe: ISO }
   Toutes les dates passées à ts-fsrs sont MIDI à Bruxelles (./jours.js).
   ============================================================ */
import { fsrs, generatorParameters, createEmptyCard, Rating, State } from 'ts-fsrs';
import { midi, jourCivil, jourDeRevision, ajouterJours, ecartJours, estJour } from './jours.js';
import { configPlanificateur } from './config.js';

export { Rating, State };
export const NOTES = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]; // 1..4
const CHAMPS_ETAT = ['state', 'stability', 'difficulty', 'reps', 'lapses', 'derniere', 'due', 'intervalle'];

const moteurs = new Map();
/** instance ts-fsrs pour une configuration (mise en cache) */
export function moteur(config = configPlanificateur()) {
  const cle = JSON.stringify([config.retention, config.intervalleMax, config.fuzz, config.courtTerme, config.etapesApprentissage, config.etapesReapprentissage]);
  if (!moteurs.has(cle)) {
    moteurs.set(cle, fsrs(generatorParameters({
      request_retention: config.retention,
      maximum_interval: config.intervalleMax,
      enable_fuzz: config.fuzz,
      enable_short_term: config.courtTerme,
      learning_steps: config.etapesApprentissage,
      relearning_steps: config.etapesReapprentissage,
    })));
  }
  return moteurs.get(cle);
}

const arrondi = (x) => (Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : 0);
const etatSeul = (b) => Object.fromEntries(CHAMPS_ETAT.map((k) => [k, b[k] === undefined ? null : b[k]]));

/** bloc → carte ts-fsrs (instants à midi) */
export function versCarteFsrs(bloc) {
  const vide = createEmptyCard(midi(bloc.due || bloc.derniere || '2000-01-01'));
  if (!bloc || bloc.state === State.New || bloc.state == null) return { ...vide, due: bloc && bloc.due ? midi(bloc.due) : vide.due };
  return {
    ...vide,
    due: bloc.due ? midi(bloc.due) : midi(ajouterJours(bloc.derniere, bloc.intervalle || 1)),
    stability: bloc.stability, difficulty: bloc.difficulty,
    state: bloc.state, reps: bloc.reps || 0, lapses: bloc.lapses || 0,
    scheduled_days: bloc.intervalle || 0, elapsed_days: 0, learning_steps: 0,
    last_review: bloc.derniere ? midi(bloc.derniere) : undefined,
  };
}

/** carte ts-fsrs → bloc (jours civils) */
export function versBloc(carte, extra = {}) {
  const derniere = carte.last_review ? jourCivil(carte.last_review) : null;
  const due = carte.state === State.New && !carte.last_review ? (extra.due !== undefined ? extra.due : jourCivil(carte.due)) : jourCivil(carte.due);
  return {
    v: 1, state: carte.state, stability: arrondi(carte.stability), difficulty: arrondi(carte.difficulty),
    reps: carte.reps || 0, lapses: carte.lapses || 0, derniere, due,
    intervalle: derniere && due ? ecartJours(derniere, due) : 0,
    ...extra,
  };
}

/* PLAFOND « Intervalle maximum » : ts-fsrs applique maximum_interval puis impose Facile > Correct + 1
   jour (ordre des 4 notes), ce qui peut le dépasser d'un ou deux jours (46–47 pour 45). Le plafond
   est donc réappliqué ici sur la date finale ; la stabilité, elle, n'est pas touchée. */
function plafonner(dueJour, jour, config) {
  return ecartJours(jour, dueJour) > config.intervalleMax ? ajouterJours(jour, config.intervalleMax) : dueJour;
}

/** les 4 issues possibles d'une réponse donnée `maintenant` : { [note]: { due, jours } } */
export function previsualiser(bloc, maintenant = new Date(), config = configPlanificateur()) {
  const jour = jourDeRevision(maintenant, config.bascule, config.fuseau);
  const apercu = moteur(config).repeat(versCarteFsrs(bloc), midi(jour));
  const out = {};
  for (const n of NOTES) { const due = plafonner(jourCivil(apercu[n].card.due), jour, config); out[n] = { due, jours: ecartJours(jour, due) }; }
  return out;
}

/** applique une note (1..4) à un bloc : nouvel état + log ts-fsrs. Le jour de révision bascule à 4 h. */
export function appliquer(bloc, maintenant, note, config = configPlanificateur(), source = 'reponse') {
  const jour = jourDeRevision(maintenant, config.bascule, config.fuseau);
  const res = moteur(config).next(versCarteFsrs(bloc), midi(jour), note);
  const nouveau = versBloc(res.card, { source, base: bloc && bloc.base ? bloc.base : figerBase(bloc, jour) });
  nouveau.due = plafonner(nouveau.due, jour, config);
  nouveau.intervalle = ecartJours(jour, nouveau.due);
  return { bloc: nouveau, jour, log: res.log };
}

/** état de départ du journal : copie de l'état (sans `base`), datée */
export function figerBase(bloc, depuis) {
  return bloc ? { ...etatSeul(bloc), source: bloc.source || null, depuis: depuis || null } : null;
}

/* ============================================================
   INITIALISATION d'une carte (migration à blanc / réelle, et première réponse en mode ombre).
   - notes J dans `historique` (582 cartes au 10/10) → état RECONSTRUIT en rejouant l'historique
     (répétitions du même jour fusionnées : seule la PREMIÈRE note du jour compte, les suivantes
     sont des « relearning » de séance sans effet sur la date) ; difficulté de DÉPART 7, puis
     elle évolue avec les notes rejouées ;
   - jamais notée mais déjà vue (présentée / sortie d'apprentissage) → ESTIMATION : stabilité ≈
     intervalle courant, difficulté 7 ;
   - jamais vue → NOUVELLE (paramètres FSRS par défaut à sa première réponse).
   Dans TOUS les cas : `due` = `dueDate` actuelle de la carte, inchangée.
   ============================================================ */
// ancienne qualité (moteur maison) → note FSRS, lecture littérale (docs/fsrs-etape1-audit.md §4)
export const NOTE_DEPUIS_QUALITE = { 1: Rating.Again, 3: Rating.Hard, 5: Rating.Easy };

/** historique maison → révisions { jour, note }, une par jour (la première), triées, ≤ jour */
export function revuesDepuisHistorique(historique, jourMax = null) {
  const vues = new Set(); const out = [];
  for (const h of historique || []) {
    if (!h || !estJour(h.date) || NOTE_DEPUIS_QUALITE[h.qualite] == null) continue;
    if (jourMax && h.date > jourMax) continue;
    if (vues.has(h.date)) continue;
    vues.add(h.date); out.push({ jour: h.date, note: NOTE_DEPUIS_QUALITE[h.qualite] });
  }
  return out.sort((a, b) => (a.jour < b.jour ? -1 : a.jour > b.jour ? 1 : 0));
}

export const estVue = (c) => (c.historique || []).some((h) => h && h.qualite != null) || !!c.learningPresented || !!c.learningDoneOn || (c.learningStreak || 0) > 0;

/** rejoue des révisions { jour, note } à partir d'un bloc (ou d'une carte neuve si null) */
export function rejouer(depart, revues, config = configPlanificateur(), difficulteDepart = null) {
  const f = moteur(config);
  let carte = depart ? versCarteFsrs(depart) : createEmptyCard(midi(revues.length ? revues[0].jour : '2000-01-01'));
  revues.forEach((r, i) => {
    carte = f.next(carte, midi(r.jour), r.note).card;
    if (i === 0 && !depart && difficulteDepart != null) carte = { ...carte, difficulty: difficulteDepart };
  });
  return carte;
}

export function initialiser(carte, jour, config = configPlanificateur()) {
  const dueDate = carte.dueDate || null;
  const revues = revuesDepuisHistorique(carte.historique, jour);
  let bloc;
  if (revues.length) {
    const c = rejouer(null, revues, config, config.difficulteMigration);
    bloc = versBloc(c, { source: 'historique' });
    bloc.lapses = revues.filter((r) => r.note === Rating.Again).length;
  } else if (estVue(carte)) {
    const I = Math.max(1, carte.intervalDays || 1);
    const ref = dueDate || jour;
    bloc = { v: 1, state: State.Review, stability: I, difficulty: config.difficulteMigration, reps: 0, lapses: 0,
      derniere: ajouterJours(ref, -I), due: ref, intervalle: I, source: 'estimation' };
  } else {
    bloc = { v: 1, state: State.New, stability: 0, difficulty: 0, reps: 0, lapses: 0, derniere: null, due: dueDate, intervalle: 0, source: 'nouvelle' };
  }
  // contrainte n°1 : l'échéance reste la date actuelle de la carte
  bloc.due = dueDate;
  if (bloc.derniere && dueDate) bloc.intervalle = ecartJours(bloc.derniere, dueDate);
  bloc.base = figerBase(bloc, jour);
  return bloc;
}

/* ============================================================
   RECONSTRUCTION depuis le journal : état = base + entrées du journal de la carte, TRIÉES
   (reviewed_at puis id), sans doublon d'id, sans les répétitions de séance (`details.relearn`),
   une seule révision par jour de révision (la première). Même résultat quel que soit l'ordre
   d'arrivée des entrées (deux appareils hors ligne). ts-fsrs 5.4.2 `reschedule` repart toujours
   d'une carte vierge (son `first_card` n'est lu que pour la date) : on rejoue donc `next` depuis
   la base, ce qui est exactement ce que fait `reschedule` en interne.
   ============================================================ */
export function trierJournal(entrees) {
  const parId = new Map();
  for (const e of entrees || []) if (e && e.id && !parId.has(e.id)) parId.set(e.id, e);
  return [...parId.values()].sort((a, b) => (a.reviewed_at < b.reviewed_at ? -1 : a.reviewed_at > b.reviewed_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function reconstruire(carte, journal, config = configPlanificateur(), jourRef = null) {
  const base = (carte.fsrs && carte.fsrs.base) || figerBase(initialiser(carte, jourRef || jourDeRevision(new Date(), config.bascule, config.fuseau), config), null);
  const entrees = trierJournal((journal || []).filter((e) => e.card_id === carte.id && !(e.details && e.details.relearn)));
  const vus = new Set(); const revues = [];
  for (const e of entrees) {
    const jour = e.jour || jourDeRevision(new Date(e.reviewed_at), config.bascule, config.fuseau);
    if (vus.has(jour) || !(e.rating >= 1 && e.rating <= 4)) continue;
    vus.add(jour); revues.push({ jour, note: e.rating });
  }
  if (!revues.length) return { ...base, v: 1, base, source: base.source || 'nouvelle' };
  const c = rejouer(base, revues, config);
  const bloc = versBloc(c, { source: 'journal', base });
  if (bloc.derniere && bloc.due) { bloc.due = plafonner(bloc.due, bloc.derniere, config); bloc.intervalle = ecartJours(bloc.derniere, bloc.due); }
  return bloc;
}
