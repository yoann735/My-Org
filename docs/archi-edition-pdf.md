# Architecture — édition « à la Aperçu » d'un PDF (1er octobre 2026)

## La question

Trois demandes touchent au PDF lui-même : **ajouter des pages**, **coller des images DANS
le PDF**, **régler la profondeur (calques)** des éléments collés. Jusqu'ici, le fichier
d'origine n'est **jamais** modifié : surlignages, boîtes, traits… vivent à part (stores
`highlights` / `annotations`, coordonnées normalisées [0,1]) et sont dessinés par-dessus
au rendu. C'est ce qui fait que rien ne peut abîmer un cours.

Deux voies possibles :

| | A. Calque par-dessus (ajouts = annotations) | B. Nouvelle version du PDF (pdf-lib) |
|---|---|---|
| Blob d'origine | intact, jamais relu en écriture | intact, mais un 2ᵉ blob devient « le » document |
| Annuler | Cmd+Z, comme toute annotation | revenir à l'ancienne version (lien `pdfId` à rebasculer) |
| Annotations existantes | inchangées | **toutes à re-numéroter** si une page est insérée (elles visent `page: n`) — une écriture cloud par annotation |
| Synchro | enregistrements ordinaires du store `annotations` (+ blob image) | un nouveau PDF complet à envoyer (Mo) à chaque ajout |
| Recherche, surlignage, ancres | inchangés (les pages du PDF gardent leur numéro) | ancres pdf.js recalculées sur un autre fichier |
| Risque | faible, additif | élevé : un bug = un document faux qui remplace le bon |

## Décision : **A — tout ajout est une annotation, le PDF n'est jamais réécrit**

Le blob d'origine n'est **lu** qu'à deux endroits (rendu pdf.js, export) et n'est
**jamais réécrit** ni remplacé. `fiche.pdfId` ne change pas.

Trois nouveaux **types** d'annotation dans le **même store `annotations`** (même synchro,
même historique d'annulation, aucune migration, aucun nouveau store côté cloud) :

| type (`kind`) | champs | rendu |
|---|---|---|
| `page` | `apres` (n° de page du PDF après laquelle elle s'insère, 0 = avant la 1ʳᵉ), `rang` (ordre entre pages ajoutées au même endroit), `width`/`height` (taille copiée sur la page voisine, en points) | une page blanche intercalée dans la liste affichée |
| `image` | `blobId` (blob ordinaire, même canal que les images de flashcards), `page`, `x`,`y`,`width`,`height` normalisés, `z` (calque) | une `<img>` posée sur la page |
| `texte` | `page`, `x`,`y`,`width`, `content` (TipTap), `couleur` | du texte libre sans cadre |
| `question` | `page`, `x`,`y` | un « ? » rond |

Les 4 entrent dans `lib/annotationTypes.js` (catégories nommées) ; une version
antérieure de l'app les ignorerait (kind inconnu → `null`, « jamais mal classé »).

### Pages ajoutées : la clé de page

Une annotation garde `page: <numéro>` pour les pages du PDF (rien ne change pour
l'existant). Sur une **page ajoutée**, `page` vaut **l'id de la page ajoutée**
(`"an…"`, une chaîne). Le lecteur construit une **liste de pages affichées** :
pages du PDF dans l'ordre, et après la page *n* les pages ajoutées `apres = n` triées
par `rang`. Insérer une page ne renumérote donc **aucune** annotation existante.
Supprimer une page ajoutée supprime aussi ses annotations, en **une** entrée d'annulation.

### Calques : règle fixe

Ordre dans une page, du bas vers le haut :

```
canvas du PDF → couche de texte → IMAGES COLLÉES (triées par z)
  → surlignages → blocs remplacés → surligneur à main levée → traits de crayon
  → textes libres, « ? », boîtes (+ flèches)
```

Le réglage de profondeur (Premier plan / Avancer / Reculer / Arrière-plan) ne fait
varier `z` **qu'entre images** : une image ne peut jamais passer au-dessus d'une boîte,
d'un trait ou d'une annotation — c'est structurel (ordre des couches dans le DOM et à
l'export), pas une condition.

### Export : un **nouveau** fichier

« Exporter le PDF annoté » charge une **copie en mémoire** des octets d'origine
(`PDFDocument.load`), y insère les pages ajoutées, dessine dans l'ordre des calques
ci-dessus, et propose le résultat en téléchargement (`…-annote.pdf`). Le blob
IndexedDB n'est jamais réécrit (vérifié par SHA-256 avant/après, voir
`docs/rapport-nuit.md`). Les boîtes sortent **ouvertes** (texte visible, même celles
réduites en pastille dans l'app), à leur position, avec leur **flèche** et leur épingle.

### Réversibilité

- Retirer la fonctionnalité = ignorer les 4 types : le PDF et toutes les annotations
  d'avant s'affichent exactement comme hier.
- Chaque ajout s'annule par Cmd+Z ; chaque élément se supprime individuellement.
- Rien n'est migré, rien n'est réécrit au cloud en masse : seules les créations faites
  par l'utilisateur partent, une par une, comme pour une boîte.

### Limites connues

- Pages **pivotées** (`/Rotate` ≠ 0) : l'export suppose des pages droites (limite déjà
  acceptée pour les surlignages).
- Export du texte riche : gras/italique/tailles simplifiés (police Helvetica standard ;
  les caractères hors WinAnsi — emoji, flèches unicode — sont remplacés).
