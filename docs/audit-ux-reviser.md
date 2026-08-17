# Audit UX — onglet Réviser (MedRevise)

> Analyse seule, **aucun fichier de code modifié**. Champ : `src/medrevise/`
> (jamais MealWeek). Lu dans `src/medrevise/pages/Reviser.jsx` (1154 l.),
> `src/medrevise/components/ui.jsx`, `src/styles/etudes.css`,
> `src/styles/design.css`, `src/medrevise/MedReviseApp.jsx`.
>
> Demande d'origine : l'écran est mal hiérarchisé. « À rattraper » et « Série du
> jour » prennent la place du haut sans jamais servir ici ; la liste « Cours &
> matières » — l'élément le plus utilisé — est trop petite et ses cibles de clic
> minuscules ; les cartes QCM / Flashcards / Feynman sont surdimensionnées.
> Les coefs sont hors sujet (supprimés, `859f780`).
>
> Version consultable (même contenu, mise en page) :
> https://claude.ai/code/artifact/84af94f1-b6a6-46ad-8673-ca8a7f6ce3d6

---

## 0. Constat en une phrase

**La surface écran suit l'ordre historique d'ajout des fonctionnalités, pas la
fréquence d'usage.** La zone la plus manipulée (l'arbre) est la plus petite,
deux blocs jamais consultés occupent le haut, et trois cartes de 134 px de haut
affichent chacune un nombre et un mot.

Quatre mesures relevées dans le code :

| Mesure | Valeur | Source |
|---|---|---|
| Largeur de la liste des cours | **380 px, figée** | `Reviser.jsx:475` — `var(--tree-col, 380px)`, la variable n'est **définie nulle part** |
| Case à cocher d'une fiche | **17 × 17 px** | `etudes.css` — `.tree-check` (2ᵉ déclaration, celle qui gagne) |
| Carte QCM / Flash / Feynman | **≈ 134 px de haut** | `.rev-mode` : padding 13 + icône 34 + chiffre 30 + libellé 15 + lien 17 + padding 13 |
| Hauteur max de l'arbre | `calc(100vh - 230px)` | `.tree-card` — les 230 px = topbar + Série du jour |

---

## 1. Inventaire

Fréquences = estimations d'usage déduites du rôle de chaque contrôle. À corriger
si l'une paraît fausse.

### 1.1 Bandeau supérieur

| Zone | Rôle | Fréquence | Verdict |
|---|---|---|---|
| Topbar « Réviser » + sous-titre + thème + hub | Repère de navigation | rare | Compacter |
| **Série du jour** (`TodaySeriesCard`, compact, repliable — `Reviser.jsx:464`) | Lancer la série planifiée | **jamais ici** | **Retirer** |
| **À rattraper** (`OverdueBox`, repliée par défaut — `Reviser.jsx:470`) | Relancer les fiches en retard | **jamais** | **Retirer** |

**Vérifié :** les deux blocs sont **déjà sur l'Accueil** — `Dashboard.jsx:53`
(série du jour) et `Dashboard.jsx:103` (retards, mode `bare`). Les retirer d'ici
ne supprime aucune capacité : c'est de la désduplication.

### 1.2 Colonne de gauche — « Cours & matières »

| Zone | Rôle | Fréquence | Verdict |
|---|---|---|---|
| En-tête + « Tout décocher » | Repère, sortie de multi-sélection | rare | Compacter |
| Ligne **Cours** (source) — chevron, icône teintée, nom, cloche | Déplier, renommer, pause rappels J, décaler J0, supprimer | souvent | **Prioritaire** |
| Cloche rappels J (`BellButton`, classe `.src-mute`) | Retirer un cours de la méthode des J | rare | Secondaire |
| Ligne **Matière** | Repère couleur, renommer, supprimer | lecture constante | **Prioritaire** |
| Lignes **Unité / Chapitre** (`DossierRow` + compteurs + bouton exos + « … ») | Déplier, ouvrir les exos de chapitre, renommer, supprimer | souvent | **Prioritaire** |
| Ligne **Fiche** — case, nom, icônes schéma / étiquette / retard / badge dû | Sélectionner, ouvrir, cocher, renommer, glisser | **très souvent** | **Prioritaire nº 1** |
| Boutons « Nouvelle unité / chapitre » (`DossierAddButton`) | Créer un dossier | rare | Secondaire (au survol) |
| Zones « Déposer ici » (`DropSlot`, entre chaque fiche, en permanence) | Réordonner / déplacer | rare | Secondaire (pendant le glisser) |
| Pied « N à réviser aujourd'hui » | Légende du badge violet | jamais relu | Fusionner dans l'infobulle |

