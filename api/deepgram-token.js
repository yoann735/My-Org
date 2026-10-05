/* ============================================================
   My Org — POST /api/deepgram-token : jeton TEMPORAIRE Deepgram pour la
   transcription en direct de MedRevise (src/medrevise/transcription/).

   La clé DEEPGRAM_API_KEY ne quitte JAMAIS le serveur : on demande à Deepgram
   un JWT de courte durée (POST /v1/auth/grant, ttl 300 s) et c'est lui seul que
   le navigateur reçoit. Il ne sert qu'à OUVRIR le WebSocket (sous-protocole
   ["bearer", jeton]) : une session de 3 h n'en redemande un qu'à la reconnexion.

   L'app n'a pas d'authentification serveur (mono-utilisateur, comme la synchro
   Supabase). Deux garde-fous à la place :
   - ORIGINE : Origin (ou à défaut Referer) doit être le domaine qui sert l'app
     (même hôte que la requête), ou figurer dans DEEPGRAM_ALLOWED_ORIGINS ;
   - DÉBIT : 120 jetons / 10 min / IP, en mémoire (par instance de fonction —
     suffisant contre un abus naïf, pas une protection forte).

   Jamais de log de la clé ni du jeton. Les erreurs Deepgram sont traduites en
   un message lisible, affiché tel quel par l'UI.

   Variables (serveur uniquement, sans préfixe VITE_ — jamais dans le bundle) :
   - DEEPGRAM_API_KEY          obligatoire ;
   - DEEPGRAM_ALLOWED_ORIGINS  facultatif, origines en plus, séparées par des virgules ;
   - DEEPGRAM_API_URL          facultatif, base REST (défaut https://api.deepgram.com) ;
   - DEEPGRAM_LISTEN_URL       facultatif, URL du WebSocket renvoyée au client
                               (défaut wss://api.deepgram.com/v1/listen). Ces deux
                               dernières ne servent qu'aux tests locaux contre
                               scripts/faux-deepgram.mjs.
   ============================================================ */

const TTL_SECONDES = 300;
const FENETRE_MS = 10 * 60 * 1000;
const MAX_PAR_FENETRE = 120; // > 60 = rythme max de reconnexion (une toutes les 10 s) : un wifi instable ne bloque jamais
const appels = new Map(); // ip → [horodatages]

function ipDe(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || (req.socket && req.socket.remoteAddress) || 'inconnue';
}

function limite(ip) {
  const maintenant = Date.now();
  const recents = (appels.get(ip) || []).filter((t) => maintenant - t < FENETRE_MS);
  if (recents.length >= MAX_PAR_FENETRE) { appels.set(ip, recents); return true; }
  recents.push(maintenant);
  appels.set(ip, recents);
  if (appels.size > 5000) appels.clear(); // borne mémoire
  return false;
}

function hoteDe(url) {
  try { return new URL(url).host; } catch { return null; }
}

function origineAutorisee(req) {
  const origine = req.headers.origin || req.headers.referer || '';
  const hote = hoteDe(origine);
  if (!hote) return false;
  const hoteRequete = req.headers['x-forwarded-host'] || req.headers.host;
  if (hote === hoteRequete) return true;
  const enPlus = String(process.env.DEEPGRAM_ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean).map((s) => hoteDe(s) || s);
  return enPlus.includes(hote);
}

/* Statut HTTP de /v1/auth/grant → message pour l'étudiant. */
function messageDeepgram(status) {
  if (status === 401) return { code: 'invalid_key', message: 'Clé Deepgram invalide ou révoquée.' };
  if (status === 402) return { code: 'no_credits', message: 'Crédits Deepgram épuisés : recharge le compte sur console.deepgram.com.' };
  if (status === 403) return { code: 'forbidden', message: 'La clé Deepgram n’a pas le droit de créer des jetons (rôle « Member » au minimum requis).' };
  if (status === 429) return { code: 'rate_limited', message: 'Deepgram limite les demandes : réessaie dans un instant.' };
  return { code: 'deepgram_error', message: `Deepgram a refusé la demande de jeton (HTTP ${status}).` };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, code: 'method', message: 'Méthode non autorisée.' });
  }
  if (!origineAutorisee(req)) {
    return res.status(403).json({ ok: false, code: 'origin', message: 'Origine non autorisée.' });
  }
  if (limite(ipDe(req))) {
    return res.status(429).json({ ok: false, code: 'rate_limited', message: 'Trop de demandes de jeton : patiente quelques minutes.' });
  }

  const cle = process.env.DEEPGRAM_API_KEY;
  if (!cle) {
    return res.status(503).json({ ok: false, code: 'missing_key', message: 'Clé Deepgram manquante côté serveur.' });
  }

  const base = (process.env.DEEPGRAM_API_URL || 'https://api.deepgram.com').replace(/\/+$/, '');
  try {
    const r = await fetch(base + '/v1/auth/grant', {
      method: 'POST',
      headers: { Authorization: 'Token ' + cle, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl_seconds: TTL_SECONDES }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      const m = messageDeepgram(r.status);
      return res.status(502).json({ ok: false, ...m });
    }
    const json = await r.json();
    if (!json || !json.access_token) {
      return res.status(502).json({ ok: false, code: 'deepgram_error', message: 'Réponse Deepgram inattendue (pas de jeton).' });
    }
    return res.status(200).json({
      ok: true,
      access_token: json.access_token,
      expires_in: json.expires_in || TTL_SECONDES,
      listen_url: process.env.DEEPGRAM_LISTEN_URL || 'wss://api.deepgram.com/v1/listen',
    });
  } catch (e) {
    // pas de détail brut (il pourrait contenir l'en-tête) : seulement la nature de l'échec
    const delai = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return res.status(504).json({ ok: false, code: 'unreachable', message: delai ? 'Deepgram ne répond pas (délai dépassé).' : 'Deepgram injoignable depuis le serveur.' });
  }
}
