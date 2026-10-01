# Mécanique — tableau type Miro dans le lecteur PDF (3-4 octobre 2026)

Un tableau blanc par fiche, à côté du PDF ou en plein écran, pour construire sa propre
synthèse visuelle d'un cours. v1 : un seul type de contenu, la **carte de texte**, mais
un canvas complet (zoom/pan infini, sélection multiple, flèches ancrées, annuler).

---

## 1. Audit — ce qui existe et se réutilise

| Besoin | Existant réutilisé | Neuf |
|---|---|---|
| Stockage local + synchro | `lib/storage.js` : `put` / `remove` horodatent et mettent en file la synchro pour tout store de `SYNCABLE` ; `reconcileAll` est générique par store ; la table cloud `medrevise_records` accepte n'importe quel nom de store (colonne texte, garde-fou last-write-wins côté serveur) | un store `tableau` ajouté à `SYNCABLE` |
| Annuler / rétablir | `lib/annotHistory.js` : `creerPile`, `cmdCreer`, `cmdModifier`, `cmdSupprimer`, `cmdGroupe` et leurs **effets locaux synchrones** (le correctif « hallucinations ») | une **seconde pile**, propre au tableau |
| Écran partagé + poignée | `apprentissage/UniteSplit.jsx` : ratio en localStorage, poignée en capture de pointeur, double-clic pour replier | le même patron dans le lecteur, trois modes |
| Sélection de texte du PDF | `pending` du lecteur : avec l'outil **Sélection**, une sélection est gardée sans rien surligner | une bulle « + Carte sur le tableau » |
| Couleurs | `pdf/Couleurs.jsx` (4 couleurs « cours » + mes couleurs synchronisées + roue) | — |
| Canvas infini, cartes, flèches | — | 100 % neuf (`src/medrevise/tableau/`) |

**Vérifié dans le code :**
- un client qui ne connaît pas encore le store `tableau` ignore ces lignes :
  `reconcileAll` ne parcourt que **ses** stores ;
- la limite de lecture cloud est de 200 pages × 1 000 lignes, soit 200 000 lignes, contre
  environ 1 200 aujourd'hui : des centaines de cartes ne la menacent pas.

## 2. Stockage

**Un enregistrement par élément** dans un nouveau store `tableau` (un pour toutes les
fiches, filtré par `ficheId`, comme `annotations`). On n'utilise pas un gros document
« tableau » unique.

```
carte : { id, ficheId, type:'carte', x, y, w, h, texte, couleur, z, createdAt, updatedAt }
lien  : { id, ficheId, type:'lien', de:{ id, cote }, vers:{ id, cote },
          style:'droite'|'coudee'|'courbe', tete:'fin'|'deux'|'aucune' }
```

