# Recommandation : le lecteur de cours organisé par séances (29/10/2026)

Prototypes : [`index.html`](index.html) (les 3 versions côte à côte). Audit : [`audit.md`](audit.md).

## 1. Version recommandée : **A « Séances d'abord »**, avec deux emprunts

**A** fait de la séance l'objet de navigation. Un cours s'ouvre sur ses séances. Chaque séance a trois documents, **Fiche(s) · Diapo · Transcript**. La fiche se lit avec ses sources (pages de diapo, phrases du transcript) qui suivent la page lue.

C'est la seule des trois versions qui répond **en 3 secondes** aux trois moments :

- **ouverture** : séances, fiches manquantes, Reprendre, Aujourd'hui ;
- **direct** : diapo + transcript, tag Début posé tout seul ;
- **révision du soir** : fiche + sources automatiques.

Elle garde aussi le lecteur actuel *à l'intérieur* de la séance : mêmes outils, même panneau.

**Emprunts aux autres versions :**

- **de B (le classeur)** : le **ruban des séances**, une mini-carte des 300 pages en bandes colorées, cliquable. Il est sur l'accueil du cours dans A ; il faut aussi l'afficher en fin de barre sur la vue Diapo complet. On garde aussi le principe que le lecteur actuel reste reconnaissable, pour limiter le réapprentissage ;
- **de C (la table synchronisée)** : le **verrou de synchronisation** des sources. En révision, les sources suivent la page de fiche lue, avec un bouton pour figer quand on veut comparer deux endroits. Et l'affichage **côte à côte** fiche + diapo sur grand écran, en option.

**Pourquoi pas B seul.** B est le moins risqué. Mais il garde un modèle **centré document** : 8 onglets de documents, et des séances qui ne sont qu'une couleur. L'étudiant doit encore se demander quelle fiche va avec quelles pages. Le direct et la révision restent les mêmes écrans encombrés d'outils.

**Pourquoi pas C seul.** C est le plus puissant en révision, mais le plus dense : 3 volets + sommaire. Il est inutilisable tel quel sur iPad en portrait et sur téléphone. Il supprime le panneau latéral auquel les écrans Exos / Notions sont habitués. Et c'est de loin le plus long à construire, avec un défilement synchronisé à trois.

## 2. Modèle de données cible

Principe : **ajouter** deux magasins et des champs. Rien n'est supprimé : les anciens enregistrements sont relus et convertis à la volée, puis migrés en tâche de fond après un `putBackup`.

### 2.1 Nouveau : `seance` (synchronisé)

```js
{
  id: 'se_…',                 // stable
  courseId: 'f-…',            // le cours (store fiches)
  n: 2,                       // ordre affiché (S2)
  titre: 'Filtration glomérulaire et clairances',   // proposé = titre de la 1ʳᵉ diapo, modifiable
  date: '2026-10-08', heure: '08:30',
  pages: { de: 59, a: 121 },  // tranche du diapo original (null tant que la fin n'est pas posée)
  transcriptIds: ['ts…'],     // 1 session, ou plusieurs si le direct a été repris
  couleur: '#3FA7D6',         // dérivée de n, modifiable
  creePar: 'direct' | 'tags' | 'manuel' | 'migration',
  updatedAt, deleted?
}
```

- Le **direct** crée la séance (ou réutilise celle du jour), pose `pages.de` sur la page affichée et ajoute la session de transcript. **Terminer** pose `pages.a`.
- Les tags `page_tag` Début / Fin **restent** : c'est leur rendu visuel sur les pages. Ils portent désormais `seanceId`, et ce n'est plus le tag qui *définit* la séance.

### 2.2 Nouveau : `fiche_resume` (synchronisé), qui remplace `companion_pdf` à terme

```js
{
  id: 'fr_…', courseId,
  titre: 'DFG et ses déterminants',
  seanceIds: ['se_2'],             // 1 séance, ou plusieurs (fiche de synthèse)
  fileId, fileName, nbPages,
  nsAnnot: '<courseId>::fr:<id>:<version>',   // espace de noms des annotations de CETTE fiche
  pageMap: { versOrig: [...], versFiche: [...], scores: [...], methode, manuel },  // comme aujourd'hui, mais par fiche
  sourcesTranscript: [{ pageFiche: 3, sessionId: 'ts…', t0: 760, t1: 905 }],     // calculé : pages d'origine × segments horodatés
  versions: [...], importeLe, ordre, updatedAt, deleted?
}
```

- **Pages d'origine d'une page de fiche** : `pageMap.versOrig`, déjà calculé par l'appariement actuel, mais restreint aux pages de la séance. Le calcul est **plus fiable** qu'aujourd'hui, puisqu'on cherche dans 60 pages au lieu de 300.
- **Lien vers le transcript** : chaque segment de transcript porte déjà `page` (`transcription/pages.js`). Les segments dont la page est dans `versOrig(pageFiche)` donnent la plage horaire. On le calcule, on ne le stocke pas forcément ; si on le stocke, c'est en cache.

### 2.3 Champs ajoutés aux magasins existants (optionnels, rétrocompatibles)

| Magasin | Champ ajouté | Usage |
|---|---|---|
| `transcript_session` | `seanceId` | regroupement par séance, badges de toutes les séances |
| `page_tag` | `seanceId` | rendu sur les pages, correction manuelle |
| `questions` (flashcards…) | `seanceId?`, `source.ns` (existe déjà) | filtre « Cette séance » ; déduit de `source.ns`/`page` si absent |
| `highlights` / `annotations` | aucun | l'espace de noms `nsAnnot` de chaque fiche suffit (existe déjà) |
| `notes_doc` | `id = seanceId` pour la note d'une séance | une note par séance + la note du cours (`id = courseId`, existante) |
| `reading_position` | aucun | déjà une position par espace de noms : une par fiche, gratuitement |

