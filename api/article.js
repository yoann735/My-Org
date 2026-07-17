/* ============================================================
   My Org — /api/article?url=... : extraction à la demande de
   l'article complet (texte + images) pour le lecteur News.
   Résout d'abord les redirections (ex. liens news.google.com),
   puis extrait via @extractus/article-extractor (contenu déjà
   nettoyé). Ne jette jamais d'erreur brute : { ok:false } si
   échec, paywall ou extraction vide — le front bascule alors sur
   le résumé + lien source.
   ============================================================ */
import { extract } from '@extractus/article-extractor';

const UA = 'Mozilla/5.0 (compatible; MyOrgNewsBot/1.0; +https://vercel.com)';
const FETCH_TIMEOUT_MS = 8000;

async function resolveFinalUrl(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return res.url || url;
  } catch {
    return url;
  }
}

function extractImages(html, leadImage) {
  const images = [];
  if (leadImage) images.push(leadImage);
  if (html) {
    const re = /<img[^>]+src="([^"]+)"/gi;
    let m;
    while ((m = re.exec(html))) {
      if (!images.includes(m[1])) images.push(m[1]);
      if (images.length >= 12) break;
    }
  }
  return images;
}

export default async function handler(req, res) {
  const rawUrl = req.query?.url;
  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({ ok: false, error: 'Paramètre url manquant.' });
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocole invalide');
  } catch {
    return res.status(400).json({ ok: false, error: 'URL invalide.' });
  }

  try {
    const resolvedUrl = await resolveFinalUrl(parsed.toString());
    const article = await extract(resolvedUrl, {}, {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!article || !article.content || !article.title) {
      return res.status(200).json({ ok: false });
    }

    const images = extractImages(article.content, article.image);

    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.status(200).json({
      ok: true,
      title: article.title,
      content: article.content,
      images,
      source: article.source || new URL(resolvedUrl).hostname.replace(/^www\./, ''),
      author: article.author || null,
      published: article.published || null,
      url: resolvedUrl,
    });
  } catch (err) {
    console.error('[api/article] extraction échouée', rawUrl, err.message);
    return res.status(200).json({ ok: false });
  }
}
