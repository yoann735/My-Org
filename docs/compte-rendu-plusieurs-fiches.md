# Plusieurs fiches de résumé par cours (29/10/2026)

**Le besoin** (étude : `docs/prototypes/lecteur-seances/`) : un gros diapo couvre plusieurs séances, et chaque séance a sa ou ses fiches de résumé. Jusqu'ici, un cours n'acceptait qu'**une** fiche : en importer une deuxième **remplaçait** la première.

**La règle de ce chantier** : on ajoute l'option, on ne casse rien de ce qui existe.

## Ce qui change à l'écran

| Où | Quoi |
|---|---|
| **Fichier › Cours** | Nouvelle entrée **« Ajouter une fiche de résumé… »**. Sans fiche, elle fait l'import habituel. Avec une fiche, elle en **ajoute** une autre : la diapo et les fiches déjà là ne changent pas. |
| **Fenêtre d'import** | Après le résumé habituel (pages associées / ajoutées), deux champs : **Nom de la fiche** et **« Elle résume quelle séance ? »**. Les séances listées viennent des tags Début / Fin de la diapo. La séance est **proposée** seulement si elle contient au moins 60 % des pages reprises par la fiche ; sinon c'est « Aucune séance en particulier ». Ces champs n'apparaissent pas pour un remplacement. |
| **Barre du lecteur** | À partir de **2 fiches**, un menu à côté du segment **Original · Fiche** (qui ne change pas) affiche la fiche choisie, par exemple « S2 · Fiche courte ». Il liste la diapo, puis les fiches **rangées par séance** (date, pages), puis « Ajouter une fiche de résumé… ». |
| **Fichier › section Fiche** | Inchangée : elle agit sur la **fiche choisie** (exporter, correspondance, remplacer, supprimer). |
| **Fichiers du cours** | La ligne de la fiche affichée indique combien d'autres fiches il y a dans le cours. |

**Avec une seule fiche, l'écran est strictement celui d'avant** : pas de menu de choix, même segment, même fenêtre (avec en plus le nom et la séance, facultatifs). Les raccourcis Tab et ⌘⇧F basculent toujours entre l'original et la fiche choisie.

Captures (`docs/img/plusieurs-fiches/`) :

- `ordi-1-une-fiche` : une seule fiche, écran inchangé ;
- `ordi-2-fenetre-ajout` : fenêtre d'ajout ;
- `ordi-3-deux-fiches` et `ordi-4-menu-choix` : deux fiches et le menu de choix ;
- `ordi-5-suppression` et `ordi-6-apres-suppression` : suppression de la fiche ajoutée ;
- `tablette-menu-choix` et `tablette-fiche-choisie` : la même chose sur tablette.

## Données : rien à migrer

- **La fiche déjà importée ne bouge pas.** Même enregistrement `companion_pdf` d'id `cp:<cours>`, même calque d'annotations `<cours>::fiche:<version>`, mêmes versions.
- **Une fiche en plus** est un autre enregistrement du même store : `cp:<cours>:<clé>`, avec `cle`. Son calque d'annotations lui est propre : `<cours>::fiche-<clé>:<version>`. Il commence par `<cours>::fiche`, comme l'attend la suppression du cours. Le remplacement d'une fiche en plus garde son calque (`nsDeVersion`).
- **Champs facultatifs** sur toute fiche :
  - `titre` : le nom affiché, par défaut le nom du fichier ;
  - `seance` : `{ tagId, date, de, a }`, un instantané de la séance choisie.
- **Fiche choisie** : préférence de l'appareil, `localStorage medrevise.jumelle.active.<cours>`. Sans choix, c'est la première fiche.
- **Positions de lecture** : une par calque, comme avant. Chaque fiche rouvre donc à sa dernière page.
- **Synchronisation** : rien de nouveau. Le store `companion_pdf` et le canal des fichiers (blobs) sont déjà synchronisés.

## Deux défauts corrigés au passage (ils seraient apparus avec plusieurs fiches)

1. **Supprimer une fiche** retirait les annotations par le préfixe `<cours>::fiche:`. Ce préfixe aurait aussi attrapé les calques des autres fiches. Désormais, seuls les calques **de cette fiche** sont retirés (`prefixeCalques`), et l'enregistrement retiré est celui de la fiche (`rec.id`). Le compte affiché dans la fenêtre de suppression suit la même règle.
2. **Supprimer le cours** (`purgeFiche`) ne retirait que `cp:<cours>`. Il retire maintenant **toutes** les fiches du cours.

Dernier point : le lien d'une flashcard vers sa boîte d'origine choisit la bonne fiche si la boîte est sur une fiche ajoutée.

## Tests

- **Vitest** : `tests/plusieurs-fiches/fiches.test.js`, 7 tests.
  - La fiche d'avant garde son id et son calque.
  - Ordre des fiches.
  - Supprimer la fiche ajoutée ne touche que ses 2 annotations, avec une sauvegarde avant.
  - Supprimer la première fiche ne touche pas la fiche ajoutée : c'est le cas qui aurait cassé avant le correctif.
  - Supprimer le cours retire tout.
  - `modifierFiche` ne change que le nom et la séance.
  - Séance proposée, y compris pour une fiche qui couvre tout le diapo.
  - Toute la suite : 199 sur 200. Le seul échec, `crayon › trois épaisseurs`, **existait déjà** avant ce chantier.
- **Non-régression, banc de la fiche jumelle** (Vite :5199 sans Supabase, Chrome headless, base de test) :
  - séquence import, bascule, calques, éditeur, tablette, remplacer : **54 sur 55**, résultat **identique sur l'ancien et le nouveau code**. La vérification « p.1 → p.1 (boîte et surlignage) » de `t-jumelle-remplacer` échouait déjà avant.
  - couleurs et téléphone : 11 sur 11 ; sans « les deux » : 9 sur 9 ;
  - cours « document » (import, éditeur, bascule, panneau, tablette) : **42 sur 42** ;
  - correspondance des pages : 100 % sur les 3 fiches de test.
- **Nouvelle option** : `scripts/tests-fiche-jumelle/t-plusieurs-fiches.mjs`, **28 sur 28** sur ordinateur.
  - Une fiche : écran d'avant.
  - Ajout : fenêtre, nom, séance.
  - Deux calques distincts, la première fiche inchangée.
  - Menu rangé par séance ; choix d'une fiche ; Tab ; la fiche choisie reste après un rechargement.
  - Suppression de la fiche ajoutée : la première et toutes les annotations intactes, le menu disparaît.
  - 0 erreur JS.
- **Tablette** : `t-plusieurs-fiches-tablette.mjs`, **7 sur 7**. Le menu est au-dessus de la page, cible de 36 px, lignes de 44 px, choix au doigt, segment Original inchangé.

Le test a trouvé un défaut : dans la barre, le menu de choix s'ouvrait **sous** la page, qui recevait alors le clic. Corrigé : le menu est posé sur `document.body` en position fixe, comme le menu Fichier.

## Limites connues (volontairement hors de ce chantier)

- Les tags Début / Fin posés **sur une fiche** (et pas sur la diapo) restent communs à toutes les fiches, comme avant. Les séances, elles, se lisent sur la diapo.
- Une ligne de transcript dite pendant qu'une fiche était affichée ramène à « la fiche choisie », sans retenir laquelle.
- Le menu Fichier compte une ligne de plus. Il défilait déjà légèrement sur un écran de 900 px de haut ; c'est toujours le cas.
- Pas de test à deux appareils pour une fiche ajoutée : elle passe par le même store synchronisé que la fiche existante.
