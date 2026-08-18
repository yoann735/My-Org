/* ============================================================
   MyOrg — bascule « UI d'avant » (mode classique).

   UN SEUL drapeau, lu AVANT le premier rendu, qui choisit entre :
   - la direction « Motion Lab » (défaut) ;
   - l'UI d'origine, exactement telle qu'elle était avant le portage.

   POURQUOI ÇA SUFFIT À TOUT ANNULER. Le portage a été fait pour être
   réversible d'un bloc :
   - toute la couche visuelle vit dans `src/styles/medrevise-theme.css`,
     chargé EN DERNIER ; ne pas le charger rend la cascade d'origine ;
   - les 201 rayons tokenisés dans design.css / etudes.css sont tous écrits
     `var(--r-x, <valeur d'origine>)` : sans le fichier de thème, `--r-x`
     n'existe pas et le repli EST la valeur d'avant ;
   - il ne reste que cinq écarts en JavaScript (palette des matières, presets
     d'accent, halo de bordure, loader L6, marqueur de portée), tous branchés
     sur `isClassicUI()`.

   POURQUOI UN RECHARGEMENT À LA BASCULE. La décision doit être prise avant
   que React monte : c'est ce qui garantit le bon ORDRE des feuilles de style
   (le thème après le bundle, jamais l'inverse), la relecture des constantes
   de module (palettes, accents) et le passage du garde-fou d'accent de
   `useSharedTheme`. Basculer à chaud laisserait un état hybride ; recharger
   donne la parité exacte, pour le prix d'un aller-retour de 200 ms.

   PORTÉE : le fichier de thème est global (les deux apps le reçoivent depuis
   l'étape 1). L'interrupteur l'est donc aussi — il rend son UI d'avant à
   MealWeek en même temps qu'à MedRevise.
   ============================================================ */

export const UI_MODE_KEY = 'ui.classic';

/** Vrai si l'utilisateur a demandé l'UI d'avant. Lu en direct dans
    localStorage (pas de cache) : appelable au tout début de main.jsx, avant
    que quoi que ce soit d'autre ne soit évalué. */
export function isClassicUI() {
  try {
    return JSON.parse(localStorage.getItem(UI_MODE_KEY)) === true;
  } catch (e) {
    return false; // stockage corrompu ou indisponible → direction actuelle
  }
}

/** Bascule et recharge. Le rechargement fait partie du contrat (voir en-tête),
    ce n'est pas un raccourci : c'est ce qui rend la bascule exacte. */
export function setClassicUI(on) {
  try {
    localStorage.setItem(UI_MODE_KEY, JSON.stringify(!!on));
  } catch (e) {
    return; // rien écrit → ne pas recharger sur un état non enregistré
  }
  window.location.reload();
}
