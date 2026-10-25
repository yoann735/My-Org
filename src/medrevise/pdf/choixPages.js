/* ============================================================
   MedRevise — CHOIX DES PAGES D'UN EXPORT (25/10, docs/compte-rendu-boites-tableaux.md §4). Fonctions PURES, partagées
   par tous les exports (PDF annoté, fiche jumelle, export spécial IA, PNG par page, .md, document) via pdf/ChoixPages.jsx.
     modes : 'toutes' · 'courante' · 'plage' (de X à Y) · 'precises' (« 1-3, 7, 10-12 »)
   Les pages sont numérotées comme dans le lecteur (1…n, pages ajoutées comprises) ; le résultat est la liste TRIÉE et
   sans doublon des indices 0…n-1. Le dernier choix est mémorisé PAR COURS (localStorage).
   ============================================================ */
export const MODES_PAGES = ['toutes', 'courante', 'plage', 'precises'];
const cleMemoire = (coursId) => 'medrevise.export.pages.' + (coursId || 'sans-cours');

/** « 1-3, 7, 10-12 » → { pages: [0, 1, 2, 6, 9, 10, 11] } ou { erreur } (n = nombre de pages du document) */
export function lirePagesPrecises(texte, n) {
  const t = String(texte || '').trim();
  if (!t) return { erreur: 'Indique des pages, par ex. « 1-3, 7, 10-12 »' };
  const out = new Set();
  for (const brut of t.split(/[,;]+/)) {
    const m = brut.trim();
    if (!m) continue;
    const r = m.match(/^(\d+)\s*(?:[-–—à]|\.\.)\s*(\d+)$/) || m.match(/^(\d+)$/);
    if (!r) return { erreur: `« ${m} » n’est pas un numéro de page ni une plage (ex. 2-4)` };
    const a = +r[1], b = r[2] != null ? +r[2] : a;
    if (a < 1 || b < 1) return { erreur: 'Les pages commencent à 1' };
    if (a > b) return { erreur: `Plage à l’envers : « ${m} » (écris ${b}-${a})` };
    if (b > n) return { erreur: `La page ${b} n’existe pas (le document en a ${n})` };
    for (let k = a; k <= b; k++) out.add(k - 1);
  }
  if (!out.size) return { erreur: 'Aucune page choisie' };
  return { pages: [...out].sort((x, y) => x - y) };
}

/** choix { mode, de, a, liste } → { pages } | { erreur } ; `courante` : numéro de la page affichée (1…n) */
export function pagesDuChoix(choix, n, courante = 1) {
  const c = choix || { mode: 'toutes' };
  if (!n) return { erreur: 'Document vide' };
  if (c.mode === 'courante') return { pages: [Math.max(1, Math.min(n, courante)) - 1] };
  if (c.mode === 'plage') {
    const a = parseInt(c.de, 10), b = parseInt(c.a, 10);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { erreur: 'Indique la première et la dernière page' };
    return lirePagesPrecises(`${a}-${b}`, n);
  }
  if (c.mode === 'precises') return lirePagesPrecises(c.liste, n);
  return { pages: Array.from({ length: n }, (_, i) => i) };
}

/** « 2, 3, 4, 7 » → « 2-4, 7 » (affichage compact et nom de fichier) */
export function resumePages(pages) {
  const p = [...pages].sort((a, b) => a - b).map((i) => i + 1);
  const morceaux = [];
  for (let k = 0; k < p.length; k++) {
    let j = k;
    while (j + 1 < p.length && p[j + 1] === p[j] + 1) j++;
    morceaux.push(j > k ? `${p[k]}-${p[j]}` : String(p[k]));
    k = j;
  }
  return morceaux.join(', ');
}
/** suffixe de nom de fichier : '' pour toutes les pages, sinon « -p2-4_7 » */
export const suffixePages = (pages, n) => (!pages || pages.length === n ? '' : '-p' + resumePages(pages).replace(/, /g, '_'));

export function lireChoixMemorise(coursId) {
  try { const v = JSON.parse(localStorage.getItem(cleMemoire(coursId)) || 'null'); return v && MODES_PAGES.includes(v.mode) ? v : null; } catch (e) { return null; }
}
export function memoriserChoix(coursId, choix) {
  try { localStorage.setItem(cleMemoire(coursId), JSON.stringify({ mode: choix.mode, de: choix.de ?? '', a: choix.a ?? '', liste: choix.liste ?? '' })); } catch (e) { /* stockage indisponible */ }
}
