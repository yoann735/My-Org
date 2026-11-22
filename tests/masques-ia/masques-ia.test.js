// Masques d'une flashcard image produits par une IA (22/11) : lecture tolérante, recalage OCR, même structure qu'une zone dessinée.
import { describe, it, expect } from 'vitest';
import { lireMasquesIA, recalerMasques, resumeImport, normaliser, PROMPT_MASQUES_IA, MARGE_PX } from '../../src/medrevise/lib/masquesIA.js';

const JSON_OK = '{"format":"medrevise-masques","version":1,"masques":[{"label":"Tubercule de Gerdy","x":0.012,"y":0.171,"w":0.180,"h":0.024},{"label":"Diaphyse","x":0.1,"y":0.5,"w":0.07,"h":0.015}]}';

describe('lecture tolérante', () => {
  it('JSON nu', () => {
    const r = lireMasquesIA(JSON_OK);
    expect(r.ok).toBe(true);
    expect(r.masques).toEqual([{ label: 'Tubercule de Gerdy', x: 0.012, y: 0.171, w: 0.18, h: 0.024 }, { label: 'Diaphyse', x: 0.1, y: 0.5, w: 0.07, h: 0.015 }]);
    expect(r.avertissements).toEqual([]);
  });
  it('texte autour et balises ```json ignorés', () => {
    const r = lireMasquesIA('Voici les masques :\n```json\n' + JSON_OK + '\n```\nBonne révision !');
    expect(r.ok).toBe(true); expect(r.masques).toHaveLength(2); expect(r.avertissements).toEqual([]);
    const r2 = lireMasquesIA('Bien sûr ! ' + JSON_OK + ' (2 étiquettes)');
    expect(r2.ok).toBe(true); expect(r2.masques).toHaveLength(2);
  });
  it('accolade dans un label : le bloc est bien délimité', () => {
    const r = lireMasquesIA('x ' + JSON_OK.replace('Diaphyse', 'Dia}physe') + ' fin }');
    expect(r.ok).toBe(true); expect(r.masques[1].label).toBe('Dia}physe');
  });
  it('virgule en trop et guillemets typographiques réparés, avec avertissement', () => {
    const r = lireMasquesIA('{“format”:“medrevise-masques”,“version”:1,“masques”:[{“label”:“Diaphyse”,“x”:0.1,“y”:0.5,“w”:0.07,“h”:0.015},]}');
    expect(r.ok).toBe(true); expect(r.masques[0].label).toBe('Diaphyse');
    expect(r.avertissements.join(' ')).toMatch(/réparé/);
  });
  it('JSON invalide : message clair qui dit où et quoi corriger', () => {
    const r = lireMasquesIA('{"format":"medrevise-masques","version":1,"masques":[{"label":"A","x":0.1 "y":0.2,"w":0.1,"h":0.1}]}');
    expect(r.ok).toBe(false);
    expect(r.erreur).toMatch(/invalide près de la ligne 1, colonne \d+/);
    expect(r.erreur).toMatch(/virgule/);
    expect(lireMasquesIA('{"masques":[{"label":"A","x":0.1').erreur).toMatch(/invalide/);
    expect(lireMasquesIA('Désolé, je ne peux pas.').erreur).toMatch(/Aucun JSON/);
    expect(lireMasquesIA('').erreur).toMatch(/Rien à lire/);
    expect(lireMasquesIA('{"format":"medrevise-masques","version":1}').erreur).toMatch(/Il manque la liste "masques"/);
    expect(lireMasquesIA('{"format":"medrevise-masques","version":1,"masques":[]}').erreur).toMatch(/vide/);
  });
  it('hors limites : ramené dans l’image avec avertissement ; hors image ou mal formé : ignoré et signalé', () => {
    const r = lireMasquesIA(JSON.stringify({ format: 'medrevise-masques', version: 1, masques: [
      { label: 'Gauche', x: -0.05, y: 0.2, w: 0.2, h: 0.03 },
      { label: 'Bas', x: 0.5, y: 0.98, w: 0.2, h: 0.05 },
      { label: 'Dehors', x: 1.2, y: 0.2, w: 0.1, h: 0.1 },
      { label: 'Texte', x: 'a', y: 0.2, w: 0.1, h: 0.1 },
      { label: 'Plat', x: 0.2, y: 0.2, w: 0, h: 0.1 },
    ] }));
    expect(r.ok).toBe(true);
    expect(r.masques).toEqual([{ label: 'Gauche', x: 0, y: 0.2, w: 0.15, h: 0.03 }, { label: 'Bas', x: 0.5, y: 0.98, w: 0.2, h: 0.02 }]);
    const a = r.avertissements.join(' ');
    expect(a).toMatch(/2 masques dépassaient de l'image : ramenés dedans/);
    expect(a).toMatch(/3 masques ignorés/); expect(a).toMatch(/« Dehors »\) : entièrement hors/); expect(a).toMatch(/« Texte »\) : x, y, w et h doivent être des nombres/);
  });
  it('coordonnées en pixels converties si la taille de l’image est connue', () => {
    const r = lireMasquesIA('{"masques":[{"label":"A","x":100,"y":200,"w":50,"h":20}]}', { W: 1000, H: 2000 });
    expect(r.masques[0]).toEqual({ label: 'A', x: 0.1, y: 0.1, w: 0.05, h: 0.01 });
    expect(r.avertissements.join(' ')).toMatch(/pixels/);
  });
  it('doublons et chevauchements forts signalés ; même label à deux endroits = pas un doublon', () => {
    const m = (label, x, y) => ({ label, x, y, w: 0.1, h: 0.02 });
    const r = lireMasquesIA(JSON.stringify({ format: 'medrevise-masques', version: 1, masques: [m('Diaphyse', 0.1, 0.5), m('Diaphyse', 0.6, 0.5), m('Diaphyse', 0.101, 0.5), m('Crête', 0.3, 0.3), m('Bord', 0.302, 0.301)] }));
    const a = r.avertissements.join(' ');
    expect(a).toMatch(/Doublon probable : « Diaphyse » \(n° 1 et 3\)/);
    expect(a).not.toMatch(/n° 1 et 2/);
    expect(a).toMatch(/Chevauchement fort : n° 4 « Crête » et n° 5 « Bord »/);
  });
});

