/* ============================================================
   My Org — POST /api/deepgram-token : jeton TEMPORAIRE Deepgram pour la
   transcription en direct de MedRevise (src/medrevise/transcription/).

   La clé DEEPGRAM_API_KEY ne quitte JAMAIS le serveur : on demande à Deepgram
   un JWT de courte durée (POST /v1/auth/grant, ttl 300 s) et c'est lui seul que
   le navigateur reçoit. Il ne sert qu'à OUVRIR le WebSocket (sous-protocole
   ["bearer", jeton]) : une session de 3 h n'en redemande un qu'à la reconnexion.

   Protection (origine + 120 jetons / 10 min / IP) : voir _protection.js, commune
   avec /api/deepgram-credits.

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

import { refuser, creerLimiteur, baseDeepgram } from './_protection.js';

const TTL_SECONDES = 300;
// > 60 = rythme max de reconnexion (une toutes les 10 s) : un wifi instable ne bloque jamais
const limite = creerLimiteur(120);

/* Statut HTTP de /v1/auth/grant → message pour l'étudiant. */
function messageDeepgram(status) {
  if (status === 401) return { code: 'invalid_key', message: 'Clé Deepgram invalide ou révoquée.' };
  if (status === 402) return { code: 'no_credits', message: 'Crédits Deepgram épuisés : recharge le compte sur console.deepgram.com.' };
  if (status === 403) return { code: 'forbidden', message: 'La clé Deepgram n’a pas le droit de créer des jetons (rôle « Member » au minimum requis).' };
  if (status === 429) return { code: 'rate_limited', message: 'Deepgram limite les demandes : réessaie dans un instant.' };
  return { code: 'deepgram_error', message: `Deepgram a refusé la demande de jeton (HTTP ${status}).` };
}

export default async function handler(req, res) {
  if (refuser(req, res, limite)) return undefined;

  const cle = process.env.DEEPGRAM_API_KEY;
  if (!cle) {
    return res.status(503).json({ ok: false, code: 'missing_key', message: 'Clé Deepgram manquante côté serveur.' });
  }

  const base = baseDeepgram();
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
