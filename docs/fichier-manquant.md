# Le fichier manquant au cloud (1 sur 74) — identité et options

**Rien n'a été supprimé ni modifié.** Enquête en lecture seule (API du cloud en GET, listing du
bucket, lecture de tes fichiers de sauvegarde), le 30/09/2026.

## Ce que c'est

| | |
|---|---|
| **Fichier** | `Les-ions.html` — le **cours HTML** d'une fiche |
| Identifiant du blob | `bms5x9c2bb87m` (type `text/html`, 377 450 octets) |
| **Fiche** | « **Les ions** » (`fms5vsyu4wqtg`) — cours *Rattrapage* → matière *Chimie* → dossier *Unit 1* |
| Cartes de la fiche | 44 (21 flashcards, 13 QCM, 7 exercices, 3 Feynman) — **aucune n'a besoin du fichier** pour être révisée |
| Importé le | 29/07/2026 à 10:08 UTC (horodatage contenu dans l'identifiant) ; fiche créée 40 min plus tôt (09:27) |
| Qui le référence | la fiche (`htmlId`) — et, pour mémoire, une copie de la fiche figée dans la carte QCM `qms5vsyu9z7tq` (vestige d'un ancien import, sans effet) |
| Surlignages / modifications dans l'app | aucun après l'import (sinon l'auto-sauvegarde aurait créé un nouvel identifiant) |

Le calcul refait côté cloud donne exactement ton message : **74 fichiers référencés, 73 au
cloud, 1 absent** — celui-ci, le seul.

## Où il existe encore — deux copies intactes, identiques à l'octet

1. **Sur ton disque** : `~/Documents/Formations & cours/Rattrapage/Fiches/Chimie/Les-ions.html`
   (modifié le 28/07 19:27, soit la veille de l'import).
2. **Dans tes sauvegardes du 25/08** (`~/Downloads/medrevise-REFERENCE-fusionnee.json`, et les
   deux « My Org Backup/Sauvegarde … Aug 25 2026.json »), qui embarquent son contenu.

Les deux ont le même SHA-256 (`af32e57acca261fe…`) et la même taille : c'est exactement le
fichier importé.

## Pourquoi il n'est jamais arrivé au cloud

Le 25/08 à 08:40, le **Chrome d'un Mac** l'avait encore (il est dans la sauvegarde faite depuis
ce navigateur). Aujourd'hui, ton Chrome sur ce Mac n'a **plus aucun fichier** en local (0 blob :
il les lit au cloud), et aucun appareil connu ne l'a. Il a vraisemblablement été importé avant
la mise en place de l'envoi durable des fichiers (outbox, mi-septembre), puis perdu localement
lors des réparations de synchro de fin août. **Rouvrir l'app « sur l'appareil d'origine » ne le
renverra donc très probablement pas** — il n'y est plus.

## Tes options (au choix — rien n'est fait tant que tu ne cliques pas)

### ✅ Option A — le remettre (recommandé, 1 minute, zéro perte)
Tu as l'original identique. Depuis cette nuit, l'app propose de le rattacher là où il manque :
1. MedRevise → **Bibliothèque** → *Rattrapage* → *Chimie* → **« Les ions »**.
2. Le cours affiche « **Le cours HTML de cette fiche n'est ni sur cet appareil ni au cloud** »
   avec un bouton **« Rattacher le fichier… »**.
3. Choisis `Documents/Formations & cours/Rattrapage/Fiches/Chimie/Les-ions.html`.

L'app l'enregistre, l'envoie au cloud (outbox durable) et la fiche pointe sur le nouveau
fichier. Réglages affichera alors « 74/74 au cloud ». Les 44 cartes ne bougent pas.

*(Alternative équivalente : le même fichier est dans ta sauvegarde de référence — mais la
restauration d'une sauvegarde remet TOUT l'appareil dans l'état du 25/08 : à ne pas utiliser
pour un seul fichier.)*

### Option B — l'essayer depuis l'appareil d'origine
Ouvre MedRevise sur tes autres appareils (autre ordinateur, autre navigateur) : s'il y dort
encore, l'app l'enverra toute seule au démarrage (audit automatique). Peu probable (voir
ci-dessus), mais sans risque.

### Option C — ne plus y penser (supprimer la référence fantôme)
Si tu décides que ce cours HTML ne te sert plus : ouvre la fiche « Les ions », menu **⋯** →
**Détacher le cours HTML** (confirmation demandée). La fiche et ses 44 cartes restent ; seul le
lien vers le fichier fantôme disparaît, et le compteur passe à 73/73. Annulable en rattachant
le fichier plus tard (option A). **Je ne l'ai pas fait** : c'est ta décision.
