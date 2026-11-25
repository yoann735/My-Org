# Compte rendu — section « Exos » de MedRevise (25/11/2026)

Nouvelle section **Exos** : une page en grille de cartes (une par *notion*), chaque notion réunit **une fiche PDF**
(facultative) et **0 à N fichiers d'exercices** (HTML ou PDF). Les PDF s'ouvrent dans le **PdfReader existant**, les HTML
dans un **lecteur intégré isolé**. Testé dans Chrome sur ordinateur, iPad tactile et téléphone, deux appareils synchronisés
par un faux Supabase local. MealWeek identique au pixel près.

## 1. Accès
- **Ordinateur / iPad** : entrée « Exos » (icône fiole, infobulle « Exos ») dans la barre latérale, après Bibliothèque,
  même style que les autres entrées (`components/ui.jsx#ED_NAV`, route `exos` dans `MedReviseApp.jsx`).
- **Téléphone** : carte « Exos » sur l'accueil du shell téléphone (`mobile/MobileHome.jsx`), écran `exos` dans
  `mobile/MobileApp.jsx` — même composant, en mode `mobile` (bouton retour vers l'accueil).

## 2. Ce qui est stocké
Un **nouveau type d'enregistrement synchronisé** `exo_notion` (store IndexedDB + ligne de la table `medrevise_records`
existante, **ajout seul** : aucun autre store réécrit, `lib/storage.js` : déclaration + liste `SYNCABLE`).

```json
{ "id": "en…", "nom": "Équilibre acido-basique", "coursId": "f-…" ,
  "fiche": { "id": "ef…", "fileId": "b…", "nom": "Fiche acido basique", "nomFichier": "Fiche-acido-basique.pdf", "type": "pdf" },
  "exercices": [ { "id": "ef…", "fileId": "b…", "nom": "QCM acido basique", "type": "html" }, … ],
  "fichiersRetires": [ { …fichier, "retireLe": "…", "raison": "retiré" | "remplacé", "role": "fiche" | "exercice" } ],
  "creeLe": "…", "updatedAt": "…" }
```
- `coursId` = une fiche de cours existante (sa matière donne la pastille de couleur) ou `null`.
- **Fichiers** : canal des blobs existant (`putBlob` → envoi au bucket, copie locale, audit des fichiers, index de la
  copie quotidienne GitHub). Champ `fileId` : couvert d'office par l'audit des blobs.
- **Annotations d'un PDF** : stores `highlights` / `annotations` existants, espace de noms `ficheId = "exo:<id du fichier>"`
  (comme les documents de notes). Un fichier remplacé reçoit un **nouvel id** : l'ancien garde ses annotations.
- **Aperçus** : rendus une fois (1ʳᵉ page, pdf.js, JPEG ~440 px) et mis en cache dans le store LOCAL `meta`
  (`exoApercu:v1:<fileId>`), file d'attente d'un rendu à la fois, après l'affichage de la grille.
- Code : `src/medrevise/exos/` (`notions.js` données, `apercus.js`, `EcranExos.jsx`, `LecteurHtml.jsx`), styles
  `src/styles/exos.css` (tout sous des classes `exo-*`).

**Migration SQL : aucune.** Le nouveau type passe par la table et la RPC existantes ; rien n'est préparé dans
`supabase/migrations/`.

## 3. Créer / modifier / supprimer
- Feuille « Nouvelle notion » / « Modifier » : nom (obligatoire — « Créer » grisé sinon), cours (menu déroulant de la DA,
  « Aucun cours » possible), fiche PDF (ajouter, remplacer, retirer), exercices HTML/PDF (ajouter plusieurs, renommer,
  Monter / Descendre, retirer). Les fichiers ne sont importés qu'à l'enregistrement (Annuler n'écrit rien).
- **Retirer ou remplacer un fichier annoté** : confirmation « Ce fichier porte N annotations… ». À l'enregistrement :
  `putBackup` (notion + fichiers retirés + leurs annotations), une version « Fichier retiré de la notion… » dans
  l'Historique de son document, et le fichier passe dans **« Fichiers retirés »** (bouton **Remettre** : il revient avec
  toutes ses annotations). Les annotations ne sont jamais effacées.
- **Supprimer une notion** (menu ⋮ de la carte ou de la notion) : « Supprimer « X » et ses N fichiers ? » (« et son
  fichier ? » pour un seul), `putBackup` de la notion entière et de toutes les annotations de ses fichiers, version dans
  l'Historique, puis tombstone de la notion (propagée aux autres appareils). Fichiers et annotations restent en base.

