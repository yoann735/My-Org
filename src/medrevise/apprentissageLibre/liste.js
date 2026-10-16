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

/** remplace la liste (un seul enregistrement, horodaté et mis en file de synchro par put).
 *  (16/10) les NOTES du même enregistrement sont conservées telles quelles. */
export async function ecrireListe(ids) {
  const avant = (await getOne(STORE, ID)) || {};
  const rec = await put(STORE, { ...avant, id: ID, cardIds: [...new Set(ids)] });
  return rec.cardIds;
}

/* ---- NOTES (16/10, docs/compte-rendu-fichiers-cours.md) : une note libre par carte, dans CE
   même enregistrement (`notes[cardId]`) — JAMAIS sur la carte : rien ne se mélange avec les J,
   FSRS ou le journal. Une note vide est retirée. Une carte retirée de la liste garde sa note
   (elle la retrouve si on la remet). ---- */
export async function lireNotes() {
  const r = await getOne(STORE, ID);
  return r && r.notes && typeof r.notes === 'object' ? r.notes : {};
}
export async function ecrireNote(cardId, texte) {
  const avant = (await getOne(STORE, ID)) || { id: ID, cardIds: [] };
  const notes = { ...(avant.notes || {}) };
  const t = String(texte || '');
  if (t.trim()) notes[cardId] = t; else delete notes[cardId];
  const rec = await put(STORE, { ...avant, id: ID, cardIds: avant.cardIds || [], notes });
  return rec.notes;
}

/* ---- GLISSER-DÉPOSER (16/10) : une carte (ou une sélection) glissée depuis le panneau
   Flashcards ou la Bibliothèque vers l'onglet « Apprentissage » de la barre latérale.
   Glisser-déposer HTML5 (souris, trackpad ; appui long au doigt sur iPad/Chrome tactile). */
export const MIME_CARTES = 'application/x-medrevise-cartes';
export const EVT_GLISSE = 'medrevise:glisse-cartes';
export function commencerGlisse(e, ids) {
  if (!ids || !ids.length) return;
  e.dataTransfer.setData(MIME_CARTES, JSON.stringify(ids));
  e.dataTransfer.setData('text/plain', ids.length > 1 ? `${ids.length} cartes` : '1 carte');
  e.dataTransfer.effectAllowed = 'copy';
  window.dispatchEvent(new CustomEvent(EVT_GLISSE, { detail: { actif: true, n: ids.length } }));
}
export const finirGlisse = () => window.dispatchEvent(new CustomEvent(EVT_GLISSE, { detail: { actif: false } }));
export const porteCartes = (e) => !!e.dataTransfer && [...(e.dataTransfer.types || [])].includes(MIME_CARTES);
export function cartesGlissees(e) { try { const v = JSON.parse(e.dataTransfer.getData(MIME_CARTES) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch (x) { return []; } }

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

/**
 * (16/10) TOUJOURS rangées par MATIÈRE puis par COURS, quel que soit le chemin d'ajout :
 * [{ matiere: { id, nom }, cours: [{ fiche, cartes }] }] — matières dans l'ordre de la
 * Bibliothèque. Une matière sans carte n'apparaît pas (elle disparaît d'elle-même).
 */
export function grouperParMatiere(db, liste) {
  const cours = grouperParCours(db, liste);
  const parMat = new Map();
  for (const g of cours) {
    const mid = g.fiche.matiereId || '—';
    if (!parMat.has(mid)) parMat.set(mid, []);
    parMat.get(mid).push(g);
  }
  const out = [];
  for (const m of (db && db.matieres) || []) if (parMat.has(m.id)) { out.push({ matiere: { id: m.id, nom: m.nom }, cours: parMat.get(m.id) }); parMat.delete(m.id); }
  for (const [mid, c] of parMat) out.push({ matiere: { id: mid, nom: 'Sans matière' }, cours: c });
  return out;
}

/** ids à jouer pour les cours cochés : ordre des cours puis des cartes, sans mélange */
export const idsDesCours = (groupes, coches) => groupes.filter((g) => coches.has(g.fiche.id)).flatMap((g) => g.cartes.map((c) => c.id));
