# Audit du lecteur de cours MedRevise : séances, fiches, transcripts (29/10/2026)

## Comment cet audit a été fait

- **Parcours dans Chrome** sur un banc local, avec une base de test. Aucune donnée réelle n'a été touchée : ni IndexedDB, ni Supabase.
  - Cours de test : « Physiologie rénale (jumelle) », 26 pages, plus sa fiche jumelle de 30 pages.
  - Formats : ordinateur 1440×900, iPad 1180×820, téléphone 390×844.
  - Captures dans [`captures/`](captures/). La liste des boutons visibles est relevée automatiquement dans `captures/*-boutons-visibles.json`.
- **Lecture du code** : `pdf/PdfReader.jsx` (4216 lignes), `PdfToolbar`, `MenuFichier`, `FichiersCours`, `TagsPages`, `CourseItemsSidebar`, `TranscriptPanel`, `lib/ficheJumelle.js`, `lib/tagsPages.js`, `transcription/sessions.js`, `transcription/pages.js`.

**À signaler.** Les marqueurs **MR-AFTER / MR-ID** cités dans la demande n'existent nulle part : ni dans `src/`, ni dans `docs/`, ni dans l'historique git (`git log -S`). Aucune fonction d'import ne place des « pages de notes » dans la diapo à partir de marqueurs. Ce qui s'en rapproche :

1. les **pages ajoutées** à la main (zone « + » entre deux pages, ou Insérer › Page) ;
2. l'import **« Textes d'annotations (JSON) »**, qui remplace le texte des boîtes ;
3. les **pages « ajoutées dans la fiche »** de la fiche jumelle (`pageMap.versOrig[i] = null`).

L'audit traite ces trois mécanismes. Si MR-AFTER / MR-ID existe ailleurs (un prompt Claude externe, une branche non poussée), il entre dans la catégorie 1 : des pages insérées après une page donnée et identifiées par un id.

| Capture | Contenu |
|---|---|
| `ordi-01-lecteur.png` / `ordi-09-vue-fiche.png` | Lecteur, vue Fiche, panneau Exos |
| `ordi-02-menu-fichier.png` | Menu Fichier : 3 sections, 20 entrées |
| `ordi-03b-flashcards.png`, `-04-…transcript`, `-06-…notions` | Modes du panneau |
| `ordi-11-les-deux.png` | Disposition « Les deux » : PDF + Tableau |
| `ordi-14-outil-surligneur.png` | Rangée contextuelle d'un outil |
| `ordi-16-tags-page.png`, `ordi-07-menu-page.png` | Menu tag Début / Fin |
| `ordi-17-seances.png` | Fenêtre « Séances » (vide sans tags) |
| `ordi-08-import-fiche-resume.png` | Résumé d'import d'une fiche jumelle |
| `ipad-*.png` | Tablette : en-tête sur une ligne, panneau en volet du bas |
| `tel-01-lecteur.png` | Téléphone : **pas de lecteur**, seulement l'accueil de révision |

## 1. Ce que voit l'étudiant aujourd'hui

À l'ouverture d'un cours, l'écran est **centré sur un document** : le PDF original, ou la fiche jumelle si elle existe et qu'elle était affichée la dernière fois. On voit d'abord :

- une barre d'outils de dessin (6 outils, annuler / rétablir, zoom, navigation) ;
- une rangée d'aide grisée (« Choisissez un outil… ») ;
- un panneau à 4 modes ouvert sur **Exos › QCM**, souvent vide.

**Rien ne dit** combien de séances le cours contient, laquelle a eu lieu aujourd'hui, ni quelle fiche correspond à quelles pages. Les séances existent bien (Fichier › Séances…), mais elles sont **déduites** des tags Début / Fin posés page par page : sans tags, la fenêtre est vide (`ordi-17-seances.png`).

Le modèle actuel est **« 1 cours = 1 diapo + au plus 1 fiche »**. Il ne tient pas pour un cours de 300 pages en 5 séances avec 7 fiches :

