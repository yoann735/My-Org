# Diagnostic — « Cloud injoignable, état non vérifiable » (nuit du 29 au 30 septembre 2026)

**Verdict : le projet Supabase visé par la production n'existe plus.** Son nom d'hôte ne
résout plus en DNS (NXDOMAIN). Ce n'est ni un problème de réseau, ni un déploiement en cours,
ni une variable d'environnement manquante, ni une régression du code de synchro.

**Aucune écriture cloud n'a été faite pendant ce diagnostic.** Tout ce qui suit est en
lecture seule : API Vercel, requêtes DNS, et un GET anonyme sur un point d'entrée REST.

---

## 1. Ce que signifie exactement le message

`src/medrevise/components/ui.jsx:193` affiche ce bandeau quand `comparerAuCloud()` renvoie
`statut: 'offline'`. Or `lib/syncStatus.js#comparerAuCloud` distingue deux cas :

| statut | condition | message affiché |
|---|---|---|
| `disabled` | `SYNC_ENABLED === false` (variables d'env absentes) | « Synchro cloud désactivée sur ce déploiement » |
| `offline` | `SYNC_ENABLED === true` **mais** `pullAllRecords()` ou `etatBlobs()` renvoie `null` | « ⚠️ Cloud injoignable — état non vérifiable » |

C'est `offline` qui s'affiche. **Donc les variables d'environnement sont bien présentes** :
le problème est en aval, au moment de joindre Supabase.

`data/sync.js#pullAllRecords` renvoie `null` sur toute erreur, y compris un `catch` d'échec
réseau — c'est volontaire (règle « jamais de résultat partiel »), mais ça confond une panne
réseau passagère avec un hôte qui n'existe plus.

## 2. Ce qui a été vérifié, et ce que ça donne

### a) Vercel — tout va bien

```
projet            my-org  (prj_hKmlYmNrbIFZHldxfGwPviOjP19B)
domaine de prod   my-org-blue.vercel.app
6 derniers déploiements production : state=READY  (aucun échec, aucun en cours)
dernier déploiement : 29/09/2026 22:36, commit 4642ead (étape 3 du refactor)
```

### b) Variables d'environnement — présentes

```
VITE_SUPABASE_URL        type=sensitive  cibles=[preview, production]  créée le 29/07/2026 17:20
VITE_SUPABASE_ANON_KEY   type=sensitive  cibles=[preview, production]  créée le 29/07/2026 17:21
```

À noter : elles ne couvrent **pas** la cible `development`. Sans conséquence pour le site
déployé, mais c'est pour ça qu'un `vercel dev` local n'a pas de synchro.

Leur valeur est chiffrée côté Vercel et je ne l'ai pas déchiffrée. Ce n'était pas nécessaire :
les variables `VITE_*` sont **inlinées dans le bundle au build**, donc l'URL réellement
utilisée en production se lit dans le fichier JS public du site.

```
GET https://my-org-blue.vercel.app/assets/index-lrO5rX2u.js   → HTTP 200, 2 936 517 o
→ une URL https://<ref>.supabase.co y figure bien
→ la clé anon y figure aussi (2 occurrences) — normal, une clé anon est publique par
  conception ; sa valeur n'est reproduite nulle part dans ce document
```

Conclusion intermédiaire : **la production est bien configurée et pointe vers un projet
Supabase précis**. `SYNC_ENABLED` vaut donc `true`, ce qui est cohérent avec le message vu.

### c) Le projet Supabase — introuvable

```
host <ref>.supabase.co                  → NXDOMAIN
dig @1.1.1.1  <ref>.supabase.co         → status: NXDOMAIN
dig @8.8.8.8  <ref>.supabase.co         → status: NXDOMAIN
GET https://<ref>.supabase.co/rest/v1/  → HTTP 000 en 0,019 s (échec de connexion)

TÉMOIN (pour écarter une panne DNS locale) :
host supabase.co                        → 76.76.21.21
GET https://supabase.co                 → HTTP 307
```

Trois résolveurs indépendants, même réponse, alors qu'un hôte témoin résout normalement.

**Ce que NXDOMAIN veut dire ici.** Un projet Supabase simplement *en pause* (inactivité sur
le plan gratuit) garde son DNS et répond par une erreur HTTP (503/540). Un nom d'hôte qui ne
résout plus du tout signifie que le projet a été **supprimé**, ou que son identifiant a
changé. Il n'y a pas de troisième explication.

## 3. Causes écartées, avec la preuve

| Hypothèse | Écartée parce que |
|---|---|
| Réseau / hors ligne | l'hôte témoin `supabase.co` résout et répond 307 |
| Déploiement en cours | les 6 derniers déploiements production sont `READY` |
| Variables d'env absentes au build | l'URL et la clé sont bien présentes dans le bundle servi |
| RPC `medrevise_push` absente | ne s'applique pas : la RPC est une écriture, or c'est la **lecture** (`pullAllRecords`) qui échoue — et de toute façon l'hôte est injoignable |
| RLS trop restrictive | une policy refusée renverrait 401/403, pas un échec DNS |
| Quota dépassé | un quota renvoie 429/402, pas NXDOMAIN |
| Régression d'un commit récent | le code de synchro n'a pas été touché depuis `1cf91ba` ; les commits de la soirée ne concernent que le lecteur PDF et la prise de notes |

## 4. Conséquences, et ce qui n'est PAS en danger

1. **La copie cloud des données est très probablement perdue.** Si le projet a été supprimé,
   la table `medrevise_records` et le bucket `medrevise-blobs` le sont aussi.
2. **Les copies locales sont intactes** : chaque appareil garde tout dans IndexedDB, et le
   code de synchro n'a jamais rien effacé en local à cause de cette panne. Au contraire,
   `storage.js#syncNow` contient déjà le garde-fou C2 : *« NE JAMAIS pousser après un tirage
   raté »* — quand `reconcileAll` échoue, la fonction sort sans rien republier.
3. **Se rebrancher sur un projet NEUF et VIDE ne détruira rien en local.** Vérifié dans
   `storage.js#reconcileAll` : une suppression locale n'a lieu que face à un *tombstone cloud
   plus récent* (`cloud.deleted && cloudTs >= localTs`). Un projet vide n'a ni ligne ni
   tombstone : chaque enregistrement local sera simplement **poussé** vers le cloud.
4. **Je n'ai PAS pu faire de sauvegarde de tes données.** Elles vivent dans l'IndexedDB de
   ton propre Chrome, que macOS protège :
   `ls ~/Library/Application Support/Google/Chrome` → `Operation not permitted`.
   Aucun contournement n'a été tenté — c'est une protection du système, pas un obstacle à
   franchir. **La sauvegarde est donc la toute première chose à faire demain, avant tout
   le reste** (Réglages → sauvegarde locale, sur *chaque* appareil).

## 5. Ce qui n'a pas pu être vérifié

- **L'état réel du projet côté Supabase** (supprimé ? renommé ? autre organisation ?) : il
  faut ouvrir le tableau de bord Supabase, ce que je ne peux pas faire — l'extension Chrome
  qui donnerait accès à ta session n'est pas connectée.
- **La répétition à blanc du SQL sur une vraie base** : ni `psql`, ni `docker`, ni la CLI
  `supabase` ne sont installés sur cette machine. Le script de restauration est donc livré
  avec un bloc `begin; … rollback;` pour que **tu** fasses la répétition en un clic dans
  l'éditeur SQL, avec les contrôles avant/après (voir `supabase/restauration-projet.sql`).

## 6. Aucune action cloud entreprise

Conformément à la règle de sécurité : aucune écriture, aucune migration, aucune suppression,
aucun reset. Le seul trafic sortant a été : l'API Vercel en lecture, deux requêtes DNS, un
GET sur une page et un asset public, et un GET anonyme sans clé sur un hôte qui n'existe pas.
