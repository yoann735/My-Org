# « Diapo d'origine » sur chaque page de fiche (29/10/2026)

Suite de [`compte-rendu-plusieurs-fiches.md`](compte-rendu-plusieurs-fiches.md), étude : `docs/prototypes/lecteur-seances/`.

## Ce qui change à l'écran

- Sur **chaque page de la fiche affichée**, en **haut à gauche**, un petit bouton **« Diapo p. 14 ↗ »**. Il devient « Diapo p. 12–13 » quand la page de fiche résume deux diapositives, et « Document p. … » pour un cours créé dans l'app.
- **Un clic** ouvre la diapo **à cette page**.
- Un bouton **« ← Revenir à la fiche (p. 15) »** apparaît alors en bas au centre. Il ramène à la page de fiche quittée, et à la bonne fiche s'il y en a plusieurs.
- **Pas de lien** sur une page ajoutée dans la fiche (sans équivalent dans la diapo), sur la diapo elle-même, ni dans les exports (le lien n'existe qu'à l'écran).
- **Rien d'autre ne change.** Tab et ⌘⇧F basculent comme avant vers la page correspondante. Revenir à la fiche par Tab ou par le segment efface aussi le bouton de retour.

Pourquoi en haut à gauche :

- **pas en bas** : une page est souvent plus haute que l'écran, on ne verrait le lien qu'en arrivant au bas de la page ;
- **pas à droite** : au-delà de ~140 %, la page est plus large que la zone de lecture et son bord droit sort de l'écran. Le coin droit reste aussi celui du badge du transcript.

Captures (`docs/img/diapo-origine/`) : `ordi-1-lien-sur-la-fiche` et `ordi-2-diapo-avec-retour`, et les mêmes sur tablette.

## Données

**Rien de nouveau n'est stocké.** Le lien lit la correspondance des pages déjà calculée à l'import de la fiche (`pageMap.versOrig` / `versFiche` de `companion_pdf`). Pour un cours « document », c'est la correspondance par bloc, recalculée sur la pagination du moment quand elle est connue.

Le seul ajout au code commun est un **repli** dans la restauration de position du lecteur. La cible d'une bascule peut porter `numero`, le numéro de page affichée. Il ne sert que si l'identifiant de page n'est pas encore connu : c'est le cas d'un document jamais affiché dans la session, où le lien ouvrait la page 1 au lieu de la bonne. Seul ce nouveau lien le renseigne.

## Tests

- **`scripts/tests-fiche-jumelle/t-diapo-origine.mjs`** : 17 sur 17 sur ordinateur, 14 sur 14 sur tablette au doigt.
  - Vérité terrain : fiche p.1 → diapo 1 ; p.6 (ajoutée) → aucun lien ; p.13 (fusion) → 12–13 ; p.15 → 14.
  - Lien dans la page, en haut à gauche, entièrement visible à 160 %.
  - Clic → diapo p.14 ; bouton « Revenir… (p. 15) » ; retour → fiche p.15 ; le bouton disparaît.
  - Tab inchangé ; un retour par Tab efface aussi le bouton.
  - Tablette : cible ≥ 32 px.
  - 0 erreur JS.
- **`t-diapo-origine-doc.mjs`** (cours créé dans l'app) : 8 sur 8. Liens « Document p. … », clic vers la page 2 (défaut corrigé, voir plus haut), retour.
- **Non-régression**, même banc que la fiche jumelle : tous les tests existants donnent le même résultat qu'avant ce chantier, y compris la vérification « p.1 → p.1 » de `t-jumelle-remplacer`, qui échouait déjà avant. Plusieurs fiches : 28 sur 28 sur ordinateur et 7 sur 7 sur tablette.

## Limites connues

- Cours « document » ouvert directement sur sa fiche : tant que le document n'a pas été affiché une fois dans la session, le lien se fonde sur la pagination **au moment de l'import** de la fiche. Si le document a beaucoup changé depuis, le lien peut viser une page voisine.
