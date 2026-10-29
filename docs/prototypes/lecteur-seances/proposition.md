# Lecteur de cours avec plusieurs fiches : proposition (essai 2, 29/10/2026)

Prototype : [`index.html`](index.html), à ouvrir dans un navigateur. Audit de l'existant : [`audit.md`](audit.md).
Le premier essai (3 versions) est archivé dans [`essai-1/`](essai-1/).

## Pourquoi j'ai tout recommencé

Ton retour sur le premier essai : impossible à comprendre sans explication. Tu avais raison, et voici pourquoi :

- **Trop de concepts nouveaux d'un coup** : rail de séances, accueil de cours, colonne Sources, ruban de 300 pages, mode direct, tiroir, palette ⌘K. Chacun se défendait seul ; ensemble, ils faisaient une autre app.
- **J'ai jeté une base qui marchait.** Le lecteur actuel est clair : un document au centre, des outils en haut, un panneau à droite. Le vrai problème est plus étroit. On ne peut avoir **qu'une seule fiche** par cours, et on ne sait pas **quelle fiche va avec quelle séance**.
- **Les maquettes étaient illisibles** : des pages remplies de barres grises, une barre de prototype avec 7 scénarios, 3 appareils et 2 thèmes. On ne voyait pas à quoi servaient les choses.

**Règle de l'essai 2 : quelqu'un qui n'a jamais vu l'app doit s'en servir sans explication.** Donc :

- on garde l'écran actuel tel quel ;
- on ajoute seulement ce qui manque, à l'endroit où on le chercherait ;
- chaque ajout porte l'étiquette « Nouveau » et s'explique par son libellé.

## Les 4 ajouts (rien d'autre ne change)

| # | Ajout | Où | Pourquoi c'est compréhensible sans aide |
|---|---|---|---|
| 1 | **Menu du document** : le bouton « Original · Fiche » devient un menu déroulant qui affiche le document en cours (ex. « S2 · DFG et ses déterminants ▾ »). Il liste la diapo du cours, puis les fiches **rangées par séance** (date et pages). | Même place que la bascule actuelle | C'est un menu déroulant ordinaire. Il dit ce qu'on regarde et ce qu'on peut regarder d'autre |
| 2 | **Ajouter une fiche de résumé…** On dépose le PDF et on répond à **une** question : « Elle résume quelle séance ? ». La séance est déjà proposée. La diapo ne change pas. | Menu Fichier, et en bas du menu du document | Une fenêtre, une question, un bouton |
| 3 | **Diapo d'origine** : chaque page de fiche porte en haut à droite « Diapo p. 63–66 ↗ ». Un clic ouvre la diapo à cette page, avec un bouton « ← Revenir à la fiche ». | Sur la page de fiche | Le lien dit où il mène, et le retour dit d'où on vient |
| 4 | **Transcrire marque le cours** : au démarrage, une case cochée « Marquer le début du cours sur la page 244 ». « Arrêter » marque la fin. L'onglet Trans. liste les **séances enregistrées** (titre, date, durée, pages). | Onglet Trans. du panneau (existant) | Plus besoin de poser les tags Début / Fin à la main. Les séances apparaissent toutes seules, avec un nom lisible |

Correction en passant : on peut **taper un numéro de page**, ce qui est indispensable avec 300 pages.

Tout le reste ne bouge pas : outils, zoom, panneau Exos / Trans. / Notes / Notions, disposition PDF / Les deux / Tableau, tags posés à la main (toujours possibles, pour corriger).

## Ce que j'ai volontairement laissé de côté

Ce sont de bonnes idées, mais pas maintenant : chacune ajoute un concept à apprendre.

- Écran d'accueil du cours, rail des séances, ruban des 300 pages (essai 1).
- Colonne « Sources » qui suit la page lue, et volets synchronisés. Le lien n° 3 donne déjà l'essentiel, en un clic.
- Filtres « cette séance » dans les flashcards et les notions.
- Lecture sur téléphone.

On pourra les reprendre **une par une**, si un vrai besoin apparaît à l'usage.

## Ce qu'il faut côté données (minimum)

- **Plusieurs fiches par cours.** Aujourd'hui `companion_pdf` n'en accepte qu'une (`id = 'cp:' + coursId`). Il faut un id par fiche, avec deux champs en plus : `titre` et `seance`.
  - On garde le reste tel quel : `fileId`, `nsAnnot`, `pageMap`, `versions`.
  - **La fiche actuelle de chaque cours reste valable**, avec les mêmes annotations : on garde son `nsAnnot`. On fait un `putBackup` avant.
- **Séance** : on ne crée pas de nouvelle notion. Une séance reste un couple de tags Début / Fin (comme aujourd'hui), avec sa date et sa session de transcript.
  - Le direct pose les tags automatiquement.
  - La fiche pointe vers la séance par le tag Début (`seance: <id du tag Début>`), ou à défaut par une plage de pages.
- **Lien n° 3** : déjà disponible, c'est `pageMap.versOrig` (calculé à l'import de la fiche jumelle aujourd'hui). Il faut juste l'afficher.

## Chantiers

1. **Plusieurs fiches** : modèle (`companion_pdf` multiple + migration sans perte), menu du document, fenêtre « Ajouter une fiche de résumé », menu Fichier mis à jour, liste dans « Fichiers du cours et séances ».
2. **Lien diapo d'origine** sur chaque page de fiche + bouton Revenir ; saisie du numéro de page.
3. **Transcrire marque le cours** : tags Début / Fin automatiques, liste des séances enregistrées dans l'onglet Trans.

Chaque chantier est petit, se livre seul et ne casse rien de l'existant.