### 1.3 Colonne de droite — fiche ouverte

| Zone | Rôle | Fréquence | Verdict |
|---|---|---|---|
| Carte « Méthode des J » (`.jcard`, icône 46 px, padding 18/20 → ≈ 82 px) | État de la fiche + palier J | lecture fréquente | Bandeau d'une ligne |
| « Voir le cours » PDF / HTML (ou « Importer une fiche ») | Ouvrir le support | souvent | **Prioritaire** |
| « Lancer aujourd'hui » | Réviser les cartes dues | souvent | **Prioritaire** |
| **Cartes QCM / Flashcards / Feynman** (`.rev-mode`, ≈ 134 px chacune) | Lancer par mode | souvent | **Prioritaire mais 3× trop grandes** |
| Curseur « QCM à réviser » (`.qcm-mod`, bloc encadré + slider pleine largeur) | Moduler le nombre de QCM | occasionnel | Réduire (popover) |
| « Réviser toute cette fiche » | Action la plus courante | très souvent | **CTA principal** |
| Exercices (3 filtres + grille de cartes ≥ 240 px) | Choisir un exo précis | occasionnel | Densifier en liste |
| Carnet d'erreurs (`CarnetEntryCard`) | Lien vers l'écran Carnet | rare ici | Une ligne |
| Vue Chapitre (exos + Tout exporter + Importer + Fermer) | Travailler un chapitre | occasionnel | Garder, réaligner |
| Lanceur de schéma d'anatomie (`AnatSchemaLauncher`) | Régler et lancer un quiz schéma | occasionnel | Garder, compacter |
| État vide « Sélectionne une fiche » | Guider au démarrage | une fois | Réduire |

**Troisième doublon repéré (non signalé dans la demande) :** le Carnet d'erreurs
est **déjà un onglet de la barre de navigation** (`MedReviseApp.jsx:41`) *et* une
carte en bas de Réviser.

---

## 2. Hiérarchie

Principe de tri : **la surface écran doit suivre la fréquence d'usage.**

### 2.1 PRIORITAIRE — doit dominer

- **L'arbre Cours → Matière → Unité → Chapitre → Fiche.** Seul endroit de l'app
  où tout le contenu est visible à plat. Toute autre action de l'écran commence
  par un clic ici. Il mérite la largeur *et* la hauteur : c'est le sujet de la
  page, pas un accessoire.
- **La ligne de fiche.** Objet le plus manipulé. Haute, lisible sur une ligne,
  une cible de clic unique et généreuse.
- **« Réviser toute cette fiche ».** Action terminale la plus fréquente ; doit
  rester le bouton le plus visible du panneau droit.
- **« Voir le cours ».** Second réflexe après l'ouverture d'une fiche ; visible
  sans survol ni menu.
- **Les trois lancements QCM / Flash / Feynman.** Fréquents → toujours visibles,
  mais chacun ne porte qu'un compteur et un mot : **importance haute, densité
  d'information très basse**. C'est le cas type du bouton compact, pas de la
  carte.

### 2.2 SECONDAIRE — présent, discret

