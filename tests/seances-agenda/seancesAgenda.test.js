// (26/11) Séances liées à l'agenda — clé stable, créneau proposé, créneau retiré / déplacé, rangement sur l'agenda.
import { describe, it, expect } from 'vitest';
import { analyserIcs } from '../../api/_lib/emploiDuTemps.js';
import { instantaneCreneau, retrouverCreneau, proposerCreneau, seancesLiees, rangerSurAgenda, libellePages, minuitDe, lierSeance, delierSeance } from '../../src/medrevise/lib/seancesAgenda.js';
import { getAll } from '../../src/medrevise/lib/storage.js';
import { ics, UID_HISTO } from './agenda.mjs';

const FEN = { debut: Date.parse('2026-11-02T00:00:00Z'), fin: Date.parse('2026-12-01T00:00:00Z') };
const PERIODE = { from: '2026-11-02T00:00:00.000Z', to: '2026-12-01T00:00:00.000Z' };
const ev = (v = 'v1') => analyserIcs(ics(v), FEN);
const histo = (l, jour) => l.find((e) => e.title === 'Histologie' && e.start.startsWith(jour));
const matiereDe = (e) => (e.title === 'Histologie' ? 'm-histo' : e.title === 'Chimie' ? 'm-chimie' : null);

describe('agenda de test', () => {
  it('Histologie 10 et 17 nov. (même UID iCal, deux occurrences distinctes), Chimie le 17', () => {
    const l = ev();
    expect(l.map((e) => [e.title, e.start])).toEqual([
      ['Histologie', '2026-11-10T09:00:00.000Z'], ['Histologie', '2026-11-17T09:00:00.000Z'], ['Chimie', '2026-11-17T12:00:00.000Z']]);
    expect(histo(l, '2026-11-10').uid).not.toBe(histo(l, '2026-11-17').uid);
  });
});

describe('copie et clé du créneau', () => {
  it('clé = UID iCal + début : les deux semaines restent distinctes ; copie complète', () => {
    const l = ev();
    const a = instantaneCreneau(histo(l, '2026-11-10')); const b = instantaneCreneau(histo(l, '2026-11-17'));
    expect(a.cle).toBe(`${UID_HISTO}|2026-11-10T09:00:00.000Z`);
    expect(b.cle).toBe(`${UID_HISTO}|2026-11-17T09:00:00.000Z`);
    expect(b).toMatchObject({ uidIcal: UID_HISTO, titre: 'Histologie', date: '2026-11-17', debut: '2026-11-17T09:00:00.000Z', fin: '2026-11-17T11:00:00.000Z' });
    expect(b.salle).toContain('B12');
  });
  it('retrouvé tel quel, horaire modifié (RECURRENCE-ID), retiré (EXDATE), hors période', () => {
    const lien = instantaneCreneau(histo(ev(), '2026-11-17'));
    expect(retrouverCreneau(lien, ev(), PERIODE).etat).toBe('ok');
    const d = retrouverCreneau(lien, ev('deplace'), PERIODE);
    expect(d.etat).toBe('modifie'); expect(d.e.start).toBe('2026-11-17T14:00:00.000Z');
    expect(retrouverCreneau(lien, ev('supprime'), PERIODE)).toEqual({ e: null, etat: 'retire' });
    expect(retrouverCreneau(lien, [], { from: '2026-12-01T00:00:00Z', to: '2027-02-01T00:00:00Z' }).etat).toBe('hors_periode');
  });
});

describe('créneau proposé d’office', () => {
  const jour17 = minuitDe('2026-11-17');
  it('1. le créneau en cours de la même matière (le 17 à 10 h 30)', () => {
    const p = proposerCreneau(ev(), { jour: jour17, maintenant: Date.parse('2026-11-17T09:30:00Z'), matiereId: 'm-histo', matiereDe });
    expect(p.title).toBe('Histologie'); expect(p.start).toBe('2026-11-17T09:00:00.000Z');
  });
  it('2. sinon le plus proche du même jour de la même matière', () => {
    const p = proposerCreneau(ev(), { jour: jour17, maintenant: Date.parse('2026-11-17T13:30:00Z'), matiereId: 'm-histo', matiereDe });
    expect(p.title).toBe('Histologie');
    // un autre jour : la même heure ce jour-là, même matière
    const p10 = proposerCreneau(ev(), { jour: minuitDe('2026-11-10'), maintenant: Date.parse('2026-11-17T09:30:00Z'), matiereId: 'm-histo', matiereDe });
    expect(p10.start).toBe('2026-11-10T09:00:00.000Z');
  });
  it('3. sinon le créneau en cours ; rien en cours ni de la matière → aucun', () => {
    const p = proposerCreneau(ev(), { jour: jour17, maintenant: Date.parse('2026-11-17T12:30:00Z'), matiereId: 'm-anat', matiereDe });
    expect(p.title).toBe('Chimie');
    expect(proposerCreneau(ev(), { jour: jour17, maintenant: Date.parse('2026-11-17T16:30:00Z'), matiereId: 'm-anat', matiereDe })).toBe(null);
    expect(proposerCreneau(ev(), { jour: jour17, maintenant: Date.parse('2026-11-17T12:30:00Z'), matiereId: null, matiereDe }).title).toBe('Chimie');
  });
});

