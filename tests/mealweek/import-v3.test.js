// MealWeek V3 — contrôle des données importées du classeur (24 recettes, 9 semaines)
// et de leur consommation par la couche de données de l'app.
// Lancer : npm test -- tests/mealweek
import { describe, it, expect } from 'vitest';
import RAW from '../../src/mealweek/data/mealweek_data.json';
import {
  RECIPES, WEEK_KEYS, OPTIONS_WEEKEND, METHODE, recipeById, weekPlan, weekShopping,
  weekBudget, weekNutrition, weekCosts, weeksUsingOption, scaleIngredientQty,
} from '../../src/mealweek/data/dataLayer.js';

const ORIGINES = new Set(['recette', 'placard', 'ajout']);

describe('recettes', () => {
  it('24 recettes, numérotées 1 à 24, stockées une seule fois sous R01…R24', () => {
    expect(RECIPES.map((r) => r.num)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    expect(Object.keys(RAW.recipes)).toEqual(RECIPES.map((r) => r.id));
    RECIPES.forEach((r) => expect(r.id).toBe('R' + String(r.num).padStart(2, '0')));
  });

  it('chaque recette a tous ses champs', () => {
    RECIPES.forEach((r) => {
      expect(r.nom, r.id).toBeTruthy();
      expect(r.source_url, r.id).toMatch(/^https?:\/\//);
      expect(r.temps, r.id).toMatch(/\d+\s*min/);
      expect(r.ustensiles.length, r.id).toBeGreaterThan(0);
      expect(typeof r.substitutions, r.id).toBe('string');
      expect(r.ingredients_livres.length, r.id).toBeGreaterThan(2);
      r.ingredients_livres.forEach((i) => {
        expect(typeof i.qty_valeur, `${r.id} ${i.nom}`).toBe('number');
        expect(i.unite, `${r.id} ${i.nom}`).toBeTruthy();
        expect(i.produit_chronodrive, `${r.id} ${i.nom}`).toBeTruthy();
        expect(ORIGINES.has(i.origine), `${r.id} ${i.nom} ${i.origine}`).toBe(true);
      });
      expect(r.etapes.length, r.id).toBeGreaterThan(3);
      r.etapes.forEach((e, k) => { expect(e.numero).toBe(k + 1); expect(e.texte).toBeTruthy(); });
      ['kcal', 'proteines_g', 'glucides_g', 'lipides_g'].forEach((c) =>
        expect(r.nutrition_1portion[c], `${r.id} ${c}`).toBeGreaterThan(0));
    });
  });

  it('nutrition recalculée depuis les valeurs /100 g (et non lue en cache)', () => {
    // R01 : somme des 10 ingrédients de l'onglet Nutrition
    expect(recipeById('R01').nutrition_1portion).toEqual({ kcal: 885.1, proteines_g: 41.6, glucides_g: 74.5, lipides_g: 46 });
  });

  it('quantités en base 1 personne, affichées ×2 par le sélecteur de portions', () => {
    const poulet = recipeById('R01').ingredients_livres[0];
    expect(scaleIngredientQty(poulet, 1)).toBe('130 g');
    expect(scaleIngredientQty(poulet, 2)).toBe('260 g');
    expect(recipeById('R01').etapes_portions).toBe(2);
  });
});

describe('semaines', () => {
  it('9 semaines S1…S9, 5 recettes chacune, qui RÉFÈRENT aux recettes', () => {
    expect(WEEK_KEYS).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9']);
    WEEK_KEYS.forEach((k) => {
      const wk = RAW.weeks[k];
      expect(wk.recettes_semaine.length, k).toBe(5);
      wk.recettes_semaine.forEach((id) => expect(recipeById(id), `${k} ${id}`).toBeTruthy());
      // les lignes de courses ne copient pas les recettes : elles portent des ids
      wk.courses.forEach((c) => c.recettes.forEach((id) => expect(RAW.recipes[id]).toBeTruthy()));
    });
  });

  it('planning 7 jours midi/soir + plat week-end + pizza reliés au catalogue', () => {
    WEEK_KEYS.forEach((k) => {
      const plan = weekPlan(k);
      expect(plan.days.map((d) => d.full)).toEqual(
        ['Dimanche (retrait)', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche midi']);
      const soirs = plan.days.map((d) => d.soirRecipeId).filter(Boolean);
      expect(soirs.sort(), k).toEqual([...RAW.weeks[k].recettes_semaine].sort());
      const wk = RAW.weeks[k];
      expect(wk.plat_weekend.option_id, k).toMatch(/^OW\d+$/);
      expect(wk.pizza.option_id, k).toMatch(/^OW\d+$/);
      expect(weeksUsingOption(wk.pizza.option_id)).toContain(k);
    });
  });

  it('coûts conformes au Sommaire du classeur', () => {
    // valeurs littérales de l'onglet Sommaire
    const attendu = {
      S1: [28.03, 12.73, 6.9, 47.66, 7.34], S2: [29.93, 7.62, 7.54, 45.09, 9.91],
      S3: [32.22, 14.63, 8.28, 55.13, -0.13], S4: [27.13, 14.92, 7, 49.05, 5.95],
      S5: [30.64, 12.78, 7.2, 50.62, 4.38], S6: [34.38, 12.42, 8.04, 54.84, 0.16],
      S7: [34.04, 25.62, 7.04, 66.7, -11.7], S8: [39.93, 5.64, 7.94, 53.51, 1.49],
      S9: [37.18, 25.92, 6.14, 69.24, -14.24],
    };
    WEEK_KEYS.forEach((k) => {
      const c = weekCosts(k);
      expect([c.courses_recettes, c.placard, c.weekend, c.total, c.marge], k).toEqual(attendu[k]);
      expect(c.gachis).toBeGreaterThan(0);
      expect(c.stock).toBeGreaterThan(0);
    });
  });

  it('moyennes nutritionnelles = celles du Sommaire', () => {
    const kcal = { S1: 813, S2: 771, S3: 933, S4: 799, S5: 878, S6: 843, S7: 893, S8: 903, S9: 810 };
    WEEK_KEYS.forEach((k) => {
      expect(RAW.weeks[k].nutrition_moyenne.kcal, k).toBe(kcal[k]);
      expect(Math.abs(weekNutrition(k).kcal - kcal[k]), k).toBeLessThanOrEqual(1);
    });
  });

  it('liste de courses Chronodrive : courses + week-end + placard, total = total prévu', () => {
    WEEK_KEYS.forEach((k) => {
      const rows = weekShopping(k);
      const wk = RAW.weeks[k];
      expect(rows.length, k).toBe(wk.courses.length + wk.weekend.length + wk.placard.length);
      expect(weekBudget(k).recipesTotal, k).toBeCloseTo(wk.couts.total, 2);
    });
  });

  it('retirer une recette retire les produits qui ne servent qu’à elle', () => {
    // S1 : le chorizo ne sert qu'à la recette 9
    const avant = weekShopping('S1').map((r) => r.name);
    const apres = weekShopping('S1', { R09: true }).map((r) => r.name);
    expect(avant).toContain('Auchan chorizo doux 24 tranches 120 g');
    expect(apres).not.toContain('Auchan chorizo doux 24 tranches 120 g');
    // l'oignon sert aussi à d'autres recettes : il reste
    expect(apres).toContain('Oignon jaune 1 kg');
  });
});

describe('catalogue & méthode', () => {
  it('catalogue week-end et texte de la méthode importés', () => {
    expect(OPTIONS_WEEKEND.length).toBe(27);
    expect(OPTIONS_WEEKEND.filter((o) => o.categorie === 'pizza').length).toBe(13);
    expect(METHODE.length).toBeGreaterThanOrEqual(9);
    expect(METHODE.some((p) => p.startsWith('Mise à jour du 12/10/2026'))).toBe(true);
  });
});
