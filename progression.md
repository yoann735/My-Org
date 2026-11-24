<!-- PASSATION:DEBUT -->
# 🔁 Passation – My Org (MedRevise)
_Clôturée le 2026-11-24_

## 🎯 Objectif
SPA Vite + React (hub + MealWeek + MedRevise), Vercel `my-org` au push sur `main`.
Session 22-24/11 : /goal « masques d'une flashcard image produits par une IA » — livré, testé, poussé (2388754, 1c2351d, 0e5d9a1, dd34607).

## ✅ Fait (vérifié)
- Éditeur de flashcard image existant (`components/OcclusionImage.jsx`) : « Copier le prompt IA » + « Coller des masques » (collage / .json) → `components/ImportMasquesIA.jsx` ; lecture tolérante + recalage OCR (contour des mots + 4 px, sinon contour orange « à vérifier », partiel = rectangle IA agrandi) → `lib/masquesIA.js` ; aperçu Valider/Annuler, rien enregistré avant.
- Masques créés par `pages/ImportAnatomieVisuel.jsx#nouvelleZone` (extraite de addZone) = même structure qu'un masque dessiné. Prop `aVerifier` de SchemaEditor (contour orange, jamais stocké). CSS fin de `src/styles/etudes.css`.
- Bug existant corrigé : `ocr/moteurTesseract.js` — la libération du moteur attend les lectures en cours (avant : sablier infini de « Masquer des mots » / import si le service PDF libérait le worker). Prouvé par `t-ocr-pdf.mjs` (bloqué sur le code d'avant).
- Test réel tibia/fibula (page 2 de ~/Downloads/TP_osteo_membre_inferieur_bassin.pdf, local seulement) : 40/40 masqués, 40 recalés, 0 à vérifier, 0 oubli, 0 réponse visible, 0 titre ; idem avec décalages ±3 % (15 tirages).
- Tests : `tests/masques-ia` 19/19 ; npm test 361/364 (crayon, emploi-du-temps/api préexistants ; filet = durée, vert seul) ; build vert ; bancs `scripts/tests-masques-ia/` verts (t-masques ordi+tablette 34/34, REEL 21/21, t-seance 3 appareils, t-synchro, t-ocr-pdf) ; t-boite (éditeur manuel) vert ; MealWeek 0 pixel différent.
- Docs : `docs/compte-rendu-masques-ia.md`, `docs/format-masques-ia.md`, `docs/prompt-masques-ia.md` (régénéré par `scripts/tests-masques-ia/doc-prompt.mjs`), captures `docs/img/masques-ia/` (fiche de DÉMO, jamais l'image du manuel).

## 🚧 En cours
- Rien ; arbre propre, poussé. Serveurs et Chrome de banc arrêtés.

## ➡️ Prochaines étapes (dans l'ordre)
1. Côté utilisateur : essayer les masques IA en vrai (iPad/Mac : Copier le prompt → IA → Coller des masques) et l'essai PNG texte coloré sur vrai iPhone (correctif 38e87c8). Attendre son retour avant toute modification.
2. Suite possible (seulement si demandé) : zoom molette absent dans l'éditeur quand l'image arrive après ouverture (`SchemaEditor` useEffect([]) sur outerRef) — bug existant noté dans le compte rendu.
3. En attente (utilisateur) : vrai iPad/Mac police, ⌘C/⌘V/⌘D, Remplacer par un PDF, retour au cours ; Passer/Précédente, → Flashcard, « 0 en attente », file d'attente ; CLI Vercel + migration 20261024.
4. Facultatif : bancs périmés `.bfc-fenetre`.

## 🧭 Décisions prises (ne pas rediscuter)
- Pas d'éditeur de masques sur téléphone (shell révision seule) : non ajouté (« rien d'autre que listé »).
- Un seul code : éditeur, OCR (même worker), création de carte existants ; aucun nouveau format stocké, aucune migration.
- Image du manuel jamais dans le dépôt ; captures publiées = fiche de démo dessinée par le banc.
- Ne jamais toucher MealWeek ni `src/shared/` ; Supabase lecture seule.

## 🛠️ Commandes utiles
- `npm run build` · `npm test` · `npx vitest run tests/masques-ia`
- Banc : Vite `medrevise-banc` (:5302, launch.json) ; Chrome headless 9345/9346/9347 profils neufs ; `TRAVAIL=<dossier hors dépôt>` ; `node rendu.mjs` → `mesure.mjs [--decaler=0.03 --graine=1]` ; `t-masques.mjs ordi|tablette`, `REEL=1 t-masques.mjs ordi`, `t-seance.mjs ordi|tablette|tel`, `t-ocr-pdf.mjs` (BASE=… pour un autre port).

## ⚠️ Pièges et préférences
- Le port 54399 (faux Supabase) peut être pris par une autre session : copie avec un autre port dans le scratchpad (sed sur `listen(54399`).
- Le faux cloud garde les cartes entre deux passages : boîte « déjà convertie » → redémarrer le faux cloud à vide.
- `t-mealweek.mjs` et `t-boite.mjs` réécrivent leurs captures commitées : `git checkout --` après.
- Petits masques : la pastille et le panneau recouvrent masque et poignées (existant) → le banc agrandit le masque inventé.
- Français, commits conventionnels, jamais de force push ; « sync auto » commite progression.md.
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
