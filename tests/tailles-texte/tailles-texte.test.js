// Taille du texte (20/11, src/medrevise/lib/taillesTexte.js) : la taille d'un objet vaut pour tout son texte ;
// le texte d'un document est en px d'une page de 1000 px.
import { describe, it, expect } from 'vitest';
import { sansTaillesCollees, contenuSansTailles, contientTailles, px1000VersPage, pageVersPx1000, renduVersPx1000 } from '../../src/medrevise/lib/taillesTexte.js';

const taille = (fs, extra = {}) => ({ type: 'textStyle', attrs: { fontSize: fs, color: null, fontFamily: null, ...extra } });
const doc = (...c) => ({ type: 'doc', content: [{ type: 'paragraph', content: c }] });

describe('collage dans un objet', () => {
  it('retire font-size des styles (couche texte du diapo, Word, page web), garde le reste', () => {
    expect(sansTaillesCollees('<span style="font-size: 23.4px; font-family: sans-serif;">Rein</span>')).toBe('<span style="font-family: sans-serif">Rein</span>');
    expect(sansTaillesCollees('<p style="font-size:11pt">a</p><b style=\'font-size: 2em\'>b</b>')).toBe('<p>a</p><b>b</b>');
  });
  it('ne touche pas un HTML sans taille', () => {
    const h = '<p style="color: red"><b>x</b></p>';
    expect(sansTaillesCollees(h)).toBe(h);
  });
});

describe('taille de l’objet = taille de tout son texte', () => {
  it('retire les tailles en dur, garde couleur, police, gras', () => {
    const d = doc({ type: 'text', text: 'a', marks: [taille('23.4px', { color: '#f00' }), { type: 'bold' }] }, { type: 'text', text: 'b', marks: [taille('calc(var(--lp) * 2.4)')] });
    expect(contientTailles(d)).toBe(true);
    const n = contenuSansTailles(d);
    expect(contientTailles(n)).toBe(false);
    expect(n.content[0].content[0].marks).toEqual([{ type: 'textStyle', attrs: { fontSize: null, color: '#f00', fontFamily: null } }, { type: 'bold' }]);
    expect(n.content[0].content[1].marks).toBeUndefined(); // marque vide : retirée
    expect(n.content[0].content[1].text).toBe('b');
  });
  it('contenu sans taille : identique', () => {
    const d = doc({ type: 'text', text: 'a', marks: [{ type: 'italic' }] });
    expect(contientTailles(d)).toBe(false);
    expect(contenuSansTailles(d)).toEqual(d);
  });
});

describe('texte d’un document : px d’une page de 1000 px', () => {
  it('aller-retour : 24 px de référence = 14,28 px de mise en page A4 (595)', () => {
    expect(px1000VersPage(24)).toBe('14.28px');
    expect(pageVersPx1000('14.28px')).toBe(24);
    for (const v of [10, 12, 14, 16, 18, 21, 24, 32, 40]) expect(pageVersPx1000(px1000VersPage(v))).toBe(v);
  });
  it('texte par défaut (12,5 px de mise en page) = 21 px de référence ; valeurs illisibles → null', () => {
    expect(pageVersPx1000('12.5px')).toBe(21);
    expect(pageVersPx1000('1.2em')).toBeNull();
    expect(pageVersPx1000('')).toBeNull();
  });
  it('mesure : px rendus → px de référence', () => {
    expect(renduVersPx1000(36.864, 1536)).toBeCloseTo(24, 6);
    expect(renduVersPx1000(22.848, 952)).toBeCloseTo(24, 6);
  });
});
