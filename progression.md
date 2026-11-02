<!-- PASSATION:DEBUT -->
# 🔁 Passation – My Org (MedRevise)
_Clôturée le 2026-11-02 à 11:11_

## 🎯 Objectif
SPA Vite + React (hub + MealWeek + MedRevise), déployée sur Vercel au push sur `main`.
Sessions du 31/10 : cartes Tableau à masque choisi, surlignage sur deux lignes, puis /goal « cartes manquantes » du contrôle d'intégrité.

## ✅ Fait (vérifié, poussé, main == origin/main)
- Antérieur : synchro rapide, surlignage exact, listes dans les boîtes, cartes Tableau à masque choisi, espace entre deux lignes d'un surlignage (voir `docs/compte-rendu-flashcards.md`, `docs/compte-rendu-synchro-rapide-surlignage-listes.md`).
- Diagnostic en lecture seule (`docs/diagnostic-elements-manquants.md`) : 12 flashcards disparues, toutes supprimées à la main les 26 et 28/10 ; l'utilisateur a confirmé que ce sont les siennes.
- Suppressions volontaires : registre `suppressionsVolontaires:<appareil>` (store `prompts`, synchronisé, `lib/storage.js#noterSuppressionsVolontaires`) écrit AVANT chaque `remove` de questions venant de l'interface (deleteQuestion, deleteCardsOfType, deleteDossier, removeFromCarnet, purgeFiche, purgeMatiere). La « baisse » (`integrite/controle.js`) ne compte que les ids absents du registre ; les 12 ids sont dans `integrite/suppressions.js#SUPPRESSIONS_CONFIRMEES`. Commits 7fe5945, f4fd00e, d86089b.
- Écran Intégrité : bouton « C'est moi qui les ai supprimées — ne plus signaler » (inscrit les ids au registre, relance le contrôle). Commit 6d02511.
- Écran Intégrité : chaque carte disparue montre recto, type, cours (libellé `[recto, ficheId]` gardé dans l'instantané) ; pour une référence ancienne, recherche en lecture seule dans les copies GitHub via `POST /api/backup-cartes` (`api/_lib/sauvegarde.js#retrouverCartes`, 15–60 s, testé sur le vrai dépôt). Commit 0416252.
- Tests : `npm test` 245/246 (seul échec connu `crayon › trois épaisseurs`), build vert, bancs `scripts/tests-suppressions-volontaires/tout.sh` ✅ (t-suppressions, t-reconnaitre, t-deux-appareils), synchro rapide 15 ✅. MealWeek et `src/shared/` intacts.

## 🚧 En cours
- Rien. Modifications non commitées : aucune (à part cette passation).
- Non vérifié : l'état READY du déploiement Vercel de 0416252 ; l'effet réel sur l'appareil de l'utilisateur (alerte de 10 cartes encore signalées : il doit ouvrir l'écran Intégrité, reconnaître les cartes, cliquer « C'est moi… »).

## ➡️ Prochaines étapes (dans l'ordre)
1. Attendre le retour de l'utilisateur : l'écran Intégrité affiche-t-il bien ses 10 cartes (recto, cours) et le bouton efface-t-il l'alerte ? Ne rien lancer sans sa demande.
2. Retour du test sur un vrai cours : synchro au retour, surlignage PDF (dont passage à la ligne), collage Word, transcription Début/Fin, cartes Tableau masquées.

## 🧭 Décisions prises (ne pas rediscuter)
- Registre par appareil (pas un seul enregistrement) : pas d'écrasement LWW entre appareils ; entrées gardées 120 jours.
- « Tout effacer » (`wipeAll`) et une restauration (`replaceStore`) restent signalés : voulu.
- Alerte fondée sur les ids disparus (pas les comptes) : une perte masquée par des créations est détectée.
- Synchro complète seulement au 1er démarrage / erreur / « Forcer la synchro » ; fusion des surlignages contigus de même couleur = voulu.

## 🛠️ Commandes utiles
- Build : `npx vite build` · Tests : `npm test`
- Serveurs de banc (`.claude/launch.json`, via preview_start) : `medrevise-banc` (:5302 sans Supabase), `faux-supabase` (:54399), `medrevise-faux-cloud` (:5300).
- Chrome headless isolé : `--remote-debugging-port=9337` (1440×900, sur :5302) ; 9335 / 9336 sur :5300 ; profils neufs dans le scratchpad.
- Banc : `scripts/tests-suppressions-volontaires/tout.sh` ; synchro : `scripts/tests-synchro-rapide/tout.sh apres --sans-attente` (restaurer ensuite `mesures-apres.json` avec git checkout).
- Copies GitHub : dépôt privé `yoann735/medrevise-backups` (lecture : `gh repo clone`).

## ⚠️ Pièges et préférences
- Ne jamais toucher MealWeek ni `src/shared/` ; jamais le vrai cloud dans les bancs ; données réelles en lecture seule.
- Français ; commit + push autonomes, conventionnels, jamais de force push. Un processus « sync auto » commite parfois seul (ex. 005d293).
- Le middleware de dev (`vite.config.js`) lit le corps JSON seulement pour `/api/backup-cartes`.
- Chrome headless audio bloqué sur ce Mac ; HMR Vite réinitialise l'état si un fichier est créé pendant un test.
<!-- PASSATION:FIN -->

## Historique des clôtures
- 2026-11-02 11:11 – Cartes manquantes : suppressions volontaires, bouton « C'est moi… », cartes disparues reconnaissables (recto, cours) ; poussé, attente retour utilisateur.
- 2026-10-31 20:55 – /goal : diagnostic des 12 flashcards manquantes (suppressions manuelles confirmées), alerte d'intégrité corrigée pour les suppressions volontaires, testée et poussée.
- 2026-10-31 20:09 – Tableau masque choisi + espace deux lignes livrés, poussés ; attente test utilisateur sur vrai cours.
- 2026-10-31 15:15 – Synchro rapide, surlignage exact, listes dans les boîtes livrés et poussés ; question ouverte : espace sur surlignage deux lignes.
- 2026-10-31 (soir) – /goal Tableau : masque par case livré, testé (ordinateur, tablette, téléphone), poussé ; puis correctif « espace entre deux lignes » livré et poussé.
