// (26/10) Carte Texte : éléments à révéler au verso — `items: [{ text, masked }]` (champ additif).
import { describe, it, expect } from 'vitest';
import { normalizeV1Item } from '../../src/medrevise/lib/schema.js';
import { toInternalItem } from '../../src/medrevise/lib/adapter.js';
import { analyserImport, EXEMPLE_IMPORT, exempleJSON } from '../../src/medrevise/lib/importFlashcards.js';
import { versoTexte } from '../../src/medrevise/apprentissageLibre/tableauBord.js';

const QUATRE = [{ text: 'Épuration', masked: true }, { text: 'Hydro-électrolytique', masked: true }, { text: 'Acido-basique', masked: false }, { text: 'Endocrine', masked: true }];

describe('schéma', () => {
  it('carte à éléments : verso facultatif, éléments vides retirés, masqué par défaut', () => {
    const r = normalizeV1Item({ type: 'flashcard', recto: 'Quelles sont les 4 fonctions du rein ?', verso: '', items: [...QUATRE, { text: '  ' }, { text: 'Sans drapeau' }] });
    expect(r.ok).toBe(true);
    expect(r.item.items).toEqual([...QUATRE, { text: 'Sans drapeau', masked: true }]);
    expect(r.item.verso).toBe('');
  });
  it('ancienne carte Texte : identique (pas de champ items ajouté), verso toujours exigé sans éléments', () => {
    const ancienne = { id: 'x', type: 'flashcard', recto: 'R', verso: 'V', theme: 'T', dueDate: '2026-10-30', historique: [{ qualite: 4 }] };
    const avant = toInternalItem(ancienne);
    expect('items' in avant).toBe(false);
    expect(toInternalItem({ ...avant })).toEqual(avant);
    expect(normalizeV1Item({ type: 'flashcard', recto: 'R', verso: '' }).ok).toBe(false);
  });
  it('modification : la planification est préservée, l’ordre des éléments suit', () => {
    const c = toInternalItem({ id: 'y', type: 'flashcard', recto: 'R', verso: 'Intro', items: QUATRE, dueDate: '2026-11-02', fsrs: { s: 3 } });
    const m = toInternalItem({ ...c, items: [QUATRE[3], QUATRE[0], QUATRE[1], QUATRE[2]] });
    expect(m.items.map((x) => x.text)).toEqual(['Endocrine', 'Épuration', 'Hydro-électrolytique', 'Acido-basique']);
    expect([m.dueDate, m.fsrs]).toEqual([c.dueDate, c.fsrs]);
  });
});

describe('import JSON (panneau)', () => {
  it('l’exemple « format attendu » contient une carte à éléments et se réimporte sans erreur', async () => {
    expect(EXEMPLE_IMPORT.items.some((x) => Array.isArray(x.items))).toBe(true);
    const a = await analyserImport({ texte: exempleJSON().replace(/"molecule": \{[^}]*\}/, '"recto": "x", "verso": "y"') });
    expect(a.ok).toBe(true);
    const el = a.cartes.find((c) => c.carte.items);
    expect(el.carte.items).toHaveLength(4);
    expect(el.carte.items.map((x) => x.masked)).toEqual([true, true, false, true]);
    expect(el.sorte).toBe('texte');
  });
  it('erreurs claires', async () => {
    const err = async (it) => (await analyserImport({ texte: JSON.stringify({ items: [{ type: 'flashcard', recto: 'R', ...it }] }) })).erreurs[0]?.message;
    expect(await err({ items: 'a' })).toMatch(/liste/);
    expect(await err({ items: [{ text: 'a', cache: true }] })).toMatch(/champ inconnu/);
    expect(await err({ items: [{ text: 'a', masked: 'oui' }] })).toMatch(/true ou false/);
    expect(await err({ items: [{ text: '' }] })).toMatch(/texte manquant/);
    expect(await err({})).toMatch(/verso/);
    expect(await err({ items: [{ text: 'a' }], tableau: { colonnes: ['A', 'B'], lignes: [['1', '2']] } })).toMatch(/seulement sur une carte texte/);
  });
});

describe('export / affichage texte', () => {
  it('versoTexte (vignettes, recherche) : verso puis un élément par ligne', () => {
    expect(versoTexte({ type: 'flashcard', verso: 'Intro', items: QUATRE })).toBe('Intro\n• Épuration\n• Hydro-électrolytique\n• Acido-basique\n• Endocrine');
    expect(versoTexte({ type: 'flashcard', verso: 'V' })).toBe('V');
  });
  it('aller-retour JSON (sauvegarde = enregistrement tel quel) : éléments intacts', () => {
    const c = toInternalItem({ id: 'z', type: 'flashcard', recto: 'R', verso: '', items: QUATRE });
    expect(JSON.parse(JSON.stringify(c)).items).toEqual(QUATRE);
  });
});
