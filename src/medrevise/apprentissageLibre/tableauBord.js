/* ============================================================
   MedRevise — MODE APPRENTISSAGE v2 : le TABLEAU DE BORD (25/10/2026,
   docs/compte-rendu-apprentissage-v2-recherche-tags.md). Fonctions PURES
   (tests/apprentissage-libre/tableauBord.test.js).
   - TOUTES les flashcards sont dans le mode Apprentissage, d'office (plus de liste à remplir).
   - Filtres : recherche (recto, verso, thème), matières (plusieurs), cours (plusieurs, inclus ou
     exclus), « Nouvelles » (définition existante : lib/categoriesFC.js estNouvelle — LECTURE seule),
     type (texte, Muscle, Tableau, Molécule, image).
   - Rangement Section → Matière → Cours, dans l'ordre de la Bibliothèque.
   INDÉPENDANCE : ce module ne lit que l'identité, le rangement et le contenu des cartes (et, pour le
   filtre « Nouvelles », la définition existante) ; il n'écrit RIEN.
   ============================================================ */
import { estMuscle, texteMuscle } from '../lib/muscle.js';
import { estTableau, texteTableau } from '../lib/carteTableau.js';
import { estMolecule } from '../molecule/carte.js';
import { estNouvelle } from '../lib/categoriesFC.js';
import { normaliser } from '../lib/rechercheTexte.js';
import { trierSections } from '../components/useTreeOpenState.js';

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
  return sansTrous(q.verso || '');
}

/** texte cherché par la barre de recherche : recto, verso, thème */
export const texteCherche = (q) => [rectoTexte(q), versoTexte(q), q.theme || ''].join(' ');

export const FILTRES_VIDES = { q: '', matieres: [], coursInclus: [], coursExclus: [], nouvelles: false, types: [] };

export const filtresActifs = (f) => !!(f && (String(f.q || '').trim() || f.matieres.length || f.coursInclus.length || f.coursExclus.length || f.nouvelles || f.types.length));

/** filtres lus (mémorisés) remis d'aplomb */
export function filtresValides(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const liste = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  return {
    q: typeof b.q === 'string' ? b.q : '',
    matieres: liste(b.matieres), coursInclus: liste(b.coursInclus), coursExclus: liste(b.coursExclus),
    nouvelles: b.nouvelles === true,
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
  const ordreMat = [...((db && db.matieres) || []).map((m) => m.id), '—'];
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
