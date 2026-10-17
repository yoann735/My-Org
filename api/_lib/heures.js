/* ============================================================
   My Org — heures « murales » de Europe/Brussels, sans dépendance (Intl seul).
   Partagé par /api/timetable (api/_lib/emploiDuTemps.js) ET le client MedRevise
   (src/medrevise/lib/emploiDuTemps.js) : le serveur range les cours dans les mêmes
   jours et semaines que ceux que l'app affiche, quel que soit le fuseau de l'appareil.
   ============================================================ */
export const FUSEAU = 'Europe/Brussels';

/* ---------- heures ---------- */
const formateurs = new Map();
function formateur(tz) {
  if (!formateurs.has(tz)) {
    formateurs.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return formateurs.get(tz);
}
export function fuseauValide(tz) {
  if (!tz) return false;
  try { formateur(tz); return true; } catch { formateurs.delete(tz); return false; }
}
/** composantes murales d'un instant dans un fuseau */
export function mural(ms, tz = FUSEAU) {
  const p = Object.fromEntries(formateur(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}
function decalage(ms, tz) {
  const m = mural(ms, tz);
  return Date.UTC(m.y, m.mo - 1, m.d, m.h, m.mi, m.s) - Math.floor(ms / 1000) * 1000;
}
/** heure murale (dans `tz`) → instant UTC en ms. Deux passes : exact hors de l'heure qui
    n'existe pas au passage à l'heure d'été (rendue une heure plus tard, comme partout). */
export function muralEnUtc(y, mo, d, h = 0, mi = 0, s = 0, tz = FUSEAU) {
  const brut = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = brut - decalage(brut, tz);
  t = brut - decalage(t, tz);
  return t;
}
/** lundi 00:00 (Bruxelles) de la semaine qui contient `ms` */
export function lundiDe(ms) {
  const m = mural(ms);
  const jour = new Date(Date.UTC(m.y, m.mo - 1, m.d)).getUTCDay(); // 0 = dimanche
  const recul = (jour + 6) % 7;
  const l = new Date(Date.UTC(m.y, m.mo - 1, m.d - recul));
  return muralEnUtc(l.getUTCFullYear(), l.getUTCMonth() + 1, l.getUTCDate());
}
/** + n jours civils (Bruxelles) à un instant minuit */
export function plusJours(ms, n) {
  const m = mural(ms);
  const d = new Date(Date.UTC(m.y, m.mo - 1, m.d + n));
  return muralEnUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), m.h, m.mi, m.s);
}
