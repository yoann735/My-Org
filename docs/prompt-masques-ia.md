# Prompt IA — masques d’une flashcard image

Texte copié par le bouton **« Copier le prompt IA »** de l’éditeur de flashcard image (MedRevise). À coller **avec l’image**
dans n’importe quelle IA (Claude, ChatGPT, Gemini…) ; la réponse (le JSON) se colle ensuite avec **« Coller des masques »**.
Format : [format-masques-ia.md](format-masques-ia.md).

Source unique : `src/medrevise/lib/masquesIA.js` (`PROMPT_MASQUES_IA`). Ce fichier en est une copie exacte, régénérée par
`node scripts/tests-masques-ia/doc-prompt.mjs`.

```text
Tu prépares des flashcards à masques (occlusion d'image) à partir de l'image jointe : un schéma dont les étiquettes (les noms des structures) doivent être cachées par des rectangles.

RÉPONDS UNIQUEMENT AVEC LE JSON CI-DESSOUS : pas de phrase avant ou après, pas d'explication, pas de balise de code.

{"format":"medrevise-masques","version":1,"masques":[{"label":"Tubercule de Gerdy","x":0.012,"y":0.171,"w":0.180,"h":0.024}]}

COORDONNÉES
- Un masque = un rectangle : x, y = son coin HAUT-GAUCHE ; w = sa largeur ; h = sa hauteur.
- Toutes les valeurs sont des FRACTIONS de l'image entière, entre 0 et 1 : x et w divisés par la largeur de l'image, y et h divisés par sa hauteur. Origine en haut à gauche. 3 décimales.
- Exemple : une étiquette qui commence à 10 % de la largeur et à 50 % de la hauteur, large de 15 % et haute de 2 % → "x":0.100,"y":0.500,"w":0.150,"h":0.020.

QUOI MASQUER
1. Un masque par étiquette. Une étiquette = le nom d'UNE structure, relié en général à l'image par un trait (plein ou pointillé).
2. Une étiquette écrite sur plusieurs lignes (ex. « Gaines tibiales / pour les / ligaments croisés ») = UN SEUL masque qui couvre toutes ses lignes, de la première à la dernière.
3. Le rectangle couvre TOUT le texte de l'étiquette (première et dernière lettre, accents, lettres qui descendent comme p, g, q) avec une petite marge, sans couvrir le trait de rappel ni le dessin.
4. Une même étiquette présente à plusieurs endroits (ex. dans deux vues) = un masque à CHAQUE endroit, chacun à sa place.

NE MASQUE JAMAIS
- les titres et sous-titres (titre de la page, « Vue antérieure », « Vue postérieure »…) ;
- les repères d'orientation (Crânial, Caudal, Médial, Latéral, flèches…) ;
- les numéros de page, les légendes, les sources, les copyrights.

LABEL
- "label" = le texte EXACT de l'étiquette, recopié lettre par lettre tel qu'il est écrit sur l'image, même s'il contient une faute ; les lignes d'une étiquette sont réunies avec une espace.

AVANT DE RÉPONDRE
1. Compte toutes les étiquettes de l'image, zone par zone (de haut en bas, à gauche puis à droite de chaque dessin).
2. Vérifie que la liste "masques" contient exactement ce nombre d'éléments, qu'aucune étiquette n'est oubliée et qu'aucun titre ni repère n'a été pris.
3. Vérifie chaque rectangle : il contient tout le texte de son étiquette et rien d'autre.
Puis réponds UNIQUEMENT avec le JSON.
```
