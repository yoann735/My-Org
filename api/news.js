/* ============================================================
   My Org — /api/news?lang=fr|en : agrège des flux RSS côté serveur
   (contourne le CORS), déduplique, filtre les dernières 48h, capture
   l'image de chaque item, puis fait curer par Claude (garde l'important
   /fiable/neutre, résumé dans la langue demandée). Le modèle ne gère
   PAS les images : le code refusionne image/url/source par id après
   coup. Sans ANTHROPIC_API_KEY : fallback local (tri par date + filtre
   mots-clés négatifs, bilingue). Cache mémoire (scope module), PAR
   LANGUE, 3h.
   ============================================================ */
import Parser from 'rss-parser';
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';

const FEEDS_BY_LANG = {
  fr: {
    Monde: [
      'https://www.france24.com/fr/rss',
      'https://news.google.com/rss/search?q=when:24h+allinurl:reuters.com&hl=fr&gl=FR&ceid=FR:fr',
    ],
    Business: [
      'https://news.google.com/rss/search?q=%C3%A9conomie+entreprise+business&hl=fr&gl=FR&ceid=FR:fr',
    ],
    Aviation: [
      'https://news.google.com/rss/search?q=aviation+a%C3%A9ronautique&hl=fr&gl=FR&ceid=FR:fr',
    ],
    'Médecine': [
      'https://news.google.com/rss/search?q=m%C3%A9decine+recherche+m%C3%A9dicale&hl=fr&gl=FR&ceid=FR:fr',
    ],
    Sport: [
      'https://news.google.com/rss/search?q=sport+actualit%C3%A9&hl=fr&gl=FR&ceid=FR:fr',
    ],
    'Sciences & Espace': [
      'https://news.google.com/rss/search?q=science+espace+d%C3%A9couverte&hl=fr&gl=FR&ceid=FR:fr',
    ],
    'Tech & IA': [
      'https://news.google.com/rss/search?q=technologie+intelligence+artificielle&hl=fr&gl=FR&ceid=FR:fr',
    ],
    'Culture & Savoir': [
      'https://news.google.com/rss/search?q=histoire+culture+g%C3%A9ographie&hl=fr&gl=FR&ceid=FR:fr',
    ],
  },
  en: {
    World: [
      'https://feeds.bbci.co.uk/news/world/rss.xml',
      'https://www.aljazeera.com/xml/rss/all.xml',
    ],
    Business: [
      'https://feeds.bbci.co.uk/news/business/rss.xml',
    ],
    Aviation: [
      'https://news.google.com/rss/search?q=aviation+aerospace&hl=en&gl=US&ceid=US:en',
    ],
    'Health & Medicine': [
      'https://www.news-medical.net/syndication.axd?format=rss',
      'https://feeds.bbci.co.uk/news/health/rss.xml',
    ],
    Sport: [
      'https://feeds.bbci.co.uk/sport/rss.xml',
    ],
    'Science & Space': [
      'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
    ],
    'Tech & AI': [
      'https://feeds.bbci.co.uk/news/technology/rss.xml',
    ],
    'Culture & Knowledge': [
      'https://news.google.com/rss/search?q=history+culture+geography&hl=en&gl=US&ceid=US:en',
    ],
  },
};

const LANG_NAME = { fr: 'français', en: 'anglais' };
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_ITEMS_TO_MODEL = 60;
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const MODEL = 'claude-haiku-4-5-20251001';

const NEGATIVE_KEYWORDS = [
  // français
  'guerre', 'mort', 'morte', 'morts', 'tue', 'tuee', 'tues', 'crash', 'attentat',
  'massacre', 'catastrophe', 'meurtre', 'tuerie', 'deces', 'explosion',
  'fusillade', 'viol', 'seisme', 'incendie meurtrier', 'assassinat', 'carnage',
  // anglais (plusieurs flux — BBC, Al Jazeera — sont en anglais)
  'war', 'dead', 'death', 'killed', 'kills', 'attack', 'attacks',
  'shooting', 'bombing', 'explosion', 'hijack', 'hijacked',
  'earthquake', 'disaster', 'murder', 'assassination',
];

/* cache module-scope, par langue (survit tant que la fonction reste "chaude") */
const cache = { fr: { payload: null, ts: 0 }, en: { payload: null, ts: 0 } };

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

function makeId(url) {
  return createHash('sha1').update(url).digest('hex').slice(0, 16);
}

/* garde-fou : certains flux (requêtes concurrentes vers le même hôte,
   notamment news.google.com) peuvent rester bloqués bien au-delà du
   `timeout` de rss-parser (qui ne couvre que la connexion, pas le
   streaming de la réponse). On force donc aussi un timeout dur ici. */
