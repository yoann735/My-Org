# Format d'import des flashcards — référence

> Diagnostic du code au 2026-09-29 (schéma v1.1). Aucune modification de code.
> Chemins relatifs à `src/medrevise/`.
> L'exemple du §5 a été passé dans le vrai parseur (`parsePastedJson`) sous Node :
> 3 flashcards reconnues, 0 ignorée, 0 erreur.

## Chaîne d'import (qui fait quoi)

```
texte collé
  └─ lib/parsePastedJson.js#parseLooseJson   (l.76)  tolère ```json, texte autour, virgules finales
  └─ lib/parsePastedJson.js#parsePastedJson  (l.104) repère l'enveloppe, valide carte par carte
       └─ lib/schema.js#normalizeV1Item      (l.297) → normFlashcard (l.149) + commonFields (l.73)
  └─ lib/import.js#createFicheFromQuestions  (l.39)  nouvelle fiche
     ou lib/import.js#appendItemsToFiche     (l.79)  ajout à une fiche existante (+ dédoublonnage)
       └─ lib/adapter.js#toInternalItem      (l.117)
       └─ lib/storage.js#newItem             (l.389) nouvel id, srcId, dates de la méthode des J
```

Point important : `normFlashcard` **reconstruit** l'objet champ par champ (schema.js l.158-166).
**Tout champ qui n'est pas listé au §1 est supprimé en silence** à l'import. Il ne sert donc à rien
d'en ajouter d'autres.

---

## 1. Structure d'une flashcard

### Ce que TU fournis

| Champ | Type | Obligatoire | Règle (schema.js) |
|---|---|---|---|
| `type` | `"flashcard"` | **OUI** | Tout autre type donne `type inconnu` (l.300). |
| `recto` | string non vide | **OUI** | Sinon `recto manquant` (l.150-153). |
| `verso` | string non vide | **OUI**, même pour une carte à trous | Sinon `verso manquant`. |
| `id` | string | Recommandé | Il n'est **pas** gardé comme clé : il devient `srcId`, qui sert au dédoublonnage (§6). S'il manque, l'app génère un id aléatoire (l.75), et le dédoublonnage ne peut plus marcher. |
| `cloze` | string[] | Non | Les mots masqués (§3). `null`, `[]` ou absent donnent une carte recto/verso classique (l.157, l.165). |
| `indice` | string | Non | Chaîne vide ou `null` → `null` (l.163). |
| `a_retenir` | string | Non | Absent → `""` (l.164). |
| `theme` | string | Non | Absent → `""`. `concept` est accepté comme alias si `theme` est vide (l.76). |
| `difficulte` | voir §4 | Non | Défaut `2` (l.54-61). |
| `tags` | string[] (ou string seule) | Non | Défaut `[]` (l.78). |

### Ce que l'APP génère (ne pas le fournir : c'est supprimé ou écrasé)

Posé par `lib/storage.js#newItem` (l.389-403) et `lib/adapter.js#toInternalItem` (l.117-131) :

| Champ | Origine |
|---|---|
| `id` (clé réelle en base) | `genId('q')`, toujours neuf |
| `srcId` | = ton `id` (un `srcId` écrit dans le JSON est supprimé, testé) |
| `ficheId` | la fiche de destination |
| `intervalDays`, `dueDate`, `capped`, `termine` | `startAdaptive(startDate)` (lib/sm2.js l.131) : la date J0 choisie dans l'écran d'import |
| `j0Date` | = startDate |
| `historique: []`, `missed: 0` | état initial |
| `concept` | recopié depuis `theme` (adapter.js l.86) |
| `_schema: "1.0"` | marqueur interne |

Un `dueDate`, un `historique` ou un `intervalDays` que tu mettrais dans le JSON serait supprimé (vérifié avec le parseur).

---

## 2. Enveloppe (racine du JSON)

`parsePastedJson` (l.110-135) accepte **4 formes** :

| Forme | Exemple | Remarque |
|---|---|---|
| **Recommandée** | `{ "schema_version": "1.1", "meta": {...}, "items": [...] }` | |
| Sans meta | `{ "items": [...] }` | C'est la forme utilisée par les prompts de l'app (lib/coursePrompts.js). |
| Tableau nu | `[ {...}, {...} ]` | Pas de `meta` possible. |
| Item seul | `{ "type": "flashcard", ... }` | Utile pour « Ajouter un item → Coller du JSON ». |

