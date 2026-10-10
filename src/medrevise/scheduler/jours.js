/* ============================================================
   MedRevise — PLANIFICATEUR : jours civils (étape 2 FSRS, docs/fsrs-etape2-compte-rendu.md).
   Règles :
   - une date de planification est un JOUR CIVIL 'YYYY-MM-DD' (jamais des millisecondes) ;
   - le fuseau de référence est Europe/Brussels, quel que soit le fuseau de l'appareil ;
   - le « jour de révision » bascule à 4 h : une réponse donnée à 01:30 compte pour la veille ;
   - ts-fsrs ne reçoit que des instants calés à MIDI heure de Bruxelles : il compte en jours UTC
     et en pas de 24 h, et midi local reste le même jour UTC toute l'année (UTC+1/+2), y compris
     les jours de changement d'heure (25/10/2026, 28/03/2027).
   ============================================================ */
export const FUSEAU = 'Europe/Brussels';
export const HEURE_BASCULE = 4;

const formats = new Map();
function formatPour(fuseau) {
  if (!formats.has(fuseau)) {
    formats.set(fuseau, new Intl.DateTimeFormat('en-CA', {
      timeZone: fuseau, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }));
  }
  return formats.get(fuseau);
}

/** heure murale d'un instant dans le fuseau : { y, m, d, h, mi, s } */
export function heureMurale(instant, fuseau = FUSEAU) {
  const p = {};
  for (const x of formatPour(fuseau).formatToParts(new Date(instant))) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

const deux = (n) => String(n).padStart(2, '0');
const versIso = (y, m, d) => `${y}-${deux(m)}-${deux(d)}`;
export const estJour = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** jour civil d'un instant dans le fuseau (sans bascule) */
export function jourCivil(instant, fuseau = FUSEAU) {
  const w = heureMurale(instant, fuseau);
  return versIso(w.y, w.m, w.d);
}

/** jour civil + n jours (calendrier pur, aucune heure en jeu) */
export function ajouterJours(jour, n) {
  const [y, m, d] = jour.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return versIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** nombre de jours civils de `a` à `b` (b − a) */
export function ecartJours(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** JOUR DE RÉVISION : jour civil à Bruxelles, la veille avant `bascule` heures du matin */
export function jourDeRevision(instant = new Date(), bascule = HEURE_BASCULE, fuseau = FUSEAU) {
  const w = heureMurale(instant, fuseau);
  const jour = versIso(w.y, w.m, w.d);
  return w.h < bascule ? ajouterJours(jour, -1) : jour;
}

/** instant de MIDI (heure murale du fuseau) d'un jour civil — seule forme de date passée à ts-fsrs */
export function midi(jour, fuseau = FUSEAU) {
  const [y, m, d] = jour.split('-').map(Number);
  const supposition = Date.UTC(y, m - 1, d, 12, 0, 0);
  const w = heureMurale(supposition, fuseau);
  const decalage = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - supposition; // +1 h ou +2 h à Bruxelles
  return new Date(supposition - decalage);
}
