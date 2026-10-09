# Tests du lecteur v2 (09/10) — voir docs/compte-rendu-pdfreader-v2.md

Outils de test, jamais chargés par l'app. Chrome headless isolé piloté en CDP (port 9333, `CDP_PORT`),
devant Vite local SANS Supabase (`VITE_SUPABASE_URL=` vide) ; transcription : `scripts/faux-deepgram.mjs`
+ Chrome lancé avec `--no-sandbox --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=voix.wav`.
Les captures et exports s'écrivent dans `../cap/` (créer le dossier à côté de celui des scripts).

- `seed.mjs` : un document « Document test v2 » et un « PDF image test » (PDF fait d'images, à passer en argument
  du fichier `../fx/image.pdf`) ; `ouvrir-cours.mjs "<titre>" [--recharger]` ouvre un cours.
- `t1-*` barre de mise en forme · `t2-poignee` poignée tablette · `t3-*` surlignage OCR (page PDF image, image de
  document, image collée, rotation) · `t4-*` palette et boîtes · `t5-*` marges et export · `t6-animations`
  durées et prefers-reduced-motion · `t-annuler`, `t-tablette*`, `t-mobile` · `captures.mjs avant|apres`,
  `inventaire.mjs avant|apres` (servir l'ancienne version par `git worktree` sur le même port), `mealweek.mjs`.
