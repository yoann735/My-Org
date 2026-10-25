// Infobulles (25/10) : séparation du raccourci clavier, placement du menu Tableau à côté de la boîte, image de boîte.
import { describe, it, expect } from 'vitest';
import { separerRaccourci } from '../../src/medrevise/lib/infobulles.js';
import { placerACote, contourSel } from '../../src/medrevise/pdf/tableauPlacement.js';
import { largeurImage, ratioVisible, largeurApresGlisser } from '../../src/medrevise/pdf/imageBoiteModele.js';

describe('raccourci des infobulles', () => {
  it('« (⌘F) », « · ⌘1 — aide », « (Échap) », sans raccourci', () => {
    expect(separerRaccourci('Rechercher dans le document (⌘F)')).toEqual({ texte: 'Rechercher dans le document', raccourci: '⌘F' });
    expect(separerRaccourci('Dessin · ⌘2 — crayon, gomme')).toEqual({ texte: 'Dessin — crayon, gomme', raccourci: '⌘2' });
    expect(separerRaccourci('Fermer (Échap)')).toEqual({ texte: 'Fermer', raccourci: 'Échap' });
    expect(separerRaccourci('Couleur du texte')).toEqual({ texte: 'Couleur du texte', raccourci: null });
    expect(separerRaccourci('Supprimer (annulable par ⌘Z)').raccourci).toBe('annulable par ⌘Z');
  });
});
describe('menu Tableau à côté de la boîte', () => {
  const E = { W: 1440, H: 900 }, P = { w: 292, h: 520 };
  const recouvre = (b, r) => !(r.left + P.w <= b.left || r.left >= b.right || r.top + Math.min(P.h, r.maxHeight) <= b.top || r.top >= b.bottom);
  it('à droite, sinon à gauche, sinon en dessous ; jamais sur la boîte, toujours dans l’écran', () => {
    const milieu = { left: 400, right: 800, top: 200, bottom: 400 };
    const bordDroit = { left: 1100, right: 1430, top: 200, bottom: 400 };
    const bordGauche = { left: 10, right: 1300, top: 100, bottom: 300 };
    const enBas = { left: 10, right: 1300, top: 600, bottom: 880 };
    const a = placerACote(milieu, P, E), b = placerACote(bordDroit, P, E), c = placerACote(bordGauche, P, E), d = placerACote(enBas, P, E);
    expect([a.cote, b.cote, c.cote, d.cote]).toEqual(['droite', 'gauche', 'dessous', 'dessus']);
    for (const [bx, r] of [[milieu, a], [bordDroit, b], [bordGauche, c], [enBas, d]]) {
      expect(recouvre(bx, r)).toBe(false);
      expect(r.left).toBeGreaterThanOrEqual(8); expect(r.left + P.w).toBeLessThanOrEqual(E.W - 8);
      expect(r.top).toBeGreaterThanOrEqual(8); expect(r.top + Math.min(P.h, r.maxHeight)).toBeLessThanOrEqual(E.H - 8 + 0.01);
    }
  });
});
describe('cellule / plage sélectionnée', () => {
  it('contour intérieur : une cellule = 4 bords ; une plage = ses bords extérieurs seulement', () => {
    expect(contourSel({ i0: 1, j0: 1, i1: 1, j1: 1 }, { i: 1, j: 1 }).split(',').length).toBe(4);
    expect(contourSel({ i0: 0, j0: 0, i1: 2, j1: 2 }, { i: 1, j: 1 })).toBeUndefined();
    expect(contourSel({ i0: 0, j0: 0, i1: 2, j1: 2 }, { i: 0, j: 2 }).split(',').length).toBe(2);
  });
});
describe('image d’une boîte', () => {
  it('largeur bornée à la boîte, proportions du cadre recadré', () => {
    expect(largeurImage({})).toBe(1);
    expect(largeurImage({ largeur: 0.05 })).toBe(0.15);
    expect(ratioVisible({ ratio: 0.5, rognage: { x: 0, y: 0, w: 0.5, h: 1 } })).toBe(1);
    expect(largeurApresGlisser(1, 100, 400)).toBe(1);
    expect(largeurApresGlisser(1, -100, 400)).toBe(0.5);
  });
});
