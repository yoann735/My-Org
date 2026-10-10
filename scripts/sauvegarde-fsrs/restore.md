# Restaurer l'état « avant FSRS » (sauvegarde du 10/10/2026)

Sauvegarde : `~/Documents/Dév & projets/Claude/Projets/My Org/backups/pre-fsrs-2026-10-10/`
(hors du dépôt : 449 Mo). Code : tag `pre-fsrs-2026-10-10` et branche `backup/pre-fsrs`
(commit `7b6c351`).

Contenu du dossier :

| Chemin | Contenu |
|---|---|
| `MANIFESTE.json` | SHA-256 et taille de chaque fichier, compteurs |
| `idb/` | export JSON sans perte de l'IndexedDB du Mac (Aside, copie de 18:39) : 29 bases, 3 055 entrées, blobs compris |
| `brut/aside-indexeddb-my-org-blue.tar.gz` | copie BRUTE des dossiers LevelDB + blobs d'Aside (même instant) |
| `supabase/medrevise_records.json` | toute la table (3 798 lignes, tombstones compris) |
| `supabase/medrevise-blobs/` | les 232 fichiers du bucket |
| `preuves/` | sorties du test de restauration |

Les commandes ci-dessous se lancent depuis la racine du dépôt, avec :

```sh
B="$HOME/Documents/Dév & projets/Claude/Projets/My Org/backups/pre-fsrs-2026-10-10"
```

## 0. Toujours commencer par vérifier la sauvegarde

```sh
node scripts/sauvegarde-fsrs/verifier.mjs manifeste "$B"     # attendu : 283/283 fichiers conformes
```

## 1. Revenir au code d'avant

```sh
git fetch origin --tags
git log --oneline -1 pre-fsrs-2026-10-10                      # 7b6c351
# a) annuler proprement les commits FSRS sur main (recommandé, sans réécrire l'historique) :
git revert --no-edit pre-fsrs-2026-10-10..main && git push
# b) ou repartir de la branche de sauvegarde (réécrit main : seulement si Yoann le demande explicitement) :
#    git push origin backup/pre-fsrs:main --force-with-lease
```

Vercel redéploie automatiquement au push.

## 2. IndexedDB du Mac (Aside)

**Avant tout** : la synchro est « le plus récent gagne ». Une base locale restaurée puis ouverte
EN LIGNE sera écrasée par toute version cloud plus récente. Restaurer le cloud d'abord (§3), ou
ouvrir l'app hors ligne pour vérifier.

### 2a. Copie brute (le plus fidèle, pour ce Mac)

```sh
osascript -e 'quit app "Aside"'; sleep 3; pgrep -x Aside && echo "Aside tourne encore : arrêter"
IDB="$HOME/Library/Application Support/Aside/Default/IndexedDB"
mkdir -p "$IDB/../IndexedDB-avant-restauration"
mv "$IDB"/https_my-org-blue.vercel.app_0.indexeddb.* "$IDB/../IndexedDB-avant-restauration/"
tar -xzf "$B/brut/aside-indexeddb-my-org-blue.tar.gz" -C "$IDB"
open -a Aside
```

### 2b. Depuis le JSON (testé le 10/10, voir `preuves/preuve-restauration.txt`)

Dans un profil Chrome **neuf** (le script refuse un profil qui contient déjà des bases) :

```sh
P="$HOME/chrome-medrevise-restaure"; mkdir -p "$P"
node scripts/sauvegarde-fsrs/restore-idb.mjs "$B" "$P"                  # 29 bases, 3 055 entrées
node scripts/sauvegarde-fsrs/export-idb.mjs "$P" /tmp/reexport          # contre-vérification
node scripts/sauvegarde-fsrs/verifier.mjs comparer "$B" /tmp/reexport  # attendu : 34/34 identiques
open -na "Google Chrome" --args --user-data-dir="$P" https://my-org-blue.vercel.app
```

