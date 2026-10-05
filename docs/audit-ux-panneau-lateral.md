# Audit UX — lecteur de cours et panneau latéral (05/10/2026)

Conditions : MedRevise en local (Chrome 154, données de test, faux Supabase/Deepgram), parcours
d'un étudiant en kiné pendant un cours : ouvrir un cours depuis la Bibliothèque, lire le PDF,
surligner, poser une boîte, créer une flashcard, lancer une transcription, ajouter une note,
chercher une notion, revenir à la Bibliothèque. Largeurs : 1440 px (ordinateur), 820 et 780 px
(tablette / fenêtre étroite — encore le shell « bureau », lecteur disponible), 390 px (téléphone —
shell mobile).

Captures de référence : `docs/img/panneau-lateral/avant-*.png`.

## Bloquant / majeur

| # | Constat | Où | Conséquence |
|---|---|---|---|
| M1 | **6 onglets à plat** (QCM, Flashcard, Exercice, Feynman, Notions, Transcript) dans 380 px → **deux lignes**, « Transcript » seul sur la seconde. Aucune hiérarchie entre s'entraîner, relire ses notions et suivre le cours. | panneau | il faut lire 6 libellés pour trouver le bon ; la transcription, outil du *moment du cours*, est noyée parmi les outils de *révision*. |
| M2 | **Le panneau s'ouvre toujours sur QCM**, même si l'on était sur Transcript ou Notions la dernière fois. | panneau | 1 clic de plus à chaque ouverture de cours, pendant le cours. |
| M3 | **Fenêtre étroite (≤ 900 px)** : la barre d'outils fait **3 lignes (≈ 150 px)**, puis la bascule « Cours / Panneau » ; le PDF ne commence qu'à **315 px** du haut. | barre + lecteur | la moitié d'un écran de tablette avant la première ligne du cours. |
| M4 | **Deux commandes pour le même panneau** : le bouton « › Panneau » de la barre ET la poignée « › » du panneau (ET, en étroit, la bascule « Cours / Panneau »). | barre + panneau | on ne sait pas lequel utiliser ; trois états à comprendre. |
| M5 | **Doublons barre ↔ menu Fichier** : « Insérer une page », « Insérer une image » (déjà dans la barre) ; « Ajouter un item », « Importer des items » (déjà dans le panneau). | menu Fichier | menu long (10 entrées), hésitation : « est-ce la même chose ? ». |
| M6 | **Le micro de transcription est une icône seule** entre la recherche et « Panneau », sans libellé à cette largeur ; il ouvre une feuille ET bascule l'onglet du panneau. | barre | action importante peu découvrable ; la barre du PDF porte un outil qui ne concerne pas le PDF. |
| M7 | **Source audio** : si l'on suit le cours en AirPods, le micro n'entend rien — l'app ne le dit qu'**après** avoir démarré (« Pas de son ? »). Aucun guide pour BlackHole / l'onglet Chrome. | feuille Transcrire | première session ratée garantie pour un cours Teams écouté au casque. |
| M8 | **Téléphone (390 px)** : le shell mobile n'a pas de lecteur de cours du tout (« révision uniquement »). | shell mobile | ni lecture, ni panneau, ni transcription sur téléphone. |

## Moyen

