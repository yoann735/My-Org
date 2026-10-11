/* ============================================================
   MedRevise — MODE APPRENTISSAGE LIBRE : la session en rafale, logique PURE.
   Vit uniquement en mémoire (état React) : rien n'est enregistré, rien n'est repris.
   - « Su » : +1 à la suite de « Su » de la carte. À 2 « Su » d'affilée, la carte est « sue » :
     elle sort de la file de CETTE session (elle reste dans la liste d'apprentissage).
     Sinon (1er « Su ») elle revient plus loin, après les autres.
   - « Pas su » : la suite retombe à 0, la carte revient plus loin, après les autres.
   - « Skip » : la carte passe en fin de file, sans rien noter.
   L'ordre des cartes restantes est toujours conservé (aucun mélange).
   ============================================================ */

/** session neuve sur des ids déjà ordonnés (cours puis cartes) */
export function nouvelleSession(ids) {
  const file = [...new Set(ids)];
  return { file, suites: {}, sues: [], vues: [], total: file.length, fin: file.length === 0 };
}

export const carteCourante = (s) => (s && !s.fin ? s.file[0] || null : null);

/** réponse à la carte courante : su = true (« Su ») ou false (« Pas su ») */
export function repondre(s, su) {
  if (!s || s.fin || !s.file.length) return s;
  const [id, ...reste] = s.file;
  const n = su ? (s.suites[id] || 0) + 1 : 0;
  const vues = s.vues.includes(id) ? s.vues : [...s.vues, id];
  const sue = su && n >= 2;
  const file = sue ? reste : [...reste, id];
  const sues = sue && !s.sues.includes(id) ? [...s.sues, id] : s.sues;
  return { ...s, file, suites: { ...s.suites, [id]: n }, vues, sues, fin: file.length === 0 };
}

/** « Skip » : la carte courante passe en fin de file, rien n'est noté */
export function passer(s) {
  if (!s || s.fin || s.file.length < 2) return s;
  const [id, ...reste] = s.file;
  return { ...s, file: [...reste, id] };
}

/** finir maintenant (écran de fin) */
export const finir = (s) => ({ ...s, fin: true });

/** « 18 cartes vues · 12 sues · 6 à retravailler » — vues = cartes notées au moins une fois */
export function bilan(s) {
  const vues = s.vues.length;
  const sues = s.sues.length;
  return { vues, sues, aRetravailler: vues - sues };
}
