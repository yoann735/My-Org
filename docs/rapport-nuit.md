# Rapport de nuit — 30 septembre 2026 (quatrième nuit) : Bibliothèque ↔ Prise de notes

**En une phrase : un document de Prise de notes se range maintenant dans la Bibliothèque en
restant LE MÊME objet (même id, preuve ci-dessous) ; on peut glisser des fichiers du Finder
sur la sidebar de la Bibliothèque comme dans Réviser ; et la sidebar est redessinée en arbre
clair.**

Aucune donnée réelle modifiée cette nuit (cloud : lecture seule). MealWeek : 0 fichier
touché. Tout est testé à la souris réelle (Chrome isolé), poussé et **déployé** (vérifié dans
le bundle de production).

| Commit | Contenu |
|---|---|
| `1a28724` | T1 — rangement d'un document : même id, aucune copie (logique) |
| `481a1f9` | T1 — fenêtre « Ranger dans la Bibliothèque » après l'import + bouton sur chaque document |
| `83ca5e9` | T2 — glisser un fichier sur l'arbre de la Bibliothèque (code partagé avec Réviser) |
| `f68bfbd` | T3 — audit `docs/audit-sidebar-biblio.md` |
| `0322e54` | T3 — sidebar redessinée |

---

## TÂCHE 1 — Prise de notes ↔ Bibliothèque ✅

### Le choix qui garantit « une seule fiche »
Un document de Prise de notes vivait dans un store à part (`notes`). **Le ranger ne le copie
pas : il DEVIENT la fiche de la Bibliothèque.** L'enregistrement passe du store `notes` au
store `fiches` **avec le même id**, le même fichier PDF (même `pdfId`, jamais dupliqué) et donc
les mêmes annotations (surlignages, boîtes, traits sont indexés par cet id). Prise de notes
continue de l'afficher (sa liste = documents pas encore rangés + fiches venues de Prise de
notes). Un seul objet, affiché à trois endroits : Prise de notes, Bibliothèque, Réviser.

Sécurité : la fiche est écrite **avant** que l'ancien enregistrement ne soit retiré (si
l'app est interrompue entre les deux, il reste deux enregistrements de même id, et la liste
n'en montre qu'un ; le rangement suivant nettoie). Ranger une deuxième fois = **déplacer**
la fiche (le geste du glisser-déposer), jamais la recréer.

### Ce que tu vois
1. **Après un glisser-déposer dans Prise de notes**, une fenêtre demande où ranger :
   **Section › Matière › Dossier**, chaque liste avec « + Nouvelle section… / + Nouvelle
   matière… / + Nouveau dossier… » pour créer sur place. Le chemin s'affiche
   (« Cours P2 › Cardiologie › ECG »). **« Plus tard »** ouvre le document comme avant.
2. **Sur chaque carte** de Prise de notes : l'emplacement (« Cours P2 › Cardiologie ›
   ECG ») ou « Pas encore rangé dans la Bibliothèque », et le bouton **« Ranger dans la
   Bibliothèque »** / **« Modifier le rangement »** (même fenêtre, bouton « Déplacer ici »
   grisé tant que rien ne change).
3. **Documents existants** : ils ont le même bouton. Rangé, un ancien document garde ses
   annotations d'avant (testé avec une annotation du 25/09).
4. Bonus : rangé, le document a le **panneau complet** (QCM, flashcards…) puisque c'est une
   vraie fiche ; dans la Bibliothèque il porte la mention « Prise de notes ».
5. Corbeille depuis Prise de notes d'un document rangé : c'est la fiche → **corbeille
   restaurable** (message explicite), pas une suppression définitive.

Tes 2 documents actuels (lus dans le cloud, sans rien écrire) : « 1 1 Orientation et
conventions vf (1) » et « Anatomie Palpatoire bac1 … MI (2) ». Ils ne sont **pas** rangés :
à toi de choisir leur place avec le bouton.

---

## PREUVE ANTI-DOUBLON (mesurée dans la base, scénario complet à la souris)

Document « Preuve anti-doublon.pdf » glissé dans Prise de notes, rangé à l'import dans
Cours P2 › Cardiologie › ECG, puis :

| Étape | Enregistrements avec cet id | Fichiers PDF | Fiches utilisant ce PDF | Annotations de cet id |
|---|---|---|---|---|
| Avant | notes 0 · fiches 0 | 17 | — | 0 |
| Rangé à l'import | **notes 0 · fiches 1** (id `nmuoc93p9ful7`) | **18 (+1)** | **1** | 0 |
| Surligné **dans Prise de notes** | fiches 1 | 18 | 1 | 1 → **la Bibliothèque l'affiche** (1 surlignage à l'écran) |
| Surligné **dans la Bibliothèque** | fiches 1 | 18 | 1 | 2 → **Prise de notes l'affiche** (2 surlignages à l'écran, « 2 annotations » sur la carte) |
| Renommé **dans la Bibliothèque** | fiches 1 | 18 | 1 | 2 → Prise de notes affiche « Preuve — renommée en Bibliothèque » |
| Déplacé **depuis Prise de notes** vers Pneumologie | **fiches 1, même id** | 18 | 1 | 2 → Réviser l'affiche au nouvel endroit |

