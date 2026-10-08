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

   v1.3 (07/10) — CRÉDITS EN DIRECT, sans réseau pendant la session :
   - la carte décompte LOCALEMENT, à partir de la dernière valeur serveur connue :
     coût = secondes envoyées × tarif effectif / 3600 (`consoNonFactureeS`, lissée par
     paliers de 10 s ; figée en pause, le moteur n'avance plus son horloge) ;
   - à l'arrêt, l'estimation reste affichée (`attente`) jusqu'à la vraie valeur serveur,
     qui la remplace ; si l'écart dépasse 5 %, le tarif effectif est recalé et stocké
     (`medrevise.transcription.tarif`) pour les sessions suivantes.
   ============================================================ */
import { sessionActive, lireEtat as lireMoteur } from './engine.js';

const CLE = 'medrevise.transcription.credits';
const CLE_TARIF = 'medrevise.transcription.tarif'; // tarif recalé après une session (v1.3)
export const TARIF_DEFAUT_H = 0.29;
const ANTI_REBOND_MS = 60 * 1000; // un rafraîchissement automatique au plus par minute
export const LIMITE_MANUELLE_MS = 30 * 1000; // bouton « Actualiser » : un appel / 30 s (v1.2)

function lireCache() {
  try { const v = JSON.parse(localStorage.getItem(CLE) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; }
}
function ecrireCache(v) { try { localStorage.setItem(CLE, JSON.stringify(v)); } catch (e) { /* stockage bloqué */ } }

function lireTarifRecale() {
  try { const v = JSON.parse(localStorage.getItem(CLE_TARIF) || 'null'); return v && Number(v.tarif) > 0 ? v : null; } catch (e) { return null; }
}

/* état : { donnees (dernière réponse ok), erreur ({ code, message } | null), chargement,
   demandeA (dernier appel), forceA (dernier « Actualiser »),
   attente (v1.3 : { secondes, soldeAvant, majAvant } — consommation des sessions finies
   pas encore lue sur le serveur ; null sinon) } */
let etat = { donnees: lireCache(), erreur: null, chargement: false, demandeA: 0, forceA: 0, attente: null };
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
export function actualiserCredits({ force = false, fin = false } = {}) {
  if (sessionActive()) return Promise.resolve(etat); // jamais pendant une session
  if (enVol) return fin ? enVol.then(() => actualiserCredits({ force, fin })) : enVol;
  if (!force && Date.now() - etat.demandeA < ANTI_REBOND_MS) return Promise.resolve(etat);
  // fin de session : toujours relu (la limite de 30 s ne vaut que pour le bouton)
  if (force && !fin && Date.now() - etat.forceA < LIMITE_MANUELLE_MS) return Promise.resolve(etat);
  publier({ chargement: true, demandeA: Date.now(), ...(force ? { forceA: Date.now() } : {}) });
  enVol = (async () => {
    try {
      const r = await fetch('/api/deepgram-credits' + (force ? '?force=1' : ''), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000) });
      let j = null;
      try { j = await r.json(); } catch (e) { /* réponse non JSON (404 en dev sans fonction…) */ }
      if (j && j.ok) {
        ecrireCache(j);
        const attente = etat.attente;
        // la vraie valeur remplace l'estimation (et recale le tarif si besoin)
        publier({ donnees: j, erreur: null, attente: null });
        if (attente) recalerTarif(attente, j);
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

/** Tarif effectif connu ($/h), pour estimer le coût d'une session localement :
 *  le tarif recalé sur la dernière session (v1.3) s'il existe, sinon celui du serveur. */
export function tarifEffectif(d = etat.donnees) {
  const r = lireTarifRecale();
  return (r && Number(r.tarif)) || (d && Number(d.effectiveRateUsdPerHour)) || TARIF_DEFAUT_H;
}

/* DIARISATION (08/10) : « Distinguer les intervenants » (diarize=true) est une option payante
   de Deepgram — 0,0020 $/min en paiement à l'usage (deepgram.com/pricing, relevé le 08/10/2026),
   soit +0,12 $/h en plus du modèle (Nova-3 en direct : 0,0048 $/min = 0,29 $/h) : ≈ +42 %.
   Une seconde diarisée compte donc pour `facteurDiarisation()` seconde ordinaire. */
export const SURCOUT_DIARISATION_H = 0.12;
export const facteurDiarisation = (d = etat.donnees) => 1 + SURCOUT_DIARISATION_H / tarifEffectif(d);

/* ---- v1.3 : décompte local pendant la session ---- */

/** Début d'une session (moteur) : mémorise le solde de départ pour le recalage. */
export function noterDebutSession() {
  const d = etat.donnees;
  if (etat.attente || !d) return; // une estimation antérieure attend déjà sa valeur serveur
  publier({ attente: null, depart: { soldeAvant: d.remainingUsd, majAvant: d.updatedAt, stale: !!d.stale } });
}

/** Fin d'une session (arrêt ou erreur) : `secondes` envoyées à Deepgram pendant cette
 *  session. L'estimation reste affichée jusqu'à la relecture serveur, lancée aussitôt. */
export function finSessionCredits(secondes) {
  const s = Math.max(0, Number(secondes) || 0);
  const prec = etat.attente;
  const dep = etat.depart || {};
  const attente = prec
    ? { ...prec, secondes: prec.secondes + s }
    : { secondes: s, soldeAvant: dep.soldeAvant, majAvant: dep.majAvant, stale: dep.stale, tarif: tarifEffectif() };
  publier({ attente, depart: null });
  return actualiserCredits({ force: true, fin: true });
}

/** Secondes consommées mais pas encore reflétées par la dernière valeur serveur.
 *  `lisse` : la part en direct avance par paliers de 10 s (pas de clignotement). */
export function consoNonFactureeS(lisse = true) {
  let s = etat.attente ? etat.attente.secondes : 0;
  const e = lireMoteur();
  if (sessionActive() && e.phase !== 'starting') {
    const direct = Math.max(0, (e.secondes || 0) - (e.secondesDepart || 0)) * (e.session && e.session.diarize ? facteurDiarisation() : 1);
    s += lisse ? Math.floor(direct / 10) * 10 : direct;
  }
  return s;
}

/** Valeurs affichées : dernière valeur serveur − consommation locale estimée. */
export function creditsEstimes(d, secondes) {
  if (!d) return { remainingUsd: null, heures: null, estime: false };
  const tarif = tarifEffectif(d);
  const cout = (secondes / 3600) * tarif;
  if (d.remainingUsd == null) {
    const h = d.estimatedHoursLeft == null ? null : Math.max(0, d.estimatedHoursLeft - secondes / 3600);
    return { remainingUsd: null, heures: h, estime: secondes > 0 };
  }
  const reste = Math.max(0, d.remainingUsd - cout);
  return { remainingUsd: reste, heures: reste / tarif, estime: secondes > 0 };
}

/* Recalage du tarif : écart > 5 % entre le coût estimé et le coût réel (solde avant −
   solde après) → tarif réel stocké. Garde-fous : session ≥ 60 s, solde de départ lu
   moins de 30 min avant, valeurs non périmées, et coût réel entre 0,5× et 2× l'estimation
   (au-delà : solde Deepgram pas encore à jour, ou consommation d'un autre appareil).
   Et un coût estimé d'au moins 0,20 $ (~40 min) : le solde est arrondi au centime, une
   session de 3 min (~1,5 centime) ne permet pas de mesurer un écart de 5 %. */
const ECART_MAX = 0.05;
const COUT_MIN_RECALAGE = 0.2;
function recalerTarif(a, j) {
  try {
    if (!a || a.secondes < 60 || a.soldeAvant == null || j.remainingUsd == null || a.stale || j.stale) return;
    if (!a.majAvant || Date.now() - new Date(a.majAvant).getTime() > 30 * 60 * 1000 + a.secondes * 1000) return;
    const estime = (a.secondes / 3600) * a.tarif;
    const reel = a.soldeAvant - j.remainingUsd;
    if (!(estime >= COUT_MIN_RECALAGE) || !(reel > 0)) return;
    const rapport = reel / estime;
    if (rapport < 0.5 || rapport > 2 || Math.abs(rapport - 1) <= ECART_MAX) return;
    const tarif = Math.round((reel * 3600 / a.secondes) * 10000) / 10000;
    localStorage.setItem(CLE_TARIF, JSON.stringify({ tarif, avant: a.tarif, ecart: Math.round((rapport - 1) * 1000) / 10, a: new Date().toISOString() }));
    publier({});
  } catch (e) { /* stockage bloqué : on garde l'ancien tarif */ }
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

/** Heures restantes = solde ÷ tarif effectif (recalé s'il existe — v1.3). */
export function heuresRestantes(d) {
  if (!d) return null;
  return d.remainingUsd == null ? d.estimatedHoursLeft : Math.max(0, d.remainingUsd) / tarifEffectif(d);
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