| # | Constat | Où |
|---|---|---|
| m1 | **Ajout d'items** : un gros bouton violet par type (« + Ajouter — QCM »), deux gros boutons en Flashcards (« Flashcard texte » / « Flashcard image ») + une barre « Pas de thème auto pour cette fiche · Définir » ; le formulaire d'ajout ouvert fait **820 px de haut et 16 boutons** (Formulaire / Coller du JSON, 8 amorces de question…). | Exercices |
| m2 | **Notions** : bouton « Copier les notions » + légende des couleurs + texte d'aide + liste — **pas de recherche** ; « chercher une notion » se fait par la recherche du PDF, qui cherche dans le *texte du cours*, pas dans *mes* notions. | Notions |
| m3 | **Clic sur une notion** : la page défile, mais **le surlignage n'est pas mis en évidence** ; sur une page dense on le cherche des yeux. | Notions |
| m4 | **Carte crédits** en haut du mode Transcript : 116 px permanents pour une information consultée rarement. | Transcript |
| m5 | Placeholder de recherche **tronqué** (« Rechercher… (⌘ ») à 1440 px avec le panneau ouvert. | barre |
| m6 | La **liste des micros** de la feuille n'a pas d'option « Automatique » et ne dit pas lequel sera utilisé si le dernier choisi a disparu. | feuille Transcrire |
| m7 | **Changer de micro** pendant une session impose d'arrêter puis de relancer. | Transcript |

## Mineur / cosmétique

| # | Constat |
|---|---|
| c1 | Libellés au singulier et au pluriel mélangés : « Flashcard 0 », « Exercice 0 » vs « Notions 1 ». |
| c2 | Les icônes Page / Image / Dessins du téléphone se ressemblent (trois rectangles). |
| c3 | Compteurs « 0 » affichés sur tous les onglets vides : bruit visuel. |
| c4 | Le mode « Les deux / Tableau » réduit le panneau sans le dire. |
| c5 | En-tête : « Fichier » en petit sous le titre, éloigné de la barre où l'on cherche les actions. |

## Ce qui marche bien (à garder)

- Les outils d'annotation au centre, la barre contextuelle (couleurs, épaisseur) qui n'apparaît
  que pour l'outil actif, les raccourcis (⌘F, ⌘Z, ⌘G).
- Le panneau qui garde sa largeur et se replie d'un geste ; la session de transcription qui
  survit à tout (changement d'onglet, mode focus).
- Le menu « Fichier » pour les actions rares (export annoté, JSON, renommer, détacher).

## Décisions (appliquées dans la refonte — détail dans `compte-rendu-panneau-lateral.md`)

| Constat | Décision |
|---|---|
| M1, M2, c1, c3 | Panneau en **3 modes** (Exercices · Notions · Transcript), segmenté avec indicateur glissant, **mode mémorisé par cours**, glissement horizontal ; sous-navigation compacte en Exercices, compteurs discrets (gris, atténués à 0), libellés au pluriel. |
| M6 | Bouton **Transcrire retiré de la barre**, il vit en tête du mode Transcript ; une session en cours se voit sur le segment « Transcript » (point rouge + chrono). |
| M4 | Bouton « Panneau » retiré de la barre : la poignée du panneau suffit (et la bascule Cours / Panneau en étroit). |
| M5 | Menu Fichier : retrait des 4 doublons. |
| M3, m5 | Barre : niveaux de compacité supplémentaires — insertions (Image, Page) regroupées dans un menu « ⋯ », recherche en icône qui se déplie ; objectif **2 lignes max** à 780 px. Placeholder court. |
| m1 | **Une seule barre d'actions** en Exercices : « + Ajouter » contextuel + menu « ⋯ » (Coller du JSON, Flashcard image, Thème automatique). |
| m2, m3 | Notions : **recherche/filtre**, liste seule ; clic → page + **mise en évidence** du surlignage ; « Copier les notions » reste dans Fichier. |
| m4 | Crédits : **une ligne grise** en bas du mode Transcript, dépliable. |
| M7, m6, m7 | Feuille Transcrire : source **Automatique** (bouclage virtuel > dernier validé > défaut), **VU-mètre 3 s avant démarrage**, message « aucun son » + **guide** ; **bascule de micro à chaud** en session. |

**Écartés** : M8 (lecteur sur téléphone — le shell mobile est volontairement limité à la révision ;
y porter le lecteur PDF complet est un chantier en soi) ; c4 (comportement du mode « Les deux »
inchangé, hors périmètre) ; c5 (en-tête/Fichier : déplacer « Fichier » toucherait la Bibliothèque
embarquée et le mode HTML, gain faible).
