# Rapport de nuit — 2 octobre 2026 (2e chantier) : dessiner sur le téléphone, poser sur le PDF

> Le rapport du 1er chantier de la soirée (icônes, formes, couleurs, flèches) est dans le
> commit `b56ca58` (`git show b56ca58:docs/rapport-nuit.md`).

**Le flux complet marche, testé en vrai sur deux appareils simulés :**
1. l'ordi ouvre une fiche ;
2. le téléphone affiche « Sur l'ordi : *fiche* » ;
3. on dessine au doigt ;
4. Exporter : la fiche de l'ordi est proposée par défaut ;
5. le dessin arrive dans l'onglet **Dessins** du lecteur de l'ordi, **7,4 s** après
   « Envoyer » ;
6. un glisser-déposer le pose sur la page, en image collée.

La mécanique est écrite d'abord dans **`docs/mecanique-dessin-mobile.md`**. Aucun point
de la liaison cloud n'était risqué : tout passe par le canal existant, sans SQL ni
nouvelle table. J'ai donc enchaîné sur le code, étape par étape.

**Garanties :**
- **Ton cloud n'a jamais été touché**, ni en lecture ni en écriture. Tous les tests
  passent par un **faux Supabase local**, qui reproduit l'API utilisée (RPC
  conditionnelle, lecture, bucket). Il est gardé dans `scripts/faux-supabase.mjs` pour
  de futurs tests.
- **Deux Chrome isolés** :
  - un « ordi » en 1 440 × 900 ;
  - un « téléphone » en 390 × 844, avec émulation tactile et de vrais gestes au doigt
    (pincement compris).
- **MealWeek : 0 fichier modifié.** `src/shared` n'est pas touché.
- **Aucune donnée existante réécrite** : deux stores neufs seulement, aucune migration.
- 0 erreur console.

| Commit | Étape |
|---|---|
| `dd45bd7` | 1. Mécanique (`docs/mecanique-dessin-mobile.md`) |
| `76ee3e3` | 2. Données + liaison ordi ↔ téléphone par le cloud |
| `13137a4` | 3. Canvas tactile du téléphone |
| `e374ce3` | 4. Export PNG vers une fiche |
| `90bff7d` | 5. Onglet « Dessins » de l'ordi + glisser-déposer sur le PDF |

---

## La mécanique choisie, en bref

- **Liaison (« quelle fiche est ouverte sur l'ordi »)** : un enregistrement unique,
  `liaison/ficheActive`.
  - L'ordi l'écrit à l'ouverture et à la fermeture d'une fiche dans le lecteur, rien à
    chaque page.
  - Le téléphone le lit par une **lecture ciblée** de ce seul store, sans relire toute
    la table : au montage, au retour sur l'app, puis toutes les 10 s tant que l'écran
    est visible.
- **Dessins** : un enregistrement `dessins/<id>` par dessin envoyé (fiche, taille, date).
  - Le PNG voyage par le **canal des blobs existant** (outbox + bucket, avec
    retentatives).
  - **Ordre garanti** : l'image est confirmée au cloud **avant** que l'entrée soit
    écrite. L'ordi ne voit donc jamais une entrée sans son image (vérifié dans le
    journal du faux cloud).
- **Ce qui ne peut pas casser** :
  - `reconcileAll`, la réconciliation critique, **n'est pas modifié** ;
  - la synchro ciblée est une fonction à part, limitée par liste blanche aux deux
    nouveaux stores ;
  - les écritures passent par la RPC conditionnelle existante, une ligne à la fois ;
  - les anciens clients ignorent les nouveaux stores.
- **Réversible** : retirer la fonctionnalité laisse deux stores inutilisés et quelques
  PNG dans le bucket.

## Ce qui est codé et testé

**1. Liaison** : l'ordi ouvre la fiche, et le cloud reçoit
`{ ficheId: 'fi_test', ouverte: true }`. Le téléphone affiche ● « Sur l'ordi : Fiche de
test formes ». Quand l'ordi a quitté la fiche, il affiche « Dernière fiche ouverte sur
l'ordi : … ».

