# Rapport de nuit — 29 au 30 septembre 2026

Deux chantiers : le **refactor du lecteur PDF** (terminé) et le **problème Supabase**
(diagnostiqué, préparé — il reste des gestes qui n'appartiennent qu'à toi).

**Aucune écriture cloud n'a été faite.** Rien n'a été supprimé, migré ni réinitialisé.

---

## ⚠️ À FAIRE EN PREMIER AU RÉVEIL, avant tout le reste

**Exporte une sauvegarde locale sur CHAQUE appareil** : MedRevise → Réglages →
« Enregistre TOUT ce que contient cet appareil dans un seul fichier JSON ».
C'est une opération en lecture seule, elle ne déclenche aucune synchro.

Pourquoi c'est urgent : le projet Supabase visé par la production **n'existe plus**
(voir plus bas). La copie cloud de tes données est donc très probablement perdue, et
**les copies locales de tes appareils sont aujourd'hui les seules qui restent**.
Je n'ai pas pu faire cette sauvegarde à ta place : macOS interdit l'accès au profil
Chrome (`ls ~/Library/.../Google/Chrome` → `Operation not permitted`). Je n'ai
tenté aucun contournement — c'est une protection du système, pas un obstacle.

---

## TÂCHE 1 — Supabase « Cloud injoignable »

### Le diagnostic, en une phrase

Le nom d'hôte du projet Supabase ne résout plus en DNS (**NXDOMAIN**, confirmé sur le
résolveur système, 1.1.1.1 et 8.8.8.8, alors qu'un hôte témoin répond normalement).
Un projet simplement *en pause* garderait son DNS et renverrait une erreur HTTP ; un
hôte qui disparaît des DNS signifie que le projet a été **supprimé**, ou que son
identifiant a changé. Détail complet et preuves : **`docs/diag-supabase-nuit.md`**.

Écarté, avec la preuve à chaque fois : réseau, déploiement en cours, variables d'env
absentes, RPC manquante, RLS, quota, régression d'un commit récent. Vercel est sain
(6 déploiements production `READY`), et les deux variables `VITE_SUPABASE_*` sont
bien présentes et bien inlinées dans le bundle servi.

### Ce que j'ai fait côté code (sans toucher au cloud)

L'app affichait le même « Cloud injoignable » pour une coupure de dix secondes et
pour un projet disparu. Elle dit maintenant **où** est la panne :

> ⚠️ Le serveur cloud ne répond pas (projet Supabase supprimé, en pause, ou URL
> erronée) — état non vérifiable

Vérifié en reproduisant la panne réelle en local (un `.env` gitignoré pointant vers un
hôte inexistant, supprimé depuis). Aucun changement du comportement de la synchro :
mêmes appels, mêmes règles, mêmes garde-fous — seul le diagnostic affiché change.

### Ce qui t'attend, et que je n'ai PAS fait

Créer un projet Supabase demande ton compte ; exécuter du SQL sur ta base est une
écriture. Les deux sortent de ce que je m'autorise en autonomie. Tout est prêt :

| # | Geste | Où |
|---|---|---|
| 1 | **Sauvegarder en local** sur chaque appareil | Réglages → sauvegarde JSON |
| 2 | Vérifier dans le tableau de bord Supabase si le projet est supprimé, en pause, ou déplacé | supabase.com |
| 3 | Si le projet est récupérable : le réactiver, et **rien d'autre** ne sera nécessaire | — |
| 4 | Sinon : créer un projet neuf, puis **répétition à blanc** du script | `supabase/restauration-projet.sql`, tel quel (il finit par `rollback;`) |
| 5 | Si les contrôles AVANT/APRÈS sont bons : remplacer `rollback;` par `commit;` et réexécuter | idem |
| 6 | Mettre à jour `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sur Vercel, puis **Redeploy** | Vercel → my-org → Settings → Environment Variables |
| 7 | Ouvrir l'app sur l'appareil le plus complet en premier, et forcer la synchro | Réglages → Forcer la synchro |
| 8 | Puis les autres appareils, un par un | — |

`supabase/restauration-projet.sql` recrée la table `medrevise_records` + sa RLS, le
bucket `medrevise-blobs` + sa policy, et la fonction `medrevise_push` (le garde-fou
`updated_at`). Il ne contient **aucun** DROP, DELETE, TRUNCATE ni UPDATE de données,
il est idempotent, et il affiche un contrôle avant et après.

### Ce que tu ne risques pas, et pourquoi je peux l'affirmer

Se rebrancher sur un projet **vide** ne détruira rien en local. Dans
`storage.js#reconcileAll`, une suppression locale n'a lieu que face à un *tombstone
cloud plus récent* (`cloud.deleted && cloudTs >= localTs`). Un projet neuf n'a ni
ligne ni tombstone : chaque enregistrement local sera **poussé** vers le cloud, jamais
effacé. Et `syncNow` porte déjà le garde-fou C2 — « ne jamais pousser après un tirage
raté » —, c'est pour ça que la panne n'a rien abîmé pendant qu'elle durait.

L'ordre des appareils (point 7) n'est important que pour le confort : en
last-write-wins, c'est la version la plus récente de chaque enregistrement qui gagne,
quel que soit l'ordre. Les **fichiers** (PDF, images), eux, ne remonteront au bucket
que depuis les appareils qui les détiennent : il faudra bien synchroniser chacun.

---

## TÂCHE 2 — Refactor du lecteur PDF : terminé

