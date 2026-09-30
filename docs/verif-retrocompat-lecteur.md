# Rétrocompatibilité du lecteur unifié — fiches déjà importées (nuit du 30/09)

**Aucune migration, aucune réécriture de données.** Toutes les évolutions de la nuit
lisent les enregistrements existants tels quels ; les seuls champs nouveaux sont
facultatifs et ont une valeur par défaut à la lecture.

| Donnée existante | Ce qui change à l'affichage | Où c'est géré |
|---|---|---|
| Surlignage PDF **avec ancre** | rien | `PdfPage#shownRects` |
| Surlignage PDF **sans ancre** (anciens) | rien ; sert aussi de garde géométrique contre le re-surlignage | `pdfShared#partCouverte` |
| Surlignage avec **note** (ancienne popover) | la note reste affichée dans l'onglet Notions et exportée ; on ne peut plus en créer | `PdfReader#notionsPdf` |
| Trait au crayon **sans `mode`** | lu comme « dessin », désormais rendu en courbe lissée ; s'affiche enfin à sa vraie place (voir fabfb5e) | `pdfShared#modeDuTrait`, `#cheminLisse` |
| Boîte de texte libre | rien | `NoteBox` |
| Bloc « remplacer le texte » (sans `kind`) | rien ; on en crée depuis le menu ⋯ | `TextEditBlock` |
| Fiche **HTML** (gabarit actuel) | même cadre et même panneau que le PDF ; Surligneur / Annuler / Rétablir de la barre pilotent les boutons du gabarit | `CourseHtmlView` |
| Fiche **HTML** d'un gabarit ancien (sans barre) | outils absents détectés : seul « Sélection », Annuler grisé ; notions listées | `CourseHtmlView#lireCours` |

Le HTML sauvegardé ne contient **rien** de nouveau : la feuille qui masque les
commandes doublées du gabarit est « adoptée » (hors DOM), donc jamais sérialisée.

## Preuves (Chrome headless isolé, base locale, `SYNC_ENABLED = false`)

Enregistrements « à l'ancienne » créés à la main (surlignage rose sans ancre avec
note, trait sans `mode`, bloc remplacé), puis lecteur ouvert sur chaque écran :

```
Réviser           canvas=1 texte=33 page=1/3  outils=Sélection/Surligneur/Boîte/Crayon/Gomme
                  panneau=QCM 1 | Flashcard 1 | Exercice 0 | Feynman 0 | Notions 1
                  surlignages=1 traits=1 blocs=1   ← les trois anciens enregistrements
Biblio · PDF      identique ; Notions : « La valve mitrale separe » + « Note écrite avant (ancienne popover) »
Biblio · HTML     iframe=1 outils=Sélection/Surligneur  panneau=QCM 1 | … | Notions 2
Vieux HTML        outils=Sélection  Annuler grisé  Notions : « un passage vert »
Apprentissage     canvas + texte, page 1/3, panneau Notions (replié par défaut, comme avant)
Import Anatomie   canvas=1 texte=33 page=1/3 panneau=Notions 0
Prise de notes    canvas=1 texte=33 page=1/3 panneau=Notions 2
MealWeek          s'ouvre (« Semaine 1 sur 8 ») — aucun fichier de src/mealweek/ touché
Erreurs console   0
```
