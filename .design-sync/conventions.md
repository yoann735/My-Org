# MyOrg — conventions du design system

Design system partagé par deux applications (**MedRevise**, révision médicale, et
**MealWeek**, planification de repas). Interface **entièrement en français**,
tutoiement. Écris les libellés en français.

## Mise en place

**Aucun provider n'est nécessaire.** Les composants sont pilotés par leurs props ;
aucun ne lit de contexte React — *à une exception près* : `DraggableFiche` et
`DropSlot` doivent être rendus **à l'intérieur d'un `FicheDndProvider`** (hors de
lui, ils ne réagissent à rien). Compose-les toujours ensemble.

**Thème.** Les tokens sont définis sur `:root` (clair) et redéfinis sous
`[data-theme="dark"]`. Pour le thème sombre, pose l'attribut sur un ancêtre :

```jsx
<div data-theme="dark">…</div>
```

**Polices.** `styles.css` charge DM Serif Display et Inter depuis un hôte distant.
Inter est la police de texte ; **DM Serif Display ne s'applique que via la classe
`.serif`** — c'est elle qui donne aux titres leur caractère. Un titre sans
`.serif` reste en Inter.

## L'idiome : des classes CSS, jamais d'utilitaires

Ce système **n'est pas** un système d'utilitaires. Tailwind est présent dans le
dépôt d'origine mais son préréglage est désactivé et aucun composant n'utilise de
classe utilitaire : n'écris **jamais** `flex items-center gap-4 bg-white p-6`.
Utilise les classes ci-dessous, et les tokens pour tout le reste.

**Structure et texte**

| Classe | Rôle |
|---|---|
| `.screen` | conteneur d'écran (rembourrage + défilement) |
| `.topbar` | barre de titre ; `.topbar-actions` pousse les actions à droite |
| `.row` | rangée en flex ; `.row.spread` répartit aux extrémités |
| `.serif` | passe le texte en DM Serif Display (titres) |
| `.hint` | texte secondaire, atténué |
| `.tnum` | chiffres tabulaires — à mettre sur tout nombre aligné en colonne |

**Contrôles**

| Classe | Rôle |
|---|---|
| `.btn` | bouton de base ; variantes `.primary`, `.ghost`, `.danger` ; tailles `.sm`, `.lg` |
| `.icon-btn` | bouton carré à icône (40 px) ; `.sm` → 34 px |
| `.cd-ic` | bouton d'icône discret de fin de ligne (30 px) |
| `.switch` | piste de bascule (rendue par le composant `Switch`) |
| `.seg` / `.seg-btn` | sélecteur segmenté ; `.active` sur le segment courant |
| `.imp-field` | champ de formulaire (label + contrôle) ; `.imp-chips` / `.imp-chip` pour un choix en pastilles, `.on` sur la pastille active |
| `.dz-compact` | zone de dépôt de fichier en pointillés |

**Marqueurs**

| Classe | Rôle |
|---|---|
| `.pill` | pastille neutre ; `.accent` la teinte |
| `.cat-badge` | badge de matière (rendu par `CatBadge`) |
| `.j-tag` | palier de la méthode des J (rendu par `JBadge`) |
| `.due-badge` | compteur d'échéance ; `.sm` en version compacte |
| `.jc-today-badge` / `.jc-paused` | « Aujourd'hui » / « En pause » |

**Surfaces**

| Classe | Rôle |
|---|---|
| `.card` | carte (préfère le composant `Card`) |
| `.day-pop-scrim` / `.day-pop` | voile plein écran + fenêtre (rendus par `Modal`, `ConfirmModal`, `DateActionModal`) |
| `.ctx-menu` / `.ctx-menu-item` | menu contextuel (rendu par `ContextMenu`) |
| `.err-mini` | bandeau de compte rendu ; `.ok` en variante réussite |

## Tokens

Toute couleur, bordure ou ombre passe par une variable — **jamais un littéral** :

`--accent` (violet, couleur d'action) · `--accent-2` (ambre) · `--accent-soft`
(fond teinté) · `--ok` `--warn` `--crit` (états) · `--bg` `--bg-2` (fonds) ·
`--card` `--card-2` (surfaces) · `--text` `--text-2` `--text-3` (trois niveaux de
texte) · `--border` `--border-2` · `--shadow` `--shadow-lg`.

```css
background: var(--card);
border: 1px solid var(--border);
color: var(--text-2);
box-shadow: var(--shadow);
```

Pour une teinte dérivée, le système utilise `color-mix` :
`color-mix(in srgb, var(--accent) 14%, transparent)`.

## Où est la vérité

Lis **`styles.css`** et les fichiers qu'il importe avant de styler quoi que ce
soit : c'est la source complète des classes et des tokens. Pour un composant
précis, lis son **`.prompt.md`** et son **`.d.ts`** — les props y sont typées et
commentées une par une.

## Exemple idiomatique

Un composant de la bibliothèque pour le contrôle, les classes du système pour ta
propre mise en page :

```jsx
import { Card, JBadge, TypeChip, Icon } from 'mealweek';

<Card title="Ostéologie du membre supérieur" icon="bone"
      action={<JBadge jLabel="J+7" />}>
  <div className="row" style={{ gap: 8, marginBottom: 12 }}>
    <TypeChip type="qcm" count={24} />
    <TypeChip type="flashcard" count={18} />
  </div>
  <div className="row spread" style={{ alignItems: 'center' }}>
    <span className="hint">Prochaine échéance : 24 août</span>
    <button className="btn primary sm">
      <Icon name="play" size={13} fill /> Réviser
    </button>
  </div>
</Card>
```
