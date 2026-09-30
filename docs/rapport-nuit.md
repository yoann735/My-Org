# Rapport de nuit — 30 septembre → 1er octobre 2026 (troisième nuit)

**En une phrase : « Les ions » est supprimée (74/74, plus d'avertissement), le créateur de
flashcard image est propre, « Unités/Chapitres » s'appellent « Dossiers », et la Bibliothèque
gère sections, matières, dossiers et glisser-déposer.**

Rien d'autre supprimé. Seule écriture sur tes vraies données : la suppression de « Les ions »,
que tu as autorisée. MealWeek : 0 fichier touché. Tout est testé à la souris réelle, poussé et
déployé.

---

## TÂCHE 1 — corrections rapides

### 1.1 Fiche fantôme « Les ions » : supprimée ✅
Faite dans ton Chrome, par les gestes normaux de l'app (Bibliothèque → Supprimer → corbeille →
Réglages → Supprimer définitivement), après deux filets de sécurité :
- `~/Downloads/medrevise-cloud-enregistrements-avant-suppression-les-ions-2026-09-30.json` —
  copie intégrale de la table du cloud (1 911 lignes), lue juste avant ;
- ta sauvegarde locale du 30/09 15:39 (déjà là).

**Ce qui a changé, vérifié au cloud (avant / après, enregistrement par enregistrement)** :
- **45 enregistrements supprimés, tous liés à « Les ions »** : la fiche + ses 44 cartes ;
- 45 « marqueurs de suppression » vides ajoutés (brouillons d'exercice et document de la fiche,
  `deleted=true`, aucune donnée) — c'est la façon normale dont l'app efface ;
- **rien d'autre** : aucune autre carte, fiche ou matière n'a bougé. (Mon clic pour déplier
  « Unit 1 » avait modifié l'état plié/déplié ; je l'ai replié, l'état d'origine est rétabli.)
- Réglages : **« ✅ À jour avec le cloud » · Fichiers 74 / 74** — plus d'avertissement.
  (Le total est 74 et non 75 : le fichier fantôme n'est simplement plus compté.)

À savoir : ton Chrome sur ce Mac n'avait **pas synchronisé depuis le 26/08**. L'ouvrir pour
cette suppression a fait sa première synchro (tirage du cloud d'abord, rien de local à
pousser) : il est maintenant à jour (empreinte identique au cloud).

### 1.2 Grosse image : entièrement visible ✅ — commit `18c19bc`
La fenêtre ne donnait que 52 % de la hauteur d'écran à son contenu ; une grande image obligeait
à défiler dedans. Maintenant le créateur prend toute la hauteur et **l'image tient entière**
(zoom toujours là). **Le fichier stocké est l'original, intact** (vérifié : 52 982 o,
1800 × 2400, identiques). Mesuré : 1 071 px de contenu pour 475 visibles → 706 pour 706.

### 1.3 Popup du créateur réagencée ✅ — même commit
- **une ligne d'outils** : Sélection · Texte | Pinceau · Trait · Rectangle · Ellipse ·
  Polygone | Changer l'image · − 100 % + ;
- **une ligne de style**, seulement pendant qu'on dessine : pastilles de couleur, bascules
  avec/sans, mini-curseurs (fini les deux curseurs pleine largeur et le grand encadré) ;
- l'aide tient sur une ligne ; l'outil « Coche » s'appelle **« Texte »** ici.

---

## TÂCHE 2 — « Unités / Chapitres » → « Dossiers » ✅

**Audit : `docs/audit-renommage.md`** (commit `2032710`). Une unité et un chapitre étaient
déjà **le même objet** (store `dossiers`, le chapitre n'étant qu'un dossier dans un dossier) :
le renommage est purement d'affichage.

