// (28/10) Carte Muscle : 6ᵉ ligne « Topographie » (après Innervation), aucune ligne obligatoire.
import { describe, it, expect } from 'vitest';
import { LIGNES_MUSCLE, lignesDe, carteMuscle, versoMuscle, texteMuscle, lignesDepuisMots } from '../../src/medrevise/lib/muscle.js';
import { analyserImport, EXEMPLE_IMPORT } from '../../src/medrevise/lib/importFlashcards.js';
import { carteVersItem } from '../../src/medrevise/lib/exportFlashcards.js';

const ANCIENNE = { id: 'old', type: 'flashcard', recto: 'Biceps brachial', verso: 'Origine : X',
  muscle: { v: 1, lignes: { origine: 'X', trajet: '', insertion: 'Y', action: 'Z', innervation: 'N' } } };

describe('modèle', () => {
  it('6 lignes, Topographie en dernier', () => {
    expect(LIGNES_MUSCLE.map((l) => l.id)).toEqual(['origine', 'trajet', 'insertion', 'action', 'innervation', 'topographie']);
    expect(LIGNES_MUSCLE[5].label).toBe('Topographie');
  });
  it('ancienne carte : Topographie lue vide, la carte n’est pas modifiée', () => {
    const avant = JSON.stringify(ANCIENNE);
    expect(lignesDe(ANCIENNE)).toEqual({ origine: 'X', trajet: '', insertion: 'Y', action: 'Z', innervation: 'N', topographie: '' });
    expect(JSON.stringify(ANCIENNE)).toBe(avant);
    expect(texteMuscle(ANCIENNE).split('\n').pop()).toBe('Topographie : —');
  });
  it('Topographie seule remplie', () => {
    const c = carteMuscle({ nom: 'Brachial', lignes: { topographie: 'Loge antérieure, sous le biceps' } });
    expect(c.muscle.lignes.topographie).toBe('Loge antérieure, sous le biceps');
    expect(c.verso.split('\n')).toEqual(['Origine : —', 'Direction des fibres / Trajet : —', 'Insertion : —', 'Action : —', 'Innervation : —', 'Topographie : Loge antérieure, sous le biceps']);
  });
  it('toutes les lignes vides : la carte se crée (nom seul)', () => {
    const c = carteMuscle({ nom: 'Coraco-brachial', lignes: {} });
    expect(c.recto).toBe('Coraco-brachial');
    expect(Object.values(c.muscle.lignes).every((v) => v === '')).toBe(true);
    expect(c.verso.trim()).not.toBe('');
  });
  it('image sur la ligne Topographie', () => {
    const c = carteMuscle({ nom: 'M', lignes: {}, images: { topographie: { imageId: 'b1' } } });
    expect(c.muscle.images).toEqual({ topographie: { imageId: 'b1' } });
    expect(versoMuscle(c.muscle.lignes, { images: c.muscle.images })).toContain('Topographie : —\n  [image : image-b1.png]');
  });
  it('OCR : l’étiquette Topographie ne déborde plus dans Innervation', () => {
    const mot = (t, x, y, line) => ({ t, x, y, w: 0.1, h: 0.03, line });
    const r = lignesDepuisMots([
      mot('Origine', 0.05, 0.1, 1), mot('Ilium', 0.4, 0.1, 1),
      mot('Innervation', 0.05, 0.3, 2), mot('Nerf', 0.4, 0.3, 2), mot('glutéal', 0.52, 0.3, 2),
      mot('Topographie', 0.05, 0.5, 3), mot('Fesse', 0.4, 0.5, 3),
    ]);
    expect(r.lignes.innervation).toBe('Nerf glutéal');
    expect(r.lignes.topographie).toBe('Fesse');
  });
});

describe('import / export', () => {
  it('import : topographie acceptée, aucune ligne obligatoire', async () => {
    const a = await analyserImport({ texte: JSON.stringify({ items: [
      { type: 'flashcard', recto: 'Brachial', muscle: { topographie: 'Loge antérieure' } },
      { type: 'flashcard', recto: 'Coraco-brachial', muscle: {} },
    ] }) });
    expect(a.erreurs || []).toEqual([]);
    expect(a.cartes.map((c) => c.carte.muscle.lignes.topographie)).toEqual(['Loge antérieure', '']);
  });
  it('format attendu : l’exemple Muscle porte topographie et se ré-importe', async () => {
    const m = EXEMPLE_IMPORT.items.find((i) => i._sorte === 'muscle');
    expect(m.muscle.topographie).toBeTruthy();
    const a = await analyserImport({ texte: JSON.stringify(EXEMPLE_IMPORT) });
    expect(a.erreurs || []).toEqual([]);
  });
  it('export : champ topographie présent (vide pour une ancienne carte)', async () => {
    const r = carteVersItem(ANCIENNE); const it2 = r.item || r;
    expect(it2.muscle.topographie).toBe('');
  });
});
