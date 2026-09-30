# Rapport de nuit — 30 septembre → 1er octobre 2026

**En une phrase : tes données sont en sécurité (locales ET cloud), le lecteur est fini et
poussé, et il te reste UN clic à faire chez Supabase.**

Aucune écriture cloud n'a été faite. Rien n'a été supprimé, recréé ni réinjecté.
MealWeek : 0 fichier touché (`git log -- src/mealweek src/shared` vide depuis hier soir).

---

## ⚠️ À lire en premier : Supabase n'est PAS perdu

Hier je t'ai écrit que le projet Supabase était probablement **supprimé**. **C'était faux.**
Cette nuit j'ai pu ouvrir ton tableau de bord (lecture seule) :

> Project "My Org" is paused — *All data, including backups and storage objects, remains
> safe.* You can resume this project from the dashboard until **01 Nov 2027**.

C'est la mise en veille automatique du plan gratuit (tes 3 projets sont en pause). Un projet
en pause perd son DNS, d'où le « NXDOMAIN » qui m'avait trompé. Détails et preuves :
**`docs/diag-supabase.md`**.

## ✅ Tes clics restants, dans l'ordre

| # | Geste | Où | Pourquoi |
|---|---|---|---|
| 1 | *(recommandé)* Exporter une sauvegarde sur **chaque autre appareil** (téléphone, autre ordi) | MedRevise → Réglages → Sauvegarde → « Avec les images et PDF » | ce Mac est déjà sauvegardé (voir plus bas) ; les autres, je n'y ai pas accès |
| 2 | **Resume project** | supabase.com → My Org → bouton « Resume project » | le seul geste nécessaire ; rien d'autre à configurer |
| 3 | Attendre que le projet soit « Healthy » (quelques minutes) | même page | DNS et API reviennent |
| 4 | *(facultatif)* Vérifier le contenu | SQL Editor → coller `supabase/verif-apres-reprise.sql` → Run | **lecture seule** (transaction `read only` + `rollback`) : lignes par store, dernière écriture, fonction `medrevise_push`, bucket |
| 5 | Ouvrir MedRevise sur l'appareil le plus à jour, puis Réglages → **Forcer la synchro** | l'app | réconciliation normale (last-write-wins) |
| 6 | Puis les autres appareils, un par un | l'app | chacun renvoie ce qu'il a de plus récent |

**Rien à faire sur Vercel** : l'URL et la clé du build pointent déjà sur ce projet (vérifié :
JWT décodé, `ref = deaonugwvbapkdixdowk`).

**Ne PAS exécuter** `supabase/restauration-projet.sql` : il servait à recréer un projet
supprimé. Sur ton projet existant, son `create or replace` remplacerait ta fonction
`medrevise_push`. Je lui ai mis un avertissement en tête.

Pour éviter une nouvelle pause : passer le projet en Pro, ou l'ouvrir au moins une fois par
semaine. Et si ça se reproduit, l'app reste désormais utilisable immédiatement (voir tâche 2).

---

## TÂCHE 2 — Supabase : diagnostic, données, remise en route

### Tes données locales : confirmées intactes, noir sur blanc

Lues dans l'IndexedDB de ton Chrome (production), depuis une page statique du site pour ne
pas démarrer l'app, en comptage seul :

| | Ce Mac, cette nuit | Ta sauvegarde de référence du 25/08 |
|---|---|---|
| fiches | **66** | 62 |
| cartes (questions) | **1 140** | 1 111 |
| sessions | **42** | 39 |
| dossiers | **24** | 22 |
| matières / cours | 2 / 1 | 2 / 1 |
| envois en attente | 0 | — |

**Rien n'est perdu en local : ce Mac a même plus que ta référence.** Ses images/PDF ne sont
pas sur cet appareil, ils sont dans le stockage cloud (0,06 Go, intact selon Supabase).
Sa dernière synchro réussie date du **26/08** : il sera à jour après l'étape 5.

**Sauvegarde neuve produite cette nuit** (bouton d'export de l'app, lecture seule) :

```
~/Downloads/medrevise-sauvegarde-my-org-blue.vercel.app-2026-09-30-15h39.json
2 688 620 octets — SHA-256 e63c2821a951d17109f6534c1c44e0da320acc0e032f9b1ae3b58496d4e047e7
compteurs = IndexedDB, à l'unité (66 / 1 140 / 42 / 24 …)
```

