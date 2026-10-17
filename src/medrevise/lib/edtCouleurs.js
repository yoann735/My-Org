/* ============================================================
   MedRevise — couleur FIXE et matière reliée de chaque cours de l'emploi du
   temps HELHa (17/10). Module pur : la palette et la teinte d'une matière sont
   passées par l'appelant (components/EmploiDuTemps.jsx), pour rester testable.

   Enregistrement de réglages `edtReglages` (storage.js#majEdtReglages, synchronisé,
   ADDITIONNEL) : { cours: { <clé>: { titre, teinte, couleur?, matiereId?, vuLe } } }
   - clé = intitulé normalisé (accents, casse, ponctuation) : même intitulé → même clé ;
   - teinte = index dans la palette de la DA, attribué À LA PREMIÈRE APPARITION
     (première couleur libre, dans l'ordre chronologique des cours) puis jamais changé ;
   - couleur = choix fait dans Réglages (index de palette) — prime sur tout ;
   - matiereId absent = correspondance automatique ; null = « aucune » ; id = choisie.
   Couleur affichée : choix de Réglages > pastille de la matière reliée > teinte.
   ============================================================ */

export function normaliser(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}
export const cleCours = (titre) => normaliser(titre) || 'cours';

/* abréviations courantes des intitulés (HELHa / bibliothèque) → mot entier */
const ABREV = {
  anat: 'anatomie', anato: 'anatomie', physio: 'physiologie', physiol: 'physiologie',
  bioch: 'biochimie', biochim: 'biochimie', histo: 'histologie', embryo: 'embryologie',
  kine: 'kinesitherapie', kines: 'kinesitherapie', kinesi: 'kinesitherapie', kinesith: 'kinesitherapie',
  psycho: 'psychologie', psy: 'psychologie', neuro: 'neurologie', pharmaco: 'pharmacologie',
  patho: 'pathologie', bio: 'biologie', biol: 'biologie', chim: 'chimie', phys: 'physique',
  stat: 'statistique', stats: 'statistique', statistiques: 'statistique', math: 'mathematiques', maths: 'mathematiques',
  angl: 'anglais', eng: 'anglais', biomeca: 'biomecanique', biomec: 'biomecanique', meca: 'mecanique',
  ortho: 'orthopedie', rhumato: 'rhumatologie', cardio: 'cardiologie', pneumo: 'pneumologie',
  gen: 'generale', gle: 'generale', fonct: 'fonctionnelle', desc: 'descriptive', palp: 'palpatoire',
  intro: 'introduction', meth: 'methodologie', methodo: 'methodologie',
};
const VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'a', 'au', 'aux', 'en', 'd', 'l', 'un', 'une', 'pour', 'sur',
  'ue', 'aa', 'cours', 'theorie', 'theorique', 'td', 'tp', 'ex', 'exercices', 'seance', 'partie', 'module', 'i', 'ii', 'iii', 'iv', '1', '2', '3', '4']);

export function jetons(s) {
  return normaliser(s).split(' ').map((m) => ABREV[m] || m).filter((m) => m && !VIDES.has(m));
}
const egaux = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

/** matière de la bibliothèque qui correspond à l'intitulé, ou null */
export function correspondanceAuto(titre, matieres) {
  const ct = jetons(titre);
  if (!ct.length) return null;
  let meilleure = null; let score = 0;
  for (const m of matieres || []) {
    if (!m || m.archive) continue;
    const mt = jetons(m.nom);
    if (!mt.length) continue;
    const dansCours = mt.filter((t) => ct.some((c) => egaux(t, c))).length / mt.length;
    const dansMatiere = ct.filter((c) => mt.some((t) => egaux(t, c))).length / ct.length;
    let s = 0;
    if (dansCours === 1) s = 2 + mt.length / 10; // tous les mots de la matière sont dans l'intitulé
    else if (dansMatiere === 1) s = 1.5; // l'intitulé est un abrégé de la matière
    else if (dansCours >= 0.6 && mt.length >= 2) s = dansCours;
    if (s > score) { score = s; meilleure = m; }
  }
  return meilleure;
}

/** réglages complétés : chaque intitulé encore inconnu reçoit une teinte FIXE, la moins portée par
    les cours déjà affichés (première libre d'abord). `titres` dans l'ordre chronologique d'apparition.
    `indexImpose(titre, reglageDuCours)` → index de palette de la couleur réellement affichée quand
    elle est imposée (choix de Réglages, matière reliée), sinon null : un cours sans matière ne
    reçoit donc pas la couleur d'une matière déjà à l'écran.
    Renvoie { reglages, nouveaux } — `nouveaux` vide si rien à enregistrer. */
export function completer(reglages, titres, taillePalette, maintenant = new Date().toISOString(), indexImpose = () => null) {
  const cours = { ...((reglages && reglages.cours) || {}) };
  const nouveaux = [];
  for (const titre of titres) {
    const cle = cleCours(titre);
    if (cours[cle]) continue;
    const usage = new Array(taillePalette).fill(0);
    Object.values(cours).forEach((c) => {
      const i = indexImpose(c.titre, c);
      const j = Number.isInteger(i) ? i : c.teinte;
      if (Number.isInteger(j) && j >= 0 && j < taillePalette) usage[j]++;
    });
    const impose = indexImpose(titre, {});
    const teinte = Number.isInteger(impose) && impose >= 0 && impose < taillePalette ? impose : usage.indexOf(Math.min(...usage));
    cours[cle] = { titre, teinte, vuLe: maintenant };
    nouveaux.push(cle);
  }
  return { reglages: { ...(reglages || {}), cours }, nouveaux };
}

/** tout ce qu'il faut pour afficher un cours */
export function resoudreCours(titre, reglages, matieres, { palette, teinteMatiere }) {
  const cle = cleCours(titre);
  const r = (reglages && reglages.cours && reglages.cours[cle]) || {};
  const choisie = r.matiereId === undefined ? undefined : r.matiereId;
  const matiere = choisie === null ? null
    : choisie ? (matieres || []).find((m) => m.id === choisie) || null
    : correspondanceAuto(titre, matieres);
  const auto = choisie === undefined;
  let couleur; let source;
  const perso = r.couleur;
  if (perso != null && perso !== '') { couleur = typeof perso === 'number' ? palette[perso % palette.length] : perso; source = 'perso'; }
  else if (matiere) { couleur = teinteMatiere(matiere); source = 'matiere'; }
  else { couleur = palette[(Number.isInteger(r.teinte) ? r.teinte : 0) % palette.length]; source = 'auto'; }
  return { cle, titre: r.titre || titre, couleur, source, matiere, lienAuto: auto };
}

/** intitulés distincts, dans l'ordre chronologique de première apparition */
export function titresDansLOrdre(events) {
  const vus = new Set(); const sortie = [];
  [...(events || [])].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0)).forEach((e) => {
    const k = cleCours(e.title);
    if (!vus.has(k)) { vus.add(k); sortie.push(e.title); }
  });
  return sortie;
}
