/* ============================================================
   MedRevise — MODE APPRENTISSAGE v2 : le TABLEAU DE BORD (25/10/2026,
   docs/compte-rendu-apprentissage-v2-recherche-tags.md). Fonctions PURES
   (tests/apprentissage-libre/tableauBord.test.js).
   - TOUTES les flashcards sont dans le mode Apprentissage, d'office (plus de liste à remplir).
   - Filtres : recherche (recto, verso, thème), matières (plusieurs), cours (plusieurs, inclus ou
     exclus), « Nouvelles » (définition existante : lib/categoriesFC.js estNouvelle — LECTURE seule),
     type (texte, Muscle, Tableau, Molécule, image) ; (26/10) « À apprendre » (tag de la carte, lib/aApprendre.js — LECTURE seule).
   - Rangement Section → Matière → Cours, dans l'ordre de la Bibliothèque.
   INDÉPENDANCE : ce module ne lit que l'identité, le rangement et le contenu des cartes (et, pour le
   filtre « Nouvelles », la définition existante) ; il n'écrit RIEN.
   ============================================================ */
import { estMuscle, texteMuscle } from '../lib/muscle.js';
import { estTableau, texteTableau } from '../lib/carteTableau.js';
import { estMolecule } from '../molecule/carte.js';
import { estNouvelle } from '../lib/categoriesFC.js';
import { estAApprendre } from '../lib/aApprendre.js';
import { normaliser } from '../lib/rechercheTexte.js';
import { trierSections } from '../components/useTreeOpenState.js';
import { trierMatieres } from '../lib/ordreMatieres.js';

export const TYPES = [
  { cle: 'texte', libelle: 'Texte' },
  { cle: 'muscle', libelle: 'Muscle' },
  { cle: 'tableau', libelle: 'Tableau' },
  { cle: 'molecule', libelle: 'Molécule' },
  { cle: 'image', libelle: 'Image' },
];

/** carte du mode Apprentissage : toute flashcard enregistrée (pas les cartes éphémères d'une séance) */
export const estCarteApprentissage = (q) => !!q && q.type === 'flashcard' && !q.ephemeral;

/** type d'affichage / de filtre (les cartes à trous sont des cartes texte) */
export function typeCarte(q) {
  if (estMuscle(q)) return 'muscle';
  if (estTableau(q)) return 'tableau';
  if (estMolecule(q)) return 'molecule';
  if ((q.occlusion && q.occlusion.imageId) || q.imageId) return 'image';
  return 'texte';
}

const sansTrous = (t) => String(t || '').replace(/\{\{(?:c\d+::)?([^{}:]*)(?:::[^{}]*)?\}\}/g, '$1');

/** recto en texte simple (Molécule : son nom) */
export const rectoTexte = (q) => sansTrous(q.recto || (q.molecule && q.molecule.nom) || '');

/** verso en texte simple (Muscle, Tableau : leur contenu mis à plat) */
export function versoTexte(q) {
  if (estMuscle(q)) return texteMuscle(q).split('\n').slice(1).join('\n');
  if (estTableau(q)) return texteTableau(q.tableau);
  if (estMolecule(q)) { const m = q.molecule || {}; return [m.formule, q.verso].filter(Boolean).join(' · '); }
  // (26/10) éléments à révéler d'une carte Texte : une ligne « • … » chacun, après le verso
  const els = Array.isArray(q.items) ? q.items.filter((x) => x && String(x.text || '').trim()).map((x) => '• ' + String(x.text).trim()) : [];
  return [sansTrous(q.verso || ''), ...els].filter(Boolean).join('\n');
}

/** texte cherché par la barre de recherche : recto, verso, thème */
export const texteCherche = (q) => [rectoTexte(q), versoTexte(q), q.theme || ''].join(' ');

export const FILTRES_VIDES = { q: '', matieres: [], coursInclus: [], coursExclus: [], nouvelles: false, aApprendre: false, types: [] };

