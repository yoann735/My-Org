/* ============================================================
   My Org — POST /api/deepgram-credits : crédits Deepgram restants, pour
   l'affichage « ≈ N h restantes » de la transcription en direct (MedRevise).

   Réponse : { ok, remainingUsd, spentUsd, hoursUsed, effectiveRateUsdPerHour,
               estimatedHoursLeft, source, spentSource, updatedAt, stale, cached }

   MÉTHODE (aucun id codé en dur, clé jamais renvoyée ni loggée) :
   1. projet  : GET /v1/projects → le premier ;
   2. solde   : GET /v1/projects/{id}/balances → somme des montants en USD
                (source = "balance"). Refusé (403, clé « Member ») → étape 4 ;
   3. heures  : GET /v1/projects/{id}/usage/breakdown?endpoint=listen sur toute la
                vie du compte (repli : /usage) → somme des `hours` ;
   4. dépense : GET /v1/projects/{id}/billing/breakdown → somme des `dollars` si la
                clé y a droit (spentSource = "billing") ; sinon heures × 0,0048 $/min,
                tarif nova-3 streaming (spentSource = "hours"). Sans solde lisible :
                remainingUsd = DEEPGRAM_INITIAL_CREDIT_USD (défaut 200) − dépense,
                source = "usage-estimate".
   5. tarif effectif = dépense / heures dès 0,5 h (capte le surcoût réel des
      mots-clés quand la dépense vient du solde ou de la facturation), sinon
      0,29 $/h ; heures restantes = solde / tarif effectif.

   CACHE : 10 min en mémoire (par instance). Erreur Deepgram/réseau → dernière
   valeur connue avec stale: true ; jamais rien d'autre qu'un JSON lisible.
   ============================================================ */
import { refuser, creerLimiteur, baseDeepgram } from './_protection.js';

const CACHE_MS = (Number(process.env.DEEPGRAM_CREDITS_CACHE_S) || 600) * 1000; // 10 min (variable : tests seulement)
const TARIF_MIN = 0.0048; // $/min, nova-3 streaming monolingue
const TARIF_DEFAUT_H = 0.29; // $/h tant que l'historique est trop court
const limite = creerLimiteur(60);
let derniere = null; // { valeur, t }

const arrondi = (x, n = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** n) / 10 ** n);
const jour = (d) => d.toISOString().slice(0, 10);

async function appeler(cle, chemin) {
  const r = await fetch(baseDeepgram() + chemin, {
    headers: { Authorization: 'Token ' + cle },
    signal: AbortSignal.timeout(8000),
  });
  let json = null;
  if (r.ok) { try { json = await r.json(); } catch { json = null; } }
  return { status: r.status, ok: r.ok && !!json, json };
}

const somme = (liste, champ) => (Array.isArray(liste) ? liste.reduce((n, x) => n + (Number(x && x[champ]) || 0), 0) : null);

/** Heures transcrites sur toute la vie du compte (null si illisible). */
async function heuresTranscrites(cle, id) {
  const fin = jour(new Date(Date.now() + 86400000));
  for (const debut of ['2020-01-01', jour(new Date(Date.now() - 365 * 86400000))]) {
    for (const chemin of [`/v1/projects/${id}/usage/breakdown`, `/v1/projects/${id}/usage`]) {
      const r = await appeler(cle, `${chemin}?start=${debut}&end=${fin}&endpoint=listen`);
      if (r.ok && Array.isArray(r.json.results)) return somme(r.json.results, 'hours');
      if (r.status === 401 || r.status === 403) break; // pas le droit : inutile d'insister sur ce chemin
    }
  }
  return null;
}

async function depenseFacturee(cle, id) {
  const fin = jour(new Date(Date.now() + 86400000));
  const r = await appeler(cle, `/v1/projects/${id}/billing/breakdown?start=2020-01-01&end=${fin}`);
  if (r.ok && Array.isArray(r.json.results)) return somme(r.json.results, 'dollars');
  return null;
}

async function calculer(cle) {
  const projets = await appeler(cle, '/v1/projects');
  if (!projets.ok) {
    const e = new Error('projects ' + projets.status);
    e.code = projets.status === 401 ? 'invalid_key' : projets.status === 403 ? 'forbidden' : 'deepgram_error';
    throw e;
  }
  const projet = (projets.json.projects || [])[0];
  if (!projet || !projet.project_id) { const e = new Error('aucun projet'); e.code = 'no_project'; throw e; }
  const id = encodeURIComponent(projet.project_id);

  const [soldes, heures, factures] = await Promise.all([
    appeler(cle, `/v1/projects/${id}/balances`),
    heuresTranscrites(cle, id),
    depenseFacturee(cle, id),
  ]);
  const initial = Number(process.env.DEEPGRAM_INITIAL_CREDIT_USD) || 200;

  let source, remaining, spent, spentSource;
  const listeSoldes = soldes.ok && Array.isArray(soldes.json.balances) ? soldes.json.balances : null;
  if (listeSoldes) {
    source = 'balance';
    const usd = listeSoldes.filter((b) => !b.units || /usd/i.test(b.units));
    remaining = somme(usd, 'amount');
    if (factures != null) { spent = factures; spentSource = 'billing'; } else { spent = Math.max(0, initial - remaining); spentSource = 'balance'; }
  } else {
    source = 'usage-estimate';
    if (factures != null) { spent = factures; spentSource = 'billing'; } else { spent = (heures || 0) * 60 * TARIF_MIN; spentSource = 'hours'; }
    remaining = initial - spent;
  }
  const rate = heures != null && heures >= 0.5 && spent > 0 ? spent / heures : TARIF_DEFAUT_H;
  return {
    ok: true,
    remainingUsd: arrondi(remaining),
    spentUsd: arrondi(spent, 3),
    hoursUsed: arrondi(heures, 3),
    effectiveRateUsdPerHour: arrondi(rate, 3),
    estimatedHoursLeft: arrondi(Math.max(0, remaining) / rate, 1),
    source, spentSource,
    updatedAt: new Date().toISOString(),
    stale: false,
  };
}

const MESSAGES = {
  invalid_key: 'Clé Deepgram invalide ou révoquée.',
  forbidden: 'La clé Deepgram ne permet pas de lire le projet.',
  no_project: 'Aucun projet Deepgram trouvé pour cette clé.',
  deepgram_error: 'Deepgram ne répond pas correctement.',
};

export default async function handler(req, res) {
  if (refuser(req, res, limite)) return undefined;
  const cle = process.env.DEEPGRAM_API_KEY;
  if (!cle) return res.status(200).json({ ok: false, code: 'missing_key', message: 'Clé Deepgram manquante côté serveur.' });

  if (derniere && Date.now() - derniere.t < CACHE_MS) {
    return res.status(200).json({ ...derniere.valeur, cached: true });
  }
  try {
    const valeur = await calculer(cle);
    derniere = { valeur, t: Date.now() };
    return res.status(200).json({ ...valeur, cached: false });
  } catch (e) {
    const code = (e && e.code) || ((e && (e.name === 'TimeoutError' || e.name === 'AbortError')) ? 'timeout' : 'unreachable');
    if (derniere) return res.status(200).json({ ...derniere.valeur, stale: true, cached: true, code });
    return res.status(200).json({ ok: false, code, message: MESSAGES[code] || 'Crédits Deepgram momentanément indisponibles.' });
  }
}