/* OCR simulé : image 1000 × 1000 px, mots en coordonnées relatives (comme ocr/ocrImage.js) */
const mot = (t, x, y, w, h = 0.012, line = 0) => ({ t, x, y, w, h, line });
const OCR = { mots: [
  mot('Tubercule', 0.010, 0.230, 0.045, 0.012, 1), mot('de', 0.058, 0.230, 0.010, 0.012, 1), mot('Gerdi', 0.071, 0.230, 0.028, 0.012, 1),
  // étiquette sur trois lignes
  mot('Gaines', 0.530, 0.140, 0.032, 0.012, 2), mot('tibiales', 0.565, 0.140, 0.036, 0.012, 2),
  mot('pour', 0.553, 0.158, 0.020, 0.012, 3), mot('les', 0.576, 0.158, 0.014, 0.012, 3),
  mot('ligaments', 0.520, 0.176, 0.046, 0.012, 4), mot('croisés', 0.569, 0.176, 0.034, 0.012, 4),
  // la même étiquette dans deux vues
  mot('Diaphyse', 0.110, 0.546, 0.040, 0.012, 5), mot('Diaphyse', 0.570, 0.548, 0.040, 0.012, 6),
  // OCR qui colle deux mots / se trompe d'une lettre / coupe un mot
  mot('Facelatérale', 0.080, 0.420, 0.055, 0.012, 7),
  mot('Malléo1e', 0.390, 0.750, 0.040, 0.012, 8), mot('interne', 0.433, 0.750, 0.034, 0.012, 8),
  mot('Mortaise', 0.440, 0.780, 0.040, 0.012, 9), mot('tibio-', 0.483, 0.780, 0.026, 0.012, 9), mot('fibulaire', 0.440, 0.796, 0.040, 0.012, 10),
  // un titre proche
  mot('Vue', 0.220, 0.186, 0.018, 0.012, 11), mot('antérieure', 0.241, 0.186, 0.045, 0.012, 11),
] };
const W = 1000, H = 1000, m4 = MARGE_PX / 1000;

