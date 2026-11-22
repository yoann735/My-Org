<!-- PASSATION:DEBUT -->
# 🔁 Passation – My Org (MedRevise)
_Clôturée le 2026-11-22_

## 🎯 Objectif
SPA Vite + React (hub + MealWeek + MedRevise), déployée sur Vercel (projet `my-org`) au push sur `main`.
Session des 20-22/11 : /goal « Enregistrer en PNG » d'un dessin (téléphone) + barre « Transcription en cours » cliquable → retour au cours ; puis correctif « texte coloré absent du PNG sur iPhone ». Tout livré, testé, poussé (3f03ced, 2f45a50, 3e685d1, c561d5b, 38e87c8, 90b73b8, 7fdb0b6).

## ✅ Fait (vérifié)
- PNG : menu Exporter de l'écran Dessin (`mobile/EcranDessin.jsx`) → bouton « Enregistrer en PNG », même fond (transparent/blanc/noir) et même rendu que l'envoi vers un cours (`svgExport` → `svgVersPng`, options `echelle`/`peindre`), ×3 (`mobile/exportPng.js` : échelle, nom `dessin-<cours>-<date>.png`, partage iPhone/iPad sinon téléchargement, bouton « Partager l'image » si geste perdu). Zones de texte peintes dans l'image (`mobile/textesPng.js`). Aucune écriture.
- Correctif iPhone (38e87c8) : les mots sont mesurés sur une COPIE de la couche sans caméra (conteneur invisible en 0,0) + filet (zone non mesurée peinte ligne par ligne). Vérifié Chrome + Safari macOS (zoom ×0,25 décalé). PAS vérifié sur vrai iPhone.
- Retour au cours : `transcription/retourCours.js` (origine du lecteur, demande panneau Transcript), `IndicateurGlobal.jsx` (bouton « Revenir au cours »), `MedReviseApp.jsx` (gestionnaire, `ctx.biblioDemande`), `pages/Bibliotheque.jsx`, `pdf/PdfReader.jsx`, `pdf/CourseHtmlView.jsx`, `styles/transcription.css`. Téléphone : pas de bouton (pas de lecteur).
- Tests : `tests/export-png-retour/` 8/8 ; `npm test` 343/345 (crayon, emploi-du-temps/api : préexistants) ; build vert. Banc `scripts/tests-export-png-retour/tout.sh` tout vert (t-png tel/ipad/ordi-etroit, t-retour ordi/tablette/tel, t-mealweek identique pixel). Bancs WebKit : `safari.html`, `safari-complet.html` + `recepteur.mjs` (:54411), ouverts via `open -a Safari`.
- Compte rendu : `docs/compte-rendu-export-png-et-retour-transcription.md` (+ `docs/img/export-png-retour/`).

## 🚧 En cours (point d'arrêt exact)
- Rien en cours ; aucune modif non commitée. Serveurs de banc arrêtés.

## ➡️ Prochaines étapes (dans l'ordre)
1. Côté utilisateur : réessayer « Enregistrer en PNG » sur le vrai iPhone avec du texte coloré. Attendre son retour ; si le texte manque encore, demander une capture du dessin avant export.
2. Côté utilisateur : essais sur vrai iPad/Mac de la taille de police, ⌘C/⌘V/⌘D, « Remplacer par un PDF… », retour au cours depuis la barre.
3. En attente (utilisateur) : Passer/Précédente en séance, → Flashcard d'une boîte, « 0 en attente », mode file d'attente ; CLI Vercel + migration `supabase/migrations/20261024_review_log_evenements.sql`.
4. Facultatif : bancs périmés visant `.bfc-fenetre`.

## 🧭 Décisions prises (ne pas rediscuter)
- Un seul rendu d'export (svgVersPng) ; les zones de texte voyagent à part vers un cours, mais sont peintes dans le PNG.
- Partage seulement iPhone/iPad (+ Android tactile) ; Mac = téléchargement.
- Retour au cours = simple navigation, la session de transcription n'est jamais touchée.
- Supabase en lecture seule ; ne jamais toucher MealWeek ni `src/shared/`.

## 🛠️ Commandes utiles
- Build : `npm run build` · Tests : `npm test`
- Banc : faux Deepgram `PORT=54400 node scripts/faux-deepgram.mjs` ; Vite :5330 (`DEEPGRAM_API_KEY=cle-de-test DEEPGRAM_API_URL=http://localhost:54400 DEEPGRAM_LISTEN_URL=ws://localhost:54400/v1/listen VITE_SUPABASE_URL=`) ; Vite :5331 = code d'avant (git archive, cacheDir séparé) ; Chrome headless 9345/9346/9347 avec `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` ; puis `scripts/tests-export-png-retour/tout.sh`.

## ⚠️ Pièges et préférences
- Chrome installé ignore `--use-file-for-fake-audio-capture` : micro factice par défaut (bips).
- Une session de transcription restée ouverte dans un Chrome fausse le passage suivant (t-retour vérifie 0 connexion au départ).
- MealWeek téléphone : tramage aléatoire des dégradés → le banc refait jusqu'à 6 essais.
- Pas de simulateur iOS installé ; WebKit testé via Safari macOS.
- « sync auto » commite et pousse seul (progression.md). Français, commits conventionnels, jamais de force push.
<!-- PASSATION:FIN -->

## Historique des clôtures
- 2026-11-22 – /goal PNG d'un dessin (×3, 3 fonds, partage iPhone, texte peint) + barre transcription → retour au cours ; correctif texte coloré iPhone (copie sans caméra) ; bancs verts Chrome + Safari ; poussé (7fdb0b6). Vrai iPhone non testé.
- 2026-11-20 18:49 – /goal police + duplication + remplacement : causes du bug de police corrigées (taille en dur dans le texte, px de mise en page du document) ; ⌘C/⌘V/⌘D des objets ; « Remplacer par un PDF… » (Historique, restauration exacte) ; bancs verts ordi + iPad, MealWeek identique ; poussé (a9874e5). WebKit réel non testé.
- 2026-11-20 14:25 – /goal séance Passer/Précédente (renotation annulable, journal en ajout seul) + boîte → formulaire complet unique ; bancs verts 3 appareils, MealWeek identique ; poussé (7e06f27).
- 2026-11-20 12:52 – /goal 74 en attente : cause = événements « Passer en révision » refusés (rating null) et ignorés ; preuve serveur unique, canal de repli sans migration, empreinte + journal, garde-fou ; 18 tests au build, bancs verts 3 appareils ; poussé, déployé (3840ce0).
- 2026-11-19 21:44 – Clôture : mode file d'attente livré et poussé (5d56577), banc téléphone tranché sans régression (d042293) ; attente des essais sur vrai Mac/iPad.
- 2026-11-15 21:00 – /goal mode file d'attente : dateEffective unique (planning.js), jours en pause dans prompts/fileAttente (aucune carte écrite, pas de migration), Réglages › Planification, décalage + alerte + « Faire le paquet suivant » ; testé ordinateur, tablette, téléphone, deux appareils, avant/après (mode désactivé identique) ; compte rendu docs/compte-rendu-mode-file-attente.md.
- 2026-11-15 19:18 – Clôture du /goal boîtes disparues + sauvegarde continue (livré, poussé a4fb223) ; à revoir : banc téléphone séance flashcards en échec au dernier passage.
- 2026-11-14 18:40 – /goal boîtes disparues + sauvegarde continue : Épithélium glandulaire, aucune boîte disparue (36 copies, cloud, journal du Mac) ; enregistrement continu (< 300 ms, relu, erreur visible), historique des versions, garde-fou ; bancs verts 3 appareils ; poussé (d23bed3, 4e3a9ca, 22bd96a).
- 2026-11-14 16:39 – /goal compteur de vues (œil, tris, filtre) + visionneuse d'image plein écran en révision : livrés, testés 3 appareils, poussés, déployés (7048c82).
- 2026-11-07 17:20 – /goal sauvegarde + statut synchro : sauvegarde jamais arrêtée, rattrapage ajouté, 19 « en attente » = faux compteur (srcId bfc), état unique ; poussé, déployé, copie prod d5ddbe0.