export const filtresActifs = (f) => !!(f && (String(f.q || '').trim() || f.matieres.length || f.coursInclus.length || f.coursExclus.length || f.nouvelles || f.aApprendre || f.types.length));

/** filtres lus (mémorisés) remis d'aplomb */
export function filtresValides(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const liste = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  return {
    q: typeof b.q === 'string' ? b.q : '',
    matieres: liste(b.matieres), coursInclus: liste(b.coursInclus), coursExclus: liste(b.coursExclus),
    nouvelles: b.nouvelles === true,
    aApprendre: b.aApprendre === true,
    types: liste(b.types).filter((t) => TYPES.some((x) => x.cle === t)),
  };
}

/** un cours passe-t-il de « neutre » → inclus → exclu → neutre ? (puce Cours à trois états) */
export function basculerCours(f, ficheId) {
  const inc = f.coursInclus.includes(ficheId), exc = f.coursExclus.includes(ficheId);
  if (!inc && !exc) return { ...f, coursInclus: [...f.coursInclus, ficheId] };
  if (inc) return { ...f, coursInclus: f.coursInclus.filter((x) => x !== ficheId), coursExclus: [...f.coursExclus, ficheId] };
  return { ...f, coursExclus: f.coursExclus.filter((x) => x !== ficheId) };
}

/** index : fiche → matière, matière → section */
function index(db) {
  const fiches = new Map(((db && db.fiches) || []).map((f) => [f.id, f]));
  const matieres = new Map(((db && db.matieres) || []).map((m) => [m.id, m]));
  return { fiches, matieres };
}

/** toutes les cartes du mode (ordre de la base) */
export const toutesLesCartes = (db) => ((db && db.questions) || []).filter(estCarteApprentissage);

/** les cartes qui passent les filtres (`filtres` = FILTRES_VIDES & co) */
export function filtrer(db, filtres) {
  const f = filtres || FILTRES_VIDES;
  const { fiches } = index(db);
  const q = normaliser(f.q);
  const mats = new Set(f.matieres), inc = new Set(f.coursInclus), exc = new Set(f.coursExclus), types = new Set(f.types);
  return toutesLesCartes(db).filter((c) => {
    if (exc.has(c.ficheId)) return false;
    if (inc.size && !inc.has(c.ficheId)) return false;
    if (mats.size) { const fi = fiches.get(c.ficheId); if (!fi || !mats.has(fi.matiereId)) return false; }
    if (types.size && !types.has(typeCarte(c))) return false;
    if (f.nouvelles && !estNouvelle(c)) return false;
    if (f.aApprendre && !estAApprendre(c)) return false;
    if (q && !normaliser(texteCherche(c)).includes(q)) return false;
    return true;
  });
}

const parOrdre = (a, b) => (a.ordre ?? 0) - (b.ordre ?? 0);

/**
 * Cartes rangées Section → Matière → Cours (ordre de la Bibliothèque ; cartes dans l'ordre de leur cours) :
 * [{ section: { id, nom }, n, matieres: [{ matiere: { id, nom }, n, cours: [{ fiche, cartes }] }] }].
 * Un groupe sans carte n'apparaît pas. Une carte sans cours / matière / section va dans « Sans … ».
 */