Recomptée après l'ouverture de l'app : strictement identique, 0 envoi en attente.

### L'app sans cloud : plus de blocage au démarrage — commit `f92b895`

Avant, rien ne s'affichait tant que la synchro n'avait pas échoué. Maintenant l'app affiche
d'abord ce qu'elle a en local, puis la synchro (même séquence, même ordre) tourne derrière.
Testé sur un serveur local pointé vers un hôte **inventé** (jamais ton vrai projet) :

```
jusqu'à l'app utilisable :  7 271 ms  →  225 ms
Réglages : « Le serveur cloud ne répond pas (projet Supabase supprimé, en pause, ou URL erronée) »
usage hors cloud : surlignage créé → conservé au rechargement → 2 envois en attente, 0 erreur
```

---

## TÂCHE 1 — Lecteur PDF/HTML : les 10 points, faits et testés

Testé **à la souris réelle** (événements souris natifs), dans ton Chrome au début puis dans
un Chrome headless isolé (voir « Méthode »). Build vert avant chaque commit, tout est poussé
et déployé (vérifié dans le bundle de production).

| # | Demande | Commit | Cause trouvée / ce qui change |
|---|---|---|---|
| 1 | Surlignage simple comme Word, pas de note | `b95aebb` | Surligneur : sélection = surligné. Sélection : **plus aucune popover** ; prendre le Surligneur avec du texte sélectionné le surligne (comme Word). Clic sur un surlignage → petite bulle **4 couleurs + Supprimer**, sans note. « Remplacer le texte » est dans le menu ⋯. |
| 2 | Pas de re-surlignage | `ff94f07` | On retire de la sélection ce qui est déjà surligné : seul le libre est coloré ; tout couvert ⇒ rien. **Bug trouvé au passage** : un glisser qui finissait entre deux lignes surlignait plusieurs lignes de trop (Chrome renvoyait une borne « DIV, 37 ») — corrigé. |
| 3 | Page précédente / suivante cassée | `03c7574` | Le compteur prenait la page *pré-rendue au-dessus* de l'écran : figé sur 1/3, « suivante » ne bougeait pas. Mesuré après : 1→2→3→2→1. |
| 4 | Boîte de texte qui ne crée rien | `5b267e9` | **Deux causes** : une variable `couleurBoite` qui n'existait pas (erreur silencieuse : aucune boîte), puis le focus qui restait sur le bouton « Boîte » (ta première Espace le « cliquait »). Maintenant : tracer → écrire aussitôt → gras/couleur → déplacer → redimensionner → tout conservé au rechargement. |
| 5 | Crayon : dessin fluide + surligneur | `c8e2601` | Barre du crayon : **[Dessin \| Surligneur]**. Dessin : fin, tous les points de la souris, lissage « streamline » en direct, rendu en courbes. Surligneur : épais comme une ligne de texte, translucide, le texte reste noir dessous. Aimant conservé (dessin). |
| 6 | Crayon décalé au-dessus du curseur | `fabfb5e` | Le calque SVG faisait 952×952 sur une page de 952×1347 (un `<svg>` garde son ratio carré) : tout était écrasé vers le haut, ~150 px en bas de page. Mesuré après : trait = curseur au pixel, à 160 % et 212 %, écran Retina. Tes anciens traits se remettent d'eux-mêmes à leur vraie place. |
| 7 | Gomme : logo, décalage, portée | `34c702b` | (a) le 🚫 (`cursor: not-allowed`) remplacé par un rond centré ; (b) même cause que le 6, plus une mesure sur la page exacte ; (c) elle n'efface **que** les traits de crayon — jamais un surlignage ni une boîte. On peut glisser pour en effacer plusieurs ; un geste = un Cmd+Z. |
| 8 | Mode focus = une icône | `ad0d250` | Icône « Focus » dans la barre latérale, au-dessus de Prompts/Réglages ; un clic active, un clic désactive, allumée quand actif. Tous les autres points d'activation retirés. |
| 9 | PDF et HTML dans le même lecteur | `54b5d78` | Même barre, **même panneau de droite sur les deux : QCM / Flashcard / Exercice / Feynman + Notions**. Sur une fiche HTML, Surligneur / Annuler / Rétablir / bulle agissent via les boutons du gabarit (mêmes sécurités que les siens). |
| 10 | Valable pour toutes les fiches existantes | `784305c` | Aucune migration : anciens surlignages (avec ou sans ancre, avec note), anciens traits, boîtes, blocs, fiches HTML actuelles et **anciennes** : tout s'affiche. Preuves : `docs/verif-retrocompat-lecteur.md`. |