| Élément | Traitement proposé |
|---|---|
| Curseur QCM | Sélecteur `24 ▾` accolé au bouton QCM → popover (curseur + conseillé + « Tout »). `pickQcmSubset` inchangé. |
| Cloche rappels J | L'**état** « en pause » reste visible (nom grisé + icône) ; le **bouton** passe dans le menu contextuel. Bénéfice : `.src-mute` n'a **aucune règle CSS** dans le projet — ce bouton s'affiche aujourd'hui avec le style natif du navigateur. |
| Boutons de création de dossier | Au survol de la matière / de l'unité, ou dans leur menu. Occupent aujourd'hui une ligne pleine en permanence, à chaque niveau. |
| Zones de dépôt | Affichées **seulement pendant un glisser**. Consomment aujourd'hui de la hauteur en continu et augmentent le risque de dépôt à côté. |
| Filtres d'exercices | Apparaissent au-delà de ~6 exercices. |
| Carnet d'erreurs | Une ligne de lien en pied de panneau, avec ses deux compteurs. |
| Topbar | Titre sur une ligne, sous-titre supprimé (il décrit ce que l'écran montre déjà). |

### 2.3 À RETIRER d'ici

- **Série du jour.** Lancée depuis l'Accueil, identique là-bas. Ici elle occupe
  le haut **et plafonne la hauteur de l'arbre** : `.tree-card` est calé à
  `max-height: calc(100vh - 230px)`, ces 230 px étant exactement ce que
  consomment topbar + bandeau.
- **À rattraper.** Repliée par défaut, jamais ouverte. Rien n'est perdu : les
  fiches en retard sont **déjà signalées dans l'arbre** par une icône d'alerte
  rouge (`overdueFicheIds`, `Reviser.jsx:444`). Pour conserver l'action, ajouter
  « Rattraper maintenant » au menu contextuel des fiches en retard.
- **Légende de pied d'arbre.** Un badge violet numéroté s'explique seul après le
  premier jour ; l'info peut vivre dans son infobulle.

### 2.4 Effet de bord à nettoyer

Les deux réglages persistés `stats.serieCollapsed` et
`stats.rattraperCollapsedReviser` ne servent **qu'à ces deux blocs sur cet
écran** (l'Accueil rend `TodaySeriesCard` sans props de repli, `Dashboard.jsx:53`).
Ils deviennent orphelins → à supprimer avec le reste, pas à laisser dans le state.

---

## 3. Nouvelle structure

Deux colonnes, comme aujourd'hui — mais le rapport de force s'inverse.

### 3.1 Avant

```
┌──────────────────────────────────────────────────────────┐
│ Topbar « Réviser » + sous-titre            thème · hub   │
├──────────────────────────────────────────────────────────┤
│ ╌╌ Série du jour ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ (à retirer) ╌╌╌╌╌ │
│ ╌╌ À rattraper (repliée) ╌╌╌╌╌╌╌╌╌╌╌╌ (à retirer) ╌╌╌╌╌ │
├───────────────┬──────────────────────────────────────────┤
│ Cours &       │ Méthode des J · fiche         ≈ 82 px    │
│ matières      ├──────────────────────────────────────────┤
│               │ ┌────────┐┌────────┐┌────────┐           │
│ 380 px figés  │ │  QCM   ││ Flash  ││Feynman │ ≈ 134 px  │
│ h = 100vh−230 │ └────────┘└────────┘└────────┘           │
│               ├──────────────────────────────────────────┤
│ case 17 px    │ Curseur QCM                    ≈ 80 px   │
│ ↑ à viser     ├──────────────────────────────────────────┤
│               │ ▶ Réviser toute cette fiche              │
│               ├──────────────────────────────────────────┤
│               │ Exercices (grille de cartes)             │
│               ├──────────────────────────────────────────┤
│               │ Carnet d'erreurs (carte)                 │
└───────────────┴──────────────────────────────────────────┘
```

### 3.2 Après

```
┌──────────────────────────────────────────────────────────┐
│ Réviser                                    thème · hub   │
├───────────────────────┬──────────────────────────────────┤
│ 🔍 Filtrer…      ⌫    │ ● Anatomie · Membre sup. · J+7   │
│                       │   Aujourd'hui 12 · Voir le cours ⋯│
│ Cours & matières      ├──────────────────────────────────┤
│                       │ ▶ Réviser toute cette fiche      │
│ ≈ 520 px              │   42 cartes · ~34 min            │
│ redimensionnable      ├──────────────────────────────────┤
│ h = 100vh − 96        │ [QCM 24 ▾] [Flash 18] [Feynman 3]│
│                       ├──────────────────────────────────┤
│ lignes de 44 px       │ Exercices — liste dense          │
│ case : zone 32 px     │  · Thermodynamique  ●●○  Réussi  →│
│ « ⋯ » au survol       │  · Cinétique        ●○○  À revoir→│
│                       │                                  │
│ ~3 fiches de plus     ├──────────────────────────────────┤
│ visibles sans scroll  │ Carnet d'erreurs →               │
└───────────────────────┴──────────────────────────────────┘
```

### 3.3 Colonne de gauche — ce qui change

- **Largeur : 380 → ≈ 520 px, avec poignée de redimensionnement.** Le composant
  existe déjà : `SplitHandle` (`ui.jsx`), utilisé par la Bibliothèque. Largeur
  mémorisée dans `stats`, comme les autres préférences d'affichage.
  Au passage : `--tree-col` est référencée (`Reviser.jsx:475`) mais **jamais
  définie** — c'est toujours le repli 380 px qui s'applique, malgré le
  commentaire `etudes.css` (« sidebar élargie ») qui affirme le contraire.
- **Hauteur : `calc(100vh - 230px)` → `calc(100vh - 96px)`**, mécaniquement, une
  fois les deux bandeaux retirés. Sur un écran de 900 px : 670 → 804 px visibles,
  soit ~3 fiches de plus sans scroller.
- **Lignes de 44 px** à tous les niveaux (cours, matière, dossier, fiche) — une
  seule hauteur pour tout l'arbre.
- **Nom de fiche sur une ligne**, tronqué avec infobulle, au lieu du
  `-webkit-line-clamp: 2` actuel : avec 520 px de large, la troncature devient
  rare. Les icônes (schéma, étiquette, retard, badge dû) sont regroupées dans un
  bloc droit de **largeur fixe**, pour que la largeur du nom ne varie plus d'une
  ligne à l'autre (c'est ce qui provoque aujourd'hui les correctifs empilés
  `min-width: 9ch` / `word-break` / `overflow-wrap` dans `etudes.css`).
- **Barre d'outils fine en tête** : champ de filtre + compteur de sélection +
  « Tout décocher » actif seulement quand il y a une sélection.
- **Bouton « ⋯ » sur chaque ligne**, révélé au survol et au focus clavier,
  permanent sur tactile. Le clic droit reste, mais n'est plus le seul chemin.

### 3.4 Colonne de droite — ce qui se compacte

| Élément | Avant | Après |
|---|---|---|
| Carte « Méthode des J » | ≈ 82 px | bandeau d'**une ligne** ≈ 48 px : pastille matière · titre · palier J · état · *Voir le cours* · menu ⋯ (Ajouter un item, Décaler le départ, Retirer de la méthode des J) |
| CTA « Réviser toute cette fiche » | en bas, après le curseur | **remonté au-dessus des trois modes**, pleine largeur |
| Cartes QCM / Flash / Feynman | ≈ 134 px | **≈ 44 px** : icône 18 px, compteur tabulaire, libellé, chevron. Rien n'est perdu (le temps moyen flashcard tient sur une ligne secondaire). |
| Curseur QCM | bloc encadré ≈ 80 px | sélecteur `24 ▾` dans le bouton QCM → popover |
| Exercices | grille de cartes ≥ 240 px | **lignes denses** : thème · difficulté · statut · calculatrice · Ouvrir |
| Carnet | carte complète | ligne de lien + compteurs |

**Budget vertical estimé** (avant la section Exercices) : ≈ 420 px aujourd'hui
(82 + 30 + 134 + 80 + 52 + espacements) → **≈ 200 px** proposés. Chiffres calculés
depuis les paddings de `etudes.css`, à confirmer à l'œil une fois codé.

---

## 4. Zones cliquables

Référence : **24 px minimum** (WCAG 2.2 AA, *Target Size (Minimum)*), **44 px
confortable** (recommandation tactile). Cibles mesurées, pas estimées.

| Élément | Cible actuelle | Diagnostic | Proposé |
|---|---|---|---|
| **Case à cocher d'une fiche** | **17 × 17 px** (`.tree-check`) | Sous le minimum d'accessibilité, 2,5× sous le confort tactile. C'est *la* cible qu'il faut viser. | **zone 32 × 32 px**, carré visuel 18 px |
| Nom d'une fiche | ≈ 40 px de haut (`.tree-course-main`, padding 10/12) | Hauteur acceptable, mais la ligne est coupée en deux cibles voisines et le nom peut passer sur 2 lignes, ce qui déplace le centre de la cible. | **toute la ligne**, 44 px, hors case et « ⋯ » |
| « ⋯ » d'un dossier | 30 × 30 px (`.cd-ic`) | Au-dessus du minimum, sous le confort — et **collé** au bouton « exercices du chapitre », sans écart. | 34 × 34 px, écart de 6 px |
| Bouton exos de chapitre | 30 × 30 px | Même dimension ; l'icône cible seule ne dit pas ce qu'elle fait. | 34 × 34 px + infobulle explicite |
| Cloche rappels J | **style natif** (`.src-mute` sans aucune règle CSS) | Non stylé : taille dictée par le navigateur (≈ 24 px), aspect étranger au reste de l'arbre. | déplacée dans le menu ; état affiché sur la ligne |
| Ligne de cours (chevron) | **ligne entière** (`.tree-src-main`) | Déjà généreux — c'est le bon modèle, à généraliser. | inchangé, 44 px |
| Ligne de dossier | ≈ 39 px (`.lib-fiche`, padding 10/12) | Correct, mais partagé avec 2 boutons de 30 px + un double-clic de renommage. | 44 px, boutons au survol |
| Zones de dépôt | visibles en continu | Occupent de la hauteur en permanence, brouillent la lecture entre deux fiches. | affichées **pendant le glisser** : bande de 8 px + surbrillance |

### Trois règles à appliquer partout dans l'arbre

1. **Une ligne = une action évidente.** Cliquer n'importe où sur la ligne d'une
   fiche l'ouvre. Les cibles concurrentes (case, ⋯) sont détourées et séparées
   par au moins 6 px.
2. **Zone de clic ≠ zone dessinée.** La case reste visuellement fine (18 px) mais
   reçoit le clic sur 32 px — inutile de grossir le dessin pour agrandir la cible.
3. **Aucune fonction accessible uniquement par une cible < 44 px.** Tout ce qui
   passe par un « ⋯ » ou une case doit avoir un second chemin : menu contextuel,
   raccourci clavier, ou modificateur de clic.

---

## 5. Interactions

L'écran a déjà du clic droit (cours, matière, fiche — `openCtxMenu`) et de
l'appui long (`startPress`, 500 ms), mais c'est **inégal** : les dossiers n'ont
qu'un « ⋯ », les fiches n'ont que le clic droit, et rien ne l'annonce.
Cible : un modèle unique appliqué à toutes les lignes.

### 5.1 Gestes

| Geste | Sur quoi | Effet proposé | Aujourd'hui |
|---|---|---|---|
| Clic | Ligne de fiche | Ouvre la fiche dans le panneau droit | identique |
| Clic | Cours / matière / dossier | Déplie ou replie | identique |
| **Double-clic** | Ligne de fiche | **Ouvre le cours** (PDF ou HTML) | renomme |
| Clic droit / appui long | **Toutes** les lignes | Menu contextuel complet | cours, matière, fiche seulement |
| Clic sur « ⋯ » | **Toutes** les lignes | Le même menu, au même contenu | dossiers seulement |
| Cmd / Ctrl + clic | Ligne de fiche | Ajoute / retire de la sélection multiple | case à cocher seulement |
| Maj + clic | Ligne de fiche | Sélectionne la plage depuis la dernière fiche cliquée | absent |
| Survol | Toutes les lignes | Révèle « ⋯ », le ▶ de lancement rapide, les boutons de création | surbrillance seule |
| Survol ≥ 600 ms | Ligne de fiche | Infobulle riche : nom complet, matière, palier J, prochaine échéance, répartition QCM / flash / Feynman / exos, retard éventuel | infobulle générique |
| ↑ / ↓ | Arbre focalisé | Déplace la sélection | absent |
| → / ← | Ligne pliable | Déplie / replie | absent |
| Entrée · Espace | Ligne de fiche | Ouvre · coche | absent |
| F2 | Ligne sélectionnée | Renomme (remplace le double-clic) | absent |
| Glisser | Fiche | Déplacer / réordonner ; zones de dépôt révélées au démarrage du glisser | zones toujours visibles |

**Le seul vrai changement de comportement** : le double-clic passe de
« renommer » à « ouvrir le cours ». Renommer reste accessible par le menu et F2.
C'est le point à valider — seule habitude existante que la proposition modifie.
Alternative si tu préfères la garder : l'ouverture du cours reste sur le bouton
du bandeau, et le double-clic ne bouge pas.

### 5.2 Contenu du menu contextuel, par type de ligne

| Ligne | Entrées |
|---|---|
| **Cours** | Renommer · Décaler le départ (J0)… · Retirer / remettre dans la méthode des J · *[nouveau]* Tout déplier / replier · Supprimer |
| **Matière** | Renommer · *[nouveau]* Nouvelle unité · Supprimer |
| **Unité** | Renommer · *[nouveau]* Nouveau chapitre · Supprimer l'unité |
| **Chapitre** | Renommer · Exercices du chapitre · *[nouveau]* Tout exporter · Supprimer le chapitre |
| **Fiche** | *[nouveau]* Voir le cours · *[nouveau]* Lancer aujourd'hui · *[nouveau]* Rattraper maintenant *(si en retard)* · Renommer · Déplacer vers… · Décaler le départ… · Retirer / remettre dans la méthode des J · *[nouveau]* Ajouter un item · Supprimer |

Les entrées *[nouveau]* **ne créent aucune fonction** : elles exposent dans le
menu des actions qui existent déjà dans l'écran — `viewCoursPdf` /
`viewCoursHtml`, `launchToday`, `startOverdueFiche`, `exportChapitre`,
`createUnite` / `createChapitre`, `setShowAddItem`. C'est ce qui permet de
retirer « À rattraper » sans rien perdre.

---

## 6. Ce qui ne doit pas casser

Liste de contrôle à repasser après **chaque** étape. Aucune capacité ne
disparaît, hors les deux blocs demandés — dont les actions restent joignables
depuis l'Accueil et le menu contextuel.

- [ ] Dossiers sur **deux niveaux** (unité → chapitre), limite doublée côté `addDossier`
- [ ] Boutons de création **en haut** de leur conteneur (`DOSSIER_ADD_TOP`)
- [ ] Rendu **identique à la Bibliothèque** — même `DossierRow`, même `DOSSIER_INDENT`
- [ ] Exercices de chapitre (`chapitreId`), vue dédiée, **exclusivité** `selChapitre` / `selIds`
- [ ] « Tout exporter » et « Importer des items » d'un chapitre
- [ ] Sélection multiple de fiches + « Tout décocher » + révision inter-fiches
- [ ] Lancement QCM avec sous-ensemble tournant (`pickQcmSubset`) et modulation du nombre
- [ ] Lancement Flashcards, Feynman, « Réviser tout », « Lancer aujourd'hui »
- [ ] Temps moyen par flashcard (`avgFlashTimeMs`)
- [ ] Schémas d'anatomie : modes visuel / théorie / les deux, format des cartes, masquage, « Éditer le schéma »
- [ ] « Voir le cours » PDF **et** HTML, et rattachement direct d'un document (`attachCoursDoc`)
- [ ] « Ajouter un item » (`AddItemModal`) et les prompts de cours (`CoursePromptsButton`)
- [ ] Rappels J au niveau **cours** *et* au niveau **fiche**, réversibles
- [ ] « Décaler le départ » (J0) sur un cours ou une fiche, dates passées acceptées
- [ ] Renommer / déplacer / supprimer, avec les mêmes textes de confirmation (`dossierDeleteTexts`)
- [ ] Glisser-déposer des fiches (`moveFicheTo`), y compris vers la racine d'une matière
- [ ] Corbeille / archivage (cours, matières, fiches) ; suppression définitive des exercices
- [ ] Badges de ligne : cartes dues, retard, étiquette, icône schéma, compteurs de dossier
- [ ] Mémoire de position : `ctx.focusFiche` + remontée dans le viewport au montage
- [ ] Accès au Carnet d'erreurs (réduit à une ligne, **jamais supprimé**)
- [ ] Filtres d'exercices : thème, difficulté, statut
- [ ] Responsive < 900 px : une seule colonne, arbre au-dessus (`etudes.css:1062`)
- [ ] Écrans mobiles (`MobileHome`, `MobileSession`) : **non concernés**
- [ ] MealWeek et le design system partagé : **hors périmètre absolu**

---

## 7. Ordre d'implémentation

Quatre étapes, de la plus sûre à la plus délicate. Chacune se vérifie seule dans
le navigateur (`npm run build` + preview, 0 erreur console) et fait un commit.

1. **Dégager le haut de l'écran** — retirer Série du jour et À rattraper,
   nettoyer les deux réglages orphelins, remonter l'arbre à
   `calc(100vh - 96px)`. Risque quasi nul, gain immédiatement visible.
2. **Compacter le panneau droit** — bandeau d'une ligne, CTA remonté, trois
   boutons compacts, curseur QCM en popover, exercices en liste, carnet en lien.
   Purement visuel : aucune logique de planification touchée.
3. **Élargir et fiabiliser l'arbre** — largeur ≈ 520 px avec poignée, lignes de
   44 px, cibles revues, « ⋯ » sur chaque ligne, zones de dépôt seulement
   pendant le glisser, filtre en tête.
4. **Ajouter les gestes** — menu contextuel unifié et enrichi, Cmd+clic et
   Maj+clic, navigation clavier, infobulle riche, double-clic (selon décision).

---

## 8. À trancher (décisions utilisateur)

| # | Question | Recommandation |
|---|---|---|
| 1 | **Double-clic sur une fiche** : garder « renommer » ou passer à « ouvrir le cours » ? | **Changer.** Renommer est rare, ouvrir le cours est fréquent ; un double-clic accidentel en renommage est plus pénible qu'en ouverture. Renommage conservé via menu + F2. |
| 2 | **Carte Carnet d'erreurs** : la retirer (3ᵉ doublon) ou la réduire ? | **Réduire à une ligne** avec ses compteurs : le compteur « à revoir » a du sens juste après une session. |
| 3 | **Champ de filtre en tête d'arbre** — ajout non demandé | À prévoir à l'étape 3 **seulement si** l'arbre dépasse déjà l'écran. Sinon, reporter. |
| 4 | **Largeur de la liste** : valeur fixe ou poignée redimensionnable ? | **Les deux** : 520 px par défaut + poignée (`SplitHandle` existe déjà, coût faible). |

---

*Audit rédigé le 2026-08-17. Statut : en attente de validation de la direction —
aucun code écrit tant que la direction n'est pas validée.*
