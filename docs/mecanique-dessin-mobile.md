# Mécanique — dessiner sur le téléphone, poser le dessin dans le PDF de l'ordi (2 octobre 2026)

Le téléphone devient une tablette graphique :
1. sur l'ordi, une fiche est ouverte (ex. Ostéologie) ;
2. sur le téléphone, MedRevise sait laquelle ;
3. on y dessine au doigt sur un grand canvas ;
4. on exporte le dessin en image vers cette fiche ;
5. sur l'ordi, il arrive dans un onglet **Dessins** du lecteur ;
6. un glisser-déposer le pose sur le PDF, comme une image collée.

**Tout passe par le cloud existant (Supabase).** Il n'y a aucune liaison directe entre
les deux appareils. Quelques secondes de latence sont acceptées.

---

## 1. Audit — ce qui se réutilise, ce qui est neuf

| Besoin | Existant réutilisé | Neuf |
|---|---|---|
| Faire voyager de petites données | `lib/storage.js` : `put` / `remove` horodatent et mettent en file la synchro (outbox IndexedDB, puis RPC `medrevise_push` en last-write-wins **côté serveur**) pour tout store de `SYNCABLE`. La table `medrevise_records` a une colonne `store` en **texte libre**, sans contrainte (vérifié dans `MEDREVISE_SUPABASE_SYNC.md`) : **aucun SQL à exécuter** | deux stores : `liaison` et `dessins` |
| Faire voyager l'image | `putBlob`, outbox des blobs, upload dans le bucket `medrevise-blobs`, retentatives. `getBlob` va chercher au cloud un blob absent en local | — |
| Lire le cloud vite | `pullAllRecords` lit **toute** la table (environ 1 200 lignes, paginées) : trop lourd pour sonder toutes les 10 s | `pullStore(nom)` : la même lecture paginée, filtrée sur **un** store, en lecture seule |
| Image posée sur le PDF | `newImageCollee` et `ajouterImage` du lecteur : déplaçable, redimensionnable, calques, annuler, export PDF annoté | `ajouterImage` accepte un blob **déjà stocké** : pas de copie |
| Dépôt sur une page | `deposerImage` (fichiers glissés depuis le Finder) | un type de glisser maison `application/x-medrevise-dessin` |
| Panneau de droite | `CourseItemsSidebar`, option `ongletsEnPlus` (déjà utilisée pour « Notions ») | onglet **Dessins** |
| Couleurs, perso synchronisées, roue | `SelecteurCouleurs` (pdf/Couleurs.jsx) | — |
| Formes | `pdf/formes.js` : les 12 tracés, en pixels, avec pointes | — |
| Lissage du trait | `suivreEnDouceur`, `lisserTrait`, `cheminLisse` (pdfShared.js) | — |
| App mobile | `mobile/MobileApp.jsx` : un routeur local, une seule tâche (« faire ses J »). Aucun lecteur PDF | écran `MobileDessin` + une carte d'entrée sur l'accueil |
| Canvas mobile | Le dessin du lecteur est lié à une page de PDF (coordonnées en fraction de page, calques par page). Il ne se réutilise pas tel quel | un canvas infini, en SVG, avec pan et pincement |

**Pourquoi le canvas mobile n'est pas le composant du lecteur :** dans le lecteur, le
dessin est collé à une page de PDF (fractions de page, rendu par page, couche de texte,
verrous anti-sélection). Le mobile n'a pas de page : il lui faut une surface libre,
zoomable au doigt. On réutilise donc les **briques** (lissage, formes, couleurs, gomme
par distance), pas le composant.

## 2. La liaison mobile ↔ ordi, par le cloud

### 2.1 « Quelle fiche est ouverte sur l'ordi ? »

Un enregistrement **unique** du nouveau store `liaison` :

```
{ id: 'ficheActive', ficheId, titre, ouverte: true|false, appareil: 'ordi', depuis: ISO }
```

- **L'ordi publie** quand le lecteur s'ouvre sur une fiche (`ouverte: true`) et quand il
  se ferme (`ouverte: false`, sans effacer la fiche : le téléphone garde « dernière fiche
  ouverte »).
  - C'est un `put('liaison', …)` ordinaire : outbox, puis RPC conditionnelle, environ
    800 ms plus tard.
  - Seul l'écran **ordinateur** publie : le shell mobile n'ouvre pas de lecteur.
- **Le téléphone lit**, sans attendre une synchro complète :
  - `synchroCiblee('liaison')` : la lecture filtrée sur ce store, puis le même
    last-write-wins que `reconcileAll`, limité à ce store ;
  - au montage de l'accueil et de l'écran Dessin, au retour sur l'onglet, puis **toutes
    les 10 s tant que l'écran est visible** (rien quand il est caché).
