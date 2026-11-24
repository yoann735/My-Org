<!-- PASSATION:DEBUT -->
# 🔁 Passation – My Org (MedRevise)
_Mise à jour le 2026-11-24 (soir)_

## 🎯 Objectif
SPA Vite + React (hub + MealWeek + MedRevise), Vercel `my-org` au push sur `main`.
/goal du 24/11 : suivi automatique des diapos pendant une transcription d'onglet (Teams) + répartition après coup — LIVRÉ.

## ✅ Fait (vérifié)
- `src/medrevise/transcription/diapos/` : moteur unique (moteur.js), Web Worker (images de l'onglet, zone, scores, rendu des pages pdf.js sur OffscreenCanvas), pilote (suivi.js), pages du PDF (pagesCours.js), « Relier aux diapos automatiquement » (repartition.js), UI (SuiviDiapos.jsx). Piste vidéo du même partage gardée (audio.js), page des lignes = diapo reconnue (engine.js), Historique porte la session (historiqueDoc.js).
- Banc Chrome `scripts/tests-suivi-diapos/` (vrai partage d'onglet, Chrome fenêtré hors écran, MUET) : passages 100 %, lignes 98,4 %, 0 mauvais changement même titre, délai moyen 2,66 s, aucun mot perdu ; après coup 100 % ; non-régression verte ; MealWeek identique au pixel. Compte rendu : `docs/compte-rendu-suivi-auto-diapos.md`.

## ➡️ Prochaines étapes
1. Essai en vrai sur un cours Teams dans Chrome + relancer le banc avec le vrai PDF d'histologie (`PDF_HISTO=~/Downloads/… node scripts/tests-suivi-diapos/t-suivi.mjs`) — aucun PDF d'histologie n'était dans ~/Downloads.
2. (Toujours en attente) essais masques IA iPad/Mac, PNG texte coloré iPhone ; zoom molette SchemaEditor ; CLI Vercel + migration 20261024.

## 🧭 Décisions prises (ne pas rediscuter)
- Un seul moteur (direct et après coup), OCR de l'app seulement si hésitation, images des changements LOCALES (store meta), aucune migration.
- Seuils : SEUIL 0,50 · MARGE 0,03 · NON_RECONNU 0,50 (moteur.js#PARAMS).

## ⚠️ Pièges et préférences
- JAMAIS de son pendant un banc (Yoann en cours) : faux Teams à −50 dB + suppressLocalAudioPlayback ; `--mute-audio` coupe AUSSI la capture.
- Ne pas modifier src/ pendant qu'un banc tourne (Vite recharge la page et coupe la session).
- « sync auto » commite ET pousse tout seul.
- Français, commits conventionnels, jamais de force push.
<!-- PASSATION:FIN -->

## Historique des clôtures
- 2026-11-24 14:13 – /goal masques IA de flashcard image (prompt, collage/.json, recalage OCR, Valider/Annuler) + correctif libération moteur OCR ; tibia/fibula 40/40 ; bancs verts 3 appareils, MealWeek identique ; poussé (dd34607). Vrai iPhone/iPad non testé.
- 2026-11-22 – /goal PNG d'un dessin (×3, 3 fonds, partage iPhone, texte peint) + barre transcription → retour au cours ; correctif texte coloré iPhone (copie sans caméra) ; bancs verts Chrome + Safari ; poussé (7fdb0b6). Vrai iPhone non testé.
- 2026-11-20 18:49 – /goal police + duplication + remplacement : causes du bug de police corrigées (taille en dur dans le texte, px de mise en page du document) ; ⌘C/⌘V/⌘D des objets ; « Remplacer par un PDF… » (Historique, restauration exacte) ; bancs verts ordi + iPad, MealWeek identique ; poussé (a9874e5). WebKit réel non testé.
- 2026-11-20 14:25 – /goal séance Passer/Précédente (renotation annulable, journal en ajout seul) + boîte → formulaire complet unique ; bancs verts 3 appareils, MealWeek identique ; poussé (7e06f27).
- 2026-11-20 12:52 – /goal 74 en attente : cause = événements « Passer en révision » refusés (rating null) et ignorés ; preuve serveur unique, canal de repli sans migration, empreinte + journal, garde-fou ; 18 tests au build, bancs verts 3 appareils ; poussé, déployé (3840ce0).
- 2026-11-19 21:44 – Clôture : mode file d'attente livré et poussé (5d56577), banc téléphone tranché sans régression (d042293) ; attente des essais sur vrai Mac/iPad.
- 2026-11-15 21:00 – /goal mode file d'attente : dateEffective unique (planning.js), jours en pause dans prompts/fileAttente (aucune carte écrite, pas de migration), Réglages › Planification, décalage + alerte + « Faire le paquet suivant » ; testé ordinateur, tablette, téléphone, deux appareils, avant/après (mode désactivé identique) ; compte rendu docs/compte-rendu-mode-file-attente.md.
- 2026-11-15 19:18 – Clôture du /goal boîtes disparues + sauvegarde continue (livré, poussé a4fb223) ; à revoir : banc téléphone séance flashcards en échec au dernier passage.
- 2026-11-14 18:40 – /goal boîtes disparues + sauvegarde continue : Épithélium glandulaire, aucune boîte disparue (36 copies, cloud, journal du Mac) ; enregistrement continu (< 300 ms, relu, erreur visible), historique des versions, garde-fou ; bancs verts 3 appareils ; poussé (d23bed3, 4e3a9ca, 22bd96a).
- 2026-11-14 16:39 – /goal compteur de vues (œil, tris, filtre) + visionneuse d'image plein écran en révision : livrés, testés 3 appareils, poussés, déployés (7048c82).
