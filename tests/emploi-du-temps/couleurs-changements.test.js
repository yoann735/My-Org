// Couleurs fixes / correspondance des matières (lib/edtCouleurs.js) et détection des
// changements (lib/emploiDuTemps.js) sur la semaine 1BKINE12 de test.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { analyserIcs } from '../../api/_lib/emploiDuTemps.js';
import { correspondanceAuto, completer, resoudreCours, titresDansLOrdre, cleCours } from '../../src/medrevise/lib/edtCouleurs.js';
import { detecterChangements, fusionnerChangements, coursEnAvant, quandLibelle, rappelJeudiVisible, semaineEcole } from '../../src/medrevise/lib/emploiDuTemps.js';

const lire = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const F = { debut: Date.UTC(2026, 9, 5), fin: Date.UTC(2026, 11, 14) };
const v = (f) => ({ events: analyserIcs(lire(f), F), from: new Date(F.debut).toISOString(), to: new Date(F.fin).toISOString() });
const v1 = v('./semaine-1bkine12.ics'); const v2 = v('./semaine-1bkine12-v2.ics');
const PAL = ['#a', '#b', '#c', '#d', '#e', '#f', '#g', '#h'];
const MAT = [{ id: 'm1', nom: 'Anatomie' }, { id: 'm2', nom: 'Physiologie' }, { id: 'm3', nom: 'Bioch.' }, { id: 'm4', nom: 'Kiné générale' }, { id: 'm5', nom: 'Psychologie', archive: true }];

describe('couleurs et correspondances', () => {
  it('correspondance automatique (accents, casse, abréviations)', () => {
    expect(correspondanceAuto('Anatomie descriptive et palpatoire', MAT).id).toBe('m1');
    expect(correspondanceAuto('PHYSIOLOGIE humaine', MAT).id).toBe('m2');
    expect(correspondanceAuto('Biochimie', MAT).id).toBe('m3');
    expect(correspondanceAuto('Kinésithérapie générale', MAT).id).toBe('m4');
    expect(correspondanceAuto('Psychologie de la santé', MAT)).toBe(null); // matière archivée
    expect(correspondanceAuto('Anglais médical', MAT)).toBe(null);
  });
  it('teinte fixe à la première apparition, stable après ajout de cours', () => {
    const titres = titresDansLOrdre(v1.events);
    const a = completer(null, titres, 8, 't0').reglages;
    expect(titres[0]).toBe('Anatomie descriptive et palpatoire');
    expect(a.cours[cleCours(titres[0])].teinte).toBe(0);
    const b = completer(a, ['Nouveau cours', ...titres], 8, 't1');
    expect(b.nouveaux).toEqual(['nouveau cours']);
    for (const t of titres) expect(b.reglages.cours[cleCours(t)].teinte).toBe(a.cours[cleCours(t)].teinte);
    expect(completer(b.reglages, titres, 8).nouveaux).toEqual([]);
  });
  it('priorité : choix Réglages > matière reliée > teinte', () => {
    const reg = completer(null, ['Anglais médical', 'Anatomie descriptive'], 8).reglages;
    const opts = { palette: PAL, teinteMatiere: (m) => 'mat:' + m.id };
    expect(resoudreCours('Anatomie descriptive', reg, MAT, opts)).toMatchObject({ couleur: 'mat:m1', source: 'matiere', lienAuto: true });
    expect(resoudreCours('Anglais médical', reg, MAT, opts)).toMatchObject({ couleur: '#a', source: 'auto', matiere: null });
    reg.cours['anatomie descriptive'].couleur = 5;
    expect(resoudreCours('Anatomie descriptive', reg, MAT, opts).couleur).toBe('#f');
    reg.cours['anglais medical'].matiereId = 'm2';
    expect(resoudreCours('Anglais médical', reg, MAT, opts)).toMatchObject({ couleur: 'mat:m2', lienAuto: false });
    reg.cours['anatomie descriptive'].matiereId = null;
    expect(resoudreCours('Anatomie descriptive', reg, MAT, opts).matiere).toBe(null);
  });
});

