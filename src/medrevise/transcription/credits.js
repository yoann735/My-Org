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
export const LIMITE_MANUELLE_MS = 30 * 1000; // bouton « Actualiser » : un appel / 30 s (v1.2)

function lireCache() {
  try { const v = JSON.parse(localStorage.getItem(CLE) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; }
}
function ecrireCache(v) { try { localStorage.setItem(CLE, JSON.stringify(v)); } catch (e) { /* stockage bloqué */ } }

/* état : { donnees (dernière réponse ok), erreur ({ code, message } | null), chargement,
   demandeA (dernier appel), forceA (dernier « Actualiser ») } */
let etat = { donnees: lireCache(), erreur: null, chargement: false, demandeA: 0, forceA: 0 };
const abonnes = new Set();
export const lireCredits = () => etat;
export function abonnerCredits(fn) { abonnes.add(fn); return () => abonnes.delete(fn); }
function publier(p) { etat = { ...etat, ...p }; abonnes.forEach((f) => f()); }

let enVol = null;
/**
 * @param {object} [o]
 * @param {boolean} [o.force] relecture immédiate : ignore l'anti-rebond local ET le cache
 *   serveur de 10 min (?force=1). Bouton « Actualiser » (limité à un appel / 30 s) et fin
 *   de session.
 */
export function actualiserCredits({ force = false } = {}) {
  if (sessionActive()) return Promise.resolve(etat); // jamais pendant une session
  if (enVol) return enVol;
  if (!force && Date.now() - etat.demandeA < ANTI_REBOND_MS) return Promise.resolve(etat);
  if (force && Date.now() - etat.forceA < LIMITE_MANUELLE_MS) return Promise.resolve(etat);
  publier({ chargement: true, demandeA: Date.now(), ...(force ? { forceA: Date.now() } : {}) });
  enVol = (async () => {
    try {
      const r = await fetch('/api/deepgram-credits' + (force ? '?force=1' : ''), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000) });
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

/** Délai avant que « Actualiser » soit de nouveau permis (ms, 0 = permis). */
export const attenteActualiser = () => Math.max(0, LIMITE_MANUELLE_MS - (Date.now() - etat.forceA));

/** Niveau d'alerte (v1.2) : 'ok' | 'bas' (< 5 h, ambre) | 'critique' (< 1 h, rouge). */
export function niveauCredits(heures) {
  if (heures == null) return 'ok';
  if (heures < 1) return 'critique';
  if (heures < 5) return 'bas';
  return 'ok';
}

/** Temps restant en heures ET minutes, arrondi à la minute : « 132 h 27 min », « 45 min ». */
export function fmtDuree(h) {
  if (h == null || !Number.isFinite(h)) return '—';
  const min = Math.max(0, Math.round(h * 60));
  const hh = Math.floor(min / 60), mm = min % 60;
  if (!hh) return `${mm} min`;
  return `${hh.toLocaleString('fr-FR')} h ${String(mm).padStart(2, '0')} min`;
}

/** Heures restantes = solde ÷ tarif effectif (valeurs de /api/deepgram-credits). */
export function heuresRestantes(d) {
  if (!d) return null;
  const tarif = Number(d.effectiveRateUsdPerHour) || TARIF_DEFAUT_H;
  return d.remainingUsd == null ? d.estimatedHoursLeft : Math.max(0, d.remainingUsd) / tarif;
}

/* ---- formats ---- */
export const fmtUsd = (x, n = 2) => (x == null ? '—' : x.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n }) + ' $');
export function fmtQuand(iso) {
  if (!iso) return '—';
  const d = new Date(iso), maintenant = Date.now();
  const min = Math.floor((maintenant - d.getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return 'le ' + d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
