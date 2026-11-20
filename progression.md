<!-- PASSATION:DEBUT -->
# 🔁 Passation – My Org (MedRevise)
_Clôturée le 2026-11-20 à 14:25_

## 🎯 Objectif
SPA Vite + React (hub + MealWeek + MedRevise), déployée sur Vercel (projet `my-org`) au push sur `main`.
Session du 20/11 : /goal séance « Passer → / ← Précédente » + flashcard depuis une boîte = formulaire complet — livré, testé, poussé (e5b89c8, 6c69145, 0820813, 7e06f27).

## ✅ Fait (vérifié)
- Séance (`session/SeanceFC.jsx`, `lib/retourSeance.js`) : Passer (→) n'écrit rien ; Précédente (←) jusqu'à la 1re carte et depuis l'écran de fin ; renoter = champs touchés remis comme avant + entrée d'annulation au journal (`rating null`, `details.evenement='annulation'`, `annule=<id>`) + nouvelle note par le planificateur inchangé à l'heure d'origine ; idem Garder/Passer en révision. `etat.actes[id]` et `etat.vue` dans la meta `seanceFC`.
- Notations annulées ignorées : `lib/vuesCartes.js` (compterVues), `journal/journal.js` journalDeCarte (reconstruction FSRS), `ReglagesFSRS.jsx` (rapport ombre). Seul ajout côté scheduler : option `surEntree` dans `scheduler/repondre.js`.
- Boîte → flashcard : ouvre `CarteAjoutFlashcard` du panneau pré-rempli (`prerempli`, `complementsDeBoite` dans `lib/boiteVersCarte.js`), lien `source` gardé (masques compris : `OcclusionEditorModal` imageIdInitiale/enPlus). `pdf/BoiteFlashcard.jsx` + CSS `.bfc-*` supprimés.
- Tests : `tests/seance-retour` (9) + `tests/boite-carte` (+3) verts ; build vert ; `npm test` 317/319 (crayon et emploi-du-temps/api échouent aussi sur 3840ce0 : préexistants, hors chantier).
- Banc Chrome `scripts/tests-seance-passer-precedente/` : t-seance 42/42 ordi/iPad/tél ; t-boite 17/17 ordi/iPad (pas de lecteur sur téléphone) ; t-apprentissage OK ×3 ; t-mealweek identique au pixel (avant 3840ce0 ↔ après).
- Compte rendu : `docs/compte-rendu-seance-passer-precedente-et-formulaire-fc.md` (+ captures `docs/img/seance-passer-precedente/`).

## 🚧 En cours (point d'arrêt exact)
- Rien en cours. Modifications non commitées : aucune (hors `progression.md`, modifié par cette clôture). Serveurs de banc arrêtés.

