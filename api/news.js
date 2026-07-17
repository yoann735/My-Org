/* ============================================================
   My Org — /api/news : agrège des flux RSS côté serveur (contourne
   le CORS), déduplique, filtre les dernières 48h, puis fait curer
   par Claude (garde uniquement l'important/fiable/neutre-positif).
   Sans ANTHROPIC_API_KEY : fallback local (tri par date + filtre
   mots-clés négatifs). Cache mémoire (scope module) 3h.
   ============================================================ */
import Parser from 'rss-parser';
import Anthropic from '@anthropic-ai/sdk';

const FEEDS = {
  Monde: [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://www.france24.com/fr/rss',
    'https://news.google.com/rss/search?q=when:24h+allinurl:reuters.com&hl=fr&gl=FR&ceid=FR:fr',
  ],
  Business: [
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://news.google.com/rss/search?q=%C3%A9conomie+entreprise+business&hl=fr&gl=FR&ceid=FR:fr',
  ],
  Aviation: [
    'https://news.google.com/rss/search?q=aviation+a%C3%A9ronautique&hl=fr&gl=FR&ceid=FR:fr',
  ],
  'Médecine': [
    'https://www.news-medical.net/syndication.axd?format=rss',
    'https://news.google.com/rss/search?q=m%C3%A9decine+recherche+m%C3%A9dicale+sant%C3%A9&hl=fr&gl=FR&ceid=FR:fr',
  ],
  'Culture & Savoir': [
    'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
    'https://news.google.com/rss/search?q=histoire+science+d%C3%A9couverte+g%C3%A9ographie&hl=fr&gl=FR&ceid=FR:fr',
  ],
};

const CATEGORIES = Object.keys(FEEDS);
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_ITEMS_TO_MODEL = 50;
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `Tu es un éditeur d'actu rationnel et non partisan. À partir de la liste d'items fournie, garde UNIQUEMENT ce qui est important, fiable et neutre ou positif. EXCLUS tout contenu anxiogène, dramatique, graphique, ou politiquement orienté. Pour le Monde, ne garde que ce qui est réellement important à l'échelle mondiale (impact réel), présenté factuellement. Retourne STRICTEMENT un JSON (aucun texte autour) : un tableau d'objets {title, source, url, category (Monde|Aviation|Business|Médecine|Culture & Savoir), importance (1-5), summary_fr (1-2 phrases neutres en français)}. Classe par importance décroissante.`;

const NEGATIVE_KEYWORDS = [
  // français
  'guerre', 'mort', 'morte', 'morts', 'tue', 'tuee', 'tues', 'crash', 'attentat',
  'massacre', 'catastrophe', 'meurtre', 'tuerie', 'deces', 'explosion',
  'fusillade', 'viol', 'seisme', 'incendie meurtrier', 'assassinat', 'carnage',
  // anglais (plusieurs flux sources — BBC notamment — sont en anglais)
  'war', 'dead', 'death', 'killed', 'kills', 'crash', 'attack', 'attacks',
  'massacre', 'shooting', 'bombing', 'explosion', 'hijack', 'hijacked',
  'earthquake', 'disaster', 'murder', 'assassination',
];

/* cache module-scope (survit tant que la fonction serverless reste "chaude") */
let cache = { payload: null, ts: 0 };

function stripAccents(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeTitle(t) {
  return stripAccents(t)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleSimilarity(a, b) {
  const wa = new Set(a.split(' ').filter((w) => w.length > 2));
  const wb = new Set(b.split(' ').filter((w) => w.length > 2));
  if (!wa.size || !wb.size) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common += 1;
  return common / Math.min(wa.size, wb.size);
}

function dedupeItems(items) {
  const kept = [];
  for (const item of items) {
    const norm = normalizeTitle(item.title);
    const isDup = kept.some((k) => titleSimilarity(norm, k._norm) > 0.6);
    if (!isDup) kept.push({ ...item, _norm: norm });
  }
  return kept.map(({ _norm, ...rest }) => rest);
}

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return 'Source inconnue'; }
}

