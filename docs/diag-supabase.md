# Diagnostic Supabase — 30 septembre 2026 (lecture seule)

**Verdict : le projet n'est PAS supprimé. Il est EN PAUSE, et Supabase affirme que
toutes ses données sont intactes.** La remise en route tient en un clic
(« Resume project »), qui t'appartient. Aucune recréation, aucune réinjection n'est
nécessaire — et le script de recréation préparé hier ne doit **pas** être utilisé.

> Correction de la veille : `docs/diag-supabase-nuit.md` concluait « supprimé » à partir
> du DNS (NXDOMAIN). C'était faux : un projet en pause perd lui aussi son DNS. Hier je
> n'avais pas accès au tableau de bord ; cette nuit si (ta session Chrome), et c'est lui
> qui tranche.

**Aucune action d'écriture n'a été faite** : pas de « Resume », pas de SQL, pas de
téléchargement de sauvegarde cloud, aucune variable Vercel modifiée.

---

## 1. Le projet existe-t-il ? Est-il en pause ?

Tableau de bord Supabase, ta session, lecture seule :

```
Organisation « yoagatann09@gmail.com's Org » — Free Plan — 3 projets
  CTF             eu-central-1   Project is paused
  Founders Union  eu-west-1      Project is paused
  My Org          eu-west-1      Project is paused      ← ref deaonugwvbapkdixdowk

Page du projet « My Org » :
  Project "My Org" is paused
  All data, including backups and storage objects, remains safe.
  You can resume this project from the dashboard until 01 Nov 2027.
  After that, this project will not be resumable, but data will still be available for download.
  [Resume project]  [Upgrade to Pro]      Export your data → [Download backups]

Utilisation de l'organisation : File storage 0.06 / 1 GB   (tes images et PDF sont là)
```

Les trois projets de l'organisation sont en pause : c'est la **mise en veille automatique
du plan gratuit** (projets sans activité), pas une action de ta part ni un incident.

## 2. L'URL et la clé du build correspondent-elles au projet ?

**Oui, les deux.** Lues dans le bundle public servi en production
(`https://my-org-blue.vercel.app/assets/index-DbIUiyfh.js`) :

```
VITE_SUPABASE_URL       → https://deaonugwvbapkdixdowk.supabase.co   = ref de « My Org »
VITE_SUPABASE_ANON_KEY  → JWT décodé localement : iss=supabase, ref=deaonugwvbapkdixdowk,
                          role=anon, exp=2100908629 (an 2036)          = même projet, valide
```

La clé n'est reproduite nulle part ; seule sa charge utile (publique par conception) a été lue.

## 3. Pourquoi l'app dit « le serveur cloud ne répond pas »

Un projet en pause n'a plus d'hôte : son nom ne résout plus.

```
dig  deaonugwvbapkdixdowk.supabase.co            → NXDOMAIN
dig @1.1.1.1 / @8.8.8.8                          → NXDOMAIN
GET https://deaonugwvbapkdixdowk.supabase.co/rest/v1/  → HTTP 000 (connexion impossible)
témoin : supabase.com                            → résout normalement
```

## 4. La table `medrevise_records` et la fonction `medrevise_push` sont-elles là ?

**Impossible à interroger tant que le projet dort** : la base est arrêtée. Rien n'indique
qu'elles aient disparu (Supabase garantit la conservation des données en pause). Pour le
vérifier après la reprise, un script **en lecture seule** est prêt :
`supabase/verif-apres-reprise.sql` (transaction `read only`, finit par `rollback`) — il
compte les lignes par store, donne la date de la dernière écriture, et vérifie la fonction
et le bucket.

## 5. Tes données locales — confirmées intactes

Lues directement dans l'IndexedDB de ton Chrome (origine `my-org-blue.vercel.app`), depuis
une page statique du site (`/favicon.svg`) pour ne PAS démarrer l'app, bases ouvertes sans
version (aucune mise à niveau possible), comptage seul :

| Store | Ce Mac, 30/09 | Sauvegarde de référence du 25/08 |
|---|---|---|
| fiches | **66** | 62 |
| questions (cartes) | **1 140** | 1 111 |
| sessionsLog | **42** | 39 |
| dossiers | **24** | 22 |
| matières | 2 | 2 |
| cours (sources) | 1 | 1 |
| outbox (envois en attente) | 0 | — |
| blobs (images/PDF sur cet appareil) | 0 | inclus dans le fichier |

Ce Mac contient **plus** que la référence du 25 août : rien n'a été perdu en local.
Sa dernière synchro réussie date du **26/08/2026 06:50** (`medrevise.derniereSyncOk`).
Il n'a pas de fichiers en local : ils sont dans le stockage cloud (0,06 Go, intact).

### Sauvegarde neuve, produite cette nuit (export lecture seule de l'app)

```
~/Downloads/medrevise-sauvegarde-my-org-blue.vercel.app-2026-09-30-15h39.json
  2 688 620 octets — SHA-256 e63c2821a951d17109f6534c1c44e0da320acc0e032f9b1ae3b58496d4e047e7
  exporteLe 2026-09-30T13:39:09Z — compteurs identiques à l'IndexedDB ci-dessus
  (66 fiches, 1 140 questions, 42 sessions, 24 dossiers…)
```

Recomptée APRÈS l'ouverture de l'app pour l'export : strictement identique, outbox à 0.
L'app n'a rien écrit ; la synchro a échoué comme prévu (garde-fou « jamais pousser après
un tirage raté »).

**Ce que je n'ai pas pu faire** : les autres appareils (téléphone, autre ordinateur) ont
leur propre IndexedDB, inaccessible d'ici. Leur sauvegarde fait partie de tes gestes.

## 6. Ce qui se passera à la reprise

- DNS et API reviennent (quelques minutes). Vercel n'a rien à changer : même URL, même clé.
- Au premier lancement, chaque appareil réconcilie avec le cloud en **last-write-wins** par
  enregistrement : la version la plus récente de chaque fiche/carte gagne, d'où qu'elle
  vienne. Une suppression locale n'a lieu que face à un tombstone cloud plus récent.
- Ce Mac repoussera ce qu'il a de plus récent que le cloud (fiches/cartes créées après sa
  dernière synchro du 26/08) ; le garde-fou `medrevise_push` refuse côté serveur toute
  écriture plus ancienne que ce qui est déjà au cloud.
- Si le projet repasse en pause un jour (plan gratuit), l'app reste désormais utilisable
  immédiatement (démarrage non bloquant, commit f92b895) et garde tout en local.
