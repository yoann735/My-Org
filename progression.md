<!-- PASSATION:DEBUT -->
# 🔁 Passation – My Org (MedRevise)
_Mise à jour le 2026-11-25 (soir)_

## 🎯 Objectif
SPA Vite + React (hub + MealWeek + MedRevise), Vercel `my-org` au push sur `main`.
/goal du 25/11 : section « Exos » (notions = fiche PDF + exercices HTML/PDF) — LIVRÉ, testé, poussé.

## ✅ Fait (vérifié)
- Section Exos : `src/medrevise/exos/` (notions.js, apercus.js, EcranExos.jsx, LecteurHtml.jsx), `src/styles/exos.css` ; entrée barre latérale + carte d'accueil téléphone ; store synchronisé `exo_notion` (ajout seul, aucune migration) ; PDF dans le PdfReader (option `coursCartes`), HTML dans une iframe sandbox « allow-scripts allow-forms ».
- Banc `scripts/tests-section-exos/tout.sh` : ordinateur, iPad, téléphone, 2 appareils, hors ligne, sécurité, non-régression, MealWeek identique → tout vert. Compte rendu `docs/compte-rendu-section-exos.md`.
- (24/11) suivi automatique des diapos livré (docs/compte-rendu-suivi-auto-diapos.md).

## ➡️ Prochaines étapes
1. Essayer la section Exos en vrai (vrais fichiers d'exos HTML) sur Mac, iPad, iPhone.
2. Essai réel Teams + banc diapos avec le vrai PDF d'histologie (`PDF_HISTO=~/Downloads/… node scripts/tests-suivi-diapos/t-suivi.mjs`) — attendre le PDF de Yoann.
3. (En attente) masques IA iPad/Mac, PNG texte coloré iPhone, zoom molette SchemaEditor, CLI Vercel + migration 20261024.

## 🧭 Décisions prises (ne pas rediscuter)
- Exos : annotations d'un fichier dans l'espace `exo:<id du fichier>` ; fichier retiré/remplacé = gardé dans `fichiersRetires` (bouton Remettre), jamais d'annotation effacée ; boîte → flashcard seulement si la notion a un cours.
- Diapos : un seul moteur ; seuils SEUIL 0,50 · MARGE 0,03 · NON_RECONNU 0,50.

## ⚠️ Pièges et préférences
- JAMAIS de son pendant un banc (Chrome --mute-audio). Ne pas modifier src/ pendant qu'un banc tourne.
- « sync auto » commite ET pousse tout seul (il a emporté le code Exos dans 00e35ac).
- Le lecteur HTML est volontairement isolé : ne jamais ajouter allow-same-origin.
- Français, commits conventionnels, jamais de force push ; ne jamais toucher MealWeek ni src/shared.
<!-- PASSATION:FIN -->

## Historique des clôtures
- 2026-11-25 – /goal suivi auto des diapos livré (100 % passages, 2,66 s), banc Chrome muet, poussé
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