Le Chrome isolé n'exécute jamais l'app pendant la restauration : réseau coupé, page vide servie
pour l'origine.

### 2c. Téléphone

Pas d'accès direct au stockage. On restaure le cloud (§3). Ensuite, sur le téléphone : Réglages
du navigateur → données du site `my-org-blue.vercel.app` → supprimer. Puis on rouvre l'app, qui
recharge tout depuis le cloud.

## 3. Cloud Supabase (procédure documentée, NON testée en réel)

Pourquoi un script dédié : la RPC `medrevise_push` n'accepte qu'un `updated_at` **plus récent**.
Elle refuserait donc de revenir à un état ancien. Le script écrit directement dans la table avec
la clé **service role**, qui n'est jamais commitée.

1. **Arrêter l'usage sur tous les appareils** : fermer l'app partout (Aside, téléphone,
   tablette). Sinon un appareil renverra ses versions plus récentes juste après la restauration.
2. Vérifier la sauvegarde (§0), puis faire une simulation sans réseau :
   ```sh
   node scripts/sauvegarde-fsrs/restore-supabase.mjs "$B"
   # attendu : 3798 lignes, 232 fichiers, « SIMULATION : aucune requête envoyée »
   ```
3. Sauvegarde côté serveur, dans Supabase → SQL Editor :
   ```sql
   create table public.medrevise_records_avant_restauration as select * from public.medrevise_records;
   select count(*) from public.medrevise_records_avant_restauration;
   ```
4. Restauration (clé copiée depuis Supabase → Project Settings → API → service_role, dans ce
   terminal uniquement) :
   ```sh
   read -s SUPABASE_SERVICE_ROLE_KEY; export SUPABASE_SERVICE_ROLE_KEY
   node scripts/sauvegarde-fsrs/restore-supabase.mjs "$B" --executer
   # ajouter --supprimer-nouvelles pour effacer aussi les lignes créées après le 10/10
   unset SUPABASE_SERVICE_ROLE_KEY
   ```
   Le script prend d'abord un instantané JSON de l'état actuel (`avant-restauration-*.json`, à
   côté de la sauvegarde). Il réécrit ensuite les 3 798 lignes, renvoie les 232 fichiers et
   recompte (« toutes les lignes sauvegardées présentes avec leur updated_at : OUI »).
5. Contrôle en lecture seule : `supabase/verif-apres-reprise.sql` dans le SQL Editor.
6. Sur chaque appareil, **avant** de rouvrir l'app : soit supprimer les données du site (il
   rechargera le cloud restauré), soit restaurer son IndexedDB (§2).

   ⚠️ Un appareil qui rouvre l'app avec ses anciennes données locales plus récentes les
   repoussera. C'est le « plus récent gagne ».

Annuler la restauration du cloud : relancer le script sur l'instantané `avant-restauration-*.json`.
Il a le même format de lignes ; le placer dans un dossier `supabase/` avec un `index.json`. Ou,
en SQL :

```sql
insert into public.medrevise_records select * from public.medrevise_records_avant_restauration
on conflict (store, record_id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted;
```

## 4. Refaire une sauvegarde (même méthode)

```sh
S=$(mktemp -d); mkdir -p "$S/p/Default/IndexedDB"
rsync -a --exclude LOCK "$HOME/Library/Application Support/Aside/Default/IndexedDB/"https_my-org-blue.vercel.app_0.indexeddb.* "$S/p/Default/IndexedDB/"
D="$HOME/Documents/Dév & projets/Claude/Projets/My Org/backups/$(date +%F)"
node scripts/sauvegarde-fsrs/export-idb.mjs "$S/p" "$D"
node scripts/sauvegarde-fsrs/export-supabase.mjs "$D"        # GET + liste du bucket : lecture seule
node scripts/sauvegarde-fsrs/manifeste.mjs "$D" "note"
node scripts/sauvegarde-fsrs/verifier.mjs manifeste "$D"
```
