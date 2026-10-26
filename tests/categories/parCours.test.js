// (26/10) « Regrouper par cours » : même sélection (maximums sur l'ensemble de la séance), ordre Bibliothèque →
// catégories (Retard → Révisions → Nouvelles) dans chaque cours ; OFF inchangé ; rang des cours de la Bibliothèque.
import { describe, it, expect } from 'vitest';
import { categoriser, composerSeance, choixValide, raccourci, regrouperParCours } from '../../src/medrevise/lib/categoriesFC.js';
import { rangDesCours } from '../../src/medrevise/apprentissageLibre/tableauBord.js';

const T = '2026-10-26';
const vue = [{ date: '2026-10-10', qualite: 4 }];
const fc = (id, ficheId, o) => ({ id, type: 'flashcard', ficheId, recto: id, verso: 'v', intervalDays: 1, ...o });
const nouv = (id, f, j0) => fc(id, f, { historique: [], dueDate: j0, j0Date: j0 });
const rev = (id, f) => fc(id, f, { historique: vue, dueDate: T, nouvelle: false });
const ret = (id, f, d) => fc(id, f, { historique: vue, dueDate: d, nouvelle: false });
const cartes = [
  nouv('nA1', 'A', '2026-10-01'), rev('rA1', 'A'), ret('lA1', 'A', '2026-10-20'), ret('lA2', 'A', '2026-10-02'),
  nouv('nB1', 'B', '2026-10-03'), rev('rB1', 'B'), rev('rB2', 'B'), ret('lB1', 'B', '2026-10-15'),
  nouv('nC1', 'C', '2026-10-02'), ret('lC1', 'C', '2026-09-01'), rev('rC1', 'C'),
];
const parId = Object.fromEntries(cartes.map((q) => [q.id, q]));
const coursDe = (id) => parId[id].ficheId;
const RANG = new Map([['C', 0], ['A', 1], ['B', 2]]); // ordre de la Bibliothèque : C, A, B
const cats = categoriser(cartes, T);
let graine = 1; const rand = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };

describe('regrouper par cours', () => {
  it('OFF : exactement l’ordre d’aujourd’hui (Retard → Révisions → Nouvelles, cours mélangés)', () => {
    const c = choixValide({});
    expect(c.parCours).toBe(false);
    graine = 1; const a = composerSeance(cats, c, coursDe, rand);
    graine = 1; const b = composerSeance(cats, c, coursDe, rand, (f) => RANG.get(f));
    expect(b).toEqual(a);
    expect(a.ids.slice(0, 4)).toEqual(['lC1', 'lA2', 'lB1', 'lA1']);
  });
  it('ON : cours dans l’ordre de la Bibliothèque, catégories dans chaque cours, même sélection', () => {
    const c = choixValide({ parCours: true });
    graine = 1; const off = composerSeance(cats, { ...c, parCours: false }, coursDe, rand);
    graine = 1; const on = composerSeance(cats, c, coursDe, rand, (f) => RANG.get(f));
    expect([...on.ids].sort()).toEqual([...off.ids].sort());
    expect(on.categorie).toEqual(off.categorie);
    const revB = off.ids.filter((id) => id.startsWith('rB')); // ordre des révisions de B : celui de la composition
    expect(on.ids).toEqual(['lC1', 'rC1', 'nC1', 'lA2', 'lA1', 'rA1', 'nA1', 'lB1', ...revB, 'nB1']);
  });
  it('ON : les maximums portent sur toute la séance, comme aujourd’hui', () => {
    const c = choixValide({ parCours: true, nouvelles: { coche: true, max: 5 }, retard: { coche: true, max: 5 }, revisions: { coche: true, max: 5 } });
    const max = { ...c, nouvelles: { coche: true, max: 5 } };
    graine = 1; const off = composerSeance(cats, { ...max, parCours: false }, coursDe, rand);
    graine = 1; const on = composerSeance(cats, max, coursDe, rand, (f) => RANG.get(f));
    expect([...on.ids].sort()).toEqual([...off.ids].sort());
    const n = (cat) => on.ids.filter((id) => on.categorie[id] === cat).length;
    expect([n('retard'), n('revisions'), n('nouvelles')]).toEqual([4, 4, 3]); // ≤ 5 chacun (tout ce qu'il y a)
    const c2 = choixValide({ parCours: true, retard: { coche: true, max: 5 }, revisions: { coche: false, max: 'tout' }, nouvelles: { coche: false, max: 10 } });
    const on2 = composerSeance(cats, { ...c2, retard: { coche: true, max: 5 } }, coursDe, rand, (f) => RANG.get(f));
    expect(on2.ids).toEqual(['lC1', 'lA2', 'lA1', 'lB1']);
  });
  it('choix mémorisé et raccourcis gardent l’interrupteur', () => {
    expect(choixValide({ parCours: true }).parCours).toBe(true);
    expect(choixValide({ parCours: 'oui' }).parCours).toBe(false);
    expect(raccourci('blocNouvelles', { parCours: true }).parCours).toBe(true);
  });
  it('cours inconnu de la Bibliothèque : à la fin, groupé', () => {
    expect(regrouperParCours(['x1', 'a1', 'x2'], { x1: 'revisions', a1: 'revisions', x2: 'retard' }, (id) => (id[0] === 'x' ? 'X' : 'A'), (f) => (f === 'A' ? 0 : undefined)))
      .toEqual(['a1', 'x2', 'x1']);
  });
});

describe('rang des cours (ordre de la Bibliothèque)', () => {
  it('section (ordre manuel), puis matière, puis cours (ordre)', () => {
    const db = {
      sources: [{ id: 's1' }, { id: 's2' }],
      matieres: [{ id: 'm1', sourceId: 's1', nom: 'Physio', ordre: 1 }, { id: 'm2', sourceId: 's1', nom: 'Anat', ordre: 0 }, { id: 'm3', sourceId: 's2', nom: 'Chimie' }],
      fiches: [{ id: 'f1', matiereId: 'm1', ordre: 2 }, { id: 'f2', matiereId: 'm1', ordre: 1 }, { id: 'f3', matiereId: 'm2' }, { id: 'f4', matiereId: 'm3' }],
    };
    const r = rangDesCours(db, { ordreSections: ['s2', 's1'] });
    const ordre = [...r.entries()].sort((a, b) => a[1] - b[1]).map((x) => x[0]);
    expect(ordre[0]).toBe('f4'); // section s2 d'abord si l'ordre manuel la place en tête
    expect(ordre.slice(1)).toEqual(['f3', 'f2', 'f1']);
  });
});
