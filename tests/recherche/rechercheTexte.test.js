// Recherche tolérante (25/10) — moteur commun du lecteur (⌘F) et du mode Apprentissage.
import { describe, it, expect } from 'vitest';
import { normaliser, contient, indexer, chercher, extrait } from '../../src/medrevise/lib/rechercheTexte.js';

describe('normalisation', () => {
  it('casse, accents, apostrophes et guillemets typographiques, ligatures, blancs et tirets', () => {
    expect(normaliser('L’Énergie « libre »')).toBe(normaliser("l'energie \"libre\""));
    expect(normaliser('ﬁltration   glomérulaire')).toBe('filtrationglomerulaire');
    expect(normaliser('cœur')).toBe('coeur');
    expect(contient('Le débit de filtration glomérulaire', 'DEBIT DE FILTRATION')).toBe(true);
  });
});

describe('phrase sur plusieurs segments', () => {
  it('à cheval sur deux lignes, avec césure', () => {
    const segs = ['La réabsorption du so-', 'dium a lieu dans le tube contourné', 'proximal.'];
    const r = chercher(segs, 'réabsorption du sodium a lieu');
    expect(r).toHaveLength(1);
    expect(r[0].morceaux).toEqual([{ seg: 0, debut: 3, fin: 21 }, { seg: 1, debut: 0, fin: 11 }]);
    expect(chercher(segs, 'tube contourné proximal')[0].morceaux.map((m) => m.seg)).toEqual([1, 2]);
  });
  it('espaces multiples, retours à la ligne, espaces perdus par l’extraction', () => {
    expect(chercher(['le   rein\nfiltre', 'le sang'], 'rein filtre le sang')).toHaveLength(1);
    expect(chercher(['lerein filtre'], 'le rein')).toHaveLength(1);
  });
  it('plusieurs occurrences, sans chevauchement', () => {
    expect(chercher(['aaa aaa'], 'aa')).toHaveLength(3); // les blancs ne comptent pas
    expect(chercher(['rein, rein', 'et rein'], 'rein')).toHaveLength(3);
  });
  it('extrait lisible autour de la phrase', () => {
    const segs = ['Début du texte. La réabsorption du so-', 'dium a lieu ici.'];
    const e = extrait(segs, chercher(segs, 'sodium a lieu')[0]);
    expect(e.trouve).toBe('so- dium a lieu');
    expect(e.apres.startsWith(' ici')).toBe(true);
  });
  it('index réutilisable, requête vide', () => {
    const segs = ['abc'];
    expect(chercher(segs, '', indexer(segs))).toEqual([]);
  });
});
