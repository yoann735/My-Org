/* ============================================================
   MedRevise — TROIS CATÉGORIES DE FLASHCARDS et COMPOSITION D'UNE SÉANCE (24/10/2026,
   docs/compte-rendu-seance-categories.md). Fonctions PURES (tests/categoriesFC.test.js).
   - NOUVELLE : jamais notée en révision (aucun `historique[].qualite`) et pas encore « passée en
     révision » (`nouvelle !== false`). Elle n'a PAS de date : sa date de départ (`dueDate`, `j0Date`)
     reste en base mais n'est plus lue — jamais en retard, elle attend le prochain bloc Nouvelles.
     Lecture DÉRIVÉE (comme la conversion du mode Apprentissage) : une carte pas encore marquée par la
     conversion (lib/conversionNouvelles.js) est déjà lue comme Nouvelle.
   - RÉVISION : date de révision (planning.js nextDate) = aujourd'hui.
   - RETARD : date passée non faite — de la plus en retard à la moins en retard.
   Séance : seuls les types cochés, chacun limité à son maximum, dans l'ordre Retard → Révisions →
   Nouvelles.
   (26/10) « REGROUPER PAR COURS » (`choix.parCours`) : la MÊME sélection (mêmes maximums sur l'ensemble de la
   séance), seulement réordonnée — cours dans l'ordre de la Bibliothèque (section → matière → cours), et dans chaque
   cours Retard (le plus en retard d'abord) → Révisions → Nouvelles. OFF : ordre inchangé.
   ============================================================ */
import { estFlashcardJ, aEteNoteeJ, entrelacer } from './apprentissageFC.js';

/** la carte est-elle une Nouvelle ? */
export const estNouvelle = (q) => estFlashcardJ(q) && q.nouvelle !== false && !aEteNoteeJ(q);

export const CATEGORIES = [
  { cle: 'nouvelles', libelle: 'Nouvelles' },
  { cle: 'revisions', libelle: 'Révisions' },
  { cle: 'retard', libelle: 'Retard' },
];
/** ordre d'entrée dans la séance */
export const ORDRE_SEANCE = ['retard', 'revisions', 'nouvelles'];
/** maximums proposés : 5, 10, 15 … 100, puis Tout */
export const MAXIMUMS = [...Array.from({ length: 20 }, (_, i) => (i + 1) * 5), 'tout'];

export const CHOIX_DEFAUT = {
  nouvelles: { coche: true, max: 10 },
  revisions: { coche: true, max: 'tout' },
  retard: { coche: true, max: 'tout' },
};

/** choix lu (mémorisé) remis d'aplomb : types connus, maximums valides */
export function choixValide(brut) {
  const out = {};
  for (const { cle } of CATEGORIES) {
    const b = (brut && brut[cle]) || {};
    const d = CHOIX_DEFAUT[cle];
    out[cle] = { coche: typeof b.coche === 'boolean' ? b.coche : d.coche, max: MAXIMUMS.includes(b.max) ? b.max : d.max };
  }
  out.parCours = !!(brut && brut.parCours === true); // (26/10) regrouper par cours — OFF par défaut
  return out;
}

/** raccourcis : « Bloc nouvelles » (Nouvelles seules) · « Révisions J » (Révisions + Retard) — maximums conservés */
export function raccourci(nom, choix) {
  const c = choixValide(choix);
  if (nom === 'blocNouvelles') return { nouvelles: { ...c.nouvelles, coche: true }, revisions: { ...c.revisions, coche: false }, retard: { ...c.retard, coche: false }, parCours: c.parCours };
  if (nom === 'revisionsJ') return { nouvelles: { ...c.nouvelles, coche: false }, revisions: { ...c.revisions, coche: true }, retard: { ...c.retard, coche: true }, parCours: c.parCours };
  return c;
}

/**
 * Cartes disponibles par catégorie. `cartes` = flashcards des fiches planifiées ;
 * `dateDue` = planning.js nextDate (Sauter, conversion). Une carte « sautée » aujourd'hui n'est pas proposée.
 * → { nouvelles, revisions, retard } (listes de cartes ; retard trié du plus ancien au plus récent)
 */
