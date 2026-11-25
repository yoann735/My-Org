/* (26/11) Agenda de TEST des séances liées (docs/compte-rendu-seances-liees-agenda.md) — format Hyperplanning.
   Histologie les 10 et 17 nov. 10 h–12 h (MÊME UID, cours répété : RRULE hebdomadaire), Chimie le 17 nov. 13 h–15 h.
   Variantes : 'v1' (normal), 'supprime' (l'Histologie du 17 retirée : EXDATE), 'deplace' (l'Histologie du 17 déplacée
   à 15 h–17 h : RECURRENCE-ID). Heures en UTC (novembre = CET, UTC+1). */
export const UID_HISTO = 'Cours-HISTO-17-1BKINE12-Index-Education';
export const UID_CHIMIE = 'Cours-CHIMIE-17-1BKINE12-Index-Education';
export function ics(variante = 'v1') {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Index Education//HYPERPLANNING//FR', 'CALSCALE:GREGORIAN'];
  const ev = ({ uid, debut, fin, matiere, prof, salle, rrule = null, exdate = null, recid = null }) => {
    L.push('BEGIN:VEVENT', 'CATEGORIES:HYPERPLANNING', 'DTSTAMP:20261101T120000Z', `UID:${uid}`);
    if (recid) L.push(`RECURRENCE-ID:${recid}`);
    L.push(`DTSTART:${debut}`, `DTEND:${fin}`);
    if (rrule) L.push(`RRULE:${rrule}`);
    if (exdate) L.push(`EXDATE:${exdate}`);
    L.push(`SUMMARY;LANGUAGE=fr:${[matiere, prof, '1BKINE12', salle, 'Cours'].join(' - ')}`, `LOCATION;LANGUAGE=fr:${salle}`);
    L.push(`DESCRIPTION;LANGUAGE=fr:Matière : ${matiere}\\nEnseignant : ${prof}\\nPromotion : 1BKINE12\\nSalle : ${salle}\\nType : Cours\\n`, 'END:VEVENT');
  };
  ev({ uid: UID_HISTO, debut: '20261110T090000Z', fin: '20261110T110000Z', matiere: 'Histologie', prof: 'MARTIN Mme', salle: 'B12 (Montignies)', rrule: 'FREQ=WEEKLY;COUNT=2',
    exdate: variante === 'supprime' ? '20261117T090000Z' : null });
  if (variante === 'deplace') ev({ uid: UID_HISTO, recid: '20261117T090000Z', debut: '20261117T140000Z', fin: '20261117T160000Z', matiere: 'Histologie', prof: 'MARTIN Mme', salle: 'B12 (Montignies)' });
  ev({ uid: UID_CHIMIE, debut: '20261117T120000Z', fin: '20261117T140000Z', matiere: 'Chimie', prof: 'LEROY M.', salle: 'C02 (Montignies)' });
  L.push('END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}
