// (28/10) Mode Apprentissage : sélection libre (indépendante des filtres) et compteur de passages.
import { describe, it, expect } from 'vitest';
import {
  FILTRES_VIDES, filtrer, grouper, idsAffiches, idsParGroupe, etatSelection, basculerCarte, basculerGroupe,
  resumeSelection, ordreSelection, passagesDe, trierMoinsPassees,
} from '../../src/medrevise/apprentissageLibre/tableauBord.js';

const db = {
  sources: [{ id: 's1', nom: 'S1' }],
  matieres: [{ id: 'mA', sourceId: 's1', nom: 'A', ordre: 0 }, { id: 'mB', sourceId: 's1', nom: 'B', ordre: 1 }],
  fiches: [{ id: 'f1', matiereId: 'mA', titre: 'C1', ordre: 0 }, { id: 'f2', matiereId: 'mA', titre: 'C2', ordre: 1 }, { id: 'f3', matiereId: 'mB', titre: 'C3', ordre: 0 }],
  questions: [
    ...['a', 'b', 'c'].map((x) => ({ id: 'f1' + x, type: 'flashcard', ficheId: 'f1', recto: 'r' + x })),
    ...['a', 'b'].map((x) => ({ id: 'f2' + x, type: 'flashcard', ficheId: 'f2', recto: 'r' + x })),
    ...['a', 'b', 'c', 'd'].map((x) => ({ id: 'f3' + x, type: 'flashcard', ficheId: 'f3', recto: x === 'a' ? 'cible' : 'r' + x })),
    { id: 'qcm', type: 'qcm', ficheId: 'f1' },
  ],
};

describe('sélection', () => {
  it('groupes : toutes les cartes du cours et de la matière, filtres ignorés', () => {
    const g = idsParGroupe(db);
    expect(g.cours.get('f3')).toEqual(['f3a', 'f3b', 'f3c', 'f3d']);
    expect(g.matieres.get('mA')).toEqual(['f1a', 'f1b', 'f1c', 'f2a', 'f2b']);
  });
  it('état partiel / tout / aucun', () => {
    expect(etatSelection(['x', 'y'], [])).toBe('aucun');
    expect(etatSelection(['x', 'y'], ['y'])).toBe('partiel');
    expect(etatSelection(['x', 'y'], new Set(['x', 'y', 'z']))).toBe('tout');
  });
  it('3 cartes, changement de filtre, 2 de plus → 5 ; « hors filtre »', () => {
    let sel = [];
    for (const id of ['f1a', 'f1b', 'f2a']) sel = basculerCarte(sel, id);
    const visB = filtrer(db, { ...FILTRES_VIDES, matieres: ['mB'] });
    for (const id of ['f3a', 'f3b']) sel = basculerCarte(sel, id);
    expect(resumeSelection(db, sel, visB)).toMatchObject({ n: 5, horsFiltre: 3 });
    expect(basculerCarte(sel, 'f1a')).toHaveLength(4);
  });
  it('case d’un cours filtré : toutes ses cartes, puis re-clic = tout décocher', () => {
    const vis = filtrer(db, { ...FILTRES_VIDES, q: 'cible' });
    expect(vis.map((c) => c.id)).toEqual(['f3a']);
    let sel = basculerGroupe(['f1a'], idsParGroupe(db).cours.get('f3'));
    expect(resumeSelection(db, sel, vis)).toMatchObject({ n: 5, horsFiltre: 4 });
    sel = basculerGroupe(sel, idsParGroupe(db).cours.get('f3'));
    expect(sel).toEqual(['f1a']);
  });
  it('une carte supprimée sort du compte ; l’ordre de session est celui du rangement', () => {
    const sel = ['f3b', 'disparue', 'f1c', 'f2a'];
    expect(resumeSelection(db, sel, []).n).toBe(3);
    expect(ordreSelection(db, sel)).toEqual(['f1c', 'f2a', 'f3b']);
  });
});

describe('compteur de passages', () => {
  const passages = { f1a: 2, f1c: 1, bidon: 0 };
  it('lecture', () => { expect(passagesDe(passages, 'f1a')).toBe(2); expect(passagesDe(passages, 'f1b')).toBe(0); expect(passagesDe(null, 'x')).toBe(0); });
  it('« Moins passées d’abord » : dans chaque cours, tri stable, rangement inchangé', () => {
    const g = trierMoinsPassees(grouper(db, filtrer(db, FILTRES_VIDES)), passages);
    expect(idsAffiches(g)).toEqual(['f1b', 'f1c', 'f1a', 'f2a', 'f2b', 'f3a', 'f3b', 'f3c', 'f3d']);
    expect(ordreSelection(db, ['f1a', 'f1b', 'f1c'], null, passages)).toEqual(['f1b', 'f1c', 'f1a']);
  });
});
