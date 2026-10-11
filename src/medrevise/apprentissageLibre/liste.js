/* ============================================================
   MedRevise — MODE APPRENTISSAGE LIBRE (11/10, docs/compte-rendu-mode-apprentissage-libre.md)
   La liste « cartes en apprentissage » : UN enregistrement `learning_set` { id, cardIds[],
   updatedAt }, synchronisé comme les autres types (lib/storage.js put → file d'envoi). C'est
   TOUT ce que ce mode stocke : ni compteur, ni date, ni historique.

   INDÉPENDANCE : ce module ne lit des cartes que leur id, leur fiche, leur type et leur
   contenu (pour l'affichage) ; il n'écrit QUE `learning_set`. Jamais `questions`, jamais le
   journal des révisions, jamais la séance du jour (store `meta`). Rien n'entre ni ne sort de
   la liste sans un geste explicite de l'utilisateur.
   ============================================================ */
import { getOne, put } from '../lib/storage.js';

export const STORE = 'learning_set';
export const ID = 'learning_set';

/** la liste enregistrée (ids, dans l'ordre d'ajout) — [] si rien n'a jamais été mis */
export async function lireListe() {
  const r = await getOne(STORE, ID);
  return r && Array.isArray(r.cardIds) ? r.cardIds.filter((x) => typeof x === 'string') : [];
}

/** remplace la liste (un seul enregistrement, horodaté et mis en file de synchro par put) */
export async function ecrireListe(ids) {
  const rec = await put(STORE, { id: ID, cardIds: [...new Set(ids)] });
  return rec.cardIds;
}

/* ---- opérations PURES sur une liste d'ids ---- */
export const ajouter = (liste, ids) => [...liste, ...ids.filter((id) => !liste.includes(id))];
export const retirer = (liste, ids) => { const s = new Set(ids); return liste.filter((id) => !s.has(id)); };

/** carte admissible : une flashcard (toutes variantes : texte, trous, image, Muscle, Molécule) */
export const estAdmissible = (q) => !!q && q.type === 'flashcard';

/**
 * Cartes de la liste rangées par cours : [{ fiche, cartes }] — cours dans l'ordre de la
 * Bibliothèque (db.fiches), cartes dans l'ordre de la fiche (celui du panneau Flashcards).
 * Une carte supprimée entre-temps est simplement ignorée (son id reste dans la liste).
 */
export function grouperParCours(db, liste) {
  const dans = new Set(liste);
  const parFiche = new Map();
  for (const q of (db && db.questions) || []) {
    if (!dans.has(q.id) || !estAdmissible(q)) continue;
    if (!parFiche.has(q.ficheId)) parFiche.set(q.ficheId, []);
    parFiche.get(q.ficheId).push(q);
  }
  const groupes = [];
  for (const f of (db && db.fiches) || []) {
    if (parFiche.has(f.id)) { groupes.push({ fiche: f, cartes: parFiche.get(f.id) }); parFiche.delete(f.id); }
  }
  // cartes dont la fiche n'est plus là (cas limite) : à la fin, sans titre
  for (const [ficheId, cartes] of parFiche) groupes.push({ fiche: { id: ficheId, titre: 'Cours introuvable' }, cartes });
  return groupes;
}

/** ids à jouer pour les cours cochés : ordre des cours puis des cartes, sans mélange */
export const idsDesCours = (groupes, coches) => groupes.filter((g) => coches.has(g.fiche.id)).flatMap((g) => g.cartes.map((c) => c.id));
