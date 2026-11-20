// « Enregistrer en PNG » d'un dessin + retour au cours depuis la barre de transcription (20/11).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { echellePng, nomFichierPng, partageImagePrefere, remettrePng } from '../../src/medrevise/mobile/exportPng.js';
import { couleurCss, peindreTextes } from '../../src/medrevise/mobile/textesPng.js';
import { noterOrigineLecteur, origineLecteur, definirRetourCours, retourPossible, revenirAuCours, prendreDemandePanneau } from '../../src/medrevise/transcription/retourCours.js';

const nav = (o) => vi.stubGlobal('navigator', o);
afterEach(() => vi.unstubAllGlobals());

describe('PNG : nom et résolution', () => {
  it('nom dessin-<cours>-<date>.png, sans accents ni caractères interdits', () => {
    const d = new Date(2026, 10, 20, 18, 5);
    expect(nomFichierPng('Néphrologie : le rein / TD 2', d)).toBe('dessin-nephrologie-le-rein-td-2-2026-11-20.png');
    expect(nomFichierPng('', d)).toBe('dessin-sans-cours-2026-11-20.png');
    expect(nomFichierPng('???', d)).toBe('dessin-sans-cours-2026-11-20.png');
  });
  it('au moins ×2 pour un dessin courant, ×3 tant que le canvas le permet', () => {
    expect(echellePng(400, 700)).toBe(3);
    expect(echellePng(2000, 1400)).toBeGreaterThanOrEqual(2);
    const k = echellePng(6000, 4000);
    expect(6000 * k).toBeLessThanOrEqual(8192);
    expect(6000 * 4000 * k * k).toBeLessThanOrEqual(16777216 + 1);
  });
});

describe('PNG : partage ou téléchargement', () => {
  const ios = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 };
  const ipad = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 };
  const mac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 };
  it('iPhone et iPad : feuille de partage ; Mac : non (même avec navigator.share)', () => {
    const share = () => Promise.resolve(); const canShare = () => true;
    nav({ ...ios, share, canShare }); expect(partageImagePrefere()).toBe(true);
    nav({ ...ipad, share, canShare }); expect(partageImagePrefere()).toBe(true);
    nav({ ...mac, share, canShare }); expect(partageImagePrefere()).toBe(false);
    nav({ ...ios }); expect(partageImagePrefere()).toBe(false); // pas d'API de partage
  });
  it('partage réussi, annulé, ou activation perdue (un toucher de plus)', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    let recu = null;
    nav({ ...ios, canShare: () => true, share: (d) => { recu = d; return Promise.resolve(); } });
    expect(await remettrePng(blob, 'dessin-a-2026-11-20.png')).toBe('partage');
    expect(recu.files[0].name).toBe('dessin-a-2026-11-20.png');
    expect(recu.files[0].type).toBe('image/png');
    nav({ ...ios, canShare: () => true, share: () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })) });
    expect(await remettrePng(blob, 'a.png')).toBe('annule');
    nav({ ...ios, canShare: () => true, share: () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })) });
    expect(await remettrePng(blob, 'a.png')).toBe('geste');
  });
});

describe('PNG : zones de texte peintes', () => {
  it('couleurs calculées rgb/rgba', () => {
    expect(couleurCss('rgb(242, 242, 245)')).toEqual({ hex: '#f2f2f5', alpha: 1 });
    expect(couleurCss('rgba(10, 132, 255, 0.5)')).toEqual({ hex: '#0a84ff', alpha: 0.5 });
  });
  it('chaque mot peint à sa place, à l’échelle de l’image, souligné si besoin', () => {
    const appels = [];
    const g = { save() {}, restore() {}, scale: (a, b) => appels.push(['scale', a, b]), measureText: () => ({ width: 30, fontBoundingBoxAscent: 14, fontBoundingBoxDescent: 4 }),
      fillText: (t, x, y) => appels.push(['texte', t, x, y]), fillRect: (x, y, w, h) => appels.push(['ligne', x, y, w, h]) };
    peindreTextes(g, [{ t: 'Rein', x: 20, y: 10, w: 30, h: 23.4, police: 'normal 500 18px system-ui', taille: 18, couleur: '#1f1f24', alpha: 1, souligne: true }], 3);
    expect(appels[0]).toEqual(['scale', 3, 3]);
    const [, t, x, y] = appels[1];
    expect([t, x]).toEqual(['Rein', 20]);
    expect(y).toBeCloseTo(10 + (23.4 - 18) / 2 + 14, 5);
    expect(appels[2][0]).toBe('ligne');
  });
});

describe('retour au cours', () => {
  it('sans shell d’ordinateur (téléphone) : aucun retour', () => {
    expect(retourPossible()).toBe(false);
    expect(revenirAuCours('c1')).toBe(false);
    expect(prendreDemandePanneau('c1')).toBe(false);
  });
  it('mémorise où le lecteur était, navigue, demande le panneau Transcript une seule fois', () => {
    noterOrigineLecteur('c1', { embedded: true, srcTab: 'pdf' });
    noterOrigineLecteur('c1', { srcTab: 'fiche' });
    expect(origineLecteur('c1')).toEqual({ embedded: true, srcTab: 'fiche' });
    const vus = [];
    const fin = definirRetourCours((id, o) => vus.push([id, o]));
    expect(retourPossible()).toBe(true);
    expect(revenirAuCours('c1')).toBe(true);
    expect(vus).toEqual([['c1', { embedded: true, srcTab: 'fiche' }]]);
    expect(prendreDemandePanneau('c1')).toBe(true);
    expect(prendreDemandePanneau('c1')).toBe(false);
    fin();
    expect(retourPossible()).toBe(false);
  });
});