export function categoriser(cartes, today, dateDue = (q) => q.dueDate) {
  const nouvelles = [], revisions = [], retard = [];
  (cartes || []).forEach((q, i) => {
    if (!estFlashcardJ(q) || q.termine) return;
    if (estNouvelle(q)) { nouvelles.push([q, i]); return; }
    const d = dateDue(q);
    if (d == null || q.skippedOn === today) return;
    if (d === today) revisions.push(q);
    else if (d < today) retard.push([q, d, i]);
  });
  retard.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[2] - b[2]));
  // nouvelles : dans l'ordre de leur date de départ prévue (puis de création)
  const depart = (q) => q.j0Date || q.dueDate || '';
  nouvelles.sort((a, b) => (depart(a[0]) < depart(b[0]) ? -1 : depart(a[0]) > depart(b[0]) ? 1 : a[1] - b[1]));
  return { nouvelles: nouvelles.map((x) => x[0]), revisions, retard: retard.map((x) => x[0]) };
}

const borne = (n, max) => (max === 'tout' ? n : Math.min(n, max));

/** nombre de cartes de chaque type qui entreront dans la séance, et le total */
export function nombres(cats, choix) {
  const c = choixValide(choix);
  const par = {};
  let total = 0;
  for (const { cle } of CATEGORIES) { par[cle] = c[cle].coche ? borne(cats[cle].length, c[cle].max) : 0; total += par[cle]; }
  return { par, total };
}

/**
 * Liste ordonnée des ids de la séance : Retard (plus en retard d'abord) → Révisions (cours alternés,
 * mélangées) → Nouvelles (ordre de départ). Chaque type coché, limité à son maximum.
 * → { ids, categorie: { [id]: 'retard'|'revisions'|'nouvelles' } }
 * (26/10) `rangCours(ficheId)` (ordre de la Bibliothèque) + `choix.parCours` : même sélection, regroupée par cours.
 */
export function composerSeance(cats, choix, coursDe = () => '', rand = Math.random, rangCours = null) {
  const c = choixValide(choix);
  const ids = []; const categorie = {};
  for (const cle of ORDRE_SEANCE) {
    if (!c[cle].coche) continue;
    let l = cats[cle].map((q) => q.id);
    if (cle === 'revisions') l = entrelacer(l, coursDe, rand);
    l = l.slice(0, c[cle].max === 'tout' ? l.length : c[cle].max);
    l.forEach((id) => { if (!(id in categorie)) { ids.push(id); categorie[id] = cle; } });
  }
  if (c.parCours && rangCours) return { ids: regrouperParCours(ids, categorie, coursDe, rangCours), categorie };
  return { ids, categorie };
}

/**
 * (26/10) REGROUPER PAR COURS : réordonne les ids d'une séance déjà composée (aucune carte ajoutée ni retirée).
 * Cours dans l'ordre `rangCours` (Bibliothèque ; un cours inconnu va à la fin), puis dans chaque cours l'ordre des
 * catégories (Retard → Révisions → Nouvelles), puis l'ordre de composition (le plus en retard d'abord, etc.).
 */
export function regrouperParCours(ids, categorie, coursDe, rangCours) {
  const rangCat = (id) => ORDRE_SEANCE.indexOf(categorie[id]);
  const rang = (id) => { const r = rangCours(coursDe(id)); return r == null || r < 0 ? Infinity : r; };
  return ids.map((id, i) => ({ id, i, c: rang(id), k: rangCat(id) }))
    .sort((a, b) => (a.c - b.c) || (a.c === Infinity && String(coursDe(a.id)).localeCompare(String(coursDe(b.id)))) || (a.k - b.k) || (a.i - b.i))
    .map((x) => x.id);
}

/**
 * REPRISE d'une séance composée (v3) : déjà faites intactes ; restantes = celles encore à faire (toujours
 * Nouvelle, ou toujours due aujourd'hui ou avant) — une carte notée ou passée en révision ailleurs disparaît.
 * Rien n'est ajouté : la composition choisie au lancement est respectée. Jamais de doublon.
 */
export function reprendreSeanceChoix(etat, cats) {
  const uniques = (l) => [...new Set(l || [])];
  const faites = uniques((etat.cartes || []).slice(0, etat.idx || 0));
  const dejaFaites = new Set(faites);
  const avant = uniques((etat.cartes || []).slice(etat.idx || 0)).filter((id) => !dejaFaites.has(id));
  const encore = new Set([...cats.nouvelles, ...cats.revisions, ...cats.retard].map((q) => q.id));
  const restantes = avant.filter((id) => encore.has(id));
  const cartes = [...faites, ...restantes];
  return { etat: { ...etat, cartes, idx: faites.length, phase: cartes.length > faites.length ? 'cartes' : 'fin' }, retirees: avant.length - restantes.length };
}