describe('séances liées sur l’agenda', () => {
  const l = ev();
  const lien17 = instantaneCreneau(histo(l, '2026-11-17')); const lien10 = instantaneCreneau(histo(l, '2026-11-10'));
  const t = (id, courseId, kind, page, extra = {}) => ({ id, courseId, document: 'original', kind, page, date: '2026-11-17', ...extra });
  const tags = [
    t('d1', 'histo', 'debut', 157, { agenda: lien17 }), t('f1', 'histo', 'fin', 192),
    t('d0', 'histo', 'debut', 120, { agenda: lien10, date: '2026-11-10' }), t('f0', 'histo', 'fin', 156, { date: '2026-11-10' }),
    t('d2', 'atlas', 'debut', 12, { agenda: lien17 }),
    t('d3', 'atlas', 'debut', 40), t('d4', 'atlas', 'debut', 60, { agenda: null }),
  ];
  const fiches = [{ id: 'histo', titre: 'Histologie — tissus' }, { id: 'atlas', titre: 'Atlas histo' }];
  it('une ligne par séance liée ; séance sans fin ; non liée / déliée ignorées', () => {
    const s = seancesLiees(tags, fiches);
    expect(s.map((x) => [x.debut.id, x.de, x.a, x.nom]).sort((a, b) => a[0].localeCompare(b[0]))).toEqual([['d0', 120, 156, 'Histologie — tissus'], ['d1', 157, 192, 'Histologie — tissus'], ['d2', 12, null, 'Atlas histo']]);
    expect(s.map((x) => x.debut.id).sort()).toEqual(['d0', 'd1', 'd2']);
    expect(libellePages(s.find((x) => x.debut.id === 'd1'))).toBe('p. 157–192');
    expect(libellePages(s.find((x) => x.debut.id === 'd2'))).toBe('à partir de p. 12');
  });
  it('rangement : deux séances sur le créneau du 17, une sur celui du 10 ; copie si retiré', () => {
    const r = rangerSurAgenda(seancesLiees(tags, fiches), l, PERIODE);
    expect(r.parUid.get(histo(l, '2026-11-17').uid).map((x) => x.debut.id).sort()).toEqual(['d1', 'd2']);
    expect(r.parUid.get(histo(l, '2026-11-10').uid).map((x) => x.debut.id)).toEqual(['d0']);
    expect(r.fantomes).toEqual([]);
    const s = rangerSurAgenda(seancesLiees(tags, fiches), ev('supprime'), PERIODE);
    expect(s.fantomes).toHaveLength(1);
    expect(s.fantomes[0]).toMatchObject({ start: '2026-11-17T09:00:00.000Z', title: 'Histologie', copie: 'retire' });
    expect(s.parUid.get(s.fantomes[0].uid).map((x) => x.debut.id).sort()).toEqual(['d1', 'd2']);
    const m = rangerSurAgenda(seancesLiees(tags, fiches), ev('deplace'), PERIODE);
    expect(m.fantomes).toEqual([]);
    expect(m.parUid.get(histo(ev('deplace'), '2026-11-17').uid).every((x) => x.etat === 'modifie')).toBe(true);
  });
});

describe('écriture : seul le champ `agenda` change, putBackup avant', () => {
  it('lier puis délier (le tag garde tous ses autres champs)', async () => {
    const tag = { id: 'pt-test-lien', courseId: 'histo', document: 'original', kind: 'debut', page: 157, pageCle: '157', date: '2026-11-17', transcriptSessionId: 'ts1' };
    const e = histo(ev(), '2026-11-17');
    const lie = await lierSeance(tag, e);
    const { updatedAt, agenda, ...reste } = lie;
    expect(reste).toEqual(tag);
    expect(agenda.cle).toBe(`${UID_HISTO}|2026-11-17T09:00:00.000Z`);
    const delie = await delierSeance(lie);
    expect(delie.agenda).toBe(null);
    expect(delie.transcriptSessionId).toBe('ts1');
    const tous = await getAll('page_tag');
    expect(tous.find((x) => x.id === tag.id).agenda).toBe(null);
    expect(await lierSeance({ ...tag, kind: 'fin' }, e)).toBe(null);
  });
});
