// « Faire défiler jusqu'à la diapo détectée » (26/11/2026, docs/compte-rendu-suivi-diapos-continu-et-defilement.md) — la cible.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  lireDefilement, abonnerDefilement, activerDefilement, signalerDiapo, consommerCible, oublierCible,
} from '../../src/medrevise/transcription/diapos/defilement.js';

describe('cible du défilement', () => {
  beforeEach(() => { activerDefilement(true); });

  it('active par défaut, sans cible', () => {
    expect(lireDefilement().actif).toBe(true);
    expect(lireDefilement().cible).toBe(null);
  });

  it('une diapo reconnue devient la cible ; la suivante la remplace', () => {
    signalerDiapo({ courseId: 'c1', page: 5, pageCle: 5, n: 3 });
    expect(lireDefilement().cible).toEqual({ courseId: 'c1', page: 5, pageCle: 5, n: 3 });
    signalerDiapo({ courseId: 'c1', page: 6, pageCle: 6, n: 4 });
    expect(lireDefilement().cible.n).toBe(4);
  });

  it('consommée une seule fois, et seulement la bonne (une cible plus récente reste)', () => {
    signalerDiapo({ courseId: 'c1', page: 5, pageCle: 5, n: 3 });
    signalerDiapo({ courseId: 'c1', page: 7, pageCle: 7, n: 4 });
    consommerCible(3); // l'ancienne : sans effet
    expect(lireDefilement().cible.n).toBe(4);
    consommerCible(4);
    expect(lireDefilement().cible).toBe(null);
  });

  it('option coupée : aucune cible (comportement d’avant)', () => {
    signalerDiapo({ courseId: 'c1', page: 5, pageCle: 5, n: 1 });
    activerDefilement(false);
    expect(lireDefilement().cible).toBe(null);
    signalerDiapo({ courseId: 'c1', page: 6, pageCle: 6, n: 2 });
    expect(lireDefilement().cible).toBe(null);
  });

  it('fin de session : la cible est oubliée ; les abonnés sont prévenus', () => {
    const vus = [];
    const off = abonnerDefilement((e) => vus.push(e.cible && e.cible.n));
    signalerDiapo({ courseId: 'c1', page: 5, pageCle: 5, n: 9 });
    oublierCible();
    off();
    expect(vus).toEqual([9, null]);
    expect(lireDefilement().cible).toBe(null);
  });
});