const FEED_HARD_TIMEOUT_MS = 9000;
function withHardTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout dur (${ms}ms) — ${label}`)), ms)),
  ]);
}

/* image : enclosure natif rss-parser, sinon media:content / media:thumbnail
   (customFields), sinon <img> trouvé dans le contenu HTML de l'item */
function extractImage(entry) {
  if (entry.enclosure?.url) return entry.enclosure.url;

  const mc = entry.mediaContent;
  if (Array.isArray(mc)) {
    const found = mc.find((m) => m?.$?.url);
    if (found) return found.$.url;
  } else if (mc?.$?.url) {
    return mc.$.url;
  }

  const mt = entry.mediaThumbnail;
  if (Array.isArray(mt)) {
    const found = mt.find((m) => m?.$?.url);
    if (found) return found.$.url;
  } else if (mt?.$?.url) {
    return mt.$.url;
  }

  const html = entry['content:encoded'] || entry.content || '';
  const m = /<img[^>]+src="([^"]+)"/i.exec(html);
  if (m) return m[1];

  return null;
}

async function fetchAllFeeds(lang) {
  const feeds = FEEDS_BY_LANG[lang];
  const parser = new Parser({
    timeout: 8000,
    customFields: {
      item: [
        ['media:content', 'mediaContent', { keepArray: true }],
        ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ],
    },
  });
  const cutoff = Date.now() - MAX_AGE_MS;
  const tasks = [];
  for (const [category, urls] of Object.entries(feeds)) {
    for (const url of urls) {
      tasks.push(
        withHardTimeout(parser.parseURL(url), FEED_HARD_TIMEOUT_MS, url)
          .then((feed) => ({ category, feed }))
          .catch((err) => {
            console.error(`[api/news] flux en échec (${category}/${lang}): ${url} — ${err.message}`);
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
        id: makeId(entry.link),
        title: entry.title.trim(),
        source: entry.creator || feedTitle || hostnameOf(entry.link),
        url: entry.link,
        image: extractImage(entry),
        pubDate: validDate ? date.toISOString() : null,
        contentSnippet: (entry.contentSnippet || entry.content || '').trim(),
        categoryHint: category,
      });
    }
  }
  return items;
}

async function curateWithClaude(items, lang, apiKey) {
  const client = new Anthropic({ apiKey });
  const categories = Object.keys(FEEDS_BY_LANG[lang]);

  const systemPrompt = `Tu es un éditeur d'actu rationnel et non partisan. Garde UNIQUEMENT l'important, fiable, neutre ou positif. EXCLUS l'anxiogène/dramatique/graphique/politiquement orienté. Pour le Monde : seulement ce qui est réellement important à l'échelle mondiale, factuel. Réponds STRICTEMENT en JSON (aucun texte autour) : un tableau d'objets {id, category, importance (1-5), summary (2-3 phrases neutres, en ${LANG_NAME[lang]}, la langue demandée)}. Le champ "category" doit être recopié TEL QUEL depuis le "categoryHint" fourni pour l'item (ne l'invente pas, ne le traduis pas). Catégories valides : ${categories.join(' | ')}. Classe le tableau par importance décroissante.`;

  const input = items.map((it) => ({
    id: it.id,
    title: it.title,
    source: it.source,
    categoryHint: it.categoryHint,
    pubDate: it.pubDate,
  }));

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: JSON.stringify(input) }],
  });

  const text = message.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim();
  const cleaned = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error('Réponse Claude non conforme (pas un tableau)');

  const byId = new Map(items.map((it) => [it.id, it]));
  const merged = [];
  for (const curated of parsed) {
    const original = curated && byId.get(curated.id);
    if (!original) continue;
    merged.push({
      id: original.id,
      title: original.title,
      source: original.source,
      url: original.url,
      image: original.image,
      category: categories.includes(curated.category) ? curated.category : original.categoryHint,
      importance: Number.isFinite(curated.importance) ? Math.min(5, Math.max(1, curated.importance)) : 3,
      summary: String(curated.summary || ''),
    });
  }
  return merged.sort((a, b) => b.importance - a.importance);
}

function fallbackCurate(items) {
  return items
    .filter((it) => {
      const norm = normalizeTitle(it.title);
      return !NEGATIVE_KEYWORDS.some((kw) => norm.includes(kw));
    })
    .sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
    .map((it, idx) => ({
      id: it.id,
      title: it.title,
      source: it.source,
      url: it.url,
      image: it.image,
      category: it.categoryHint,
      importance: Math.max(1, 5 - Math.floor(idx / 6)),
      summary: it.contentSnippet ? it.contentSnippet.slice(0, 220) : it.title,
    }));
}

export default async function handler(req, res) {
  const now = Date.now();
  const rawLang = (req.query?.lang || 'fr').toString().toLowerCase();
  const lang = FEEDS_BY_LANG[rawLang] ? rawLang : 'fr';

  if (cache[lang].payload && now - cache[lang].ts < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=10800, stale-while-revalidate=600');
    return res.status(200).json(cache[lang].payload);
  }

  try {
    const rawItems = await fetchAllFeeds(lang);
    const deduped = dedupeItems(rawItems);
    const recent = deduped
      .sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
      .slice(0, MAX_ITEMS_TO_MODEL);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    let items;
    let source;

    if (apiKey) {
      try {
        items = await curateWithClaude(recent, lang, apiKey);
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

    const payload = { items, generatedAt: new Date().toISOString(), source, lang };
    cache[lang] = { payload, ts: now };

    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=10800, stale-while-revalidate=600');
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[api/news] erreur', err);
    if (cache[lang].payload) return res.status(200).json(cache[lang].payload);
    return res.status(500).json({ error: "Impossible de récupérer les actualités pour l'instant." });
  }
}
