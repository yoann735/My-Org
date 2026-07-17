/* ============================================================
   My Org — News : apprentissage 100% local par les clics (aucune IA).
   À chaque ouverture d'article, le profil d'affinité (stocké dans
   myorg_news_clicks) apprend : catégorie +3, source +2, chaque mot
   significatif du titre +1 (minuscule, sans stopwords fr/en).
   Le score d'un item = récence + importance + w_cat*catégorie +
   w_src*source + somme(poids des mots du titre présents dans le
   profil). Coeffs éditables ci-dessous. Tant qu'aucun clic n'a été
   enregistré, "Pour toi" retombe sur un mix varié (round-robin par
   catégorie, triée par récence).
   ============================================================ */

const STOPWORDS_FR = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'au', 'aux',
  'en', 'sur', 'sous', 'dans', 'par', 'pour', 'avec', 'sans', 'ce', 'ces',
  'cette', 'son', 'sa', 'ses', 'leur', 'leurs', 'il', 'elle', 'ils', 'elles',
  'que', 'qui', 'quoi', 'dont', 'est', 'sont', 'sera', 'ont', 'a', 'plus',
  'moins', 'très', 'tout', 'tous', 'toute', 'toutes', 'pas', 'ne', 'se',
  'nous', 'vous', 'entre', 'vers', 'apres', 'avant', 'comme', 'aussi',
]);

const STOPWORDS_EN = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for',
  'with', 'without', 'this', 'that', 'these', 'those', 'his', 'her', 'its',
  'their', 'he', 'she', 'it', 'they', 'is', 'are', 'was', 'were', 'be',
  'has', 'have', 'had', 'more', 'less', 'very', 'all', 'not', 'no',
  'we', 'you', 'between', 'after', 'before', 'as', 'also', 'from', 'by',
]);

/* coefficients — éditables */
const W_CAT = 1;
const W_SRC = 1;
const W_WORD = 1;
const RECENCY_HALF_LIFE_H = 60; // score de récence tombe à ~0 après quelques jours
const FOR_YOU_LIMIT = 12;

function stripAccents(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function significantWords(title) {
  return stripAccents(title)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS_FR.has(w) && !STOPWORDS_EN.has(w));
}

export function emptyProfile() {
  return { id: 'profile', categories: {}, sources: {}, words: {}, updatedAt: null };
}

export function hasSignal(profile) {
  if (!profile) return false;
  return !!(Object.keys(profile.categories || {}).length
    || Object.keys(profile.sources || {}).length
    || Object.keys(profile.words || {}).length);
}

/* pure : renvoie un NOUVEAU profil (n'aliase pas l'ancien) */
export function recordClick(profile, item) {
  const base = profile && profile.id ? profile : emptyProfile();
  const categories = { ...base.categories };
  const sources = { ...base.sources };
  const words = { ...base.words };

  if (item?.category) categories[item.category] = (categories[item.category] || 0) + 3;
  if (item?.source) sources[item.source] = (sources[item.source] || 0) + 2;
  for (const w of significantWords(item?.title || '')) words[w] = (words[w] || 0) + 1;

  return { id: 'profile', categories, sources, words, updatedAt: new Date().toISOString() };
}

function recencyScore(pubDate) {
  if (!pubDate) return 0;
  const ageH = (Date.now() - new Date(pubDate).getTime()) / (60 * 60 * 1000);
  return Math.max(0, 10 - (ageH / RECENCY_HALF_LIFE_H) * 10);
}

function scoreItem(item, profile) {
  const catScore = (profile.categories?.[item.category] || 0) * W_CAT;
  const srcScore = (profile.sources?.[item.source] || 0) * W_SRC;
  let wordScore = 0;
  for (const w of significantWords(item.title || '')) wordScore += profile.words?.[w] || 0;
  wordScore *= W_WORD;
  return recencyScore(item.pubDate) + (item.importance || 3) + catScore + srcScore + wordScore;
}

/* mix varié round-robin par catégorie, triée par récence dans chaque
   catégorie — utilisé tant qu'aucun clic n'a été enregistré */
function variedMix(items, limit) {
  const byCat = new Map();
  for (const it of items) {
    if (!byCat.has(it.category)) byCat.set(it.category, []);
    byCat.get(it.category).push(it);
  }
  for (const arr of byCat.values()) arr.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  const cats = [...byCat.keys()];
  const mixed = [];
  let i = 0;
  while (mixed.length < limit && cats.some((c) => byCat.get(c).length)) {
    const cat = cats[i % cats.length];
    const arr = byCat.get(cat);
    if (arr.length) mixed.push(arr.shift());
    i += 1;
  }
  return mixed;
}

export function rankForYou(items, profile, readUrls, limit = FOR_YOU_LIMIT) {
  const unread = items.filter((it) => !readUrls?.has(it.url));
  if (!hasSignal(profile)) return variedMix(unread, limit);
  return unread
    .map((it) => ({ it, score: scoreItem(it, profile) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.it);
}
