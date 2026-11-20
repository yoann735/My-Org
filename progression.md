<!-- PASSATION:DEBUT -->
# 🔁 Passation – My Org (MedRevise)
_Clôturée le 2026-11-20 à 18:49_

## 🎯 Objectif
SPA Vite + React (hub + MealWeek + MedRevise), déployée sur Vercel (projet `my-org`) au push sur `main`.
Session du 20/11 soir : /goal taille de police (document + diapo), ⌘C/⌘V/⌘D des objets d'annotation, « Remplacer par un PDF… » d'un document créé — livré, testé, poussé (3e47cb5, 5d7f37a, 7acebd5, beee5ae, 06871a1, a9874e5).

## ✅ Fait (vérifié)
- Police : causes = taille en dur (marques `fontSize`) dans le texte collé d'un objet, et liste du document en px de mise en page 595 (24 → 40 rendus). Corrigé : `lib/taillesTexte.js`, `pdf/PdfPage.jsx` (retire les tailles en dur), `pdf/FormatTexte.jsx` (BoutonTaille en px1000), `pdf/ChoixTaille.jsx` (ref `dernierChoix`, corrige « mismatched transaction » iPad). Mesures exactes ordi + iPad, après rechargement aussi.
- Copie : `lib/copieObjets.js` (presse-papiers en mémoire, liste), effet clavier/copy/paste dans `pdf/PdfReader.jsx` ; ⌘V au pointeur sinon +16 px, autre page / autre cours ; ⌘D duplique et sélectionne ; nouvel id, sans lien flashcard. Pas de multi-sélection dans le lecteur.
- Remplacement : `lib/remplacerDocument.js` (putBackup → version « Avant… » → blob → fiche → annotations déplacées, pages au-delà → dernière), `pdf/RemplacerDocument.jsx` (message exact), `pdf/MenuFichier.jsx`. `lib/historiqueDoc.js` restaure la fiche en dernier (restauration exacte). CSS `.hv-detail/.hv-liste` (bouton Restaurer visible iPad).
- Tests unitaires : tailles-texte (7), copie-objets (7), remplacer-document (4) ; `npm test` 335/337 (crayon, emploi-du-temps/api : préexistants). Build vert.
- Banc `scripts/tests-police-duplication-remplacement/` : t-police 25/25, t-copie 52 ordi / 51 iPad, t-remplacement 28 ordi (synchro tél incluse) / 24 iPad, t-nonreg 17/17 ; MealWeek identique au pixel.
- Compte rendu : `docs/compte-rendu-police-duplication-remplacement-pdf.md` (+ `docs/img/police-duplication-remplacement/`).

## 🚧 En cours (point d'arrêt exact)
- Rien en cours. Modifications non commitées : aucune (hors `progression.md`, modifié par cette clôture). Serveurs et Chrome de banc arrêtés.

