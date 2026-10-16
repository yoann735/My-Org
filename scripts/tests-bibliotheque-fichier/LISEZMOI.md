# Tests du 15/10 — tris de la Bibliothèque, menu « Fichier » unique (docs/compte-rendu-bibliotheque-fichier.md)

Outils de test, jamais chargés par l'app. Jamais le vrai cloud : Vite `:5199` SANS Supabase
(`VITE_SUPABASE_URL= npx vite --port 5199`) + Chrome headless `--remote-debugging-port=9333`.
Captures dans `../cap/` (exclu de git).

- `seed-biblio.mjs` : sections « Cours S1 », « Rattrapage », une section archivée, dossiers, 8 fiches
  aux dates d'ajout et de modification échelonnées (écrit directement dans IndexedDB, idempotent).
- `seed-menu.mjs` : un cours PDF + fiche HTML, un cours jetable (pour « Supprimer »).
- `./tout.sh <PDF>` rejoue tout ; `r-menu-captures.mjs <préfixe>` capture le menu sur les 4 pages.
