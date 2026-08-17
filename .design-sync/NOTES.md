# design-sync — notes de reprise (MyOrg)

Projet Claude Design : `3bb6b22a-26e1-46a1-95f4-c1dc96811742`
(https://claude.ai/design/p/3bb6b22a-26e1-46a1-95f4-c1dc96811742)

## Ce dépôt n'est pas une bibliothèque

C'est une **application privée** (Vite + React, `package.json` sans `exports` ni
build de lib). Il n'y a **ni `dist/` de bibliothèque, ni `.d.ts` livrés**. D'où
deux choix structurants, à ne pas défaire :

- **`.design-sync/ds-entry.mjs`** est l'entrée passée au convertisseur
  (`--entry`, aussi enregistrée dans `cfg.entry`). Elle ré-exporte les 27
  composants du design system **et importe les deux feuilles de style**.
  Sans elle, le convertisseur synthétise une entrée depuis *tous* les `.jsx` de
  `src/` — pages, sessions, lecteur PDF, TipTap — avec collisions de noms.
- **`cfg.dtsPropsFor` porte les 27 contrats de props, écrits à la main.**
  `exportedNames()` ne trouve rien (aucun `.d.ts`) et ts-morph n'extrait rien
  d'utile d'un JSX déstructuré : sans ces entrées, chaque `<Name>Props` sort en
  `[key: string]: unknown`, et l'agent de design code à l'aveugle.
  **Si tu ajoutes un composant, ajoute son contrat ici** — c'est le seul endroit.

## CSS : la feuille passe par l'ENTRÉE, pas par `cssEntry`

`cfg.cssEntry` est **concaténé** à `_ds_bundle.css`, et `cfg.tokensGlob` ne
s'applique qu'à un *paquet npm* de tokens (`cfg.tokensPkg`) — inutile ici. Les
deux feuilles arrivent donc par des `import` dans `ds-entry.mjs`, **dans l'ordre
de `src/main.jsx`** : `design.css` (tokens + primitives) **puis** `etudes.css`
(surcharges MedRevise). Inverser casse la cascade.

Volontairement exclus : `index.css` (directives Tailwind — préréglage désactivé,
aucun composant du DS n'utilise d'utilitaire), `documents.css` et
`medrevise-mobile.css` (écrans hors périmètre).

## `guidelinesGlob: []` — délibéré

Le glob par défaut happait `docs/*.md`, qui ne contient que des **audits
techniques internes** (synchro, méthode des J, audit UX de Réviser). L'agent de
design les lirait comme des consignes de design. Ne pas rétablir le défaut sans
ajouter de vrais documents de règles.

## Deux composants écartés

`StudySidebar` et `DestPicker` sont dans `componentSrcMap` à `null` : ils lisent
l'état de l'app via `ctx`/`db` et ne s'affichent pas seuls. `ICONS` et
`ETIQUETTES` sont exclus aussi (constantes, pas des composants).

## Recettes d'aperçu apprises ici

- **Surfaces modales** (`Modal`, `ConfirmModal`, `DateActionModal`) rendent leur
  propre voile en `position: fixed`. Dans une carte, il s'échappe de la cellule.
  Chaque aperçu les pose dans une **scène conteneur** (`position: relative` +
  `transform: translateZ(0)`, qui crée un bloc conteneur pour le `fixed`) avec une
  hauteur fixe et `overflow: hidden`. `cfg.overrides` met ces trois-là en
  `cardMode: "column"` pour qu'elles aient la largeur de la carte.
- **`ContextMenu` se rend dans un portail vers le `body`** : aucune scène ne peut
  le contenir, et rendu seul il laisserait le root vide. Son aperçu affiche donc
  la **ligne source** (contenu réel du root) et laisse le menu se dessiner par
  dessus, aux coordonnées passées.
- **Trio glisser-déposer** : `DraggableFiche` et `DropSlot` n'existent que dans un
  `FicheDndProvider` — les trois aperçus montrent la même scène composée.
- **Les fichiers `File`** de `CourseDocField` se construisent dans l'aperçu
  (`new File([…], 'x.pdf', { type: 'application/pdf' })`) : `detectDocKind` lit le
  type et l'extension.

## Warns de rendu connus (à ne pas rechasser)

- **`DropSlot` — cellules quasi vides, et c'est correct.** Depuis l'étape 3 de
  l'audit UX, un créneau de dépôt est réduit à une bande de ~6 px au repos et ne
  s'ouvre en zone « Déposer ici » que **pendant un glisser** (contexte
  `FicheDragCtx`, `ui.jsx`). Une capture statique ne peut pas le montrer. Les
  aperçus situent les créneaux dans une liste et le disent en commentaire.
- **`TodaySeriesCard` — `SerieDuJour` et `Compacte` se ressemblent beaucoup.** La
  variante compacte ne change que le rembourrage et la taille du titre. Différence
  réelle, faible à l'œil ; ce n'est pas un doublon.
- **`[FONT_REMOTE]`** est attendu : `design.css` charge DM Serif Display et Inter
  par `@import` distant. Rien à embarquer ; les polices se chargent à l'exécution
  (vérifié : les titres `.serif` sortent bien en DM Serif dans les captures).
- **`tokens: 30 définis, 32 référencés (3 manquants)`** — sous le seuil, non
  bloquant, jamais apparu à l'écran.

## Environnement

- Node **v24.18.0**, `npm ci` (lockfile `package-lock.json`).
- npm de cette machine **bloque les scripts d'installation** (`allow-scripts`) :
  `esbuild` n'exécute pas son `postinstall`. Vérifié, il fonctionne quand même
  (paquet de plateforme installé en dépendance optionnelle). Si un jour esbuild
  refuse de démarrer : `npm approve-scripts esbuild` dans `.ds-sync/`.
- Playwright + Chromium installés dans `~/Library/Caches/ms-playwright`
  (macOS — **pas** `~/.cache/ms-playwright`, un `ls` sur ce chemin ne trouve rien).

## Risques de resynchro

- **Les 27 contrats de props sont écrits à la main et ne se revalident pas tout
  seuls.** Si une signature change dans `ui.jsx` (prop ajoutée, renommée,
  supprimée), `cfg.dtsPropsFor` ment en silence : rien ne le détecte. **À chaque
  resynchro, diffe les signatures de `ui.jsx` contre `dtsPropsFor`.**
- **`conventions.md` cite des classes et des tokens par leur nom.** Ils ont été
  vérifiés contre `_ds_bundle.css` au moment de la synchro. Un renommage dans
  `design.css`/`etudes.css` le rendrait faux — revalide avant d'envoyer.
- **Le contenu des aperçus est inventé mais plausible** (noms de cours, matières,
  taux de réussite). Ce ne sont pas des données réelles du dépôt ; il n'y a rien
  à resynchroniser de ce côté, mais ne les prends pas pour des exemples canoniques
  validés par l'auteur.
- **Les polices dépendent du réseau.** Une capture hors ligne ferait retomber
  toutes les cartes sur une police système, sans qu'aucun contrôle ne le signale.
- **`ds-entry.mjs` doit suivre les ajouts.** Un composant ajouté à `ui.jsx`
  n'apparaît que s'il est ré-exporté ici *et* déclaré dans `componentSrcMap`
  *et* doté d'un contrat dans `dtsPropsFor`.
- Le convertisseur signale `docs: 0/27` : il n'existe aucune documentation par
  composant dans le dépôt. Les `.prompt.md` sont donc synthétisés depuis les
  contrats et les aperçus — c'est voulu, pas une régression.
