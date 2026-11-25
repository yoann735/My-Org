# Banc « section Exos » (25/11/2026) — docs/compte-rendu-section-exos.md

Outils de test, jamais chargés par l'app. Jamais le vrai cloud : faux Supabase `:54399` + Vite `:5300`
(configs « faux-supabase » et « medrevise-faux-cloud » de `.claude/launch.json`). Chrome **headless et muet**
(`--mute-audio`), profils neufs : 9431 ordinateur A, 9432 iPad tactile (1024×1366), 9433 téléphone (390×844),
9434 ordinateur B (2ᵉ appareil). Fichiers de test (PDF, QCM HTML, HTML piégé) générés hors du dépôt
(`$TMPDIR/banc-section-exos`). Captures : `docs/img/section-exos/`.

- `t-creation.mjs <app>` : accès, 3 notions (cours / sans cours / sans fiche), grille, aperçus, filtre, tri, liste.
- `t-lecteurs.mjs <app>` : fiche PDF dans le PdfReader (annoter, fermer, rouvrir, Historique), QCM HTML, HTML piégé.
- `t-modification.mjs <app>` : renommer, cours, ajouter, réordonner, retirer un exo annoté, remettre, remplacer la fiche.
- `t-telephone.mjs` : shell téléphone (accueil → Exos, grille, créer / modifier / supprimer au doigt).
- `t-synchro.mjs` : deux appareils (notions, fichiers, annotations), hors ligne, suppression propagée.
- `t-nonreg.mjs` : barre latérale, lecteur d'un cours et son onglet « Exos », synchro, sauvegardes.
- `t-mealweek.mjs` : MealWeek identique (builds avant / après).

`./tout.sh` rejoue tout.
