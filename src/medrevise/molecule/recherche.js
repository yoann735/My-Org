/* ============================================================
   MedRevise — recherche dans la bibliothèque de molécules (08/10).
   Pur (testé sous Node par scripts/molecules/test-bibliotheque.mjs). Insensible aux
   accents, à la casse et à l'écriture des lettres grecques (β = beta = b-) ; chaque mot
   tapé doit se retrouver dans le nom, un synonyme ou la catégorie ; le nom l'emporte
   sur les synonymes, le début de mot sur le milieu.
   ============================================================ */
const GREC = { α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ω: 'omega' };
export const normaliser = (s) => String(s || '')
  .replace(/[αβγδω]/g, (c) => ' ' + GREC[c] + ' ')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/⁺/g, '+').replace(/[^a-z0-9+]+/g, ' ').trim();

function scoreMot(mot, champ, poids) {
  const mots = champ.split(' ');
  if (mots.includes(mot)) return 4 * poids;
  if (mots.some((w) => w.startsWith(mot))) return 2.5 * poids;
  if (mot.length >= 3 && champ.includes(mot)) return 1 * poids;
  return 0;
}

/** entrées classées pour la requête (au plus `max`) */
export function rechercher(entrees, requete, max = 12) {
  const q = normaliser(requete);
  if (!q) return [];
  const mots = q.split(' ').filter(Boolean);
  const res = [];
  for (const e of entrees) {
    const nom = normaliser(e.nom);
    const syns = (e.synonymes || []).map(normaliser);
    const cat = normaliser(e.categorie);
    let total = 0, tous = true;
    for (const m of mots) {
      const s = Math.max(scoreMot(m, nom, 3), ...syns.map((x) => scoreMot(m, x, 2)), scoreMot(m, cat, 1));
      if (!s) { tous = false; break; }
      total += s;
    }
    if (!tous) continue;
    if (nom === q) total += 40;
    else if (nom.startsWith(q)) total += 10;
    if (syns.includes(q)) total += 15;
    res.push({ e, total });
  }
  res.sort((a, b) => b.total - a.total || a.e.nom.length - b.e.nom.length);
  return res.slice(0, max).map((x) => x.e);
}