export function grouper(db, cartes, stats = null) {
  const { fiches, matieres } = index(db);
  const parFiche = new Map();
  for (const c of cartes) { if (!parFiche.has(c.ficheId)) parFiche.set(c.ficheId, []); parFiche.get(c.ficheId).push(c); }
  // fiche → matière → section
  const arbre = new Map(); // sectionId → Map(matiereId → [fiche])
  const ajouter = (sid, mid, fiche) => {
    if (!arbre.has(sid)) arbre.set(sid, new Map());
    const m = arbre.get(sid);
    if (!m.has(mid)) m.set(mid, []);
    m.get(mid).push(fiche);
  };
  for (const [ficheId] of parFiche) {
    const fiche = fiches.get(ficheId) || { id: ficheId, titre: 'Cours introuvable' };
    const mat = fiche.matiereId && matieres.get(fiche.matiereId);
    ajouter(mat && mat.sourceId ? mat.sourceId : '—', mat ? mat.id : '—', fiche);
  }
  const sections = trierSections((db && db.sources) || [], stats);
  const ordreSec = [...sections.map((s) => s.id), '—'];
  const ordreMat = [...trierMatieres((db && db.matieres) || []).map((m) => m.id), '—']; // (26/10) ordre de la Bibliothèque
  const nomSec = new Map(sections.map((s) => [s.id, s.nom]));
  const out = [];
  for (const sid of ordreSec) {
    const m = arbre.get(sid);
    if (!m) continue;
    const mats = [];
    for (const mid of ordreMat) {
      const fs = m.get(mid);
      if (!fs) continue;
      const cours = [...fs].sort(parOrdre).map((fiche) => ({ fiche, cartes: parFiche.get(fiche.id) }));
      mats.push({ matiere: { id: mid, nom: mid === '—' ? 'Sans matière' : (matieres.get(mid) || {}).nom || 'Matière' }, n: cours.reduce((n, g) => n + g.cartes.length, 0), cours });
    }
    out.push({ section: { id: sid, nom: sid === '—' ? 'Sans section' : nomSec.get(sid) || 'Section' }, n: mats.reduce((n, x) => n + x.n, 0), matieres: mats });
  }
  return out;
}

/**
 * (26/10) RANG de chaque cours dans l'ordre de la Bibliothèque (section → matière → cours), le même que `grouper` :
 * Map(ficheId → rang). Sert à « Regrouper par cours » de la séance du jour (lib/categoriesFC.js regrouperParCours).
 */
export function rangDesCours(db, stats = null) {
  const sections = trierSections((db && db.sources) || [], stats);
  const rangSec = new Map(sections.map((x, i) => [x.id, i]));
  const rangMat = new Map(trierMatieres((db && db.matieres) || []).map((m, i) => [m.id, i]));
  const mats = new Map(((db && db.matieres) || []).map((m) => [m.id, m]));
  const cle = (f) => { const m = mats.get(f.matiereId); const sec = m && rangSec.has(m.sourceId) ? rangSec.get(m.sourceId) : sections.length;
    return [sec, m && rangMat.has(m.id) ? rangMat.get(m.id) : Infinity, f.ordre ?? 0]; };
  const fiches = ((db && db.fiches) || []).map((f, i) => ({ f, i, k: cle(f) }));
  fiches.sort((a, b) => (a.k[0] - b.k[0]) || ((a.k[1] - b.k[1]) || 0) || (a.k[2] - b.k[2]) || (a.i - b.i));
  return new Map(fiches.map((x, i) => [x.f.id, i]));
}

/** ids dans l'ordre affiché (celui de la session) */
export const idsAffiches = (groupes) => groupes.flatMap((s) => s.matieres.flatMap((m) => m.cours.flatMap((g) => g.cartes.map((c) => c.id))));

/** matières et cours proposés dans les filtres (ceux qui ont au moins une carte) */
export function choixFiltres(db, stats = null) {
  const groupes = grouper(db, toutesLesCartes(db), stats);
  const matieres = [], cours = [];
  for (const s of groupes) for (const m of s.matieres) {
    matieres.push({ id: m.matiere.id, nom: m.matiere.nom, section: s.section.nom, n: m.n });
    for (const g of m.cours) cours.push({ id: g.fiche.id, nom: g.fiche.titre || 'Sans titre', matiereId: m.matiere.id, matiere: m.matiere.nom, n: g.cartes.length });
  }
  return { matieres, cours };
}

