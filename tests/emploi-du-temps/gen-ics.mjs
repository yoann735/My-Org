/* Génère les .ics de test (une vraie semaine 1BKINE12, format Hyperplanning) :
   semaine-1bkine12.ics (v1), semaine-1bkine12-v2.ics (v2 = horaire, salle et annulation
   changés) et (17/10, calendrier horaire) semaine-1bkine12-v3.ics (v3 = v1 + un cours qui
   CHEVAUCHE les TP du mardi, un cours du SAMEDI et un cours du soir jusqu'à 20:30).
   Lancer : node tests/emploi-du-temps/gen-ics.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ici = path.dirname(fileURLToPath(import.meta.url));

// heures en UTC (comme Hyperplanning) : 19-23/10 = CEST (UTC+2), dès le 26/10 = CET (UTC+1)
const cours = (o) => o;
function base(v2, v3 = false) {
  const L = [];
  const ev = ({ uid, debut, fin, matiere, prof, salle, type = 'Cours', memo = '', statut = '', tz = null, rrule = null, exdate = null, recid = null, summary = null }) => {
    L.push('BEGIN:VEVENT', 'CATEGORIES:HYPERPLANNING', 'DTSTAMP:20261016T120000Z', `UID:${uid}`);
    if (recid) L.push(tz ? `RECURRENCE-ID;TZID=${tz}:${recid}` : `RECURRENCE-ID:${recid}`);
    L.push(tz ? `DTSTART;TZID=${tz}:${debut}` : `DTSTART:${debut}`, tz ? `DTEND;TZID=${tz}:${fin}` : `DTEND:${fin}`);
    if (rrule) L.push(`RRULE:${rrule}`);
    if (exdate) L.push(`EXDATE;TZID=${tz}:${exdate}`);
    if (statut) L.push(`STATUS:${statut}`);
    L.push(`SUMMARY;LANGUAGE=fr:${summary || [matiere, prof, '1BKINE12', salle, type].filter(Boolean).join(' - ')}`);
    L.push(`LOCATION;LANGUAGE=fr:${salle}`);
    L.push(`DESCRIPTION;LANGUAGE=fr:Matière : ${matiere}\\nEnseignant : ${prof}\\nPromotion : 1BKINE12\\nSalle : ${salle}\\nType : ${type}${memo ? `\\nMémo : ${memo}` : ''}\\n`);
    L.push('END:VEVENT');
  };
  // ---- semaine passée (12-16/10)
  ev({ uid: 'Cours-900101-1-1BKINE12-Index-Education', debut: '20261012T063000Z', fin: '20261012T083000Z', matiere: 'Anatomie descriptive et palpatoire', prof: 'LEYH Mme', salle: 'C02 (Montignies)' });
  ev({ uid: 'Cours-900102-1-1BKINE12-Index-Education', debut: '20261013T114500Z', fin: '20261013T134500Z', matiere: 'Physiologie humaine', prof: 'DUPONT M.', salle: 'Teams' });
  // ---- semaine type (19-23/10)
  // cours sur deux créneaux (même matière, même salle, pause de 15 min)
  ev({ uid: 'Cours-900201-1-1BKINE12-Index-Education', debut: '20261019T063000Z', fin: '20261019T083000Z', matiere: 'Anatomie descriptive et palpatoire', prof: 'LEYH Mme', salle: 'C02 (Montignies)' });
  ev({ uid: 'Cours-900201-2-1BKINE12-Index-Education', debut: '20261019T084500Z', fin: '20261019T104500Z', matiere: 'Anatomie descriptive et palpatoire', prof: 'LEYH Mme', salle: 'C02 (Montignies)' });
  // cours Teams (v2 : horaire changé 13:45 → 14:30)
  ev({ uid: 'Cours-900202-1-1BKINE12-Index-Education', debut: v2 ? '20261019T123000Z' : '20261019T114500Z', fin: v2 ? '20261019T143000Z' : '20261019T134500Z', matiere: 'Physiologie humaine', prof: 'DUPONT M.', salle: 'Teams', memo: 'Lien Teams sur Moodle' });
  // pratique
  ev({ uid: 'Cours-900203-1-1BKINE12-Index-Education', debut: '20261020T063000Z', fin: '20261020T103000Z', matiere: 'Kinésithérapie générale', prof: 'MARTIN Mme', salle: 'P1 (Montignies)', type: 'Travaux pratiques' });
  // cours annulé
  ev({ uid: 'Cours-900204-1-1BKINE12-Index-Education', debut: '20261020T114500Z', fin: '20261020T134500Z', matiere: 'Biochimie', prof: 'LEROY M.', salle: 'A12 (Montignies)', statut: 'CANCELLED', summary: 'Cours annulé : Biochimie - LEROY M. - 1BKINE12 - A12' });
  // v2 : annulé à son tour
  ev({ uid: 'Cours-900205-1-1BKINE12-Index-Education', debut: '20261021T063000Z', fin: '20261021T083000Z', matiere: 'Psychologie de la santé', prof: 'BERNARD Mme', salle: 'Teams', statut: v2 ? 'CANCELLED' : '' });
  // série hebdomadaire du jeudi 10:45 (heure de Bruxelles) — traverse le changement d'heure du 25/10
  ev({ uid: 'Serie-Histologie-1BKINE12', tz: 'Europe/Brussels', debut: '20261015T104500', fin: '20261015T124500', matiere: 'Histologie', prof: 'PETIT M.', salle: 'B04 (Montignies)', rrule: 'FREQ=WEEKLY;BYDAY=TH;COUNT=6', exdate: '20261112T104500' });
  // cours modifié (exception de la série : déplacé à 13:45, autre salle)
  ev({ uid: 'Serie-Histologie-1BKINE12', tz: 'Europe/Brussels', recid: '20261022T104500', debut: '20261022T134500', fin: '20261022T154500', matiere: 'Histologie', prof: 'PETIT M.', salle: 'B07 (Montignies)', memo: 'Cours déplacé' });
  // v2 : salle changée
  ev({ uid: 'Cours-900206-1-1BKINE12-Index-Education', debut: '20261023T063000Z', fin: '20261023T083000Z', matiere: 'Anglais médical', prof: 'SMITH Mme', salle: v2 ? 'A03 (Montignies)' : 'A01 (Montignies)' });
  if (v3) {
    // chevauchement : remédiation 10:00–11:00 pendant les TP de kiné 08:30–12:30 (mardi)
    ev({ uid: 'Cours-900207-1-1BKINE12-Index-Education', debut: '20261020T080000Z', fin: '20261020T090000Z', matiere: 'Remédiation anatomie', prof: 'LEYH Mme', salle: 'C03 (Montignies)' });
    // cours du soir (jeudi 19:00–20:30) : la grille s'étend jusqu'à 21 h
    ev({ uid: 'Cours-900208-1-1BKINE12-Index-Education', debut: '20261022T170000Z', fin: '20261022T183000Z', matiere: 'Séminaire d’éthique', prof: 'MOREAU M.', salle: 'Teams' });
    // samedi 24/10 09:00–11:00 : la colonne du samedi apparaît
    ev({ uid: 'Cours-900209-1-1BKINE12-Index-Education', debut: '20261024T070000Z', fin: '20261024T090000Z', matiere: 'Journée portes ouvertes', prof: 'DIRECTION', salle: 'Hall (Montignies)', type: 'Activité' });
  }
  // ---- après le changement d'heure (26/10, CET)
  ev({ uid: 'Cours-900301-1-1BKINE12-Index-Education', debut: '20261026T073000Z', fin: '20261026T093000Z', matiere: 'Anatomie descriptive et palpatoire', prof: 'LEYH Mme', salle: 'C02 (Montignies)' });
  ev({ uid: 'Cours-900302-1-1BKINE12-Index-Education', debut: '20261027T124500Z', fin: '20261027T144500Z', matiere: 'Physiologie humaine', prof: 'DUPONT M.', salle: 'Teams' });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Index Education//HYPERPLANNING//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:1BKINE12', ...L, 'END:VCALENDAR', ''].join('\r\n');
}
fs.writeFileSync(path.join(ici, 'semaine-1bkine12.ics'), base(false));
fs.writeFileSync(path.join(ici, 'semaine-1bkine12-v2.ics'), base(true));
fs.writeFileSync(path.join(ici, 'semaine-1bkine12-v3.ics'), base(false, true));
console.log('ok');
