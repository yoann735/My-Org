/* ============================================================
   My Org — /api/news : agrège en firehose un maximum de flux RSS
   côté serveur (contourne le CORS), déduplique, filtre les 72
   dernières heures, capture l'image de chaque item. Filtre NÉGATIF
   LÉGER uniquement (titres clairement dramatiques/graphiques) — on
   n'exclut rien d'autre, la pertinence se fait par le TRI (récence +
   affinité apprise côté client), pas par la suppression.
   ENRICHISSEMENT OPTIONNEL (si ANTHROPIC_API_KEY) : les ~40 items les
   plus récents sont envoyés à Claude Haiku pour {importance, summary}
   — jamais pour exclure. Les autres items gardent leur résumé natif
   (contentSnippet du flux) + une importance neutre par défaut.
   Chaque item est tagué `lang` (fr/en) selon son flux d'origine ; le
   filtre Tous/FR/EN se fait côté front sur ce champ. Cache mémoire
   (scope module), un seul payload combiné, refetch au-delà de 3h.
   Un flux mort ne casse jamais la réponse.
   ============================================================ */
import Parser from 'rss-parser';
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';

/* pool de flux — à plat, catégorie canonique (fr) + langue de l'item.
   Facile à éditer : ajouter/retirer une ligne suffit. */
const FEEDS = [
  // Monde
  { category: 'Monde', lang: 'fr', url: 'https://www.france24.com/fr/rss' },
  { category: 'Monde', lang: 'en', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { category: 'Monde', lang: 'en', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { category: 'Monde', lang: 'fr', url: 'https://news.google.com/rss/search?q=when:24h+allinurl:reuters.com&hl=fr&gl=FR&ceid=FR:fr' },
  // Business
  { category: 'Business', lang: 'en', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { category: 'Business', lang: 'fr', url: 'https://news.google.com/rss/search?q=%C3%A9conomie+entreprise+startup&hl=fr&gl=FR&ceid=FR:fr' },
  { category: 'Business', lang: 'en', url: 'https://news.google.com/rss/search?q=business+economy+markets&hl=en&gl=US&ceid=US:en' },
  // Aviation
  { category: 'Aviation', lang: 'fr', url: 'https://news.google.com/rss/search?q=aviation+a%C3%A9ronautique+avion&hl=fr&gl=FR&ceid=FR:fr' },
  { category: 'Aviation', lang: 'en', url: 'https://news.google.com/rss/search?q=aviation+aerospace+airline&hl=en&gl=US&ceid=US:en' },
  // Médecine
  { category: 'Médecine', lang: 'en', url: 'https://www.news-medical.net/syndication.axd?format=rss' },
  { category: 'Médecine', lang: 'en', url: 'https://feeds.bbci.co.uk/news/health/rss.xml' },
  { category: 'Médecine', lang: 'fr', url: 'https://news.google.com/rss/search?q=m%C3%A9decine+recherche+m%C3%A9dicale+sant%C3%A9&hl=fr&gl=FR&ceid=FR:fr' },
  // Sciences & Espace (newscientist.com/feed/home retiré : renvoie 406 en permanence)
  { category: 'Sciences & Espace', lang: 'en', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml' },
  { category: 'Sciences & Espace', lang: 'en', url: 'https://www.livescience.com/feeds.xml' },
  { category: 'Sciences & Espace', lang: 'en', url: 'https://phys.org/rss-feed/physics-news/' },
  { category: 'Sciences & Espace', lang: 'fr', url: 'https://news.google.com/rss/search?q=science+espace+d%C3%A9couverte&hl=fr&gl=FR&ceid=FR:fr' },
  // Tech & IA
  { category: 'Tech & IA', lang: 'en', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
  { category: 'Tech & IA', lang: 'fr', url: 'https://news.google.com/rss/search?q=technologie+intelligence+artificielle&hl=fr&gl=FR&ceid=FR:fr' },
  // Sport
  { category: 'Sport', lang: 'en', url: 'https://feeds.bbci.co.uk/sport/rss.xml' },
  { category: 'Sport', lang: 'fr', url: 'https://news.google.com/rss/search?q=sport+actualit%C3%A9&hl=fr&gl=FR&ceid=FR:fr' },
  // Histoire & Culture
  { category: 'Histoire & Culture', lang: 'en', url: 'https://www.smithsonianmag.com/rss/latest_articles/' },
  { category: 'Histoire & Culture', lang: 'fr', url: 'https://news.google.com/rss/search?q=histoire+culture+g%C3%A9ographie&hl=fr&gl=FR&ceid=FR:fr' },
  // Docs & longs formats
  { category: 'Docs & longs formats', lang: 'en', url: 'https://www.quantamagazine.org/feed/' },
  { category: 'Docs & longs formats', lang: 'en', url: 'https://aeon.co/feed.rss' },
  { category: 'Docs & longs formats', lang: 'en', url: 'https://longreads.com/feed/' },
  { category: 'Docs & longs formats', lang: 'en', url: 'https://nautil.us/feed/' },
];

const LANG_NAME = { fr: 'français', en: 'anglais' };
const MAX_AGE_MS = 72 * 60 * 60 * 1000; // fenêtre firehose : 72h
const MAX_ITEMS_TO_ENRICH = 40; // seuls les + récents passent par Claude
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const MODEL = 'claude-haiku-4-5-20251001';

/* filtre négatif LÉGER : écarte seulement les titres clairement
   dramatiques/graphiques. Éditable — on ne sur-filtre pas. */
const NEGATIVE_KEYWORDS = [
  'guerre', 'attentat', 'crash', 'meurtre', 'tuerie', 'massacre', 'fusillade', 'carnage', 'assassinat', 'attaque terroriste',
  'war', 'terror attack', 'plane crash', 'mass shooting', 'massacre', 'murder', 'bombing', 'gunman',
];

/* cache module-scope : un seul payload combiné (fr+en), survit tant
   que la fonction serverless reste "chaude" */
const cache = { payload: null, ts: 0 };

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

function isDramatic(title) {
  const norm = normalizeTitle(title);
  return NEGATIVE_KEYWORDS.some((kw) => norm.includes(normalizeTitle(kw)));
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

async function fetchAllFeeds() {
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

  const tasks = FEEDS.map(({ category, lang, url }) =>
    withHardTimeout(parser.parseURL(url), FEED_HARD_TIMEOUT_MS, url)
      .then((feed) => ({ category, lang, feed }))
      .catch((err) => {
        console.error(`[api/news] flux en échec (${category}/${lang}): ${url} — ${err.message}`);
        return null;
      }),
  );

  const results = await Promise.all(tasks);
  const items = [];
  for (const result of results) {
    if (!result) continue;
    const { category, lang, feed } = result;
    const feedTitle = feed.title || '';
    for (const entry of feed.items || []) {
      if (!entry.link || !entry.title) continue;
      if (isDramatic(entry.title)) continue;
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
        category,
        lang,
        importance: 3, // neutre par défaut, affiné par Claude pour les + récents
        summary: '',
      });
    }
  }
  return items;
}

async function enrichWithClaude(items, apiKey) {
  const client = new Anthropic({ apiKey });
  const systemPrompt = `Tu enrichis un flux d'actualité, tu ne le censures pas. Pour CHAQUE item fourni (id, title, source, category, lang, pubDate), réponds STRICTEMENT en JSON (aucun texte autour) : un tableau d'objets {id, importance (1-5, importance factuelle objective de la nouvelle), summary (2-3 phrases neutres et factuelles, écrites dans la langue indiquée par "lang" : "fr" → français, "en" → anglais)}. N'exclus AUCUN item de ta réponse — un item par entrée fournie.`;

  const input = items.map((it) => ({
    id: it.id, title: it.title, source: it.source, category: it.category, lang: it.lang, pubDate: it.pubDate,
  }));

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: JSON.stringify(input) }],
  });

  const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  const cleaned = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error('Réponse Claude non conforme (pas un tableau)');

  const byId = new Map(parsed.map((p) => [p?.id, p]));
  return items.map((it) => {
    const curated = byId.get(it.id);
    if (!curated) return it;
    return {
      ...it,
      importance: Number.isFinite(curated.importance) ? Math.min(5, Math.max(1, curated.importance)) : it.importance,
      summary: String(curated.summary || '') || it.summary,
    };
  });
}

