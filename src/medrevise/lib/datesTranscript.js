/* ============================================================
   MedRevise — DATES DE TRANSCRIPT d'un cours, pour la Bibliothèque (25/11/2026,
   docs/compte-rendu-filtre-dates-transcript.md). LECTURE SEULE : rien n'est écrit.

   RÈGLE : une date de transcript d'un cours = un jour (Europe/Brussels) où du texte
   transcrit a été enregistré sur ce cours (n'importe quelle diapo), toutes sessions
   confondues, dédoublonné, de la plus récente à la plus ancienne.
   - Source : store `transcript_session`, enregistrements `kind: 'session'` (courseId = id
     de la fiche). Les mots-clés (`kind: 'keyterms'`) ne comptent pas.
   - Seuls les segments qui portent du texte comptent (status ≠ 'gap', texte non vide) :
     une session ouverte sans un mot prononcé ne donne aucune date.
   - Instant réel d'un segment : début de session (`startedAt`) + t0 secondes ; après une
     marque de reprise (segment `reprise` avec `repriseLe`), l'horloge repart de l'heure
     réelle de la reprise (t0 de la marque = cet instant). Une session reprise le
     lendemain donne donc bien deux jours.
   - Repli : segment sans t0 lisible → jour du début de la session.
   - HEURE et DURÉE d'un jour (ajout du 25/11) : heure = premier mot transcrit ce jour-là (Bruxelles),
     toutes sessions ; durée = somme, session par session, du premier au dernier mot de ce jour-là
     (début du 1er segment → fin du dernier ; les pauses à l'intérieur d'une session comptent, pas
     l'écart entre deux sessions).

   UN SEUL CALCUL, MÉMORISÉ : le résultat par session est gardé (clé id + updatedAt) au
   niveau du module — une session déjà vue n'est jamais recalculée ; une nouvelle session
   ou un nouveau segment (écriture locale, ou session reçue du cloud) ne recalcule QUE
   cette session. La table cours → jours est reconstruite à partir de ces résultats.
   ============================================================ */
import { useEffect, useState } from 'react';
import { getAll, getOne } from './storage.js';

const STORE = 'transcript_session';
const FUSEAU = 'Europe/Brussels';

/* jour Europe/Brussels (« AAAA-MM-JJ ») d'un instant — par heure UTC (les décalages de
   Bruxelles sont des heures entières) : un formatage Intl par heure distincte, pas par segment */
const fmtJour = new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' });
const parHeure = new Map();
export function jourBruxelles(ms) {
  const h = Math.floor(ms / 3600e3);
  let j = parHeure.get(h);
  if (!j) { j = fmtJour.format(new Date(h * 3600e3)); parHeure.set(h, j); }
  return j;
}

/** plages par jour de cette session : Map(« AAAA-MM-JJ » → { debut, fin } en ms) — du premier mot au dernier
    mot enregistrés ce jour-là (début d'un segment → fin d'un segment) */
export function plagesSession(rec) {
  const m = new Map();
  if (!rec || rec.kind !== 'session') return m;
  const debut = Date.parse(rec.startedAt || rec.createdAt || '');
  if (!Number.isFinite(debut)) return m;
  let ancre = debut, base = 0;
  for (const s of rec.segments || []) {
    if (!s) continue;
    const t0 = Number(s.t0), t1 = Number(s.t1);
    if (s.reprise && s.repriseLe) {
      const r = Date.parse(s.repriseLe);
      if (Number.isFinite(r)) { ancre = r; base = Number.isFinite(t0) ? t0 : 0; }
      continue;
    }
    if (s.status === 'gap' || !String(s.text || '').trim()) continue;
    const a = Number.isFinite(t0) ? ancre + (t0 - base) * 1000 : debut;
    const b = Number.isFinite(t1) && t1 >= (Number.isFinite(t0) ? t0 : -Infinity) ? ancre + (t1 - base) * 1000 : a;
    const j = jourBruxelles(a);
    const p = m.get(j);
    if (!p) m.set(j, { debut: a, fin: b });
    else { if (a < p.debut) p.debut = a; if (b > p.fin) p.fin = b; }
  }
  return m;
}
/** jours (Set « AAAA-MM-JJ ») où cette session a enregistré du texte */
export const joursSession = (rec) => new Set(plagesSession(rec).keys());

/* ---- mémoire du module : sessionId → { cle, courseId, plages: [[jour, debut, fin]], sig } ---- */
const parSession = new Map();
let table = new Map(); // courseId → jours[] (décroissants)
let details = new Map(); // courseId → Map(jour → { debut (ms), duree (s), sessions })
let versionTable = 0;
const abonnes = new Set();

function calculer(r) {
  const plages = [...plagesSession(r)].map(([j, p]) => [j, p.debut, p.fin]);
  return { cle: (r.updatedAt || '') + '|' + ((r.segments && r.segments.length) || 0), courseId: r.courseId, plages, sig: r.courseId + JSON.stringify(plages) };
}
/** (re)calcule une session si elle a changé → true si ses dates / heures / durées ont changé */
function majSession(r) {
  const prec = parSession.get(r.id);
  const cle = (r.updatedAt || '') + '|' + ((r.segments && r.segments.length) || 0);
  if (prec && prec.cle === cle && prec.courseId === r.courseId) return false;
  const v = calculer(r);
  parSession.set(r.id, v);
  return !prec || prec.sig !== v.sig;
}

