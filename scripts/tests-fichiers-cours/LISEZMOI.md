# Tests du 16/10 — carnet d'erreurs, mode Apprentissage, menu « Copier » du transcript, fichiers d'un cours
(docs/compte-rendu-fichiers-cours.md)

Outils de test, jamais chargés par l'app. Jamais le vrai cloud : Vite `:5199` SANS Supabase + Chrome headless 9333.
Captures dans `../cap/` (exclu de git). Jeux de test idempotents, base LOCALE du banc seulement :
`seed-carnet.mjs`, `seed-apprentissage.mjs`, `seed-fichiers.mjs` ; fichiers : `gen-cours-v2.mjs <fx>` (cours.pdf
sans la page 5, page 10 à la fin) et `mkfile -n 101m <fx>/trop-lourd.pdf`.
`./tout.sh <fx>` rejoue tout (97 vérifications). `commun-appr.mjs` : glisser HTML5 réel par CDP (interception).