async function fetchAllFeeds() {
  const parser = new Parser({ timeout: 8000 });
  const cutoff = Date.now() - MAX_AGE_MS;
  const tasks = [];
  for (const [category, urls] of Object.entries(FEEDS)) {
    for (const url of urls) {
      tasks.push(
        parser.parseURL(url)
          .then((feed) => ({ category, feed }))
          .catch((err) => {
            console.error(`[api/news] flux en échec (${category}): ${url} — ${err.message}`);
            return null;
          }),
      );
    }
  }

  const results = await Promise.all(tasks);
  const items = [];
  for (const result of results) {
    if (!result) continue;
    const { category, feed } = result;
    const feedTitle = feed.title || '';
    for (const entry of feed.items || []) {
      if (!entry.link || !entry.title) continue;
      const dateStr = entry.isoDate || entry.pubDate;
      const date = dateStr ? new Date(dateStr) : null;
      const validDate = date && !Number.isNaN(date.getTime());
      if (validDate && date.getTime() < cutoff) continue;
      items.push({
        title: entry.title.trim(),
        source: entry.creator || feedTitle || hostnameOf(entry.link),
        url: entry.link,
        pubDate: validDate ? date.toISOString() : null,
        contentSnippet: (entry.contentSnippet || entry.content || '').trim(),
        categoryHint: category,
      });
    }
  }
  return items;
}

async function curateWithClaude(items, apiKey) {
  const client = new Anthropic({ apiKey });
  const input = items.map((it) => ({
    title: it.title,
    source: it.source,
    url: it.url,
    categoryHint: it.categoryHint,
    pubDate: it.pubDate,
  }));

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify(input) }],
  });

  const text = message.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim();
  const cleaned = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error('Réponse Claude non conforme (pas un tableau)');

  return parsed
    .filter((it) => it && it.title && it.url)
    .map((it) => ({
      title: String(it.title),
      source: String(it.source || hostnameOf(it.url)),
      url: String(it.url),
      category: CATEGORIES.includes(it.category) ? it.category : 'Culture & Savoir',
      importance: Number.isFinite(it.importance) ? Math.min(5, Math.max(1, it.importance)) : 3,
      summary_fr: String(it.summary_fr || ''),
    }))
    .sort((a, b) => b.importance - a.importance);
}

function fallbackCurate(items) {
  return items
    .filter((it) => {
      const norm = normalizeTitle(it.title);
      return !NEGATIVE_KEYWORDS.some((kw) => norm.includes(kw));
    })
    .sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
    .map((it, idx) => ({
      title: it.title,
      source: it.source,
      url: it.url,
      category: it.categoryHint,
      importance: Math.max(1, 5 - Math.floor(idx / 6)),
      summary_fr: it.contentSnippet ? it.contentSnippet.slice(0, 220) : it.title,
    }));
}

export default async function handler(req, res) {
  const now = Date.now();

  if (cache.payload && now - cache.ts < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=10800, stale-while-revalidate=600');
    return res.status(200).json(cache.payload);
  }

  try {
    const rawItems = await fetchAllFeeds();
    const deduped = dedupeItems(rawItems);
    const recent = deduped
      .sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
      .slice(0, MAX_ITEMS_TO_MODEL);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    let items;
    let source;

    if (apiKey) {
      try {
        items = await curateWithClaude(recent, apiKey);
        source = 'claude';
      } catch (err) {
        console.error('[api/news] curation Claude échouée, fallback local', err);
        items = fallbackCurate(recent);
        source = 'fallback';
      }
    } else {
      items = fallbackCurate(recent);
      source = 'fallback';
    }

    const payload = { items, generatedAt: new Date().toISOString(), source };
    cache = { payload, ts: now };

    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=10800, stale-while-revalidate=600');
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[api/news] erreur', err);
    if (cache.payload) return res.status(200).json(cache.payload);
    return res.status(500).json({ error: "Impossible de récupérer les actualités pour l'instant." });
  }
}