(L'ancien format `{ "questions": [...], "synthese": "..." }` passe encore par l'adaptateur. Ne pas l'utiliser.)

- **`schema_version`** : **facultatif**, sa valeur n'est jamais vérifiée. Son seul effet : un
  objet qui le contient n'est jamais pris pour l'ancien format (adapter.js l.21-24).
  Mettre `"1.1"` est propre, mais ce n'est pas nécessaire.
- **`meta`** : objet libre, **facultatif**, stocké tel quel sur la fiche. Champs réellement lus :
  - `meta.resume` → devient la **synthèse** de la fiche (parsePastedJson l.125). Seulement à la
    **création** d'une fiche : un ajout à une fiche existante ne touche pas la synthèse.
  - `meta.matiere` → ne sert qu'à afficher un avertissement si elle ne correspond pas à la
    matière choisie (seulement dans l'import Rattrapage, pages/ImportRattrapage.jsx l.118).
  - `meta.qcm_conseille` (entier) → nombre de QCM conseillé (lib/planning.js l.554). Sans
    intérêt pour des flashcards.
  - `meta.titre` : **n'est pas lu**. Le titre de la fiche se saisit dans l'écran d'import.
- `note_couverture` à la racine est ignoré sans erreur (l.126-127).

---

## 3. Flashcards à trous (cloze)

Deux éléments à garder synchronisés (lib/cloze.js) :

1. Dans le **`recto`**, chaque trou s'écrit `{{mot}}`. Expression régulière : `/\{\{([^{}]+)\}\}/g`
   (l.27). **Un trou ne peut donc contenir ni `{` ni `}`** : pas de LaTeX avec accolades dans un trou.
2. Le tableau **`cloze`** liste les réponses attendues, **dans l'ordre d'apparition des trous**.
   `cloze[i]` est la réponse attendue pour le i-ème `{{…}}` et c'est le tableau qui fait foi
   (l.32). S'il y a plus de trous que d'entrées, l'app prend le texte entre accolades.

Une carte est considérée comme « à trous » si `type === "flashcard"` et que `cloze` est un tableau
non vide (`isCloze`, l.13-15). Si le recto contient `{{…}}` mais que `cloze` est absent, la carte
est affichée comme une carte classique, **avec les accolades visibles**.

Le **`verso`** reste obligatoire. Il contient en général la phrase complète. En mode « Retourner »,
les mots de `cloze` y sont **surlignés** là où ils apparaissent tels quels (`highlightClozeWords`,
l.66, insensible à la casse). Écris donc les mots masqués à l'identique dans le verso.

La correction du mode saisie tolère 1-2 fautes de frappe (`matchClozeBlank`, l.57-60, via la
distance de Levenshtein d'anatMatch).

Exemple réel du code, forme produite par le formulaire manuel (components/AddItemForm.jsx
l.343-346) et demandée par les prompts (lib/coursePrompts.js, « FORMAT DE SORTIE ») :

```json
{ "type": "flashcard", "theme": "...", "recto": "... {{mot}} ...", "verso": "...",
  "cloze": ["mot"], "indice": null, "a_retenir": null }
```

Règle simple : **`cloze` = la liste exacte des textes entre `{{ }}`, dans le même ordre.**

---

## 4. Champs pédagogiques optionnels

| Champ | Valeurs acceptées | Utilisation dans l'app |
|---|---|---|
| `indice` | string ou `null` | Caché derrière un bouton « Voir l'indice » au recto (mobile/MobileSession.jsx l.295-297). |
| `a_retenir` | string | Encadré « À retenir : » affiché au verso (MobileSession.jsx l.303, CourseItemsSidebar.jsx l.203). |
| `theme` | string | Libellé de la notion : il est recopié dans `concept` et affiché sur la carte ou dans la liste du cours. |
| `concept` | string | Alias de `theme`, utilisé seulement si `theme` est vide. Préfère `theme`. |
| `difficulte` | `1` `2` `3`, ou `"facile"`/`"easy"`/`"simple"` → 1, `"intermediaire"`/`"moyen"`/`"medium"` → 2, `"difficile"`/`"hard"`/`"expert"` → 3. Accents et majuscules ignorés. Toute autre valeur → 2. | Stocké. **Aucun écran ne s'en sert pour les flashcards** aujourd'hui : le rythme de révision dépend seulement de tes notes. |
| `tags` | string[] | Stocké. **Aucun écran ne s'en sert** aujourd'hui (aucune lecture de `.tags` dans le code). |
| `cloze` | string[] | Voir §3. |
| `srcId` | — | **Ne pas le fournir** : il est supprimé. C'est ton `id` qui devient `srcId`. |

LaTeX : les textes passent par le composant `<Tex>`. Dans du JSON, pense à doubler les
antislash (`"$\\Delta G$"`).

---

## 5. Exemple complet et valide (à copier)

Vérifié : `parsePastedJson` renvoie `ok: true`, `counts.flashcard = 3`, `ignored = 0`, `errors = []`.

```json
{
  "schema_version": "1.1",
  "meta": {
    "matiere": "Biologie",
    "resume": "La membrane plasmique est une bicouche phospholipidique à perméabilité sélective."
  },
  "items": [
    {
      "type": "flashcard",
      "id": "bio-membrane-fc-001",
      "theme": "Membrane plasmique",
      "difficulte": "facile",
      "tags": ["membrane", "structure"],
      "recto": "De quoi est principalement constituée la membrane plasmique ?",
      "verso": "D'une bicouche de phospholipides, dans laquelle s'insèrent des protéines et du cholestérol.",
      "indice": "Pense à une double couche de lipides.",
      "a_retenir": "Modèle de la mosaïque fluide (Singer et Nicolson, 1972)."
    },
    {
      "type": "flashcard",
      "id": "bio-membrane-fc-002",
      "theme": "Membrane plasmique",
      "difficulte": "intermediaire",
      "tags": ["membrane"],
      "recto": "Les phospholipides ont une tête {{hydrophile}} et deux queues {{hydrophobes}}.",
      "verso": "Les phospholipides ont une tête hydrophile et deux queues hydrophobes.",
      "cloze": ["hydrophile", "hydrophobes"],
      "indice": null,
      "a_retenir": "Ce caractère amphiphile explique la formation spontanée de la bicouche dans l'eau."
    },
    {
      "type": "flashcard",
      "id": "bio-membrane-fc-003",
      "theme": "Transport membranaire",
      "difficulte": "difficile",
      "tags": ["transport"],
      "recto": "Quelle différence entre diffusion facilitée et transport actif ?",
      "verso": "La diffusion facilitée suit le gradient de concentration, sans énergie. Le transport actif va contre le gradient et consomme de l'ATP.",
      "indice": "Regarde le sens du gradient."
    }
  ]
}
```

Version minimale acceptée (sans métadonnées) :
`{ "items": [ { "type": "flashcard", "id": "x-001", "recto": "…", "verso": "…" } ] }`

---

## 6. Dédoublonnage

**Clé utilisée** : le `srcId` des cartes déjà en base, comparé à l'`id` des cartes collées
(lib/import.js l.83-95). À l'import, ton `id` devient le `srcId` de la carte (storage.js l.394).

**Quand le dédoublonnage s'applique** :

| Situation | Dédoublonnage ? |
|---|---|
| Création d'une **nouvelle fiche** (`createFicheFromQuestions`, l.39) | **Non.** Tout est importé. |
| **Ajout à une fiche existante** (`appendItemsToFiche`, l.79) | **Oui.** Une carte dont l'`id` est déjà le `srcId` d'une carte **de cette fiche** est ignorée et comptée dans « doublons ». Les doublons à l'intérieur d'un même collage sont aussi filtrés (l.94). |

Il y a ajout à une fiche existante :
- quand l'écran d'import (pages/Dashboard.jsx l.679, l.728) trouve une fiche **de même matière et
  de même titre** (casse et espaces ignorés, `findMatchingFiche`, import.js l.21-26). L'ajout est
  alors proposé par défaut ;
- avec « Ajouter un item → Coller du JSON » depuis une fiche (AddItemForm.jsx l.106-149) ;
- dans l'import Rattrapage, quand tu choisis une fiche existante.

**Garanties** :
- **Aucun écrasement possible.** L'import ne fait qu'ajouter des cartes : la clé réelle est
  toujours un `genId('q')` neuf, et une carte existante n'est jamais réécrite. Au pire, tu crées un doublon.
- Le dédoublonnage est **limité à la fiche** : le même `id` dans deux fiches différentes ne pose
  pas de problème.
- **Sans `id`**, l'app génère un id aléatoire (schema.js l.75) : réimporter le même JSON dans la
  même fiche **crée des doublons**.

**Règles à mettre dans ton prompt** :
1. Donner à chaque carte un `id` **unique et stable**, par exemple `<matiere>-<chapitre>-fc-<NNN>`
   (`bio-membrane-fc-001`).
2. Pour **compléter** une fiche déjà importée, garder les ids des anciennes cartes et
   **continuer la numérotation** (`…-fc-004`, `…-fc-005`). Réutiliser un id existant fait
   **ignorer** la nouvelle carte (elle ne remplace pas l'ancienne).
3. Pour **corriger** une carte déjà importée : l'import ne met rien à jour. Il faut la modifier
   dans l'app, ou la supprimer puis la réimporter.
4. Importer dans une **nouvelle fiche** (titre différent) ne dédoublonne rien.
5. Les cartes créées à la main dans l'app ont un `srcId` aléatoire : elles ne
   bloqueront jamais une carte importée.
