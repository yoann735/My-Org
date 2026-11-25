# Banc « séances liées à l'agenda » (26/11/2026)

Compte rendu : `docs/compte-rendu-seances-liees-agenda.md`. Il n'utilise que des **données de test**, jamais le vrai cloud ni le vrai Hyperplanning.

- **Agenda de test** : `tests/seances-agenda/agenda.mjs` (format Hyperplanning) contient Histologie les 10 et 17 nov. de 10 h à 12 h (même UID, cours répété) et Chimie le 17 nov. de 13 h à 15 h. Deux variantes : `supprime` (l'Histologie du 17 est retirée) et `deplace` (elle passe à 15 h–17 h).
- **`/api/timetable` est intercepté dans Chrome** (CDP Fetch). La réponse est calculée par le **vrai** analyseur du serveur (`api/_lib/emploiDuTemps.js#analyserIcs`). Cela permet d'avoir le 10 nov. dans la période et de changer de variante sans redémarrer Vite. Le chemin serveur lui-même est couvert par le banc de l'emploi du temps (`scripts/tests-emploi-du-temps`).
- **Horloge simulée** : le 17 nov. à 10 h 30 (Bruxelles), par un script injecté avant l'app (`localStorage.__horloge`).
- **Fichiers** : les PDF (Histologie 300 p., Atlas 40 p., Chimie 8 p.) sont générés dans `$TMPDIR/banc-section-exos/seances-agenda`.
- **Scripts** :
  - `t-lecteur.mjs ordi|ipad` : le scénario complet ;
  - `t-telephone.mjs` : l'affichage sur téléphone ;
  - `t-synchro.mjs` : deux appareils par le faux Supabase, à lancer **après** `t-lecteur.mjs ordi` ;
  - `t-mealweek.mjs` : MealWeek avant / après, comparée octet pour octet.
- `./tout.sh` rejoue tout. **Relance « faux-supabase » avant chaque série** : il garde tout en mémoire, et l'horloge simulée rend les écritures d'une série précédente « plus récentes ».
- Captures : `docs/img/seances-liees-agenda/`.
