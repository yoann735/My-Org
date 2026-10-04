# Diagnostic — date de départ (J0) future ignorée sur les flashcards importées en JSON (04/10/2026)

## Ce qui a été vérifié en vrai (instance locale isolée)

**Ce qui fonctionnait déjà :**
- **Import par l'Accueil, « Importer une fiche »**, avec le champ « Premier passage
  (J0) » à J+2 : cartes dues le 06, `j0Date` au 06. C'est vrai pour une nouvelle fiche
  comme pour un ajout à une fiche existante.
  Chemin : `Dashboard.jsx` → `createFicheFromQuestions` / `appendItemsToFiche`
  (`lib/import.js`) → `newItem` (`lib/storage.js:536`) → `startAdaptive(startDate)`.
- **« Décaler le départ »**, sur une fiche dont les cartes ont été importées : décalées
  au 06 (`MedReviseApp.jsx`, `shiftFicheStart`).
- **Planning :** aucune des cartes au J0 futur n'est comptée due aujourd'hui (`dueToday`,
  `todayPlan`, `overdueQuestions`…).

## Causes

1. **« Coller du JSON » n'avait aucun champ de date.**
   - Où : `components/AddItemForm.jsx`, `PasteJsonForm`. C'est l'onglet « Coller du
     JSON » du panneau du lecteur et d'« Ajouter un item » dans Réviser.
   - L'appel était `appendItemsToFiche({ ficheId, items })`, sans `startDate`. Ces
     cartes partaient donc **toujours** dues aujourd'hui, sans moyen de choisir le 06.
2. **Réimporter un JSON avec une autre date ne redatait rien.**
   - Où : `lib/import.js`, `appendItemsToFiche`.
   - Les items déjà présents dans la fiche (même `id` d'origine, donc même `srcId`) sont
     ignorés comme doublons. Les cartes gardaient leur échéance du jour, et l'aperçu
     disait seulement « N doublons ignorés ».

## Correction

- **« Coller du JSON » propose « Premier passage (J0) »**, avec le même champ et le même
  effet que l'import de l'Accueil : `appendItemsToFiche({ …, startDate })`. Une date
  passée est acceptée.
- **Doublons, en option explicite.** Les trois aperçus (Accueil, Rattrapage, Coller du
  JSON) proposent une case, **décochée par défaut** : « Appliquer aussi ce J0 aux N
  cartes déjà dans la fiche, jamais révisées ».
  - Seules sont concernées les cartes QCM et flashcard **jamais révisées**, la même
    cible que « Décaler le départ ».
  - Une sauvegarde (`putBackup`) est faite avant la réécriture.
  - Les cartes déjà révisées ne sont jamais touchées.
- **Aucune migration, aucune modification des cartes existantes** sans cette case
  cochée.

## Tests réels

| Cas | Résultat |
|---|---|
| Coller du JSON, J0 = +2 | 3 cartes dues le 06 (« Premier passage le 06/10/2026 ») |
| Coller du JSON, J0 = aujourd'hui | dues le 04 |
| Coller du JSON, J0 = −3 | dues le 01, en retard, comme « Décaler le départ » à une date passée |
| Réimport du même JSON au J0 +2, case décochée | cartes inchangées |
| Même réimport, case cochée | les 2 cartes jamais révisées passent au 06 ; la carte révisée reste au 04 |
| Comparaison | carte collée au J0 06 identique, champ par champ, à une carte créée au formulaire puis décalée au 06 : `dueDate`, `j0Date`, `intervalDays`, `capped`, `termine`, `historique` |
| Import par l'Accueil, J0 +2 | inchangé, toujours dû le 06 |