**2. Canvas tactile** (téléphone : accueil → carte **Dessin** → **Dessiner**) :
- **un doigt** dessine avec l'outil actif :
  - crayon, surligneur (translucide) ;
  - **12 formes** (les mêmes que dans le lecteur) ;
  - **gomme** (efface l'élément touché) ;
  - main ;
- **deux doigts** : déplacer et zoomer en pinçant. Un 2e doigt posé abandonne le trait en
  cours ;
- **couleurs** : le même système que partout (4 couleurs de base, tes couleurs
  synchronisées, roue) ;
- **5 épaisseurs**, annuler / rétablir, tout effacer (annulable), recentrer ;
- **brouillon** gardé sur le téléphone si on quitte l'écran.

Testé au doigt :
- 2 traits + ellipse + flèche ;
- pincement : `scale(2.5)`, **aucun trait parasite** ;
- gomme : `3 → 2` ;
- annuler / rétablir : `3 → 2 → 1 → 0 → 1 → 2 → 3`.

**3. Export** : la feuille propose **la fiche ouverte sur l'ordi en tête**, avec une
recherche dans les fiches et les documents de Prise de notes, et un fond transparent (par
défaut) ou blanc. Le dessin est rendu en PNG net (×2, côté le plus long plafonné à
2 400 px).

Testé : PNG de 27 Ko envoyé au bucket, **puis** l'entrée, « Envoyé » en 1,2 s.
**Hors ligne** : « Prêt — en attente de réseau ». Rien n'arrive sur l'ordi pendant la
coupure ; **le dessin arrive tout seul 8 s après le retour du réseau**.

**4. Ordi** : un onglet **Dessins** (avec son nombre) dans le panneau de droite du
lecteur PDF :
- vignettes datées, avec un badge **Nouveau** / **Posé** ;
- **glisser** une vignette sur une page la pose au point de dépôt ; **« Poser »** la pose
  au centre de la page affichée ;
- l'image posée est une image collée ordinaire (déplacer, redimensionner, calques,
  Cmd+Z, export PDF annoté). Elle **réutilise le blob du dessin**, sans copie ;
- **« Retirer »** ne retire que l'entrée de la liste : l'image déjà posée reste, le
  fichier n'est pas supprimé.

Testé :
- glisser-déposer natif (intercepté par Chrome) : `images 0 → 1`, même blob que le
  dessin ;
- « Poser » : `1 → 2` ;
- Cmd+Z : `→ 1` ;
- Retirer : `dessins 2 → 1`, image posée intacte, au cloud seule l'entrée est marquée
  supprimée.

## Bugs trouvés en route (corrigés)

1. **Liaison fausse après un remontage rapide du lecteur.** Trois écritures
   asynchrones se croisaient, et la fiche pouvait être ouverte avec `ouverte: false` au
   cloud. Les publications sont maintenant mises en file.
2. **Annuler sur le téléphone** : le 1er « annuler » ne faisait rien, le 3e en sautait
   deux. L'état était relu trop tard par React. Il est maintenant capturé avant la mise à
   jour.
3. **Pointe de flèche énorme** avec un trait épais sur le téléphone : elle est plafonnée.
4. **Dessin posé deux fois trop grand** (PNG rendu en ×2) : la taille de départ tient
   compte de l'échelle.
5. **Faux bug écarté** : le lecteur se refermait entre deux de mes scripts. C'était le
   Chrome de test qui reprenait sa taille par défaut à la déconnexion. L'app n'est pas en
   cause.

## Non-régression

**Lecteur** (avec la synchro active, sur le faux cloud), comme avant :
- crayon, texte libre, « ? » ;
- boîte et sa flèche principale ;
- export PDF annoté : le dessin posé y sort (`images: 1`), avec le reste, et le PDF
  d'origine est identique (SHA-256 `ed13189d…` avant et après).

Les formes, les couleurs et le tableau ne sont pas retestés dans ce chantier ; leur code
n'est pas modifié.

**Écrans** : Accueil, Réviser, Bibliothèque, Carnet, Apprentissage, Prise de notes, tous
sans erreur. **MealWeek** s'ouvre normalement. L'accueil du téléphone garde la série du
jour et la synchro ; la carte Dessin s'ajoute sous la série.

## Ce qui reste, ou que je n'ai pas fait par sécurité

- **Le premier vrai aller-retour avec ton cloud n'a pas été fait** : il aurait fallu
  écrire dans tes données réelles. Tout est prouvé sur un faux Supabase qui imite l'API.
  Rien ne demande de SQL : la table accepte déjà tout nom de store. **À faire en premier
  au réveil** :
  1. ouvre une fiche sur l'ordi (version déployée) ;
  2. sur le téléphone, vérifie la carte « Sur l'ordi : … » ;
  3. envoie un petit dessin ;
  4. il doit apparaître dans l'onglet Dessins en une dizaine de secondes.
- **Le téléphone ne réagit pas instantanément** : sondage toutes les 10 s, donc 5 à 10 s
  de latence typique. Le temps réel (Supabase Realtime) serait possible, mais il demande
  d'activer la réplication sur la table, côté serveur. Je ne l'ai pas touché.
- **Pas fait** :
  - texte dans le dessin mobile ;
  - sélection et déplacement d'un élément déjà dessiné sur le téléphone (on annule, on
    gomme, ou on redessine) ;
  - export de plusieurs pages ;
  - envoi vers une page précise : on choisit la page en déposant.
- **Pas d'onglet Dessins sur les fiches HTML** (ni dans le mode Tableau) : un dessin ne
  se pose que sur un PDF, d'où l'onglet seulement là.
- **Données de test** : uniquement dans les deux Chrome isolés et le faux cloud (en
  mémoire), rien dans ton app.