Et sur toute la base à chaque étape : **0 id commun** entre documents et fiches,
**0 PDF partagé** entre deux fiches. Le document d'avant (rangé plus tôt) : même id
`nmuobfr6jwhqr`, son annotation du 25/09 (`hl_note_avant`) pointe toujours dessus,
plus aucun enregistrement `notes`.

Côté cloud (quand la synchro tourne) ranger = 1 fiche écrite + 1 marqueur de suppression de
l'ancien enregistrement `notes` — les deux gestes normaux de l'app, rien de massif.

---

## TÂCHE 2 — Glisser un fichier sur la Bibliothèque ✅

La logique de Réviser (dépôt → petite fenêtre titre + J0 → création) est devenue **un seul
code partagé** par Réviser et la Bibliothèque (pas de copie).
- Lâché sur un **dossier** (même fermé) → la fiche est créée **dedans** ✓
- Lâché sur une **matière** → à sa **racine** ✓
- Survol prolongé d'un dossier fermé → il **s'ouvre** (sous-dossier atteint) ✓
- **Images** → converties en PDF (même conversion que Prise de notes), aussi dans Réviser ✓
- **.docx / .pptx** → refusés avec l'explication « exporte-le en PDF » (pas de conversion
  fiable hors ligne) ✓
- Lâché hors d'une matière → « Aucune destination ici… », l'app ne quitte jamais la page ✓
- Réviser retesté : dépôt, image, « Annuler » n'écrit rien ✓

## TÂCHE 3 — Sidebar ✅

**Audit : `docs/audit-sidebar-biblio.md`** — chaque élément, ce qui déborde, chaque bouton
et son mécanisme. Constats principaux : en-tête de section de 101 à 126 px avec le nom
sur deux lignes ; 84 px par fiche ; 7 titres sur 12 tronqués ; la matière (petite pastille)
moins visible que ses fiches ; 3 boutons différents pour créer un dossier.

**Refonte** (arbre type Finder, sombre et fin) :

| | Avant | Après |
|---|---|---|
| Hauteur d'une ligne | 84 à 126 px | **30 px** (section 28) |
| Lignes visibles à l'écran | ~8 | **22** |
| Titres tronqués | 7 / 12 | 2 / 30 (titres de plus de ~40 caractères) |

- **Section** : une ligne en titre de groupe ; flèche de repli ; **↑ ↓** et cloche au survol
  (la cloche reste affichée quand les rappels sont en pause).
- **Matière** : ligne en gras avec son point de couleur, **repliable** (nouveau, mémorisé) ;
  au survol **+** (nouveau dossier, nom présélectionné) et ⋯.
- **Dossier** : flèche + dossier + nom + nombre ; **+** (sous-dossier) et ⋯ au survol ;
  « Nouveau dossier dedans » dans le menu.
- **Fiche** : titre sur toute la largeur ; ▷ et ⋯ au survol ; détail dans l'infobulle.
- **« + Nouvelle matière »** en bas de chaque section.
- Corrigé au passage : au début d'un glisser de fiche, les zones « Déposer ici »
  grandissaient et **tout l'arbre bougeait sous le curseur** (la fiche tombait une ligne
  trop bas). Elles gardent maintenant leur taille : testé, la fiche tombe dans le dossier
  visé.

Testé : repli section/matière/dossier (mémorisé après rechargement), ↑ ↓, création
matière/dossier/sous-dossier, menus, ouverture d'un document, glisser une fiche sur un dossier
fermé, réordonner deux fiches, dépôt de fichiers.

---

## Check-list de non-régression (après chaque commit)

```
Réviser · Bibliothèque PDF · Bibliothèque HTML · Apprentissage · Import Anatomie · Prise de notes → OK
Glisser-déposer de fichiers dans Réviser → OK (même code, retesté)
MealWeek → s'ouvre normalement — 0 fichier touché
Erreurs console : 0
```

## Ce que j'ai choisi de NE PAS faire (sécurité / doute)

1. **Ranger tes 2 documents réels** : c'est une décision de rangement, je te la laisse (un
   clic chacun).
2. **« Retirer de la Bibliothèque »** (redevenir un simple document de notes) : ce serait un
   nouveau passage d'un store à l'autre ; pas demandé, donc pas ajouté. On peut le
   déplacer, le renommer ou le mettre à la corbeille.
3. **Convertir les .docx / .pptx** : impossible proprement hors ligne ; message clair à la
   place.
4. **Toucher à l'arbre de Réviser** : seul le code d'import par dépôt est partagé ; son
   apparence est identique (le composant de ligne de dossier partagé n'a pas été modifié).
5. **« Déplacer vers… » d'une fiche de Bibliothèque vers une autre matière** : le menu ⋯
   reste limité à la matière (comme avant) ; entre matières, le glisser-déposer marche.

## Méthode

Chrome headless isolé (profil jetable, base locale, synchro désactivée), vrais événements
souris/clavier et **vrais glisser-déposer de fichiers depuis le disque** (pipeline d'entrée de
Chrome, comme depuis le Finder). Cloud : lecture seule (comptage de tes documents). Fichiers de
test jamais commités, supprimés.