## ➡️ Prochaines étapes (dans l'ordre)
1. Côté utilisateur : essayer taille de police, ⌘C/⌘V/⌘D et « Remplacer par un PDF… » sur vrai iPad/Mac (WebKit/Safari non testé). Attendre son retour avant toute modification.
2. Côté utilisateur (en attente) : essais « Passer / Précédente » en séance et « → Flashcard » d'une boîte ; « 0 en attente » téléphone/iPad ; mode file d'attente.
3. Côté utilisateur : CLI Vercel (`npm i -g vercel`, `vercel login`, `vercel link --yes --project my-org`) et migration `supabase/migrations/20261024_review_log_evenements.sql` (l'app marche sans).
4. Facultatif : bancs périmés `tests-boites-tableaux/t-flashcard.mjs`, `tests-topographie-echap/t-boite.mjs` (visent `.bfc-fenetre` supprimé).

## 🧭 Décisions prises (ne pas rediscuter)
- Tailles affichées en px, stockées en référence 1000 px ; choisir la taille d'un objet entier retire les tailles en dur de son texte.
- Remplacement : texte tapé dans le document masqué mais conservé (pages → `${ns}::retire:k`), revient à la restauration.
- Supabase en lecture seule pour Claude ; ne jamais toucher MealWeek ni `src/shared/`.

## 🛠️ Commandes utiles
- Build : `npm run build` · Tests : `npm test` (TZ Bruxelles)
- Banc : `scripts/tests-police-duplication-remplacement/tout.sh` ; faux Supabase :54399 (remise à zéro avant chaque passage) ; Vite :5320 (avec cloud), :5321 (code d'avant 3957a7f, `AVANT`), :5322 (sans cloud) ; Chrome headless 9345 ordi, 9346 tél, 9347 iPad ; `node t-police.mjs ordi|tablette` etc.

## ⚠️ Pièges et préférences
- iPad : le doigt fait défiler → tracer/poser au stylet (`pointerType: 'pen'`) ; CSS `scale` à multiplier dans les mesures ; un onglet chrome://settings vole le focus (Page.bringToFront).
- Deux Vite sur le même node_modules : `cacheDir` séparé sinon page blanche.
- « sync auto » commite et pousse seul (progression.md). Français, commits conventionnels, jamais de force push.
<!-- PASSATION:FIN -->

## Historique des clôtures
- 2026-11-20 18:49 – /goal police + duplication + remplacement : causes du bug de police corrigées (taille en dur dans le texte, px de mise en page du document) ; ⌘C/⌘V/⌘D des objets ; « Remplacer par un PDF… » (Historique, restauration exacte) ; bancs verts ordi + iPad, MealWeek identique ; poussé (a9874e5). WebKit réel non testé.
- 2026-11-20 14:25 – /goal séance Passer/Précédente (renotation annulable, journal en ajout seul) + boîte → formulaire complet unique ; bancs verts 3 appareils, MealWeek identique ; poussé (7e06f27).
- 2026-11-20 12:52 – /goal 74 en attente : cause = événements « Passer en révision » refusés (rating null) et ignorés ; preuve serveur unique, canal de repli sans migration, empreinte + journal, garde-fou ; 18 tests au build, bancs verts 3 appareils ; poussé, déployé (3840ce0).
- 2026-11-19 21:44 – Clôture : mode file d'attente livré et poussé (5d56577), banc téléphone tranché sans régression (d042293) ; attente des essais sur vrai Mac/iPad.
- 2026-11-15 21:00 – /goal mode file d'attente : dateEffective unique (planning.js), jours en pause dans prompts/fileAttente (aucune carte écrite, pas de migration), Réglages › Planification, décalage + alerte + « Faire le paquet suivant » ; testé ordinateur, tablette, téléphone, deux appareils, avant/après (mode désactivé identique) ; compte rendu docs/compte-rendu-mode-file-attente.md.
- 2026-11-15 19:18 – Clôture du /goal boîtes disparues + sauvegarde continue (livré, poussé a4fb223) ; à revoir : banc téléphone séance flashcards en échec au dernier passage.
- 2026-11-14 18:40 – /goal boîtes disparues + sauvegarde continue : Épithélium glandulaire, aucune boîte disparue (36 copies, cloud, journal du Mac) ; enregistrement continu (< 300 ms, relu, erreur visible), historique des versions, garde-fou ; bancs verts 3 appareils ; poussé (d23bed3, 4e3a9ca, 22bd96a).
- 2026-11-14 16:39 – /goal compteur de vues (œil, tris, filtre) + visionneuse d'image plein écran en révision : livrés, testés 3 appareils, poussés, déployés (7048c82).
- 2026-11-07 17:20 – /goal sauvegarde + statut synchro : sauvegarde jamais arrêtée, rattrapage ajouté, 19 « en attente » = faux compteur (srcId bfc), état unique ; poussé, déployé, copie prod d5ddbe0.
- 2026-11-07 16:35 – /goal environnement : tout vérifié (build, prod Ready, sauvegarde 07/11), rapport poussé ; restent CLI Vercel et migration 20261024 à vérifier.