/* ============================================================
   (28/10) SÉLECTION LIBRE et COMPTEUR DE PASSAGES (docs/compte-rendu-apprentissage-v2-recherche-tags.md).
   La sélection est une liste d'ids, INDÉPENDANTE des filtres : une carte cochée le reste quand le filtre, la
   recherche ou la vue changent. Une case de cours / de matière porte sur TOUTES ses cartes, même masquées par le
   filtre en cours. Le compteur de passages (`passages[cardId]`, apprentissageLibre/liste.js) n'est que LU ici.
   ============================================================ */

/** ids de toutes les cartes du mode, par cours (ficheId) et par matière (même clé que `grouper` : '—' = sans matière) */
export function idsParGroupe(db) {
  const { fiches, matieres } = index(db);
  const cours = new Map(), mats = new Map();
  const pousser = (m, k, id) => { if (!m.has(k)) m.set(k, []); m.get(k).push(id); };
  for (const c of toutesLesCartes(db)) {
    pousser(cours, c.ficheId, c.id);
    const fi = fiches.get(c.ficheId);
    const mid = fi && fi.matiereId && matieres.has(fi.matiereId) ? fi.matiereId : '—';
    pousser(mats, mid, c.id);
  }
  return { cours, matieres: mats };
}

/** état d'une case de groupe : 'tout' | 'partiel' | 'aucun' */
export function etatSelection(ids, sel) {
  const s = sel instanceof Set ? sel : new Set(sel || []);
  const n = (ids || []).filter((id) => s.has(id)).length;
  return n === 0 ? 'aucun' : n === (ids || []).length ? 'tout' : 'partiel';
}

/** coche une carte (ou la décoche) — renvoie la nouvelle liste (ordre de sélection conservé) */
export const basculerCarte = (sel, id) => ((sel || []).includes(id) ? sel.filter((x) => x !== id) : [...(sel || []), id]);

/** case de groupe : tout cocher (si rien ou une partie est cochée) ou tout décocher (si tout l'est) */
export function basculerGroupe(sel, ids) {
  const l = sel || [];
  if (etatSelection(ids, l) === 'tout') { const r = new Set(ids); return l.filter((x) => !r.has(x)); }
  const deja = new Set(l);
  return [...l, ...(ids || []).filter((id) => !deja.has(id))];
}

/** sélection résumée : cartes encore existantes, dont combien masquées par le filtre en cours */
export function resumeSelection(db, sel, visibles) {
  const existe = new Set(toutesLesCartes(db).map((c) => c.id));
  const vis = new Set((visibles || []).map((c) => (typeof c === 'string' ? c : c.id)));
  const ids = (sel || []).filter((id) => existe.has(id));
  return { n: ids.length, horsFiltre: ids.filter((id) => !vis.has(id)).length, ids };
}

/** ids de la sélection dans l'ordre de rangement (Section → Matière → Cours → cartes) : l'ordre de la session */
export function ordreSelection(db, sel, stats = null, passages = null) {
  const s = new Set(sel || []);
  const g = grouper(db, toutesLesCartes(db).filter((c) => s.has(c.id)), stats);
  return idsAffiches(passages ? trierMoinsPassees(g, passages) : g);
}

/** nombre de passages d'une carte (0 = jamais sue en session Apprentissage) */
export const passagesDe = (passages, id) => { const n = passages && passages[id]; return Number.isInteger(n) && n > 0 ? n : 0; };

/** tri « Moins passées d'abord » : dans chaque cours, les cartes de 0 passage d'abord (tri stable, rangement inchangé) */
export function trierMoinsPassees(groupes, passages) {
  return groupes.map((s) => ({ ...s, matieres: s.matieres.map((m) => ({ ...m, cours: m.cours.map((g) => ({
    ...g, cartes: g.cartes.map((c, i) => [c, i]).sort((a, b) => (passagesDe(passages, a[0].id) - passagesDe(passages, b[0].id)) || (a[1] - b[1])).map((x) => x[0]),
  })) })) }));
}