- `x, y, w, h` : coordonnées du **monde** du tableau (px à zoom 1), illimitées.
- `cote` : 'n' | 'e' | 's' | 'o' (le point d'ancrage au milieu de chaque côté), ou
  'auto' (le côté le plus proche de l'autre carte, recalculé à chaque rendu).
- **Poids :** une carte pèse quelques centaines d'octets. On écrit une ligne à la fois,
  jamais tout le tableau : déplacer une carte n'envoie qu'elle.
- **Conflits :** deux appareils qui modifient deux cartes différentes ne s'écrasent pas
  (last-write-wins **par carte**). Un seul document aurait perdu une des deux
  modifications.
- **Caméra** (zoom, position) et **disposition** (PDF / les deux / tableau, ratio) :
  préférences d'affichage, en localStorage, par fiche. Rien au cloud.
- **Réversible :** retirer la fonctionnalité laisse un store inutilisé, sans migration.
  Les autres stores ne sont pas touchés.
- **Purge d'une fiche** (corbeille) : ses éléments de tableau sont purgés avec elle.
- **Sauvegardes** (`backupExport`) : elles parcourent déjà tous les stores.

## 3. Le canvas

**DOM transformé + un seul SVG pour les flèches**, dans un même « monde » :

```
.tb-vue (overflow hidden, fond = grille CSS)
  └─ .tb-monde  style transform: translate(px,py) scale(z)   ← UNE seule propriété animée
       ├─ <svg class="tb-liens">   les flèches (coordonnées monde)
       └─ .tb-carte × N            position absolute left/top/width/height (monde)
```

- **Pan et zoom fluides** : pendant le geste, on écrit `transform` directement sur
  `.tb-monde` (référence DOM, une fois par image, `requestAnimationFrame`), **sans aucun
  rendu React**. L'état React de la caméra n'est validé qu'à la fin du geste (150 ms
  sans mouvement). Le compositeur GPU ne déplace alors qu'une couche : même avec des
  centaines de cartes, aucun recalcul de mise en page.
- **Grille** : fond CSS en points (`radial-gradient`) sur `.tb-vue`. Sa taille et son
  décalage suivent la caméra, sans un seul élément de plus dans le DOM.
- **Charge** : au-delà de 150 cartes, celles qui sont hors de la vue (avec une marge) ne
  sont pas montées. Le calcul est fait à la validation de la caméra, pas à chaque image.
- **Pourquoi pas `<canvas>`** : il faudrait réécrire l'édition de texte, la sélection et
  l'accessibilité. Le DOM fait tout cela nativement, et la transformation GPU suffit à la
  fluidité.
- **Gestes :**

  | Geste | Effet |
  |---|---|
  | molette, ou deux doigts sur le trackpad | pan |
  | Cmd/Ctrl + molette, ou pincement | zoom centré sur le curseur (facteur proportionnel, comme le zoom du PDF) |
  | glisser le fond | sélection rectangle |
  | Espace + glisser, outil Main (H), clic du milieu | pan |
  | double-clic sur le fond | nouvelle carte |

## 4. Les flèches

- Points d'ancrage : le milieu de chaque côté de la carte (n, e, s, o). En `auto`, on
  prend le couple de côtés qui se font face (comparaison des centres).
- Chaque flèche est **recalculée à chaque rendu** depuis les rectangles **affichés** des
  deux cartes (aperçu du geste compris). Elle suit donc la carte pendant qu'on la
  déplace, sans rien stocker de plus.
- **Trois tracés :**
  - **droite** : un segment d'ancre à ancre ;
  - **coudée** (dure, angulaire) : chemin orthogonal ; on sort de 24 px selon la normale
    du côté, on fait un coude au milieu, puis on entre de 24 px ;
  - **courbe** (souple) : une Bézier cubique dont les points de contrôle prolongent les
    normales des deux côtés (longueur = 40 % de la distance, entre 40 et 200 px).
- **Pointe** : un `marker` SVG. Épaisseur constante à l'écran
  (`vector-effect: non-scaling-stroke`).
- **Créer** : au survol d'une carte, 4 poignées d'ancrage apparaissent. On glisse depuis
  l'une d'elles (une flèche fantôme suit le pointeur) et on lâche sur une autre carte :
  le côté le plus proche est choisi.
- **Rediriger** : une flèche sélectionnée montre ses deux bouts, qu'on peut glisser vers
  une autre carte.
- **Supprimer** : Suppr, ou la corbeille de sa barre.
- **Style** : la barre de la flèche sélectionnée propose Droite / Coudée / Courbe et la
  pointe.

## 5. Intégration au lecteur

- **Disposition** : bascule segmentée **PDF · Les deux · Tableau** dans la barre du
  lecteur.
  - « Les deux » : PDF à gauche, tableau à droite, poignée réglable (patron
    `UniteSplit`), double-clic pour revenir à 50/50 ;
  - « Tableau » : le PDF reste **monté mais masqué**, et on retrouve sa page et son
    zoom.
  - Le panneau d'items se replie quand le tableau est visible, pour la place. Il se
    rouvre d'un clic.
  - L'état est mémorisé par fiche (localStorage).
- **Création depuis une sélection** : seulement avec l'outil **Sélection**, qui ne
  surligne jamais rien ; il garde la sélection dans `pending`.
  - Quand le tableau est visible et qu'une sélection existe, une bulle
    « ＋ Carte sur le tableau » apparaît au bout de la sélection ;
  - un clic crée la carte avec le texte, posée au centre de la vue du tableau, en
    cascade si plusieurs ;
  - la bulle fait `preventDefault` au `mousedown` : la sélection n'est pas perdue ;
  - avec l'outil **Surligneur**, rien ne change : la sélection surligne, comme avant ;
  - aucun lien n'est gardé vers le PDF, seulement le texte.
- **Raccourcis, sans conflit** : le tableau est un conteneur focusable. Ses raccourcis
  (Cmd+Z, Suppr, Cmd+A, Cmd+D, flèches, Échap) n'agissent que lorsque **le focus est
  dans le tableau**. Les gestionnaires globaux du lecteur (Cmd+Z des annotations, Échap
  des outils) **ignorent** les événements dont la cible est dans `.tb`. C'est le même
  principe que la séparation TipTap / historique d'annotation : la cible du clavier
  départage.

## 6. Étapes (un commit chacune)

1. Cette mécanique.
2. **Données** : store `tableau` ajouté à `SYNCABLE`, module `lib/tableau.js` (fabriques,
   lecture par fiche), purge avec la fiche. Pas encore d'interface.
3. **Canvas + disposition** :
   - les trois modes, la poignée, l'état mémorisé ;
   - pan et zoom fluides, grille ;
   - cartes : créer (double-clic, bouton), éditer, déplacer, redimensionner, couleur,
     supprimer ;
   - sélection multiple (Maj+clic, rectangle), déplacement groupé ;
   - annuler/rétablir.
4. **Flèches** : ancres, création par glisser, trois tracés, suivi, redirection,
   suppression, style.
5. **Création depuis une sélection du PDF.**
6. **Confort** : guides d'alignement (aimantation aux bords et centres des autres
   cartes), Cmd+D, Cmd+A, flèches du clavier, mini-barre de zoom (− % + « tout
   afficher »), test de charge avec 300 cartes.

## Risques identifiés et parades

| Risque | Parade |
|---|---|
| Un nouveau store synchronisé | Store **neuf** (aucune donnée existante réécrite), lignes ignorées par les anciens clients, testé hors cloud. Seules les créations de l'utilisateur partent, une par une. |
| Conflits de raccourcis avec le lecteur | Routage par la cible du focus (voir 5), testé : Cmd+Z dans le tableau n'annule pas une annotation du PDF, et inversement. |
| Le PDF masqué en mode Tableau | Le lecteur est déjà conçu pour un panneau de largeur nulle (l'ajustement ignore une zone < 120 px). |
| Charge (beaucoup de cartes) | Transformation GPU + culling au-delà de 150 cartes, mesuré avec 300 cartes. |

Aucun point ne me paraît d'architecture incertaine : on enchaîne sur le code.