## ➡️ Prochaines étapes (dans l'ordre)
1. Côté utilisateur : essayer « Passer / Précédente » en séance et « → Flashcard » d'une boîte sur le vrai iPad/téléphone (WebKit non testé). Attendre son retour avant toute modification.
2. Côté utilisateur (toujours en attente) : vérifier « 0 en attente » sur téléphone puis iPad (correctif 74 en attente) ; essais du mode file d'attente.
3. Côté utilisateur : CLI Vercel (`npm i -g vercel`, `vercel login`, `vercel link --yes --project my-org`) et migration `supabase/migrations/20261024_review_log_evenements.sql` (l'app marche sans).
4. Facultatif : les anciens bancs `tests-boites-tableaux/t-flashcard.mjs` et `tests-topographie-echap/t-boite.mjs` visent `.bfc-fenetre` (supprimé) : périmés.

## 🧭 Décisions prises (ne pas rediscuter)
- Journal en ajout seul : annulation = nouvelle entrée qui référence la ligne annulée ; aucune migration.
- Renotation à l'heure de la notation d'origine (même résultat qu'une note directe, fuzz FSRS compris).
- Un seul formulaire de flashcard ; la « date de départ » de l'ancien formulaire de boîte disparaît (départ = aujourd'hui, comme le panneau).
- Supabase en lecture seule pour Claude ; ne jamais toucher MealWeek ni `src/shared/`.

## 🛠️ Commandes utiles
- Build (tests de synchro inclus) : `npm run build` · Tests : `npm test` (TZ Bruxelles)
- Banc : faux Supabase `scripts/tests-seance-passer-precedente/relancer-faux-supabase.sh` (remise à zéro avant CHAQUE passage) ; Vite :5314 (`VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_ANON_KEY=faux`) ; Chrome headless profils neufs 9345 (1440×900), 9346 (390×844), 9347 (820×1180) ; `node t-seance.mjs ordi|tablette|tel`, `node t-boite.mjs ordi|tablette`.
- MealWeek avant/après : Vite :5315 (git archive 3840ce0, cacheDir séparé) et :5316 (config avec cacheDir séparé) → `node t-mealweek.mjs ordi|tel`.

## ⚠️ Pièges et préférences
- Deux Vite sur le même node_modules : `cacheDir` séparé sinon page blanche. Faux Supabase en mémoire : un passage précédent re-synchronise ses données.
- Tablette : arbre de la Bibliothèque replié (`.lib-master.collapsed .split-handle`). Modale = `.day-pop` (pas de role=dialog).
- « sync auto » commite et pousse seul (progression.md). Français, commits conventionnels, jamais de force push.
<!-- PASSATION:FIN -->

## Historique des clôtures
- 2026-11-20 – /goal police + duplication + remplacement : cause du bug de police (taille en dur dans le texte d'un objet ; px de mise en page dans le document), corrigée ; ⌘C/⌘V/⌘D des objets ; « Remplacer par un PDF… » d'un document créé (Historique, restauration exacte) ; bancs verts ordinateur + iPad, téléphone (synchro), MealWeek identique ; compte rendu docs/compte-rendu-police-duplication-remplacement-pdf.md. Sur vrai iPad/iPhone (WebKit) : non testé.
- 2026-11-20 14:25 – /goal séance Passer/Précédente (renotation annulable, journal en ajout seul) + boîte → formulaire complet unique ; bancs verts 3 appareils, MealWeek identique ; poussé (7e06f27).
- 2026-11-20 12:52 – /goal 74 en attente : cause = événements « Passer en révision » refusés (rating null) et ignorés ; preuve serveur unique, canal de repli sans migration, empreinte + journal, garde-fou ; 18 tests au build, bancs verts 3 appareils ; poussé, déployé (3840ce0).
- 2026-11-19 21:44 – Clôture : mode file d'attente livré et poussé (5d56577), banc téléphone tranché sans régression (d042293) ; attente des essais sur vrai Mac/iPad.
- 2026-11-15 21:00 – /goal mode file d'attente : dateEffective unique (planning.js), jours en pause dans prompts/fileAttente (aucune carte écrite, pas de migration), Réglages › Planification, décalage + alerte + « Faire le paquet suivant » ; testé ordinateur, tablette, téléphone, deux appareils, avant/après (mode désactivé identique) ; compte rendu docs/compte-rendu-mode-file-attente.md.
- 2026-11-15 19:18 – Clôture du /goal boîtes disparues + sauvegarde continue (livré, poussé a4fb223) ; à revoir : banc téléphone séance flashcards en échec au dernier passage.
- 2026-11-14 18:40 – /goal boîtes disparues + sauvegarde continue : Épithélium glandulaire, aucune boîte disparue (36 copies, cloud, journal du Mac) ; enregistrement continu (< 300 ms, relu, erreur visible), historique des versions, garde-fou ; bancs verts 3 appareils ; poussé (d23bed3, 4e3a9ca, 22bd96a).
- 2026-11-14 16:39 – /goal compteur de vues (œil, tris, filtre) + visionneuse d'image plein écran en révision : livrés, testés 3 appareils, poussés, déployés (7048c82).
- 2026-11-07 17:20 – /goal sauvegarde + statut synchro : sauvegarde jamais arrêtée, rattrapage ajouté, 19 « en attente » = faux compteur (srcId bfc), état unique ; poussé, déployé, copie prod d5ddbe0.
- 2026-11-07 16:35 – /goal environnement : tout vérifié (build, prod Ready, sauvegarde 07/11), rapport poussé ; restent CLI Vercel et migration 20261024 à vérifier.
- 2026-11-02 11:11 – Cartes manquantes : suppressions volontaires, bouton « C'est moi… », cartes disparues reconnaissables (recto, cours) ; poussé, attente retour utilisateur.