- **Deux ordis** : le dernier qui ouvre une fiche gagne. C'est le sens voulu, « la fiche
  sur laquelle je suis ».
- **Coût** : une écriture à l'ouverture ou à la fermeture d'une fiche (pas à chaque
  page) ; une lecture d'une ligne toutes les 10 s, seulement sur l'écran concerné.

### 2.2 Le dessin, du téléphone à l'ordi

Le nouveau store `dessins` contient un enregistrement par dessin envoyé :

```
{ id, ficheId, blobId, largeur, hauteur, titre, envoyeLe, appareil: 'mobile', createdAt }
```

**Ordre d'envoi**, pour que l'ordi ne voie jamais une entrée sans son image :
1. `putBlob(png)` : écrit localement, puis met en file l'envoi vers le bucket ;
2. `flushBlobOutbox()` attendu, puis vérification que le blob a quitté l'outbox, donc
   qu'il est **confirmé au cloud** ;
3. alors seulement, `put('dessins', entrée)`, qui part par l'outbox des enregistrements.

**Hors ligne :**
- l'entrée est quand même écrite en local ;
- les deux outbox l'enverront au retour du réseau (mécanisme existant) ;
- l'écran l'indique : « Envoyé » ou « En attente de réseau ».

**L'ordi reçoit** :
- quand le lecteur est ouvert : `synchroCiblee('dessins')` au montage, au retour sur
  l'onglet, puis **toutes les 10 s si l'onglet est visible** ;
- la liste de l'onglet Dessins est filtrée sur la fiche ;
- l'image passe par `getBlob` (téléchargée au premier affichage, puis gardée en local).
- **Si le blob n'est pas encore lisible** (cas hors ligne), la vignette affiche
  « Image en route… » et se réessaie au tour suivant.

### 2.3 Ce qui ne peut pas casser

- **Rien d'existant n'est réécrit.** Les deux stores sont neufs. Les anciens clients les
  ignorent : `reconcileAll` ne parcourt que **ses** stores.
