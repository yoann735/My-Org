/* ============================================================
   MedRevise — TRANSCRIPTION EN DIRECT : crédits Deepgram (v1.1).

   Source : POST /api/deepgram-credits (cache serveur 10 min). Ici :
   - CACHE LOCAL (localStorage) : la dernière valeur s'affiche instantanément,
     au rechargement comme hors ligne ;
   - RAFRAÎCHISSEMENT seulement à l'ouverture d'un cours, à l'ouverture de la
     feuille de démarrage, à la fin d'une session et au bouton « Actualiser »
     (Réglages) — JAMAIS pendant une session : rien ne doit concurrencer la
     transcription, ni réseau ni fil principal ;
   - un échec n'est jamais bloquant : on garde la valeur connue, marquée « stale ».
   ============================================================ */
import { sessionActive } from './engine.js';

const CLE = 'medrevise.transcription.credits';
export const TARIF_DEFAUT_H = 0.29;
const ANTI_REBOND_MS = 60 * 1000; // un rafraîchissement automatique au plus par minute

function lireCache() {
  try { const v = JSON.parse(localStorage.getItem(CLE) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; }
}
function ecrireCache(v) { try { localStorage.setItem(CLE, JSON.stringify(v)); } catch (e) { /* stockage bloqué */ } }

/* état : { donnees (dernière réponse ok), erreur ({ code, message } | null), chargement, demandeA } */
let etat = { donnees: lireCache(), erreur: null, chargement: false, demandeA: 0 };
const abonnes = new Set();
export const lireCredits = () => etat;
export function abonnerCredits(fn) { abonnes.add(fn); return () => abonnes.delete(fn); }
function publier(p) { etat = { ...etat, ...p }; abonnes.forEach((f) => f()); }

let enVol = null;
/**
 * @param {object} [o]
 * @param {boolean} [o.force] ignore l'anti-rebond local (bouton « Actualiser », fin de session)
 */
export function actualiserCredits({ force = false } = {}) {
  if (sessionActive()) return Promise.resolve(etat); // jamais pendant une session
  if (enVol) return enVol;
  if (!force && Date.now() - etat.demandeA < ANTI_REBOND_MS) return Promise.resolve(etat);
  publier({ chargement: true, demandeA: Date.now() });
  enVol = (async () => {
    try {
      const r = await fetch('/api/deepgram-credits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000) });
      let j = null;
      try { j = await r.json(); } catch (e) { /* réponse non JSON (404 en dev sans fonction…) */ }
      if (j && j.ok) {
        ecrireCache(j);
        publier({ donnees: j, erreur: null });
      } else {
        const erreur = { code: (j && j.code) || 'http_' + r.status, message: (j && j.message) || 'Crédits indisponibles.' };
        publier({ erreur, donnees: etat.donnees ? { ...etat.donnees, stale: true } : null });
      }
    } catch (e) {
      publier({ erreur: { code: 'reseau', message: 'Crédits indisponibles (hors ligne ?).' }, donnees: etat.donnees ? { ...etat.donnees, stale: true } : null });
    } finally {
      publier({ chargement: false });
      enVol = null;
    }
    return etat;
  })();
  return enVol;
}

/** Tarif effectif connu ($/h), pour estimer le coût d'une session localement. */
export function tarifEffectif() {
  const d = etat.donnees;
  return (d && Number(d.effectiveRateUsdPerHour)) || TARIF_DEFAUT_H;
}

/** Niveau d'alerte : 'ok' | 'bas' (< 20 h) | 'critique' (< 5 h). */
export function niveauCredits(heures) {
  if (heures == null) return 'ok';
  if (heures < 5) return 'critique';
  if (heures < 20) return 'bas';
  return 'ok';
}

/* ---- formats ---- */
export const fmtUsd = (x, n = 2) => (x == null ? '—' : x.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n }) + ' $');
export function fmtHeures(h) {
  if (h == null) return '—';
  if (h >= 100) return Math.round(h).toLocaleString('fr-FR') + ' h';
  if (h >= 10) return Math.round(h) + ' h';
  return h.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' h';
}
export function fmtQuand(iso) {
  if (!iso) return '—';
  const d = new Date(iso), maintenant = Date.now();
  const min = Math.round((maintenant - d.getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