## 4. Lecteurs
- **PDF** : `PdfReader` existant en plein écran, `source = { id: "exo:<fichier>", pdfId, … }` — mêmes outils
  (surligneur, texte/boîtes, dessin, formes, insérer), enregistrement continu, Historique (menu Fichier), OCR (tout PDF
  importé passe par `putBlob`, qui déclenche l'OCR). Seul ajout au lecteur : l'option facultative **`coursCartes`** —
  quand la notion est rattachée à un cours, « Boîte → Flashcard » et le panneau Exercices rangent les cartes dans **ce
  cours**. Sans cette option, rien ne change (3 lignes : `ficheCartes = ficheReelle || cours rattaché`). Sur téléphone, le
  lecteur reçoit son option existante `ajusterLargeur` (page à la largeur de l'écran) et l'en-tête passe sur deux lignes
  (CSS limité à `.exo-lecteur-pdf.mobile`).
- **HTML** : plein écran dans l'app (barre : retour + nom du fichier), interactif, rien n'est enregistré, aucun outil.

### Isolation du lecteur HTML
`<iframe srcdoc sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer" allow="">` — **sans**
`allow-same-origin`, `allow-top-navigation`, `allow-popups`, `allow-modals`. Origine opaque (`null`) : pas d'accès à
IndexedDB, aux cookies, au localStorage de l'app, à Supabase, ni au DOM du parent. Seul le texte du fichier est passé ;
l'app n'écoute aucun message. Chrome la fait même tourner dans un **processus séparé** (cible CDP « iframe about:srcdoc »).
Un court script est placé en tête du fichier : `localStorage` / `sessionStorage` → stockage **en mémoire** (perdu à la
fermeture) ; `alert()` → bandeau dans la page de l'exercice. `confirm()` / `prompt()` gardent le comportement du bac à
sable (renvoient faux / vide). Les polices et bibliothèques en ligne se chargent s'il y a du réseau.

**Preuves (fichier piégé `Exo-piege.html`, rapport lu dans l'iframe par le banc, ordinateur / iPad / téléphone) :**

| Tentative du fichier | Résultat |
|---|---|
| `document.cookie` | BLOQUÉ (SecurityError) |
| `window.parent.document` | BLOQUÉ (SecurityError) |
| `window.parent.localStorage` | BLOQUÉ (SecurityError) |
| `window.parent.document.cookie` | BLOQUÉ (SecurityError) |
| `window.parent.eval` / variables de l'app | BLOQUÉ (SecurityError) |
| `indexedDB.open('medrevise-fiches')` | BLOQUÉ (SecurityError) |
| lire `window.top.location` | BLOQUÉ (SecurityError) |
| rediriger l'app (`top.location.href = …`) | BLOQUÉ (SecurityError) |
| `window.open(…)` | BLOQUÉE (null) |
| `parent.postMessage` | envoyé, ignoré (l'app n'écoute rien) |
| `window.origin` | `null` (origine opaque) |

Après exécution : même adresse, mêmes données (fiches, notions), le lecteur reste ouvert ; un cookie de test posé par
l'app n'est pas lisible.

## 5. Hors ligne
À l'ouverture de la page Exos, les fichiers de toutes les notions sont copiés sur l'appareil en tâche de fond
(`getBlob`). Testé : appareil B rechargé sans réseau → grille et aperçus (cache), fiche PDF, exo PDF jamais ouvert
avant, exo HTML : tous disponibles.

## 6. L'onglet « Exos » existant du lecteur (non touché)
C'est le mode **« Exercices »** du panneau latéral du lecteur d'un cours (libellé abrégé « Exos » quand le panneau est
étroit, `components/CourseItemsSidebar.jsx`). Il liste les cartes **du cours** par type — QCM, Flashcards, Exercices,
Feynman — avec Ajouter / Importer / Exporter. Aucune ligne n'en a été modifiée ; `t-nonreg.mjs` vérifie qu'il s'affiche comme avant.

## 7. Tests (banc `scripts/tests-section-exos/`, Chrome headless muet, faux Supabase)
`./tout.sh` rejoue tout (25/11, **tout vert, 0 erreur console**) :

| Script | Appareils | Ce qui est vérifié | Résultat |
|---|---|---|---|
| `t-creation.mjs` | ordinateur, iPad | entrée « Exos » (icône + infobulle), en-tête (titre, filtre, grille/liste, tri, Nouvelle notion), nom obligatoire, 3 notions (cours / sans cours / sans fiche), stockage, noms lisibles, aperçus (fiche, sinon 1ᵉʳ PDF d'exos), cartes de même largeur, pastille, date, menu ⋮, tri, filtre, liste, vue notion, retour | ✅ |
| `t-lecteurs.mjs` | ordinateur, iPad, téléphone | fiche PDF dans le PdfReader (mêmes outils), boîte écrite → enregistrée, Historique, panneau du cours rattaché, fermer / rouvrir → annotation là ; QCM HTML (boutons, champ, correction JS, localStorage/sessionStorage en mémoire, alert en bandeau), rien d'enregistré, mémoire perdue à la fermeture ; fichier piégé bloqué, app intacte | ✅ |
| `t-modification.mjs` | ordinateur, iPad | renommer, changer de cours, ajouter 2 exos, réordonner, renommer un exo ; exo annoté (2 boîtes) retiré → confirmation « 2 annotations », putBackup, Fichiers retirés, annotations intactes, version Historique ; Remettre ; remplacer la fiche annotée → confirmation, ancienne récupérable | ✅ |
| `t-telephone.mjs` | téléphone | carte d'accueil, grille 2 colonnes égales sans débordement, liste, filtre, créer / modifier / supprimer au doigt, QCM au doigt, retour accueil | ✅ |
| `t-synchro.mjs` | ordinateurs A + B | notions, fichiers et aperçus sur B ; annotation A → B et B → A ; B hors ligne : fiche, exo PDF, exo HTML ; suppression (confirmation, putBackup) → disparaît sur A puis sur B | ✅ |
| `t-nonreg.mjs` | ordinateur | barre latérale (6 entrées, chacune s'ouvre), lecteur d'un cours + onglet « Exos » (QCM / Flashcards / Exercices / Feynman), synchro « À jour », export local avec `exo_notion`, copie GitHub (lignes + fichiers dans l'index) | ✅ |
| `t-mealweek.mjs` | ordinateur, téléphone | build de production avant (`ffcf06f`) / après : capture identique octet pour octet, aucune erreur | ✅ |


Captures (`docs/img/section-exos/`) :

| | Ordinateur | iPad | Téléphone |
|---|---|---|---|
| Grille | `ordi-grille.png`, `ordi-liste.png`, `ordi-filtre.png` | `ipad-grille.png` | `tel-accueil.png`, `tel-grille.png`, `tel-liste.png` |
| Feuille | `ordi-feuille-remplie.png`, `ordi-feuille-modifier.png`, `ordi-confirmation-retrait.png`, `ordi-fichiers-retires.png` | `ipad-feuille-modifier.png`, `ipad-confirmation-retrait.png` | `tel-feuille.png` |
| Notion | `ordi-notion.png` | `ipad-notion.png` | `tel-notion.png` |
| Lecteur PDF | `ordi-lecteur-pdf.png`, `ordi-lecteur-pdf-annote.png` | `ipad-lecteur-pdf-annote.png` | `tel-lecteur-pdf-annote.png` |
| Lecteur HTML | `ordi-lecteur-html.png`, `ordi-html-piege.png` | `ipad-lecteur-html.png`, `ipad-html-piege.png` | `tel-lecteur-html.png`, `tel-html-piege.png` |
| Deux appareils | `b-grille-synchro.png`, `b-hors-ligne-html.png`, `a-confirmation-suppression.png`, `b-apres-suppression.png` | | |
| Non-régression | `nonreg-lecteur-cours-onglet-exos.png`, `mealweek-ordi-avant/apres.png` | | `mealweek-tel-avant/apres.png` |

## 8. Limites connues
- « Boîte → Flashcard » n'existe que pour une notion **rattachée à un cours** (une carte doit appartenir à un cours).
- Un fichier HTML est affiché seul : des images ou scripts *relatifs* (fichiers posés à côté de lui) ne sont pas
  disponibles ; les ressources en ligne (https) le sont.
- Le PdfReader sur téléphone reste celui de l'app (barres d'outils denses) ; il est ajusté à la largeur de l'écran.

## 9. Commits
- `00e35ac` *sync auto* (commit et push automatiques du dépôt) — contient tout le code de la section (`src/medrevise/exos/`,
  `src/styles/exos.css`, branchements dans `MedReviseApp.jsx`, `ui.jsx`, `storage.js`, `MobileApp.jsx`, `MobileHome.jsx`,
  option `coursCartes` de `PdfReader.jsx`), le banc `scripts/tests-section-exos/` et les premières captures.
- commit `docs(medrevise): section Exos…` (ce compte rendu complété, captures finales, passation).
