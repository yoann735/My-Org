// Lecture de l'emploi du temps HELHa (api/_lib/emploiDuTemps.js) sur une vraie semaine
// 1BKINE12 au format Hyperplanning. Lancer : npm test
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { analyserIcs, fenetre, formaterProf, muralEnUtc, mural } from '../../api/_lib/emploiDuTemps.js';

const lire = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const F = { debut: Date.UTC(2026, 9, 5), fin: Date.UTC(2026, 11, 14) };
const v1 = analyserIcs(lire('./semaine-1bkine12.ics'), F);
const heure = (iso) => { const m = mural(Date.parse(iso)); return `${String(m.d).padStart(2, '0')}/${m.mo} ${String(m.h).padStart(2, '0')}:${String(m.mi).padStart(2, '0')}`; };

describe('emploi du temps HELHa', () => {
  it('champs Hyperplanning normalisés', () => {
    const a = v1.find((e) => e.uid.startsWith('Cours-900201-1'));
    expect(a).toMatchObject({ title: 'Anatomie descriptive et palpatoire', teacher: 'Mme Leyh', room: 'C02', campus: 'Montignies', modality: 'presentiel', cancelled: false });
    expect(heure(a.start)).toBe('19/10 08:30');
  });
  it('Teams, pratique, annulé', () => {
    expect(v1.find((e) => e.uid.startsWith('Cours-900202')).modality).toBe('teams');
    expect(v1.find((e) => e.uid.startsWith('Cours-900202')).room).toBe('');
    expect(v1.find((e) => e.uid.startsWith('Cours-900203')).modality).toBe('pratique');
    const b = v1.find((e) => e.uid.startsWith('Cours-900204'));
    expect(b.cancelled).toBe(true);
    expect(b.title).toBe('Biochimie');
  });
  it('cours sur deux créneaux = deux cours', () => {
    expect(v1.filter((e) => e.uid.startsWith('Cours-900201')).map((e) => heure(e.start))).toEqual(['19/10 08:30', '19/10 10:45']);
  });
  it('série hebdo : modification, EXDATE et changement d\'heure du 25/10', () => {
    const h = v1.filter((e) => e.title === 'Histologie').map((e) => `${heure(e.start)} ${e.room}`);
    expect(h).toEqual(['15/10 10:45 B04', '22/10 13:45 B07', '29/10 10:45 B04', '05/11 10:45 B04', '19/11 10:45 B04']);
    const avant = v1.find((e) => e.title === 'Histologie' && e.start.startsWith('2026-10-15'));
    const apres = v1.find((e) => e.title === 'Histologie' && e.start.startsWith('2026-10-29'));
    expect(avant.start).toBe('2026-10-15T08:45:00.000Z'); // CEST
    expect(apres.start).toBe('2026-10-29T09:45:00.000Z'); // CET
  });
  it('heures UTC lues à l\'heure de Bruxelles des deux côtés du 25/10', () => {
    expect(heure(v1.find((e) => e.uid.startsWith('Cours-900301')).start)).toBe('26/10 08:30');
    expect(muralEnUtc(2026, 10, 25, 1, 30)).toBe(Date.UTC(2026, 9, 24, 23, 30)); // CEST
    expect(muralEnUtc(2026, 10, 25, 4, 0)).toBe(Date.UTC(2026, 9, 25, 3, 0));
  });
  it('fenêtre : semaine passée + 9 semaines', () => {
    const f = fenetre(Date.UTC(2026, 9, 17, 10));
    expect(new Date(f.debut).toISOString()).toBe('2026-10-04T22:00:00.000Z');
    expect(new Date(f.fin).toISOString()).toBe('2026-12-13T23:00:00.000Z');
    const dans = analyserIcs(lire('./semaine-1bkine12.ics'), { debut: Date.UTC(2026, 9, 19), fin: Date.UTC(2026, 9, 20) });
    expect(dans.every((e) => e.start.startsWith('2026-10-19'))).toBe(true);
  });
  it('v2 : horaire, salle, annulation', () => {
    const v2 = analyserIcs(lire('./semaine-1bkine12-v2.ics'), F);
    expect(heure(v2.find((e) => e.uid.startsWith('Cours-900202')).start)).toBe('19/10 14:30');
    expect(v2.find((e) => e.uid.startsWith('Cours-900206')).room).toBe('A03');
    expect(v2.find((e) => e.uid.startsWith('Cours-900205')).cancelled).toBe(true);
  });
  it('profs', () => {
    expect(formaterProf('LEYH Mme')).toBe('Mme Leyh');
    expect(formaterProf('DUPONT Anne, MARTIN M.')).toBe('Anne Dupont, M. Martin');
    expect(formaterProf('Mme Van DEN BERG')).toBe('Mme Van Den Berg');
  });
  it('heure flottante et TZID inconnu = Bruxelles', () => {
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0',
      'BEGIN:VEVENT', 'UID:x', 'DTSTART:20261028T083000', 'DTEND:20261028T103000', 'SUMMARY:Flottant', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:y', 'DTSTART;TZID=Romance Standard Time:20261021T083000', 'DTEND;TZID=Romance Standard Time:20261021T103000', 'SUMMARY:Windows', 'END:VEVENT',
      'END:VCALENDAR'].join('\r\n');
    const r = analyserIcs(ics, F);
    expect(r.map((e) => heure(e.start))).toEqual(['21/10 08:30', '28/10 08:30']);
  });
});
