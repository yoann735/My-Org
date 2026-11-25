<!-- PASSATION:DEBUT -->
# 🔁 Passation – My Org (MedRevise)
_Mise à jour le 2026-11-26 (séances liées à l'agenda)_

## 🎯 Objectif
SPA Vite + React (hub + MealWeek + MedRevise), Vercel `my-org` au push sur `main`.
/goal du 26/11 : séances (début → fin de cours) liées à un créneau de l'agenda, pages vues dans l'agenda, « Ouvrir le cours » → page de début — LIVRÉ, testé, commité.

## ✅ Fait (vérifié)
- (26/11) SÉANCES LIÉES À L'AGENDA : lien = champ `agenda` AJOUTÉ au tag Début existant (`page_tag`, synchro existante, aucune migration) ; clé UID iCal + début, copie titre/date/heures/salle ; fenêtre « Lier à un cours de l'agenda » après un Début (menu ou Transcrire), créneau proposé (en cours même matière → plus proche même matière même jour → en cours), « Passer » ; menu du tag : Lier / Changer / Délier ; mention « 17 nov. · Histologie » ; agenda : « p. 157–192 · doc », copie « cours retiré de l'agenda », « horaire modifié » ; « Ouvrir le cours » → page de début (choix si plusieurs). Code `lib/seancesAgenda.js`, `components/LienAgenda.jsx`, `styles/seances-agenda.css`. Banc `scripts/tests-seances-agenda/tout.sh` (relancer faux-supabase avant) + 9 tests Vitest ; série finale 160/161 (seul écart : capture MealWeek téléphone instable, identique en relance ×2). Commit 05645be. Compte rendu `docs/compte-rendu-seances-liees-agenda.md`.
- (25/11 soir) Bibliothèque : bouton calendrier par matière (localStorage `medrevise.biblio.datesTranscript`), une ligne de pastilles « 17 nov. » par cours, « +N » déplier/replier, heure et durée (« 10h00 · 50 min ») sur la pastille filtrée et en mode déplié, filtre par jour (rappel « 17 nov. ✕ », combiné à la recherche). Calcul unique mémorisé `src/medrevise/lib/datesTranscript.js` (jour Europe/Brussels, reprises gérées), relecture par id (`storage.js` : ids dans l'événement d'écriture ; `synchroIsolee.js` : événement après réception). Bouton éteint = arbre identique à avant. Banc `scripts/tests-filtre-dates-transcript/tout.sh` vert (161 vérifications) + MealWeek identique. Compte rendu `docs/compte-rendu-filtre-dates-transcript.md` (règle, mesures, captures). Commit 6ce8107.
- Section Exos livrée (00e35ac/71e9190) + glisser-déposer HTML/PDF dans la feuille (5c16650), bancs verts.
- (24/11) suivi automatique des diapos livré (docs/compte-rendu-suivi-auto-diapos.md).

## ➡️ Prochaines étapes
0. Essayer en vrai les séances liées (Mac/iPad, vrai agenda HELHa) ; « Transcrire le cours » → fenêtre non testée en navigateur (audio du Chrome de test HS) — attendre le retour de Yoann.
1. (FAIT 26/11) /goal « séances liées à l'agenda » (lier début→fin de cours d'un document à un créneau de l'agenda, pages vues dans l'agenda, « Ouvrir le cours » → page de début) : texte complet du goal dans le message d'ouverture de la session suivante ; à faire en autonomie. Pistes : système début/fin existant = tags de pages `lib/tagsPages.js` (kind 'debut'/'fin', `transcription/marquerCours.js`, docs/compte-rendu-transcription-marque-cours.md) ; agenda = `api/timetable.js`, `lib/emploiDuTemps.js`, `components/EmploiDuTemps.jsx`/`GrilleEcole.jsx` (docs/compte-rendu-emploi-du-temps.md).
2. Essayer en vrai (Mac, iPad) les dates de transcript de la Bibliothèque sur les vraies matières ; attendre le retour de Yoann avant toute modification.
3. Essayer la section Exos en vrai (vrais fichiers d'exos HTML, glisser-déposer depuis le Finder) sur Mac, iPad, iPhone ; attendre le retour de Yoann.
4. Essai réel Teams + banc diapos avec le vrai PDF d'histologie (`PDF_HISTO=~/Downloads/… node scripts/tests-suivi-diapos/t-suivi.mjs`) — attendre le PDF.
5. (En attente) masques IA iPad/Mac, PNG texte coloré iPhone, zoom molette SchemaEditor, CLI Vercel + migration 20261024.

## 🧭 Décisions prises (ne pas rediscuter)
- Dates de transcript : jour = Europe/Brussels ; heure = 1er mot du jour ; durée = somme par session du 1er au dernier mot du jour ; heure+durée seulement sur la pastille filtrée / ligne dépliée / infobulle (la ligne repliée reste des dates) ; filtre non retenu au rechargement ; téléphone sans Bibliothèque = rien à faire.
- Exos : annotations d'un fichier dans l'espace `exo:<id du fichier>` ; fichier retiré/remplacé gardé dans `fichiersRetires` ; boîte → flashcard seulement si la notion a un cours.
- Diapos : un seul moteur ; seuils SEUIL 0,50 · MARGE 0,03 · NON_RECONNU 0,50.

## ⚠️ Pièges et préférences
- JAMAIS de son pendant un banc (Chrome --mute-audio). Ne pas modifier src/ pendant qu'un banc tourne.
- Configs de test « dates-avant » / « mealweek-avant-dates » : pointent vers une copie temporaire (scratchpad) du code d'avant le chantier — à recréer (`git archive`) pour rejouer la comparaison avant/après.
- « sync auto » commite ET pousse tout seul.
- Le lecteur HTML des Exos est volontairement isolé : ne jamais ajouter allow-same-origin.
- Français, commits conventionnels, jamais de force push ; ne jamais toucher MealWeek ni src/shared.
<!-- PASSATION:FIN -->

## Historique des clôtures
- 2026-11-26 – /goal séances liées à l'agenda : livré (05645be), bancs verts ordinateur / iPad / téléphone / 2 appareils, MealWeek identique ; « Transcrire le cours » → fenêtre non testé en navigateur (audio HS).
- 2026-11-26 00:05 – /cloture : dates de transcript livrées (6ce8107, 07ba376) ; suite = /goal séances liées à l'agenda.
- 2026-11-25 23:55 – /goal dates de transcript + heure/durée + filtre par date dans la Bibliothèque : livré, banc vert 3 appareils + 2 appareils + perf, MealWeek identique, commité (6ce8107).
- 2026-11-25 22:04 – section Exos livrée (00e35ac/71e9190) + glisser-déposer HTML/PDF dans la feuille (5c16650), bancs verts ; pas testé avec les vrais fichiers.
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
