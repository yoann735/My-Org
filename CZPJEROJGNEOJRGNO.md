# Reprise — refonte du moteur de document MedRevise (arrêt le 08/10/2026)

## Où on en est (tout est commité et poussé sur `main`)

| Commit | Contenu |
|---|---|
| 606612c | Audit `docs/audit-document-engine.md` (bugs B1 à B9, cause racine) + correctif zoom ⌘ + molette (B9) |
| 9e3faef | Moteur paginé : un seul flux (`pdf/DocumentFlux.jsx`, `documents/lib/pagination.js`, `paginationExt.js`), conversion `notes_doc.flux` + putBackup, synchro, export par copie du flux |
| 835889f | Pages en trop masquées (jamais supprimées), ancien format intact, dépôt d'image dans l'espace libre |
| ea2d9a0 | Paragraphe de moins de 4 lignes jamais coupé, fond noir sans liseré à l'export, test de conformité (`scripts/tests-document/`) |
| 0f4e038 | Captures du test de conformité hors du dépôt (`CAP_DIR`) |

## Tests déjà verts (Chrome headless, jamais le vrai cloud)

- **Scénario de l'audit rejoué sur le nouveau moteur :** rien ne déborde, aucune image perdue ni dupliquée, réouverture intacte.
- **Images :**
  - une image plus haute qu'une page est réduite ;
  - une image qui ne tient pas passe à la page suivante ;
  - une image glissée en haut de la page 1 reste en place après défilement, après réouverture, et sur un 2ᵉ appareil (faux Supabase).
- **Insertion :** 2 paragraphes au début d'un document de 5 pages → aucun saut de vue.
- **Export :** conformité écran / PDF verte sur les 3 documents :
  - texte seul ;
  - texte + 6 images ;
  - texte + images + annotations + fond noir.

  Écart maximal ≤ 1,92 px. Les verdicts sont dans `scratchpad/mesures/*-conformite.txt`, les captures dans `docs/img/document-engine/`.
- **Zoom :** ⌘ seul, ⌘A, ⌘C, ⌘V et ⌘Tab ne zooment plus ; ⌘+, ⌘− et ⌘0 ainsi que le pincement zooment correctement ; la page du navigateur reste à ×1.
- **Conversion des anciens documents** (pages et `content`) : contenu intact et dans l'ordre, sauvegarde avant conversion, idempotente.

## Interrompu en cours

- Test tablette au toucher (`scratchpad/banc/tablette-flux.mjs "Tablette flux"`), arrêté avant son résultat.

## À faire à la reprise

1. Relancer le test tablette et corriger si besoin (glisser d'image au doigt, `touch-action`).
2. **Non-régression :**
   - annotations du lecteur PDF (cours « Cours 20 pages ») ;
   - annuler / rétablir ;
   - OCR d'image ;
   - position de lecture ;
   - MealWeek et `src/shared/` intacts : `git diff 606612c~1 -- src/mealweek src/shared` doit être vide.
3. Cocher « corrigé » chaque bug B1 à B9 dans `docs/audit-document-engine.md`. B9 est déjà corrigé ; les autres le sont par le moteur, B6 par le CSS d'impression.
4. Écrire `docs/compte-rendu-document-engine.md` avec :
   - l'architecture (flux → pagination → rendu → export) ;
   - la cause racine ;
   - les mesures de conformité ;
   - les captures côte à côte ;
   - la liste des commits.
5. Build vert, commit, push.

Bancs de test (en dehors du dépôt) : `scratchpad/banc/`, avec `audit-flux.mjs`, `glisse.mjs`, `conformite.mjs`, `deux-appareils.mjs`, `conversion.mjs` et `insertion-debut.mjs`. Le 2ᵉ appareil utilise Chrome sur les ports 9335 et 9336, Vite sur :5300 et le faux Supabase sur :54399.
