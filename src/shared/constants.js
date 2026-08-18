/* shared UI constants */
import { isClassicUI } from './uiMode.js';

/** Presets d'accent — alignés sur le spectre de la direction « Motion Lab »
   (étape 1 des tokens, voir src/styles/medrevise-theme.css).

   POURQUOI CETTE LISTE DOIT SUIVRE LA DIRECTION : useSharedTheme applique
   l'accent choisi en STYLE INLINE sur <html>, ce qui l'emporte sur toute
   feuille de style. Une liste restée pastel écraserait donc le violet validé
   à chaque chargement. Le violet est en tête : c'est l'accent de la direction,
   et le garde-fou de useSharedTheme (« accent inconnu → ACCENTS[0] ») bascule
   automatiquement les accents pastel déjà enregistrés vers lui.
   Le texte posé sur l'accent utilise --on-accent.

   ET C'EST CE MÊME GARDE-FOU QUI REND LA BASCULE EXACTE : en mode « UI
   d'avant », la liste redevient les quatre pastels d'origine, et l'accent
   enregistré (violet du spectre) est vu comme inconnu, donc ramené sur
   Lavande — la valeur d'avant. La bascule inverse fait le chemin retour.
   CONTREPARTIE ASSUMÉE : un accent choisi à la main dans un mode ne survit
   pas à l'aller-retour, puisque les deux listes sont disjointes. */
export const ACCENTS = isClassicUI()
  ? [
    { name: 'Lavande', v: '#B0A4EE' },
    { name: 'Bleu ciel', v: '#9AC4F2' },
    { name: 'Menthe', v: '#93D6B6' },
    { name: 'Corail', v: '#F2A38F' },
  ]
  : [
    { name: 'Violet', v: '#a47bff' },
    { name: 'Cyan', v: '#17b2ff' },
    { name: 'Vert', v: '#02cd88' },
    { name: 'Rose', v: '#fa8aec' },
    { name: 'Lime', v: '#c4d423' },
  ];
