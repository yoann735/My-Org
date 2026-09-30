# Rapport de nuit — 30 septembre → 1er octobre 2026 (deuxième nuit)

**En une phrase : les boîtes sont claires et leur épingle se déplace, les flashcards image
existent et entrent dans la méthode des J, et le fichier manquant est identifié — c'est
« Les-ions.html », et tu en as une copie identique sur ton disque.**

Rien supprimé, aucune écriture cloud (le cloud n'a été que lu, en GET), MealWeek : 0 fichier
touché. Tout est testé à la souris réelle (voir « Méthode »), poussé et déployé.

---

## ✅ Ce que tu as à faire (2 minutes, facultatif)

**Remettre le fichier manquant** (recommandé) : MedRevise → Bibliothèque → Rattrapage → Chimie
→ **« Les ions »** → bouton **« Rattacher le fichier… »** → choisis
`Documents/Formations & cours/Rattrapage/Fiches/Chimie/Les-ions.html`.
Réglages affichera ensuite 74/74. Détails et autres options : **`docs/fichier-manquant.md`**.

---

## TÂCHE 3 — le fichier manquant (1 sur 74) — commit `bedec42`

| | |
|---|---|
| **C'est** | le **cours HTML `Les-ions.html`** (377 450 octets) de la fiche **« Les ions »** |
| Où | cours *Rattrapage* › matière *Chimie* › dossier *Unit 1* — 44 cartes (21 flashcards, 13 QCM, 7 exercices, 3 Feynman), qui n'ont **pas** besoin du fichier |
| Importé | le 29/07/2026 à 10:08 UTC, 40 min après la création de la fiche ; jamais modifié dans l'app depuis |
| Appareil | le **Chrome d'un Mac** l'avait encore le 25/08 (il est dans la sauvegarde faite depuis ce navigateur) ; aucun appareil connu ne l'a aujourd'hui |
| **Copies intactes** | ① `~/Documents/Formations & cours/Rattrapage/Fiches/Chimie/Les-ions.html` ② ta sauvegarde de référence du 25/08 — **identiques à l'octet** (même SHA-256) |

**Tes options** (je n'en ai appliqué aucune) :
- **A — le remettre** (recommandé) : bouton « Rattacher le fichier… » sur la fiche (ci-dessus).
- **B — l'appareil d'origine** : ouvrir MedRevise sur tes autres appareils ; peu probable
  qu'il y soit encore, sans risque.
- **C — ne plus y penser** : fiche « Les ions » → menu ⋯ → **« Détacher le cours HTML… »**
  (confirmation demandée) : la fiche et ses 44 cartes restent, seul le lien disparaît.

**Côté app (ce qui a changé)** :
- Réglages ne dit plus seulement « 1 fichier ni ici ni au cloud » mais **lequel** :
  « le cours HTML (Les-ions.html) de la fiche « Les ions » ».
- Une fiche dont le fichier manque reste utilisable (cartes, panneau), dit ce qui manque et
  propose **« Rattacher le fichier… »** sur place (HTML et PDF).
- Menu ⋯ : « Détacher le cours HTML… » / « Détacher le PDF… », **avec confirmation**.

Vérifié : fiche à fichier fantôme ⇒ message + bouton ; vrai fichier choisi ⇒ cours affiché ;
détacher ⇒ lien retiré, cartes conservées.

---

## TÂCHE 1 — boîtes : contrôles limpides + épingle déplaçable — commit `f461dc8`

**Avant** : cinq icônes de 18 px sans texte (cible, flèche, ×, –, corbeille).
**Maintenant** : au-dessus de la boîte (dessous si elle touche le haut de la page), visible
quand la boîte est active ou survolée, une barre **à libellés** :

> 📍 **Épingler** · ➚ **Flèche** · — **Réduire** · 🗑 **Supprimer**

- **Épingler** : « Clique l'endroit de la fiche où épingler cette boîte · Échap pour annuler ».
  Épinglée, le bouton devient **« Retirer l'épingle »**. L'icône est une vraie épingle.
- **Flèche** : jamais grisée. Sans épingle, elle fait d'abord poser l'épingle, puis se trace
  toute seule. Avec : **« Retirer la flèche »**.
- **Déplacer l'épingle** : on la **glisse** directement sur la page (le passage visé est
  recalculé, la flèche suit).
- **Boîte réduite** : sa pastille se **glisse** où tu veux (épinglée : l'épingle suit ; libre :
  la boîte rouvrira à l'endroit du lâcher) ; un **clic** la rouvre. Position mémorisée.
- Chaque bouton a une infobulle qui dit **comment**. Tout est annulable (Cmd+Z).

Vérifié : barre = [Épingler, Flèche, Réduire, Supprimer] ; Flèche sans épingle ⇒ visée puis
flèche ; épingle glissée sur « Le debit cardiaque » ⇒ texte recalculé, pointe au bord du repère ;
pastille glissée ⇒ exactement au point visé (330,548) ; boîte libre réduite déplacée ⇒ rouvre au
point du lâcher ; survol ⇒ barre, départ ⇒ cachée ; Supprimer puis Cmd+Z ⇒ restaurée.

---

## TÂCHE 2 — flashcards IMAGE (occlusion) — commit `50aec11`

**Réutilisé, pas réinventé** : l'éditeur de schéma de l'**anatomie** (`SchemaEditor`), son
format (coches en coordonnées relatives) et son rendu (`ZonesLayer`).

**Où** : panneau de droite → onglet **Flashcard** → deux boutons côte à côte, **« Flashcard
texte »** et **« Flashcard image »**. Aussi : ⋯ → Ajouter un item → Flashcard → « Ou une
flashcard image… ». L'édition se fait dans une **grande fenêtre** : l'éditeur ne tient pas dans
les 380 px du panneau.

**Comment** (rappelé en haut de la fenêtre) :
1. **Colle** une capture (⌘V), glisse ou choisis une image.
2. Dessine une **zone** (Rectangle, Ellipse, Polygone, Pinceau) = un **masque à deviner** ;
   tape sa réponse dans son texte (« Réponse cachée sous ce masque »).
3. Outil **Coche** : clique un endroit = un **texte visible** sur l'image.
4. Question (par défaut « Que cachent les masques ? »), réponse écrite facultative, thème.

**En révision** (ordinateur et mobile) : recto = masques opaques numérotés **?1 ?2 ?3** + les
textes ; verso = contours + réponses posées sur l'image. Notation Raté / Difficile / Facile,
**méthode des J identique** à une flashcard texte (c'en est une, avec une image en plus).

**Garde-fous** : bouton « Créer » désactivé tant qu'il n'y a ni image ni masque (et il dit
pourquoi) ; pied de fenêtre collant ; **confirmation avant de fermer** s'il y a du travail non
enregistré — Échap, qu'on tape souvent dans un éditeur, ne peut plus tout effacer ; coller du
texte dans un champ ne remplace pas l'image ; image perdue ⇒ message + re-choix.

**Tests « comme un utilisateur »** — tous passés, 0 erreur console :

| Intention | Résultat |
|---|---|
| ouvrir sans image / avec image sans masque | « Créer » désactivé + raison |
| coller une capture | image affichée |
| 2 rectangles + 1 ellipse + 1 coche | « 3 masques · 1 texte » |
| créer | carte enregistrée, image stockée, `intervalDays 1`, due aujourd'hui |
| réviser : recto | ?1 ?2 ?3 + « VG », **aucune** réponse visible |
| réviser : verso + « Facile » | réponses visibles ; 1 → 3 jours, historique +1 |
| modifier : changer une réponse, supprimer un masque, changer l'image | enregistré, **état de révision conservé** |
| Échap / Annuler en cours d'édition | confirmation ; « non » garde tout |
| supprimer | carte retirée |
| mobile (390 px) | image 312 px, masques, révélation, notation |
| éditeur d'anatomie | inchangé (export, théorie, synonymes) |

**Deux défauts trouvés en testant, et corrigés** :
- **Mobile, thème sombre** (`8588c1c`) : le recto de **toutes** les flashcards s'écrivait en
  noir sur fond noir (un `<button>` n'hérite pas de la couleur du texte).
- **Éditeur de schéma** (aussi celui de l'anatomie) : le panneau d'une coche passait **sous**
  les poignées de forme — « Supprimer » était incliquable sur une ellipse.

**Revue UX, et ce que j'ai rectifié** : aide en 3 points en tête ; vocabulaire d'anatomie
remplacé dans ce contexte (« Réponse cachée sous ce masque », « (masque sans réponse) » au lieu
de « Nom de la structure » / « (sans nom) ») ; théorie, synonymes et « Export image/PDF »
masqués ici ; pied collant ; confirmation de fermeture ; second point d'entrée depuis
« Ajouter un item ».

**Limite connue** : une carte = tous ses masques d'un coup (pas « un masque par carte » à la
Anki). C'est ajoutable si tu préfères réviser chaque masque séparément.

---

## Check-list de non-régression (version finale)

```
Réviser · Bibliothèque PDF · Bibliothèque HTML · Apprentissage · Import Anatomie · Prise de notes
→ lecteur, outils, panneau (QCM | Flashcard | Exercice | Feynman | Notions) : OK
MealWeek → s'ouvre normalement (« Semaine 1 sur 8 ») — 0 fichier touché
Erreurs console : 0
```

## Ce que j'ai choisi de NE PAS faire

1. **Rattacher ou détacher « Les ions » à ta place** : c'est une écriture sur tes données
   réelles ; tout est prêt pour ton clic (option A ou C).
2. **Restaurer ta sauvegarde de référence** pour récupérer ce fichier : cela remettrait TOUT
   l'appareil dans l'état du 25/08.
3. **Écrire dans le cloud**, même pour vérifier : lecture seule (GET + listing du bucket).
4. **Toucher l'anatomie** au-delà du strict nécessaire : deux options facultatives
   (comportement par défaut inchangé) et un correctif de superposition.

## Méthode

Tests dans un Chrome headless isolé (profil jetable, base locale, synchro désactivée) piloté
par de **vrais événements souris/clavier** (CDP), captures à l'appui ; fichiers choisis via le
vrai sélecteur (`DOM.setFileInputFiles`) ; collage via un vrai `ClipboardEvent` portant un
fichier image. Fichiers de test (`public/*.tmp.*`) jamais commités, supprimés.