**Renommé** (commit `023ae09`) : Nouveau dossier · Supprimer le dossier · Dossier vide. ·
« 7 fiches · 4 dossiers » · « Supprimer ce dossier ? » · Exercices du dossier · prompt
« Exercices du dossier » · « · dossier » dans le carnet · noms par défaut.
**Pas touché** : toutes les clés de données (`dossiers`, `dossierId`, `chapitreId`,
`treeOpenDossiers`, clés d'export, id de prompt).
**Laissé exprès (homonymes)** : l'**unité physique** d'un exercice numérique (mmol/L) et
l'**« unité d'apprentissage »** de l'onglet Apprentissage — un autre objet (exos + PDF), pas un
dossier. *Si tu veux aussi renommer ce dernier (ex. « Séance »), dis-le : ce sont 15 libellés.*

---

## TÂCHE 3 — Bibliothèque « QG » ✅

**Audit : `docs/audit-bibliotheque.md`** (commit `8787086`). Découverte : le glisser-déposer
des fiches **existait déjà** dans la Bibliothèque (le même que Réviser), mais on ne pouvait
lâcher que sur les petites zones « Déposer ici », visibles seulement dans les dossiers ouverts.

| | Commit | Ce que ça fait | Vérifié |
|---|---|---|---|
| 3.1 Sections | `a9bb97b` | **flèche** pour replier/déplier (même état mémorisé que Réviser) ; **↑ / ↓** au survol pour l'ordre, mémorisé (préférence d'affichage, aucun champ ajouté) — Réviser suit le même ordre | repliée ⇒ toujours repliée au rechargement ; « Monter » ⇒ 1re, idem dans Réviser |
| 3.2 Matières | `6dd9cb4` | **« + Matière »** dans l'en-tête de section ; menu **⋯** sur chaque matière : Renommer · Nouveau dossier · **Supprimer la matière…** — le geste existant (fiches → « À classer » avec leur méthode des J, matière → corbeille restaurable), **précédé d'une sauvegarde** (`putBackup`, ajoutée aussi pour Réviser) et d'une confirmation qui dit tout | « Sa fiche (2 cartes) n'est PAS supprimée… » ; fiche dans « À classer », matière à la corbeille, sauvegarde `pre-delete-matiere-…` créée |
| 3.3 Dossiers | `6dd9cb4` | bouton **« + Dossier »** accentué dans la ligne de chaque matière ; à la création, **le nom provisoire est sélectionné** (on tape directement le vrai nom — avant, la frappe s'ajoutait à « Nouveau dossier ») | dossier « Cellule » créé du premier coup |
| 3.4 Glisser-déposer | `49cb999` | lâcher une fiche **sur la ligne d'un dossier, même fermé**, ou **sur le nom d'une matière** ; survoler un dossier fermé ~0,6 s pendant le glisser l'**ouvre** ; surbrillance de la cible | dossier fermé d'une autre matière ✓ · matière d'une autre section ✓ · ouverture au survol ✓ · ligne d'insertion classique ✓ · Réviser inchangé ✓ |

---

## Check-list de non-régression (version finale)

```
Réviser · Bibliothèque PDF · Bibliothèque HTML · Apprentissage · Import Anatomie · Prise de notes → OK
Glisser-déposer dans Réviser → OK (inchangé)
MealWeek → s'ouvre normalement — 0 fichier touché
Erreurs console : 0
```

## Ce que j'ai choisi de NE PAS faire

1. **Renommer « unité d'apprentissage »** (onglet Apprentissage) : ce n'est pas un dossier ;
   je te laisse décider.
2. **Supprimer définitivement une matière** depuis la Bibliothèque : la suppression passe par
   la corbeille (restaurable), comme partout dans l'app.
3. **Importer des fichiers du Finder par glisser dans la Bibliothèque** (ça existe dans
   Réviser) : autre geste que « ranger » ; à ajouter si tu veux.
4. **Glisser des sections ou des matières** : l'ordre des sections se fait par ↑ / ↓, plus sûr
   pour quelques éléments.
5. **Découper 1.2/1.3 et 3.2/3.3 en commits séparés** : chaque paire modifie les mêmes lignes ;
   un commit chacune, message détaillé pour les deux points.

## Méthode

Suppression de « Les ions » : dans ton Chrome, par les gestes de l'app, avec copie du cloud
avant et comparaison du cloud après. Tout le reste : Chrome headless isolé (profil jetable,
base locale, synchro désactivée), vrais événements souris/clavier (CDP). Fichiers de test
jamais commités, supprimés.