function withNativeSummary(it) {
  if (it.summary) return it;
  return { ...it, summary: it.contentSnippet ? it.contentSnippet.slice(0, 220) : it.title };
}

export default async function handler(req, res) {
  const now = Date.now();

  if (cache.payload && now - cache.ts < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=10800, stale-while-revalidate=600');
    return res.status(200).json(cache.payload);
  }

  try {
    const rawItems = await fetchAllFeeds();
    const deduped = dedupeItems(rawItems).sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));

    const apiKey = process.env.ANTHROPIC_API_KEY;
    let items = deduped;
    let source = 'native';

    if (apiKey && deduped.length) {
      const toEnrich = deduped.slice(0, MAX_ITEMS_TO_ENRICH);
      const rest = deduped.slice(MAX_ITEMS_TO_ENRICH);
      try {
        const enriched = await enrichWithClaude(toEnrich, apiKey);
        items = [...enriched, ...rest];
        source = 'claude+native';
      } catch (err) {
        console.error('[api/news] enrichissement Claude échoué, résumés natifs uniquement', err);
      }
    }

    items = items.map(withNativeSummary);

    const payload = {
      items,
      generatedAt: new Date().toISOString(),
      source,
      count: items.length,
    };
    cache.payload = payload;
    cache.ts = now;

    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=10800, stale-while-revalidate=600');
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[api/news] erreur', err);
    if (cache.payload) return res.status(200).json(cache.payload);
    return res.status(500).json({ error: "Impossible de récupérer les actualités pour l'instant." });
  }
}
