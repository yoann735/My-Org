/* ============================================================
   My Org — POST /api/timetable : emploi du temps HELHa (Hyperplanning) de la
   promo, pour le calendrier de l'Accueil de MedRevise (mode « École »).

   Le lien iCal privé n'existe QUE côté serveur (HELHA_ICAL_URL, sans préfixe
   VITE_) : jamais renvoyé au client, jamais écrit dans un log ni dans un message
   d'erreur. Le navigateur ne reçoit que le JSON normalisé (api/_lib/emploiDuTemps.js) :
   semaine passée + semaine en cours + 8 suivantes, fuseau Europe/Brussels.

   Cache mémoire (par instance) de 60 min. `?force=1` relit Hyperplanning, au plus
   une fois par minute ; au-delà, le cache est servi avec `forceLimite`. Si
   Hyperplanning est injoignable, le dernier cache est servi (`stale: true`).
   Protection (origine + 300 appels / 10 min / IP) : voir _protection.js.

   Sans HELHA_ICAL_URL : 503 { code: 'not_configured' } — l'app affiche
   « Emploi du temps non configuré » dans le sélecteur, rien ne casse.
   ============================================================ */
import { refuser, creerLimiteur } from './_protection.js';
import { analyserIcs, fenetre } from './_lib/emploiDuTemps.js';

const TTL_MS = 60 * 60 * 1000;
const FORCE_MS = 60 * 1000;
const TAILLE_MAX = 8 * 1024 * 1024;
// réponses servies par le cache : la limite ne protège que la fonction ; Hyperplanning, lui, est
// protégé par le cache de 60 min et la limite de ?force=1
const limite = creerLimiteur(300);

let cache = null; // { at, data }
let dernierForce = 0;

async function lireHyperplanning(url) {
  const r = await fetch(url.replace(/^webcals?:\/\//i, 'https://'), {
    headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5' },
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) {
    const e = new Error('http'); e.status = r.status; throw e;
  }
  const texte = await r.text();
  if (texte.length > TAILLE_MAX) { const e = new Error('trop_gros'); e.code = 'too_big'; throw e; }
  if (!/BEGIN:VCALENDAR/i.test(texte)) { const e = new Error('pas_ics'); e.code = 'not_ics'; throw e; }
  const { debut, fin } = fenetre();
  return {
    generatedAt: new Date().toISOString(),
    from: new Date(debut).toISOString(),
    to: new Date(fin).toISOString(),
    timezone: 'Europe/Brussels',
    events: analyserIcs(texte, { debut, fin }),
  };
}

function messageErreur(e) {
  if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) return { code: 'unreachable', message: 'Hyperplanning ne répond pas (délai dépassé).' };
  if (e && e.status === 404) return { code: 'not_found', message: 'Lien Hyperplanning introuvable : il a peut-être été régénéré.' };
  if (e && e.status) return { code: 'upstream', message: `Hyperplanning a refusé la demande (HTTP ${e.status}).` };
  if (e && e.code === 'too_big') return { code: 'too_big', message: 'Emploi du temps trop volumineux.' };
  if (e && e.code === 'not_ics') return { code: 'not_ics', message: 'Le lien Hyperplanning ne renvoie pas un calendrier iCal.' };
  if (e && e.message === 'parse') return { code: 'parse', message: 'Emploi du temps illisible.' };
  return { code: 'unreachable', message: 'Hyperplanning injoignable depuis le serveur.' };
}

export default async function handler(req, res) {
  if (refuser(req, res, limite)) return undefined;

  const url = process.env.HELHA_ICAL_URL;
  if (!url || !/^(https?|webcals?):\/\//i.test(url.trim())) {
    return res.status(503).json({ ok: false, code: 'not_configured', message: 'Emploi du temps non configuré' });
  }

  const maintenant = Date.now();
  const veutForcer = (req.query && String(req.query.force) === '1') || /[?&]force=1(?:&|$)/.test(String(req.url || ''));
  let forceLimite = false;
  let doitLire = !cache || maintenant - cache.at > TTL_MS;
  if (veutForcer) {
    if (maintenant - dernierForce < FORCE_MS) forceLimite = true;
    else { dernierForce = maintenant; doitLire = true; }
  }

  if (doitLire) {
    try {
      let data;
      try { data = await lireHyperplanning(url.trim()); } catch (e) {
        if (e && (e.status || e.code || e.name === 'TimeoutError' || e.name === 'AbortError' || e.name === 'TypeError')) throw e;
        throw new Error('parse');
      }
      cache = { at: maintenant, data };
    } catch (e) {
      const m = messageErreur(e);
      if (cache) {
        return res.status(200).json({ ok: true, ...cache.data, cachedAt: new Date(cache.at).toISOString(), stale: true, avertissement: m.message, forceLimite });
      }
      return res.status(502).json({ ok: false, ...m });
    }
  }

  return res.status(200).json({
    ok: true, ...cache.data, cachedAt: new Date(cache.at).toISOString(), stale: false,
    forceLimite, reessaiForce: forceLimite ? Math.ceil((FORCE_MS - (maintenant - dernierForce)) / 1000) : 0,
  });
}
