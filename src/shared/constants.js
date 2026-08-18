/* shared UI constants */

/** Presets d'accent — alignés sur le spectre de la direction « Motion Lab »
   (étape 1 des tokens, voir src/styles/medrevise-theme.css).

   POURQUOI CETTE LISTE DOIT SUIVRE LA DIRECTION : useSharedTheme applique
   l'accent choisi en STYLE INLINE sur <html>, ce qui l'emporte sur toute
   feuille de style. Une liste restée pastel écraserait donc le violet validé
   à chaque chargement. Le violet est en tête : c'est l'accent de la direction,
   et le garde-fou de useSharedTheme (« accent inconnu → ACCENTS[0] ») bascule
   automatiquement les accents pastel déjà enregistrés vers lui.
   Le texte posé sur l'accent utilise --on-accent. */
export const ACCENTS = [
  { name: 'Violet', v: '#a47bff' },
  { name: 'Cyan', v: '#17b2ff' },
  { name: 'Vert', v: '#02cd88' },
  { name: 'Rose', v: '#fa8aec' },
  { name: 'Lime', v: '#c4d423' },
];