## 3. Ce qui disparaît de l'app actuelle

| Élément actuel | Devient |
|---|---|
| Segment **Original · Fiche** (et Tab / ⌘⇧F) | Sélecteur **Fiche(s) · Diapo · Transcript** de la séance ; Tab passe de la fiche à la diapo source |
| Mode **Transcript** du panneau | Document de la séance + **mode d'écran En direct** ; le panneau garde Cartes / Notions / Notes |
| Fenêtres **Fichiers du cours** et **Séances** | Un seul écran **« Séances et documents »** (et l'accueil du cours) |
| Sections **Diapo originale** / **Fiche** du menu Fichier | Une section **« Document affiché »** |
| Pose manuelle des tags + fenêtre « transcript lié » | Automatique par le direct ; la fenêtre reste pour **corriger** |
| « ⋯ » de la barre, Insérer › Page, doublon Prompts, rangée d'aide vide | Supprimés |
| Disposition PDF / Les deux / Tableau dans l'en-tête | Menu « Affichage » |
| Code mort (`ajoutPage`, détacher le PDF, `AddItemModal`, props non fournies) | Supprimé |

## 4. Données existantes : ce qui change, sans rien perdre

1. **`putBackup('pre-seances-<courseId>-<date>')`** avant toute écriture : tags, sessions, `companion_pdf` et fiches du cours.
2. **Séances depuis les tags existants.** Chaque couple Début → Fin du document *original* calculé par `lib/tagsPages.js` devient une `seance`. On garde la date et les pages ; le transcript vient du `transcriptSessionId` du tag. Les tags reçoivent `seanceId`. Les tags posés sur la *fiche* sont rapportés sur la diapo par `pageMap.versOrig`.
3. **Sessions de transcript sans tag.** Elles sont regroupées par **date** : une session sans séance du même jour crée une séance de pages `de` / `a` égales à la min / max des `page` de ses segments. Sans pages : séance « à compléter ».
4. **`companion_pdf` (une fiche par cours) → `fiche_resume`.** On garde **le même `nsAnnot`**, donc aucune annotation ne bouge. On garde le même `pageMap` et les mêmes `versions`. La séance est déduite des pages couvertes par `versOrig`. Si aucune séance n'existe, la fiche est rattachée à « toutes les séances » et proposée à la correction. **Les versions archivées** de l'ancien modèle sont listées dans « Séances et documents » ; on peut les rouvrir.
5. **Le lecteur relit les deux formats** tant que la migration n'est pas finie. `companion_pdf` n'est **jamais supprimé** : il est marqué `migreVers: 'fr_…'`.
6. **Flashcards et notions** : `seanceId` est **calculé** à l'affichage (page de `source`, ou fiche d'origine). Rien n'est réécrit tant que l'utilisateur ne modifie pas la carte.
7. **Synchronisation** : les deux nouveaux magasins passent par l'outbox et `medrevise_push` comme les autres. Le script SQL n'a pas besoin de nouvelle table : la table générique `medrevise_records` accepte un nouveau `store`.

## 5. Découpage en chantiers

| # | Chantier | Contenu | Livrable vérifiable |
|---|---|---|---|
| **1** | **Séances en données** | Magasin `seance`, migration tags + sessions → séances (§4.2-3, `putBackup`), `seanceId` sur tags et sessions, synchro. Écran **« Séances et documents »** qui remplace Fichiers du cours + Séances | Sur une copie des vraies données : même nombre de tags, de sessions et d'annotations avant / après ; chaque séance a ses pages et son transcript ; 2 appareils voient les mêmes séances |
| **2** | **Plusieurs fiches par cours** | Magasin `fiche_resume` (migration `companion_pdf`, même `nsAnnot`), import avec **proposition de séance** (date, pages reconnues, vocabulaire du transcript), glisser sur une séance, correspondance par fiche | 7 fiches dans un cours, 2 sur la même séance, 1 sur deux séances ; annotations de l'ancienne fiche intactes au pixel |
| **3** | **Accueil du cours + navigation séance** | Accueil (ruban, Reprendre, Aujourd'hui, cartes de séance), rail des séances, sélecteur Fiche(s) · Diapo · Transcript, saisie du n° de page, menu Fichier simplifié, suppression des doublons et du code mort | Les 3 questions « en 3 secondes » se vérifient sur captures (ordinateur, iPad) |
| **4** | **Révision avec sources + direct** | Colonne **Sources** qui suit la page de fiche (verrou, côte à côte en option) ; **mode En direct** (tag Début / Fin et lien transcript automatiques, outils masqués) ; « Exporter la séance pour Claude » | Lire f2a p. 4 → les diapos 70–73 et les phrases du transcript correspondantes apparaissent ; un direct crée une séance complète sans aucun tag manuel |
| **5** | **Filtres par séance + téléphone** | Filtre « Cette séance / Tout le cours » dans Cartes, Notions, Notes (une note par séance) ; **lecture de fiche sur téléphone** (lecture, surlignage, feuille Sources), liste des séances | Réviser S2 le soir sur téléphone avec ses 4 flashcards et la fiche f2a |

Ordre conseillé : 1 → 2 (le socle des données, sans toucher à l'écran), puis 3 → 4 (l'expérience), et 5 en dernier. Chaque chantier se livre et se teste seul. **Le lecteur actuel continue de fonctionner entre deux chantiers** : le segment Original · Fiche lit la première fiche de la séance tant que le chantier 3 n'est pas livré.
