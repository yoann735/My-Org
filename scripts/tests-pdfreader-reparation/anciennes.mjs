// Jeu d'ANCIENNES annotations de chaque sorte (avant ce chantier), page 1 du cours de test.
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const base = { ficheId: 'f-rep', page: 1, createdAt: '2026-10-01T10:00:00.000Z' };
const zig = (x0, y0, n, dx, amp) => Array.from({ length: n }, (_, i) => [+(x0 + i * dx).toFixed(4), +(y0 + Math.sin(i / 2) * amp).toFixed(4)]);
export const ANCIENNES = [
  // boîtes : d'avant le 09/10 (sans fond), fond plein / teinté / transparent, v4 compacte
  { ...base, id: 'old-b1', kind: 'libre', type: 'boite', x: 0.06, y: 0.06, width: 0.22, height: 0.05, couleur: 'jaune', content: doc('Boîte d’avant'), ancre: { x: 0.15, y: 0.3, texte: null }, fleche: true, fleches: [{ id: 'oldfl1', x: 0.42, y: 0.3, texte: null }] },
  { ...base, id: 'old-b2', kind: 'libre', type: 'boite', x: 0.55, y: 0.06, width: 0.25, height: 0.05, couleur: 'ardoise', fond: 'plein', content: doc('Fond plein') },
  { ...base, id: 'old-b3', kind: 'libre', type: 'boite', x: 0.55, y: 0.15, width: 0.25, height: 0.05, couleur: 'sauge', fond: 'teinte', content: doc('Fond teinté') },
  { ...base, id: 'old-b4', kind: 'libre', type: 'boite', x: 0.55, y: 0.24, width: 0.25, height: 0.05, couleur: 'corail', fond: 'transparent', content: doc('Transparent') },
  { ...base, id: 'old-b5', kind: 'libre', type: 'boite', x: 0.06, y: 0.4, width: 0.12, height: 0.03, couleur: 'jaune-vif', fond: 'plein', compacte: true, content: doc('Compacte v4'),
    fleches: [{ id: 'oldfl2', x: 0.45, y: 0.5, texte: null, type: 'souple', points: [{ x: 0.3, y: 0.38 }] }] },
  { ...base, id: 'old-t1', kind: 'texte', type: 'texte', x: 0.06, y: 0.55, width: 0.3, height: 0.03, couleur: 'noir', content: doc('Texte libre d’avant') },
  // traits : ancien (sans rendu), v4 Catmull-Rom, forme redressée, surligneurs
  { ...base, id: 'old-tr1', kind: 'trait', type: 'trait', mode: 'dessin', couleur: 'bleu', epaisseur: 0.0042, points: zig(0.08, 0.66, 30, 0.008, 0.01), aimant: true },
  { ...base, id: 'old-tr2', kind: 'trait', type: 'trait', mode: 'dessin', couleur: 'rouge', epaisseur: 0.0024, opacite: 1, rendu: 'cr', points: zig(0.08, 0.7, 30, 0.008, 0.012) },
  { ...base, id: 'old-tr3', kind: 'trait', type: 'trait', mode: 'dessin', couleur: 'vertfonce', epaisseur: 0.0042, rendu: 'droit', formeReconnue: 'rectangle', points: [[0.4, 0.62], [0.5, 0.62], [0.5, 0.68], [0.4, 0.68], [0.4, 0.62]] },
  { ...base, id: 'old-tr4', kind: 'trait', type: 'surligneur', mode: 'surligneur', couleur: 'jaune', epaisseur: 0.017, opacite: 0.35, points: zig(0.08, 0.76, 25, 0.01, 0.003) },
  { ...base, id: 'old-tr5', kind: 'trait', type: 'surligneur', mode: 'surligneur', couleur: 'magenta', epaisseur: 0.017, opacite: 0.4, rendu: 'droit', points: [[0.08, 0.8], [0.4, 0.8]] },
  // formes : flèche d'avant, flèche libre stylée v4, rectangle, double flèche
  { ...base, id: 'old-f1', kind: 'forme', type: 'forme', forme: 'fleche', x: 0.6, y: 0.4, width: 0.25, height: 0.1, couleur: 'corail', epaisseur: 0.0025 },
  { ...base, id: 'old-f2', kind: 'forme', type: 'forme', forme: 'fleche', x: 0.6, y: 0.55, width: 0.25, height: 0.08, couleur: 'bleufonce', epaisseur: 0.0025, fleche: { type: 'souple', points: [{ x: 0.7, y: 0.5 }] } },
  { ...base, id: 'old-f3', kind: 'forme', type: 'forme', forme: 'rectangle', x: 0.6, y: 0.7, width: 0.15, height: 0.08, couleur: 'violet', epaisseur: 0.0025, remplie: true },
  { ...base, id: 'old-f4', kind: 'forme', type: 'forme', forme: 'double', x: 0.6, y: 0.85, width: 0.3, height: 0.0, couleur: 'noir', epaisseur: 0.0025 },
  { ...base, id: 'old-q1', kind: 'question', type: 'question', x: 0.45, y: 0.88 },
];