### Check-list de non-régression (rejouée en fin de nuit)

```
Réviser (plein écran)  canvas=1 texte=33 page 1/3  5 outils  panneau QCM|Flashcard|Exercice|Feynman|Notions
Bibliothèque · PDF     idem — anciens surlignage + trait + bloc affichés, note ancienne visible
Bibliothèque · HTML    iframe  outils Sélection/Surligneur  même panneau
Apprentissage          lecteur OK, panneau Notions (replié par défaut, comme avant)
Import Anatomie        lecteur OK, panneau Notions
Prise de notes         lecteur OK, panneau Notions
MealWeek               s'ouvre normalement
Erreurs console        0
Outils (souris réelle, version finale) : pages 2→3→2→1 ; boîte créée + « Texte tapé tout de suite » en gras ;
crayon dessin + surligneur ; gomme efface la courbe traversée, la boîte reste.
```

### Changements de comportement à connaître

- **Plus de note sur les surlignages** (comme demandé). Les notes existantes restent visibles
  dans l'onglet Notions et partent à l'export ; on ne peut plus en créer ni en modifier.
- **Panneau de droite ouvert par défaut** sur toutes les fiches (il remplace « Notions
  surlignées »). Le bouton « Panneau » de la barre le replie.
- **Fiche HTML** : la barre interne du gabarit ne garde que ce que la barre commune n'a pas
  (Mode lecture, G, I, Titre, Sous-titre, Image, Enregistrer). Pastilles, Annuler/Rétablir
  et « Copier pour un prompt » passent par la barre commune (Copier : onglet Notions).
- **Boîte, crayon et gomme n'existent que sur les PDF.** Une fiche HTML n'a pas de pages :
  ces outils dessinent en coordonnées de page. C'est la seule différence entre les deux
  lecteurs ; si tu les veux aussi sur HTML, c'est un chantier à part (le cours HTML devrait
  devenir une « page » unique de hauteur fixe).
- **Crayon** : le lissage arrondit un peu les pointes d'un tracé très rapide (2 à 4 px au
  sommet d'une vague rapide) ; début et fin sont exactement sous le curseur.

---

## Ce que j'ai choisi de NE PAS faire

1. **Cliquer « Resume project »** : c'est ton infra, et c'est une écriture — ton clic.
2. **Exécuter du SQL**, même en lecture : la base est arrêtée ; le script de contrôle est prêt.
3. **Télécharger les sauvegardes cloud** (« Download backups ») : inutile, Supabase garantit
   les données ; et c'est un téléchargement de ton infra.
4. **Toucher aux variables Vercel** : elles sont justes.
5. **Réinjecter depuis une sauvegarde** : inutile puisque rien n'est perdu. (Si un jour il le
   fallait : Réglages → Restaurer une sauvegarde, qui montre un aperçu avant d'écrire et
   sauvegarde l'état actuel d'abord.)
6. **Ouvrir tes autres appareils** : impossible d'ici.
7. Dans Réglages de la prod, **seul** le bouton d'export a été cliqué — ni « Réinitialiser
   les dates », ni « Restaurer une sauvegarde », ni « Forcer la synchro ».

## Méthode, et ce qui a gêné

- Au début, l'extension Chrome était connectée et j'ai testé dans ton Chrome (serveur local
  isolé, base vide, synchro désactivée). Puis ton onglet est passé « caché » (fenêtre réduite
  ou recouverte) : Chrome y gèle l'animation, pdf.js ne rendait plus les pages, et les clics
  de l'extension n'arrivaient plus. J'ai donc continué dans un **Chrome headless isolé**
  (profil jetable, sans lien avec ton navigateur) piloté par un petit client CDP qui envoie
  de vrais événements souris/clavier.
- Ton Chrome n'a servi, pour le reste de la nuit, qu'à : lire le tableau de bord Supabase,
  compter ton IndexedDB, et cliquer « Exporter » dans Réglages.
- Fichiers de test (`public/*.tmp.*`) : jamais commités, supprimés à la fin.
