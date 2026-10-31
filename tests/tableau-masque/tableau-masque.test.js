// (31/10) Carte Tableau : choisir ce qui est masqué — `tableau.masque = { cellules, noms }` (champ additif).
import { describe, it, expect } from 'vitest';
import { normaliserTableau, carteTableau, masqueDe, masqueParDefaut, estMasqueParDefaut, texteTableau } from '../../src/medrevise/lib/carteTableau.js';
import { toInternalItem } from '../../src/medrevise/lib/adapter.js';
import { analyserImport, exempleJSON } from '../../src/medrevise/lib/importFlashcards.js';
import { carteVersItem } from '../../src/medrevise/lib/exportFlashcards.js';

const COLS = ['Muscle', 'Origine', 'Insertion', 'Action', 'Innervation'];
const LIGNES = [['Grand glutéal', 'Ilium', 'Tubérosité glutéale', 'Extension', 'Glutéal inf.'], ['Moyen glutéal', 'Ilium', 'Grand trochanter', 'Abduction', 'Glutéal sup.'],
  ['Petit glutéal', 'Ilium', 'Grand trochanter', 'Abduction', 'Glutéal sup.'], ['Piriforme', 'Sacrum', 'Grand trochanter', 'Rotation lat.', 'Nerf du piriforme']];

describe('modèle', () => {
  it('ancienne carte Tableau : aucun masque écrit, défaut = toutes les cases masquées, noms visibles', () => {
    const r = normaliserTableau({ colonnes: ['A', 'B'], lignes: [['1', '2']] });
    expect(r.tableau).toEqual({ v: 1, colonnes: ['A', 'B'], lignes: [['1', '2']] });
    expect(masqueDe(r.tableau)).toEqual({ cellules: [[true, true]], noms: [false, false] });
    const ancienne = { id: 'x', type: 'flashcard', recto: 'T', verso: 'A : 1 · B : 2', tableau: { v: 1, colonnes: ['A', 'B'], lignes: [['1', '2']] }, dueDate: '2026-11-02' };
    expect(toInternalItem(ancienne).tableau).toEqual(ancienne.tableau);
  });
  it('masque par défaut explicite : non écrit (la carte ne change pas)', () => {
    const r = normaliserTableau({ colonnes: ['A', 'B'], lignes: [['1', '2']], masque: masqueParDefaut(1, 2) });
    expect('masque' in r.tableau).toBe(false);
  });
  it('tableau 4 × 5 : colonne, ligne, 3 cases, case visible dans une colonne masquée, nom masqué', () => {
    const m = masqueParDefaut(4, 5);
    m.cellules = m.cellules.map((l) => l.map(() => false));
    for (let r = 0; r < 4; r++) m.cellules[r][2] = true; // colonne « Insertion »
    m.cellules[1] = [true, true, true, true, true]; // ligne 2
    m.cellules[0][4] = true; m.cellules[2][0] = true; m.cellules[3][3] = true; // 3 cases isolées
    m.cellules[3][2] = false; // une case de la colonne masquée rendue visible
    m.noms[1] = true; // nom « Origine » masqué
    const carte = carteTableau({ titre: 'Fesse', colonnes: COLS, lignes: LIGNES, masque: m });
    expect(carte.tableau.masque).toEqual(m);
    expect(carte.verso).toBe(texteTableau({ colonnes: COLS, lignes: LIGNES })); // verso texte inchangé
    // aller-retour export → import
    const it = carteVersItem({ ...carte, id: 'c1' });
    expect(it.tableau.masque).toEqual(m);
    expect(estMasqueParDefaut(masqueDe(carte.tableau))).toBe(false);
  });
  it('ligne vide retirée : le masque suit les lignes gardées', () => {
    const r = normaliserTableau({ colonnes: ['A', 'B'], lignes: [['1', '2'], ['', ''], ['3', '4']], masque: { cellules: [[false, true], [false, false], [true, false]] } });
    expect(r.tableau.lignes).toEqual([['1', '2'], ['3', '4']]);
    expect(r.tableau.masque.cellules).toEqual([[false, true], [true, false]]);
  });
  it('masque partiel ou 1 / 0 : complété au défaut', () => {
    const r = normaliserTableau({ colonnes: ['A', 'B'], lignes: [['1', '2'], ['3', '4']], masque: { cellules: [[0]], noms: [1] } });
    expect(r.tableau.masque).toEqual({ cellules: [[false, true], [true, true]], noms: [true, false] });
  });
  it('erreurs claires', () => {
    const e = (masque) => normaliserTableau({ colonnes: ['A', 'B'], lignes: [['1', '2']], masque }).raison;
    expect(e([])).toMatch(/objet/);
    expect(e({ cases: [] })).toMatch(/champ inconnu/);
    expect(e({ cellules: [['oui', true]] })).toMatch(/booléens/);
    expect(e({ cellules: [[true, true, true]] })).toMatch(/2 booléens au plus/);
    expect(e({ cellules: [[true], [true]] })).toMatch(/2 lignes pour 1/);
    expect(e({ noms: [true, false, true] })).toMatch(/noms/);
  });
});

describe('import', () => {
  it('format attendu : réimportable, le tableau à masque choisi garde son masque', async () => {
    const a = await analyserImport({ texte: exempleJSON().replace(/"molecule": \{[^}]*\}/, '"recto": "x", "verso": "y"') });
    expect(a.ok).toBe(true);
    const tabs = a.cartes.filter((c) => c.sorte === 'tableau');
    expect(tabs).toHaveLength(2);
    expect('masque' in tabs[0].carte.tableau).toBe(false);
    expect(tabs[1].carte.tableau.masque).toEqual({ cellules: [[false, true], [false, true]], noms: [false, false] });
  });
  it('erreur de masque signalée par carte', async () => {
    const a = await analyserImport({ texte: JSON.stringify({ items: [{ type: 'flashcard', recto: 'T', tableau: { colonnes: ['A', 'B'], lignes: [['1', '2']], masque: { cellules: 'non' } } }] }) });
    expect(a.erreurs[0].message).toMatch(/tableau\.masque\.cellules/);
  });
});