describe('recalage OCR', () => {
  it('prend exactement le contour des mots + 4 px (étiquette mal placée par l’IA, faute recopiée)', () => {
    const [r] = recalerMasques([{ label: 'Tubercule de Gerdi', x: 0.02, y: 0.215, w: 0.10, h: 0.02 }], OCR, { W, H });
    expect(r.recale).toBe(true);
    expect(r.x).toBeCloseTo(0.010 - m4, 4); expect(r.y).toBeCloseTo(0.230 - m4, 4);
    expect(r.x + r.w).toBeCloseTo(0.099 + m4, 4); expect(r.y + r.h).toBeCloseTo(0.242 + m4, 4);
  });
  it('tolère accents, casse et petite faute (Gerdy ≠ Gerdi)', () => {
    const [r] = recalerMasques([{ label: 'TUBERCULE DE GERDY', x: 0.01, y: 0.225, w: 0.09, h: 0.02 }], OCR, { W, H });
    expect(r.recale).toBe(true);
  });
  it('étiquette sur plusieurs lignes → un seul masque qui couvre toutes les lignes', () => {
    const [r] = recalerMasques([{ label: 'Gaines tibiales pour les ligaments croisés', x: 0.525, y: 0.135, w: 0.08, h: 0.03 }], OCR, { W, H });
    expect(r.recale).toBe(true);
    expect(r.y).toBeCloseTo(0.140 - m4, 4); expect(r.y + r.h).toBeCloseTo(0.188 + m4, 4);
    expect(r.x).toBeCloseTo(0.520 - m4, 4); expect(r.x + r.w).toBeCloseTo(0.603 + m4, 4);
  });
  it('même label dans deux vues : chacun recalé à SA place', () => {
    const [a, b] = recalerMasques([{ label: 'Diaphyse', x: 0.105, y: 0.540, w: 0.05, h: 0.02 }, { label: 'Diaphyse', x: 0.565, y: 0.545, w: 0.05, h: 0.02 }], OCR, { W, H });
    expect(a.recale && b.recale).toBe(true);
    expect(a.x).toBeCloseTo(0.110 - m4, 4); expect(b.x).toBeCloseTo(0.570 - m4, 4);
  });
  it('mot collé, chiffre lu pour une lettre, mot coupé par un trait d’union', () => {
    const r = recalerMasques([
      { label: 'Face latérale', x: 0.075, y: 0.41, w: 0.07, h: 0.02 },
      { label: 'Malléole interne', x: 0.385, y: 0.745, w: 0.09, h: 0.02 },
      { label: 'Mortaise tibio-fibulaire', x: 0.435, y: 0.775, w: 0.08, h: 0.035 },
    ], OCR, { W, H });
    expect(r.map((x) => x.recale)).toEqual([true, true, true]);
    expect(r[2].y + r[2].h).toBeCloseTo(0.808 + m4, 4);
  });
  it('label introuvable près du masque → position de l’IA gardée, « à vérifier »', () => {
    const m = { label: 'Crête soléaire', x: 0.3, y: 0.3, w: 0.06, h: 0.015 };
    const [r] = recalerMasques([m], OCR, { W, H });
    expect(r).toEqual({ ...m, recale: false });
    // trop loin : la zone de recherche est le masque agrandi de 3 % de l'image
    const [loin] = recalerMasques([{ label: 'Diaphyse', x: 0.110, y: 0.60, w: 0.04, h: 0.012 }], OCR, { W, H });
    expect(loin.recale).toBe(false);
  });
  it('mot significatif non lu (collé à un trait) : masque de l’IA AGRANDI aux mots lus, toujours « à vérifier »', () => {
    const ocr = { mots: [mot('Malléole', 0.562, 0.784, 0.073, 0.012, 1)] }; // « interne » non lu
    const m = { label: 'Malléole interne', x: 0.567, y: 0.787, w: 0.15, h: 0.02 };
    const [r] = recalerMasques([m], ocr, { W, H });
    expect(r.recale).toBe(false); expect(r.partiel).toBe(true);
    expect(r.x).toBeCloseTo(0.562 - m4, 4); expect(r.y).toBeCloseTo(0.784 - m4, 4); // couvre le « M » que l'IA laissait dépasser
    expect(r.x + r.w).toBeGreaterThanOrEqual(m.x + m.w); expect(r.y + r.h).toBeGreaterThanOrEqual(m.y + m.h);
    // moins de la moitié des lettres lues : position de l'IA telle quelle
    const [r2] = recalerMasques([{ label: 'Gouttière des tendons fléchisseurs', x: 0.55, y: 0.78, w: 0.15, h: 0.02 }], ocr, { W, H });
    expect(r2.recale).toBe(false); expect(r2.partiel).toBeUndefined(); expect(r2.x).toBe(0.55);
  });
  it('sans OCR : rien n’est recalé ; deux masques sur les mêmes mots → le second à vérifier', () => {
    expect(recalerMasques([{ label: 'Diaphyse', x: 0.1, y: 0.54, w: 0.05, h: 0.02 }], null, { W, H })[0].recale).toBe(false);
    const r = recalerMasques([{ label: 'Diaphyse', x: 0.105, y: 0.540, w: 0.05, h: 0.02 }, { label: 'Diaphyse', x: 0.106, y: 0.541, w: 0.05, h: 0.02 }], OCR, { W, H });
    expect(r.map((x) => x.recale)).toEqual([true, false]);
  });
  it('résumé en une ligne', () => {
    expect(resumeImport([{ recale: true }, { recale: true }, { recale: false }])).toBe('3 masques importés · 2 recalés · 1 à vérifier');
    expect(resumeImport([{ recale: true }])).toBe('1 masque importé · 1 recalé · 0 à vérifier');
  });
  it('normalisation', () => {
    expect(normaliser('Patte d’oie')).toBe('pattedoie');
    expect(normaliser('Crête')).toBe('crete');
  });
});

describe('prompt', () => {
  it('impose le format et les consignes', () => {
    for (const x of ['UNIQUEMENT', '"format":"medrevise-masques"', 'plusieurs lignes', 'UN SEUL masque', 'Vue antérieure', 'Crânial', 'numéros de page', 'EXACT', 'faute', 'Compte toutes les étiquettes', 'trait']) expect(PROMPT_MASQUES_IA).toContain(x);
  });
});
