// Boîte → flashcard (25/10, src/medrevise/lib/boiteVersCarte.js) : règle de découpage.
import { describe, it, expect } from 'vitest';
import { decouperBoite, carteDeBoite, tableauDeGrille } from '../../src/medrevise/lib/boiteVersCarte.js';

const T = (t, marks) => ({ type: 'text', text: t, ...(marks ? { marks: marks.map((m) => ({ type: m })) } : {}) });
const P = (...c) => ({ type: 'paragraph', content: c });
const doc = (...c) => ({ type: 'doc', content: c });

describe('boîte → flashcard', () => {
  it('titre + explication + « Ex : » : première ligne = recto, le reste = verso', () => {
    const r = decouperBoite(doc(P(T('Néphron')), P(T('Unité fonctionnelle du rein : '), T('filtration', ['bold']), T(', réabsorption.')), P(T('Ex : '), T('glomérule', ['italic']), T(' puis tubule.'))));
    expect(r.recto).toBe('Néphron');
    expect(r.verso).toBe('Unité fonctionnelle du rein : **filtration**, réabsorption.\nEx : *glomérule* puis tubule.');
  });
  it('premier passage en gras = recto, la fin de ligne passe au verso (sans le « : »)', () => {
    const r = decouperBoite(doc(P(T('Clairance', ['bold']), T(' : volume de plasma épuré par minute.')), P(T('Déf : '), T('C = U × V / P'))));
    expect(r.recto).toBe('Clairance');
    expect(r.verso).toBe('volume de plasma épuré par minute.\nDéf : C = U × V / P');
  });
  it('listes conservées (puces, numéros)', () => {
    const r = decouperBoite(doc(P(T('Fonctions du rein')), { type: 'bulletList', content: [{ type: 'listItem', content: [P(T('Filtrer'))] }, { type: 'listItem', content: [P(T('Réabsorber', ['bold']))] }] },
      { type: 'orderedList', attrs: { start: 1 }, content: [{ type: 'listItem', content: [P(T('Glomérule'))] }] }));
    expect(r.recto).toBe('Fonctions du rein');
    expect(r.verso).toBe('- Filtrer\n- **Réabsorber**\n1. Glomérule');
  });
  it('retour à la ligne dans un paragraphe = nouvelle ligne', () => {
    const r = decouperBoite(doc(P(T('Rein droit'), { type: 'hardBreak' }, T('plus bas que le gauche'))));
    expect(r).toEqual({ recto: 'Rein droit', verso: 'plus bas que le gauche' });
  });
  it('image et boîte-tableau', () => {
    const b = { id: 'b1', page: 3, ficheId: 'f', content: doc(P(T('Schéma'))), image: { blobId: 'bx', position: 'dessus', ratio: 0.5 } };
    const c = carteDeBoite(b, { recto: 'Schéma', verso: '', id: 'x' });
    expect(c).toMatchObject({ imageId: 'bx', imagePlace: 'recto', versoFormat: 'leger', source: { boiteId: 'b1', page: 3, sorte: 'boite' } });
    const g = { v: 1, cols: [0.5, 0.5], entete: true, lignes: [['Muscle', 'Action'], ['Psoas', 'Flexion'], ['', '']], fusions: [], formats: [[{ fond: 'cyan' }, null], [null, null], [null, null]] };
    const t = carteDeBoite({ id: 'b2', page: 1, grille: g }, { recto: 'Muscles', id: 'y' });
    expect(t.tableau).toEqual({ v: 1, colonnes: ['Muscle', 'Action'], lignes: [['Psoas', 'Flexion']] });
    expect(t.grille.formats[0][0].fond).toBe('cyan');
    expect(t.source.sorte).toBe('boite-tableau');
    expect(tableauDeGrille({ cols: [1], entete: false, lignes: [['a']] }).colonnes).toEqual(['Colonne 1', 'Colonne 2']);
  });
});