function reconstruire() {
  const m = new Map();
  for (const v of parSession.values()) {
    if (!v.plages.length) continue;
    let d = m.get(v.courseId);
    if (!d) { d = new Map(); m.set(v.courseId, d); }
    for (const [j, a, b] of v.plages) {
      const x = d.get(j);
      if (!x) d.set(j, { debut: a, duree: Math.max(0, (b - a) / 1000), sessions: 1 });
      else { x.debut = Math.min(x.debut, a); x.duree += Math.max(0, (b - a) / 1000); x.sessions++; }
    }
  }
  const t = new Map();
  for (const [c, d] of m) t.set(c, [...d.keys()].sort().reverse());
  table = t; details = m; versionTable++;
  abonnes.forEach((f) => f(versionTable));
}

/** intègre la liste complète du store : ne recalcule que les sessions nouvelles ou modifiées */
export function integrer(recs) {
  const vus = new Set();
  let change = false;
  for (const r of recs || []) {
    if (!r || r.kind !== 'session' || !r.id || !r.courseId) continue;
    vus.add(r.id);
    if (majSession(r)) change = true;
  }
  for (const id of [...parSession.keys()]) if (!vus.has(id)) { parSession.delete(id); change = true; }
  if (change || !versionTable) reconstruire();
  return table;
}
/** { debut, duree, sessions } d'un cours pour un jour, ou null */
export const detailJour = (courseId, jour) => ((details.get(courseId) || new Map()).get(jour) || null);
export const tableDates = () => table;
/** (tests) remise à zéro de la mémoire */
export function oublier() { parSession.clear(); table = new Map(); details = new Map(); versionTable = 0; charge = false; }

/* ---- lecture du store : UNE fois, puis seulement ce qui change ----
   À la 1re activation, le store est lu en entier ; ensuite l'écoute reste en place (un simple
   écouteur d'événement) et chaque écriture locale ne relit QUE les sessions écrites (`detail.ids`,
   lib/storage.js#signalerEcriture). Une session reçue du cloud (lib/synchroIsolee.js, sans ids)
   ou un rechargement complet des données relit le store. Rouvrir la Bibliothèque ne relit rien. */
let charge = false, lecture = null, relireEncore = false, minuteur = null, ecoute = false;
const idsEnAttente = new Set();
let toutEnAttente = false;
function relire() {
  if (lecture) { relireEncore = true; return lecture; }
  lecture = getAll(STORE).then((l) => { integrer(l || []); charge = true; }).catch(() => {}).finally(() => {
    lecture = null;
    if (relireEncore) { relireEncore = false; relire(); }
  });
  return lecture;
}
async function relireIds(ids) {
  let change = false;
  for (const id of ids) {
    const r = await getOne(STORE, id).catch(() => undefined);
    if (r && r.kind === 'session' && r.courseId) { if (majSession(r)) change = true; }
    else if (!r && parSession.has(id)) { parSession.delete(id); change = true; }
  }
  if (change) reconstruire();
}
function vider() {
  minuteur = null;
  if (!charge || toutEnAttente) { toutEnAttente = false; idsEnAttente.clear(); relire(); return; }
  const ids = [...idsEnAttente]; idsEnAttente.clear();
  if (ids.length) relireIds(ids);
}
function surEcriture(e) {
  if (!e || !e.detail || e.detail.store !== STORE) return;
  if (Array.isArray(e.detail.ids)) e.detail.ids.forEach((id) => idsEnAttente.add(id)); else toutEnAttente = true;
  clearTimeout(minuteur); minuteur = setTimeout(vider, 300); // une passe par rafale d'écritures
}
function surRecharge() { toutEnAttente = true; clearTimeout(minuteur); minuteur = setTimeout(vider, 300); }
function ecouter() {
  if (typeof window === 'undefined' || ecoute) return;
  ecoute = true;
  window.addEventListener('medrevise:ecriture', surEcriture);
  window.addEventListener('medrevise:recharge', surRecharge);
}

/** Map(courseId → jours décroissants), tenue à jour. `actif` = false (bouton éteint partout) et jamais
    activé : rien n'est lu ni écouté. */
export function useDatesTranscript(actif) {
  const [, setV] = useState(versionTable);
  useEffect(() => {
    if (!actif) return undefined;
    const f = (v) => setV(v);
    abonnes.add(f); ecouter();
    if (!charge) relire(); else setV(versionTable);
    return () => { abonnes.delete(f); };
  }, [actif]);
  return actif ? table : null;
}

/* ---- libellés ---- */
const fmtCourt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtLong = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtEntier = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const enDate = (jour) => { const [a, m, j] = jour.split('-').map(Number); return new Date(Date.UTC(a, m - 1, j, 12)); };
/** « 17 nov. » — année ajoutée si ce n'est pas l'année en cours (Bruxelles) */
export function libelleJour(jour, maintenant = Date.now()) {
  const annee = jourBruxelles(maintenant).slice(0, 4);
  return (jour.slice(0, 4) === annee ? fmtCourt : fmtLong).format(enDate(jour));
}
const fmtHeure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: FUSEAU });
/** « 9h05 » (heure de Bruxelles) */
export const libelleHeure = (ms) => fmtHeure.format(new Date(ms)).replace(':', 'h').replace(/^0(\d)/, '$1');
/** « 52 min », « 1 h 05 », « < 1 min » */
export function libelleDuree(s) {
  const m = Math.round(s / 60);
  if (m < 1) return '< 1 min';
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0');
}
/** « lundi 17 novembre 2026 » (infobulles) */
export const libelleJourEntier = (jour) => fmtEntier.format(enDate(jour));
