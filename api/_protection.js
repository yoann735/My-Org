/* ============================================================
   My Org — protection commune des fonctions Deepgram (/api/deepgram-token,
   /api/deepgram-credits). Préfixe « _ » : Vercel ne le déploie pas comme une
   route, c'est un simple module importé.

   L'app n'a pas d'authentification serveur (mono-utilisateur) :
   - ORIGINE : Origin (ou à défaut Referer) = le domaine qui sert l'app (même hôte
     que la requête), ou listé dans DEEPGRAM_ALLOWED_ORIGINS ;
   - DÉBIT : N appels / 10 min / IP, en mémoire (par instance — freine un abus
     naïf, ce n'est pas une authentification).
   ============================================================ */

const FENETRE_MS = 10 * 60 * 1000;

function ipDe(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || (req.socket && req.socket.remoteAddress) || 'inconnue';
}

function hoteDe(url) {
  try { return new URL(url).host; } catch { return null; }
}

export function origineAutorisee(req) {
  const origine = req.headers.origin || req.headers.referer || '';
  const hote = hoteDe(origine);
  if (!hote) return false;
  const hoteRequete = req.headers['x-forwarded-host'] || req.headers.host;
  if (hote === hoteRequete) return true;
  const enPlus = String(process.env.DEEPGRAM_ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean).map((s) => hoteDe(s) || s);
  return enPlus.includes(hote);
}

/** Limiteur par IP. Chaque appelant crée le sien (compteurs séparés). */
export function creerLimiteur(maxParFenetre) {
  const appels = new Map(); // ip → [horodatages]
  return function limite(req) {
    const ip = ipDe(req);
    const maintenant = Date.now();
    const recents = (appels.get(ip) || []).filter((t) => maintenant - t < FENETRE_MS);
    if (recents.length >= maxParFenetre) { appels.set(ip, recents); return true; }
    recents.push(maintenant);
    appels.set(ip, recents);
    if (appels.size > 5000) appels.clear(); // borne mémoire
    return false;
  };
}

/** Contrôles communs. Renvoie true si la réponse a déjà été envoyée (refus). */
export function refuser(req, res, limite) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, code: 'method', message: 'Méthode non autorisée.' });
    return true;
  }
  if (!origineAutorisee(req)) {
    res.status(403).json({ ok: false, code: 'origin', message: 'Origine non autorisée.' });
    return true;
  }
  if (limite(req)) {
    res.status(429).json({ ok: false, code: 'rate_limited', message: 'Trop de demandes : patiente quelques minutes.' });
    return true;
  }
  return false;
}

export const baseDeepgram = () => (process.env.DEEPGRAM_API_URL || 'https://api.deepgram.com').replace(/\/+$/, '');