Sept étapes, sept commits, tous poussés, `npm run build` vert avant chacun.

| Étape | Commit | Ce qui change |
|---|---|---|
| 1 | `6177005` | Boîte de texte réparée : 4 défauts enchaînés (focus manquant, mise en forme sans effet, fermeture périmée qui réécrivait la géométrie, Retour arrière destructeur) + couleur d'une boîte existante + Échap |
| 2 | `e102c95` | Bandeau du mode focus retiré ; accueil Prise de notes = drag & drop plein écran, import en zéro clic |
| 3 | `4642ead` | Suppression d'un surlignage limpide : contour au survol, cible cerclée, bouton rouge pleine largeur |
| 4 | `9f22e70` | Découpage à comportement identique : `PdfReader` 1907 → 990 lignes, + `pdfShared` (278), `PdfPage` (514), `CourseHtmlView` (212) |
| 5 | `7f13483` | Un seul axe d'outil (fin du faux mode Lecture/Édition), barre en 3 zones + barre contextuelle + menu ⋯, gomme |
| 6 | `58cb112` | Crayon à main levée + mode aimant (simplification RDP puis accrochage angulaire) |
| 7 | `9d4c85a` | Un seul lecteur : prop `source` unique, `outilsNotes` et `mode` supprimés, outils actifs **partout** |
| — | `94cc0de` | Message de panne cloud précis (tâche 1) |

**Combien de lecteurs y avait-il ? Un seul.** Ton impression de « plusieurs versions »
était juste, mais la cause était ailleurs : un fichier de 1907 lignes contenant DEUX
visionneuses sans rapport (le PDF et l'atelier HTML), chacune avec sa barre d'outils,
plus cinq axes de mode orthogonaux. Aucun vestige à supprimer : il fallait séparer.

### Une régression, attrapée et corrigée

Le découpage de l'étape 4 a emporté `courseExportOk` avec la branche HTML, alors que
la barre PDF s'en sert aussi → `ReferenceError` et écran blanc sur Réviser. La
check-list l'a vu immédiatement ; corrigé dans le même commit. C'est exactement ce
pour quoi l'étape 4 n'apportait aucune fonctionnalité.

### Check-list de non-régression, rejouée à chaque étape

Six points d'entrée du lecteur, dans un Chrome headless isolé, sur une base locale :

```
Réviser            canvas=1  page=1 / 2  outils=[Sélection/Surligneur/Boîte/Crayon/Gomme]
Biblio · PDF       canvas=1  page=1 / 2  outils=[…]
Biblio · HTML      iframe=1  atelier=1   (CourseHtmlView, #doc relu — pas le lecteur PDF)
Apprentissage      canvas=2  page=1 / 2  outils=[…]
Anatomie théorie   canvas=1  page=1 / 2  outils=[…]
Prise de notes     canvas=2  page=1 / 2  outils=[…]
TOTAL erreurs console : 0
```

### Un changement de comportement volontaire, à connaître

Depuis l'étape 7, **les outils d'annotation (surligneur, boîte, crayon, gomme) et
l'undo/redo sont actifs sur les PDF de tes fiches** — Réviser, Bibliothèque,
Apprentissage, Import Anatomie — et plus seulement en Prise de notes. C'est ce que
« un seul lecteur partout » implique, et tu l'as validé. Si tu préfères les réserver
à la Prise de notes, c'est une condition à remettre, pas un retour en arrière.

---

## Ce que j'ai choisi de NE PAS faire

1. **Toucher au cloud**, de quelque façon que ce soit. Pas d'écriture, pas de SQL, pas
   de variable d'environnement modifiée, pas de redeploy déclenché.
2. **Lire ou copier ta base locale** depuis le profil Chrome : macOS le refuse, et je
   n'ai pas cherché à contourner.
3. **Répéter le SQL à blanc sur une vraie base** : ni `psql`, ni `docker`, ni la CLI
   `supabase` sur cette machine. Le script est donc livré avec son `begin; … rollback;`
   pour que la répétition se fasse chez toi, en un clic, avec les contrôles visibles.
4. **Décrypter les valeurs des variables Vercel.** Inutile : les variables `VITE_*`
   sont inlinées dans le bundle public, ce qui a suffi pour vérifier la configuration.
5. **Corriger le démarrage lent quand le cloud est mort.** Constat mesuré cette nuit :
   avec un hôte injoignable, l'app reste ~7,5 s sur l'écran de chargement, parce que la
   synchro de démarrage attend le réseau avant le premier rendu. C'est réparable (rendre
   l'app utilisable d'abord, synchroniser ensuite), mais ça touche l'ordre d'amorçage de
   la synchro — je ne voulais pas y toucher la nuit où le cloud est déjà en panne.
6. **Corriger le `key` React de `QcmApprentissage`** que je t'avais signalé hier : après
   vérification, il venait de mon jeu de test, pas de l'app.

## Détails de méthode

L'extension Claude pour Chrome n'étant pas connectée, j'ai piloté un **Chrome headless
isolé** (profil jetable, port CDP 9333, sans aucun rapport avec ton navigateur ni ta
session) via un petit client CDP sans dépendance. La base de test a été peuplée en
appelant les **vrais modules du dépôt** servis par Vite. Aucun `.env` n'existe dans le
dépôt, donc `SYNC_ENABLED = false` en local : l'instance de test ne pouvait pas joindre
le cloud, même par accident.

`src/mealweek/` et `src/shared/` : **0 fichier touché** de toute la nuit.