- **Écritures** : seulement par le canal existant (outbox + RPC conditionnelle, jamais
  d'`upsert` aveugle), une ligne à la fois. Aucune écriture de masse.
- **Lecture ciblée** : nouvelle fonction en **lecture seule**, avec la même règle « tout
  ou rien » que `pullAllRecords` (`null` si une page échoue, jamais un résultat partiel).
- **`synchroCiblee`** n'est permise que pour `liaison` et `dessins` (liste blanche). Le
  `reconcileAll` critique n'est **pas modifié**.
- **Réversible** : retirer la fonctionnalité laisse deux stores inutilisés et quelques
  PNG dans le bucket. Aucune migration.

## 3. Le canvas tactile du téléphone

**Technologie : SVG transformé, comme le tableau.**
- Un `<svg>` plein écran, avec un groupe `<g transform="translate(px,py) scale(z)">` :
  le monde.
- Les éléments sont **vectoriels** : traits (points + couleur + épaisseur + opacité) et
  formes (`formes.js`).
- Annuler, gommer, changer de zoom ne perdent rien ; l'export en PNG est net à toute
  taille.

**Gestes, via les Pointer Events** (`touch-action: none` sur la surface : le navigateur ne
fait ni défilement ni zoom de page) :

| Geste | Effet |
|---|---|
| 1 doigt | l'outil actif : crayon, surligneur, forme, gomme |
| 2 doigts | déplacer + zoomer (pincement), centré entre les doigts |
| 2e doigt posé pendant un trait | le trait en cours est **annulé** (c'était un début de pincement) |
| outil Main | 1 doigt déplace le canvas |
| double tap | rien (pas de zoom navigateur parasite) |

**Fluidité :**
- pendant un trait, on écrit directement l'attribut `d` du chemin en cours (référence
  DOM), **sans rendu React**. React ne reprend la main qu'au lever du doigt ;
- `getCoalescedEvents()` récupère tous les points entre deux images ;
- `suivreEnDouceur` lisse en direct, `lisserTrait` simplifie au lever, `cheminLisse`
  trace en courbes ;
- pan et zoom écrivent `transform` du groupe par `requestAnimationFrame`, et l'état est
  validé à la fin du geste.

**Outils, en barre du bas, au pouce :**
- **Crayon** et **Surligneur** (translucide) ;
- **Formes** : les 12 de `formes.js`, posées par glisser ;
- **Gomme** : efface un élément entier qu'on touche, comme dans le lecteur ;
- **Main**.

**Réglages :**
- couleurs (le même `SelecteurCouleurs` : 4 couleurs de base, mes couleurs
  synchronisées, roue) ;
- **5 épaisseurs** (pastilles de taille réelle) ;
- **annuler / rétablir** (pile de 100 états) ;
- **tout effacer**, annulable ;
- **recentrer**.

**Brouillon** : le dessin en cours est gardé sur le téléphone (localStorage,
best-effort). Quitter l'écran ne le perd pas. Il est vidé après un export réussi, si on le
demande.

## 4. Export (téléphone)

Bouton **Exporter**, puis une feuille :
- **Fiche cible** : par défaut la fiche ouverte sur l'ordi, affichée en tête
  (« ● Sur l'ordi »). Sinon une liste des fiches avec recherche : fiches avec PDF ou
  HTML, et documents de Prise de notes ;
- **Fond** : transparent (par défaut : posé sur le PDF, le dessin ne cache pas le cours)
  ou blanc ;
- **Envoyer**.

**Rendu PNG :**
- boîte englobante du dessin, avec une marge de 16 px ;
- SVG sérialisé, puis `Image`, puis `<canvas>`, à l'échelle 2 ;
- côté le plus long plafonné à 2 400 px. Poids typique : 30 à 300 Ko.

## 5. Côté ordi : l'onglet « Dessins » et le glisser-déposer

- **Onglet « Dessins »** du panneau de droite, avec le nombre de dessins. Vignettes
  datées, la plus récente en haut, une pastille « Nouveau » sur ce qui n'a pas encore été
  posé. Il n'apparaît que sur les documents PDF, le seul endroit où le dessin peut se
  poser.
- **Glisser une vignette sur une page.** Le dépôt passe par `ajouterImage` avec le blob
  **existant** : c'est une image collée ordinaire, centrée sur le point de dépôt.
  - On peut la déplacer, la redimensionner, la mettre au premier plan ;
  - Cmd+Z l'annule ;
  - elle sort dans l'export PDF annoté.
- **Bouton « Poser »** : la même chose, au centre de la page affichée (sans souris
  précise, ou au clavier).
- **Retirer** un dessin de la liste : une suppression de **cet** enregistrement
  (tombstone), demandée par l'utilisateur. Une image déjà posée reste, elle a sa propre
  annotation, et le blob n'est jamais supprimé.
- Un dessin posé reste dans la liste : on peut le poser à nouveau ailleurs.

## 6. Stockage, poids, réversibilité

- `liaison` : 1 enregistrement au total. `dessins` : 1 par dessin envoyé (quelques
  centaines d'octets). Le PNG vit dans le bucket existant.
- **Purge d'une fiche** (corbeille) : ses dessins sont retirés avec elle, comme son
  tableau.
- **Sauvegardes** : `backupExport` parcourt `SYNCABLE`. Les deux stores y entrent
  d'office.
- Rien n'est migré, rien n'est réécrit.

## 7. Étapes (un commit chacune)

1. **Cette mécanique.**
2. **Données + liaison** :
   - stores `liaison` et `dessins` ;
   - `pullStore` (lecture seule) et `synchroCiblee` (liste blanche) ;
   - `lib/dessins.js` ;
   - l'ordi publie sa fiche active ;
   - purge avec la fiche.
3. **Canvas tactile mobile** : écran Dessin, outils, gestes, annuler, brouillon ;
   l'entrée depuis l'accueil mobile, avec « Sur l'ordi : … ».
4. **Export** : choix de la fiche, PNG, envoi ordonné (blob confirmé, puis entrée).
5. **Ordi** : onglet Dessins, sondage, glisser-déposer et « Poser ».
6. **Test bout à bout** dans deux navigateurs isolés (un téléphone émulé, un ordi), avec
   un **faux Supabase local** : ton cloud n'est jamais touché pendant les tests.

## Risques et parades

| Risque | Parade |
|---|---|
| L'entrée arrive avant l'image | Envoi ordonné (blob confirmé, puis entrée) ; vignette qui se réessaie |
| Sonder le cloud coûte | Lecture filtrée sur un store (une à quelques lignes), seulement écran visible, toutes les 10 s |
| Toucher au `reconcileAll` critique | Non modifié ; `synchroCiblee` est une fonction à part, limitée à 2 stores |
| Ancien client sur un autre appareil | Ignore les nouveaux stores (vérifié dans le code) |
| Trait parasite au début d'un pincement | 2e doigt posé = le trait en cours est abandonné |
| Zoom ou défilement du navigateur pendant le dessin | `touch-action: none` sur la surface |
| Gros dessin | PNG plafonné à 2 400 px ; même canal que les PDF (qui pèsent des Mo) |

**Point d'attention, sans blocage :** le premier aller-retour avec le **vrai** cloud ne
peut pas être fait cette nuit sans écrire dans tes données. Il est prouvé de bout en bout
sur un faux Supabase local qui reproduit l'API utilisée (RPC conditionnelle, lecture
filtrée, bucket). Rien dans la liaison n'est d'architecture incertaine : on enchaîne sur
le code.