describe('changements sur 7 jours', () => {
  const maintenant = Date.UTC(2026, 9, 18, 18); // dimanche 18/10 20:00
  it('horaire, salle, annulation détectés avant → après', () => {
    const c = detecterChangements(v1, v2, maintenant);
    const parUid = Object.fromEntries(c.map((x) => [x.uid.split('-').slice(0, 2).join('-'), x]));
    expect(c).toHaveLength(3);
    expect(parUid['Cours-900202'].avant.start).toBe('2026-10-19T11:45:00.000Z');
    expect(parUid['Cours-900202'].apres.start).toBe('2026-10-19T12:30:00.000Z');
    expect(parUid['Cours-900206'].apres.room).toBe('A03');
    expect(parUid['Cours-900205'].apres.cancelled).toBe(true);
  });
  it('hors des 7 jours : ignoré ; retour à l\'identique : retiré', () => {
    expect(detecterChangements(v1, v2, Date.UTC(2026, 9, 24))).toHaveLength(0);
    const l = fusionnerChangements([], detecterChangements(v1, v2, maintenant), maintenant);
    expect(l).toHaveLength(3);
    const retour = fusionnerChangements(l, detecterChangements(v2, v1, maintenant), maintenant);
    expect(retour).toHaveLength(0);
  });
  it('cours retiré puis remis sous un autre identifiant = déplacé', () => {
    const v3 = { ...v1, events: v1.events.map((e) => (e.uid.startsWith('Cours-900206') ? { ...e, uid: 'autre', start: '2026-10-23T09:00:00.000Z', end: '2026-10-23T11:00:00.000Z' } : e)) };
    const c = detecterChangements(v1, v3, maintenant);
    expect(c).toHaveLength(1);
    expect(c[0].apres.start).toBe('2026-10-23T09:00:00.000Z');
  });
});

describe('prochain cours, rappel du jeudi', () => {
  it('en cours / dans 25 min / cours annulé sauté', () => {
    const lundi0805 = Date.UTC(2026, 9, 19, 6, 5);
    expect(quandLibelle(coursEnAvant(v1.events, lundi0805), lundi0805)).toBe('Dans 25 min');
    const lundi0900 = Date.UTC(2026, 9, 19, 7);
    expect(quandLibelle(coursEnAvant(v1.events, lundi0900), lundi0900)).toBe('En cours · jusqu’à 10:30');
    const mardi1300 = Date.UTC(2026, 9, 20, 11);
    expect(coursEnAvant(v1.events, mardi1300).cours.title).toBe('Psychologie de la santé'); // biochimie annulée
  });
  it('rappel affiché du lundi au jeudi 16 h (Bruxelles)', () => {
    expect(rappelJeudiVisible(Date.UTC(2026, 9, 19, 6))).toBe(true);
    expect(rappelJeudiVisible(Date.UTC(2026, 9, 22, 13, 59))).toBe(true); // jeudi 15:59
    expect(rappelJeudiVisible(Date.UTC(2026, 9, 22, 14, 0))).toBe(false); // jeudi 16:00
    expect(rappelJeudiVisible(Date.UTC(2026, 9, 24, 10))).toBe(false);
  });
  it('semaine du 26/10 (après le changement d\'heure) : jours justes', () => {
    const s = semaineEcole(v1.events, 1, Date.UTC(2026, 9, 21, 10));
    expect(s.jours.map((j) => j.num)).toEqual([26, 27, 28, 29, 30, 31, 1]);
    expect(s.jours[0].cours.map((e) => e.title)).toEqual(['Anatomie descriptive et palpatoire']);
    expect(s.jours[3].cours.map((e) => e.title)).toEqual(['Histologie']);
  });
});
