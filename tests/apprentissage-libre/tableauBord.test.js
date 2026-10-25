// Mode Apprentissage v2 (25/10) — tableau de bord : toutes les cartes, filtres, rangement.
import { describe, it, expect } from 'vitest';
import { filtrer, grouper, idsAffiches, FILTRES_VIDES, typeCarte, toutesLesCartes, basculerCours, filtresValides } from '../../src/medrevise/apprentissageLibre/tableauBord.js';

const db = {
  sources: [{ id: 's1', nom: 'Bloc 1' }, { id: 's2', nom: 'Bloc 2' }],
  matieres: [{ id: 'm1', nom: 'Physiologie', sourceId: 's1' }, { id: 'm2', nom: 'Chimie', sourceId: 's2' }],
  fiches: [{ id: 'f1', titre: 'Rein', matiereId: 'm1', ordre: 2 }, { id: 'f0', titre: 'Cœur', matiereId: 'm1', ordre: 1 }, { id: 'f2', titre: 'Acides', matiereId: 'm2' }],
  questions: [
    { id: 'a', type: 'flashcard', ficheId: 'f1', recto: 'Néphron', verso: 'Unité fonctionnelle du rein', theme: 'Anatomie', historique: [{ qualite: 4 }], nouvelle: false },
    { id: 'b', type: 'flashcard', ficheId: 'f1', recto: 'DFG', verso: '120 mL/min', historique: [] },
    { id: 'c', type: 'flashcard', ficheId: 'f0', recto: 'Débit cardiaque', verso: 'VES × FC', imageId: 'img1', historique: [] },
    { id: 'd', type: 'flashcard', ficheId: 'f2', recto: 'pKa', verso: '', tableau: { v: 1, colonnes: ['A', 'B'], lignes: [['1', '2']] }, historique: [{ qualite: 3 }], nouvelle: false },
    { id: 'e', type: 'qcm', ficheId: 'f1', enonce: 'x' },
    { id: 'f', type: 'flashcard', ficheId: 'f1', recto: 'éphémère', ephemeral: true },
  ],
};

describe('toutes les flashcards', () => {
  it('sans liste : toutes les flashcards enregistrées, ni QCM ni cartes éphémères', () => {
    expect(toutesLesCartes(db).map((q) => q.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(filtrer(db, FILTRES_VIDES)).toHaveLength(4);
  });
});

describe('filtres', () => {
  const ids = (f) => filtrer(db, { ...FILTRES_VIDES, ...f }).map((q) => q.id).sort();
  it('recherche recto / verso / thème, sans accents', () => expect(ids({ q: 'unite fonctionnelle' })).toEqual(['a']) || expect(ids({ q: 'anatomie' })).toEqual(['a']));
  it('matières, cours inclus et exclus, Nouvelles, type', () => {
    expect(ids({ matieres: ['m2'] })).toEqual(['d']);
    expect(ids({ coursInclus: ['f1'] })).toEqual(['a', 'b']);
    expect(ids({ coursExclus: ['f1'] })).toEqual(['c', 'd']);
    expect(ids({ nouvelles: true })).toEqual(['b', 'c']);
    expect(ids({ types: ['image'] })).toEqual(['c']);
    expect(ids({ types: ['tableau', 'texte'] })).toEqual(['a', 'b', 'd']);
    expect(ids({ matieres: ['m1'], nouvelles: true, coursExclus: ['f0'] })).toEqual(['b']);
  });
  it('types et filtres mémorisés remis d’aplomb', () => {
    expect(typeCarte(db.questions[2])).toBe('image');
    expect(filtresValides({ types: ['zzz', 'muscle'], nouvelles: 'oui' })).toEqual({ ...FILTRES_VIDES, types: ['muscle'] });
    let f = basculerCours(FILTRES_VIDES, 'f1');
    expect(f.coursInclus).toEqual(['f1']);
    f = basculerCours(f, 'f1'); expect(f.coursExclus).toEqual(['f1']);
    f = basculerCours(f, 'f1'); expect(f).toEqual(FILTRES_VIDES);
  });
});

describe('rangement Section → Matière → Cours', () => {
  it('ordre de la Bibliothèque, compteurs, ordre de session', () => {
    const g = grouper(db, filtrer(db, FILTRES_VIDES));
    expect(g.map((s) => [s.section.nom, s.n])).toEqual([['Bloc 1', 3], ['Bloc 2', 1]]);
    expect(g[0].matieres[0].cours.map((c) => c.fiche.titre)).toEqual(['Cœur', 'Rein']);
    expect(idsAffiches(g)).toEqual(['c', 'a', 'b', 'd']);
  });
});