1. **Une seule fiche jumelle** par cours (`companion_pdf` d'id `cp:<cours>`). Une deuxième fiche *remplace* la première : l'ancienne devient une « version » archivée, illisible dans le lecteur.
2. **La séance n'est pas un objet.** Elle n'a ni nom ni identifiant. Elle se recalcule à partir des tags, qui sont *par document* : une séance posée sur la diapo n'existe pas sur la fiche.
3. **Lien séance ↔ transcript manuel et fragile.** Il passe par un `transcriptSessionId` choisi dans une liste au moment de poser le tag. La session ne connaît ni sa séance ni sa plage de pages.
4. **Les transcripts sont une liste plate** par date. Le badge de page n'utilise qu'une session de référence : les pages des autres séances n'ont pas de badge.
5. **Flashcards, Notions et Notes sont rattachées au cours entier.** On ne peut pas les filtrer par séance ni par fiche. Il y a un seul document Notes par cours.
6. **Pas de vue d'ensemble.** On ne peut pas taper un numéro de page, et il n'y a plus de vignettes (onglet « Pages » retiré le 26/10). Aller à la p. 187 d'un PDF de 300 pages veut dire faire défiler.

## 2. Inventaire et verdict, commande par commande

Légende des fréquences (estimation d'usage pour ce besoin) :

- **●●●** plusieurs fois par séance ;
- **●●** chaque séance ;
- **●** chaque semaine ;
- **○** rare (une fois par cours, ou moins).

### 2.1 En-tête et barre

| Commande | Rôle | Fréquence | Bon endroit ? | Doublon ? | Verdict | Pourquoi |
|---|---|---|---|---|---|---|
| ‹ Retour | quitter le cours | ●● | oui | — | **Garder** | |
| Titre renommable + « 30 pages » | identité du cours | ○ (renommer) | oui | Fichier › Renommer (F2) | **Garder** le titre, **fusionner** le renommage dans un seul endroit (le menu) | Le crayon à côté du titre se clique par erreur, et F2 existe déjà |
| Bouton « Fichier » | menu du cours et des documents | ● | oui | — | **Garder, simplifier** (voir 2.4) | |
| Disposition **PDF / Les deux / Tableau** | afficher le tableau Miro à côté | ○ | non : occupe le coin le plus visible pour une fonction rare | — | **Déplacer** dans un menu « Affichage » ou le panneau | Coût visuel permanent pour un usage rare |
| Segment **Original · Fiche** | basculer entre les 2 documents (Tab, ⌘⇧F) | ●●● | oui | — | **Remplacer** par un sélecteur de documents de la séance (Fiche(s) · Diapo · Transcript) | Il est binaire : il ne peut pas montrer 7 fiches |
| ▲ « 1 / 30 » ▼ | page précédente / suivante | ●● | oui | — | **Garder** et **rendre le numéro saisissable**, plus un **ruban des séances** pour sauter | 300 pages sans saisie directe, c'est trop long |
| ⊖ 160 % ⊕ ⤢ | zoom | ● | oui | pincement (tablette) | **Garder** (réduire à ⊖ % ⊕ sur tablette) | |
| 6 outils (Sélection, Surligneur, Dessin, Texte, Formes, Insérer) | annoter | ●●● (fiche) / ● (diapo) | oui | — | **Garder**, mais **masquer en direct** | Pendant le cours, on suit la diapo et on écoute : on n'annote pas |
| Rangée contextuelle réservée (« Choisissez un outil… ») | réglages de l'outil | ●● | oui | — | **Garder, mais vide = 0 px** | 40 px de hauteur perdus pour un texte d'aide permanent |
| Annuler / Rétablir | historique | ●● | oui | ⌘Z | **Garder** | |
| Recherche + liste des résultats | chercher dans le document | ● | oui | — | **Élargir** à tout le cours (diapo + fiches + transcripts), ⌘K | La réponse est souvent dans le transcript ou une autre fiche |
| « ⋯ » de la barre | une seule entrée (« Remplacer le texte sélectionné ») | ○ | non | — | **Supprimer** (mettre l'action dans le clic droit sur sélection) | Un menu pour une seule entrée, presque toujours grisée |
| Thème, « Changer d'app », bouton Panneau (tablette seulement) | — | ○ / ● | non | menu avatar sur ordinateur | **Garder Panneau**, **déplacer** thème et changer d'app | Incohérent entre appareils |

### 2.2 Sur les pages

| Commande | Rôle | Fréquence | Verdict | Pourquoi |
|---|---|---|---|---|
| Zone « + » entre deux pages | insérer une page blanche | ● | **Garder** | Geste naturel ; c'est le même mécanisme que des « pages de notes » insérées |
| Insérer › Page | idem | ○ | **Supprimer** | Doublon de la zone « + » |
| Icône tag (13 px dans la marge) + clic droit → Marquer début / fin | créer une séance | ○ (2 fois par séance) | **Automatiser** : le tag Début se pose quand on démarre le direct, le tag Fin quand on l'arrête. Garder l'icône seulement pour corriger | Aujourd'hui, une séance demande 4 actions précises sur des cibles minuscules ; on l'oublie, et alors rien n'est relié |
| Fenêtre du tag (date, transcript : aucun / en cours / existant) | lier tag ↔ transcript | ○ | **Supprimer pour le cas normal** (lien automatique), garder en « Corriger la séance » | Choisir une session dans une liste, c'est demander à l'étudiant de faire le travail de la base |
| Pastilles « ▶ Début · 22 oct. » / « ■ Fin » | voir et ouvrir la séance | ● | **Garder** | Bon repère visuel |
| Badge transcript « 12 lignes » sur la page | ouvrir le transcript de la page | ●● | **Garder**, pour **toutes** les séances | Aujourd'hui une seule session de référence a des badges |
| Bulle de sélection (Notion / Flashcard / Copier) | créer depuis le texte | ●●● | **Garder** | |
| Mini-barre de boîte (→ Flashcard, IA / orig.…) | — | ●● | **Garder** | |
| « + Ajouter au tableau » | carte Miro depuis une sélection | ○ | **Garder** seulement si le Tableau est affiché (c'est déjà le cas) | |

### 2.3 Panneau latéral

| Mode / commande | Fréquence | Verdict | Pourquoi |
|---|---|---|---|
| **Exos** (QCM / Flashcards / Exercices / Feynman) | ●● | **Garder**, ajouter un filtre **« Cette séance / Tout le cours »**. Ouvrir par défaut sur **Flashcards** et non sur QCM, souvent vide | La révision du soir porte sur une séance |
| Flashcards : Importer / Exporter / thème / filtres / ★ | ● | **Garder**, regrouper Importer, Exporter et Thème dans « ⋯ » | La ligne d'actions fait 4 boutons pour des gestes hebdomadaires |
| **Transcript** | ●●● en direct, ●● en révision | **Sortir du panneau** : le transcript est un *document de la séance*, au même rang que la fiche et la diapo. Le direct devient un mode d'écran | Dans un panneau de 320 px, au 4ᵉ onglet, on ne peut pas le lire en même temps que la fiche |
| Transcript : feuille de démarrage (source, vu-mètre, mots-clés, diarisation) | ● | **Garder**, avec par défaut les mots-clés de la séance précédente et un seul clic « Démarrer » | |
| Transcript : liste « Sessions de ce cours » | ● | **Remplacer** par les séances : une séance = une session (ou plusieurs reprises) | Liste plate, sans titre |
| **Notes** (un document par cours) | ● | **Garder** : une note par séance + une note du cours | |
| **Notions** | ●● | **Garder**, avec filtre par séance | |
| Glissement horizontal entre les modes | ● | **Garder** (tablette) | |

### 2.4 Menu Fichier (20 entrées en 3 sections, `ordi-02-menu-fichier.png`)

| Entrée | Fréquence | Verdict | Pourquoi |
|---|---|---|---|
| Renommer le cours (F2) | ○ | **Garder** | |
| Fichiers du cours… | ○ | **Fusionner** avec Séances… dans **« Séances et documents… »** | Ce sont les deux moitiés d'une même question : « qu'est-ce qu'il y a dans ce cours ? » |
| Séances… | ● | **Fusionner** (idem) et **promouvoir** : les séances deviennent la navigation principale | |
| Supprimer le cours… | ○ | **Garder** | |
| Sections « Diapo originale » **et** « Fiche » (chacune 8 entrées identiques) | — | **Remplacer** par une seule section **« Document affiché »** | Ne marche pas avec 7 fiches : le menu aurait 8 sections. Doubler chaque action n'a de sens que pour 2 documents |
| Exporter annotée (⌘P), Autres formats (.md, PNG) | ● / ○ | **Garder** l'export ; mettre .md et PNG dans la fenêtre d'export | |
| Export spécial IA… (⌘⇧E) | ●● (après chaque séance, pour Claude) | **Garder et rendre contextuel** : « Exporter la séance pour Claude » = pages de la séance + transcript, prêts à coller | C'est **le** geste qui fabrique la fiche ; il doit partir de la séance, pas d'une plage de pages tapée à la main |
| Textes d'annotations (JSON) Exporter / Importer + volet Affichage | ○ | **Déplacer** dans « Export spécial IA » (avancé) | Usage de spécialiste |
| Reconnaissance de texte… | ○ | **Garder** (états), mais la masquer quand elle est inutile (« inutile » est déjà affiché) | |
| Mise en page… | ○ | **Garder** (documents créés dans l'app) | |
| Correspondance des pages… | ○ | **Garder**, mais **par fiche** | Chaque fiche a sa propre correspondance avec les pages de *sa* séance |
| Remplacer ce fichier… | ○ | **Garder** | |
| Supprimer la diapo / la fiche… | ○ | **Renommer en « Retirer du cours… »** (rien n'est effacé, comme aujourd'hui) | |
| « Importer une fiche » (section Fiche vide) | ●● | **Promouvoir** : bouton visible + glisser un PDF sur une séance | Aujourd'hui caché au fond du menu Fichier |

### 2.5 Doublons relevés (et décision)

| Doublon | Lieux | Décision |
|---|---|---|
| Prompts IA | Export IA › Prompts, Exos › ⋯ › Prompts, ⋯ de la barre (lecteur embarqué) | **Un seul endroit** : Exos › ⋯ |
| Importer / Remplacer / Supprimer la fiche | Menu Fichier **et** Fichiers du cours | **Séances et documents** seulement, plus le menu contextuel de la fiche |
| Remplacer la diapo | 3 chemins | 1 chemin (Séances et documents) |
| Insérer une page | Insérer › Page et zone « + » | Zone « + » seulement |
| Ouvrir le transcript d'une page | Badge, pastille de tag, Séances › micro, « p. » du transcript | **Garder les quatre** : ce sont des liens dans les deux sens, pas des doublons gênants |
| Ouvrir / replier le panneau (tablette) | Bouton d'en-tête, séparateur, poignée basse | Garder le séparateur et la poignée, retirer le bouton d'en-tête |
| Exporter annoté | ⌘P, menu Fichier (×2 sections) | Une seule entrée (document affiché) + ⌘P |

### 2.6 Code mort à retirer à l'occasion

Ces éléments ne sont accessibles par aucun chemin de l'interface :

- modale « Ajouter une page » (`ajoutPage`) ;
- « Détacher le PDF ? » (`setDetacherPdf` n'est jamais appelé) ;
- `AddItemModal` / « Importer des items » ;
- props `boutonTranscrire` et `avantPanneau` de `PdfToolbar`, jamais fournies.

## 3. Le modèle mental cible

L'étudiant ne pense pas « PDF original / PDF fiche ». Il pense :

```
Cours  (Physiologie rénale, UE 2.4, 300 pages)
 └── Séance 1 … Séance 5        ← l'unité de temps ET de contenu : « le cours du 8 octobre »
      ├── pages du diapo 59–121 ← une tranche du gros PDF
      ├── transcript (2 h 05)   ← ce qui a été dit, relié page par page
      ├── fiche(s) de Claude    ← ce qu'il lit et révise (1, 2, ou une fiche commune à 2 séances)
      └── ses traces            ← surlignages, notes, flashcards, notions issues de cette séance
```

Trois règles en découlent :

1. **La séance est l'objet central**, stocké et nommé. Ce n'est pas un calcul fait à partir de deux tags.
2. **Les trois documents d'une séance sont liés entre eux** : une page de fiche → ses pages de diapo → ses minutes de transcript. Le lien se voit et se clique dans les deux sens.
3. **La fiche est le document de travail**, le diapo et le transcript sont ses **sources**. On n'annote presque jamais le diapo après le cours.

### Ce qu'il faut voir en 3 secondes

| Moment | Question de l'étudiant | Ce que l'écran doit montrer, sans clic |
|---|---|---|
| **En ouvrant un cours** | « Où j'en suis ? Qu'est-ce qui manque ? » | Les 5 séances (date, titre, pages) ; pour chacune, **transcript ✓** et **fiche(s) ✓ / manquante** ; un bouton **Reprendre** (dernière fiche, dernière page) ; **Aujourd'hui** si une séance tombe ce jour-là |
| **Pendant le cours en direct** | « Est-ce que ça enregistre ? Sur quelle page est le prof ? » | Grande diapo de la page courante, transcript qui défile **à côté**, chrono + vu-mètre, **tag Début déjà posé**, flèches de page. Aucun outil de dessin, aucun panneau Exos |
| **En révision le soir** | « Je relis ma fiche ; d'où vient ce point ? Qu'a dit le prof ? » | La fiche en grand ; à côté, **automatiquement**, les pages de diapo et les phrases du transcript de la page de fiche lue ; les flashcards et notions **de cette séance** |

### Parcours clés, avant / après

| Parcours | Aujourd'hui | Cible |
|---|---|---|
| Créer une séance | ouvrir le cours, aller à la page de début, clic sur l'icône de 13 px, « Marquer début », choisir le transcript dans la liste ; idem pour la fin | « Démarrer le cours en direct » sur la séance du jour : Début, transcript et date se posent tout seuls ; « Terminer » pose la Fin |
| Faire faire la fiche par Claude | Export IA, taper la plage de pages, copier le transcript à part (Transcript › Copier) | « Exporter la séance pour Claude » : pages + transcript en un paquet |
| Ranger la fiche | Fichier › Importer une fiche (la précédente est remplacée !) | Glisser le PDF sur la séance, ou importer avec la séance **proposée** (date, pages reconnues, vocabulaire du transcript) |
| Relire avec les sources | basculer Original ↔ Fiche (Tab) et chercher la page ; ouvrir le transcript au 4ᵉ onglet, filtrer « Cette page » | Les sources suivent la page de fiche lue |

## 4. Ce qu'on peut fusionner, simplifier ou supprimer

- **Fusionner** « Fichiers du cours » + « Séances » → **« Séances et documents »**, l'écran de gestion du cours.
- **Fusionner** le segment Original · Fiche + l'onglet Transcript → **sélecteur de documents de la séance** (Fiche(s) · Diapo · Transcript).
- **Simplifier** le menu Fichier : 20 entrées en 3 sections → environ 9 entrées en 2 sections (Cours, Document affiché).
- **Automatiser** les tags Début / Fin (direct) et le lien tag ↔ transcript.
- **Supprimer** : « ⋯ » de la barre, Insérer › Page, le doublon Prompts, la rangée d'aide vide, le code mort.
- **Déplacer** : la disposition PDF / Les deux / Tableau, et les Textes d'annotations (JSON), dans « avancé ».
- **Ajouter** (manquant) : saisie du numéro de page, **ruban des séances** (mini-carte des 300 pages), filtre « cette séance » dans Exos / Notions / Notes, et une **lecture de fiche sur téléphone** (aujourd'hui il n'y a aucun lecteur sur téléphone).
