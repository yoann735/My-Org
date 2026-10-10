# Restaurer MedRevise depuis une copie du filet de sécurité

Il existe deux sources de copies :
- **le dépôt GitHub privé** `<user>/medrevise-backups`, avec un commit « backup YYYY-MM-DD » par jour ;
- **le dossier local** choisi dans Réglages → Sauvegardes, qui contient `données/YYYY-MM-DD/`
  (8 copies gardées).

Les deux contiennent exactement les mêmes fichiers :

| Fichier | Contenu |
|---|---|
| `data/records.jsonl` | une ligne par enregistrement de `medrevise_records` (tombstones compris), triées (store, id) ; découpé en `records-001.jsonl`, `-002…` au-delà de 40 Mo |
| `data/review_log.jsonl` | le journal des révisions |
| `data/files-index.json` | la liste des fichiers du bucket (nom, taille, empreinte), **sans leur contenu** |
| `manifest.json` | le jour, les comptes, le SHA-256 de chaque fichier |

**Les PDF et les images ne sont pas dans GitHub.** Ils restent dans le bucket Supabase
`medrevise-blobs`, et dans le dossier local sous `<cours>/<fichier>`.

Toutes les commandes se lancent depuis la racine du dépôt MyOrg.

## 1. Choisir la copie

```sh
# liste des copies (jeton GitHub dans le terminal seulement, jamais dans un fichier)
read -s GITHUB_TOKEN; export GITHUB_TOKEN
gh api repos/<user>/medrevise-backups/commits --jq '.[] | .sha[0:7] + "  " + .commit.message'
```

Ou, dans le dossier local : `données/2026-10-10/`, etc.

## 2. Vérifier la copie (sans rien écrire)

```sh
node scripts/sauvegarde/restore-from-github.mjs --depot <user>/medrevise-backups --ref <commit> --verifier-seulement
node scripts/sauvegarde/restore-from-github.mjs --dossier "<dossier>/données/2026-10-10" --verifier-seulement
```

Résultat attendu :
- « empreintes SHA-256 : N/N conformes au manifeste » ;
- « copie complète et intègre ».

## 3. Reconstruire une IndexedDB

La reconstruction se fait dans un profil Chrome **vide**. Le script refuse un profil qui contient
déjà MedRevise, sauf avec `--force`.

```sh
P="$HOME/chrome-medrevise-restaure"; mkdir -p "$P"
node scripts/sauvegarde/restore-from-github.mjs --depot <user>/medrevise-backups --ref <commit> --profil "$P"
# (ou --dossier "<dossier>/données/2026-10-10")
```

Le script :
1. télécharge les fichiers de la révision ;
2. contrôle leur SHA-256 ;
3. recrée chaque store `medrevise-<store>` (clé = id), plus le journal `medrevise-review_log` ;
4. relit tout et compare, store par store, **le nombre d'enregistrements et l'empreinte**.

Code de sortie 0 seulement si tout est identique. Le Chrome utilisé est isolé : réseau coupé, page
vide, l'app ne tourne jamais pendant la restauration.

Ouvrir ensuite l'app dans ce profil :

```sh
open -na "Google Chrome" --args --user-data-dir="$P" https://my-org-blue.vercel.app
```

**Attention** : la synchro suit la règle « le plus récent gagne ».
- Ouverte en ligne, cette base est réconciliée avec le cloud : les enregistrements plus récents du
  cloud l'emportent.
- Pour revenir réellement à l'état de la copie partout, restaurer aussi le cloud (§4).

Pour le Mac (Aside), la copie brute du dossier IndexedDB reste la voie la plus fidèle :
`scripts/sauvegarde-fsrs/restore.md` §2a.

## 4. Supabase (procédure documentée, NON exécutée par les scripts du filet)

Le filet ne fait que **lire** Supabase. Pour remettre le cloud dans l'état d'une copie :

1. **Fermer l'app sur tous les appareils.**
2. **Sauvegarde serveur**, dans Supabase → SQL Editor :
   ```sql
   create table public.medrevise_records_avant_restauration as select * from public.medrevise_records;
   ```
3. **Convertir la copie** au format de `restore-supabase.mjs` (`supabase/medrevise_records.json` + `index.json`) :
   ```sh
   node -e '
   const fs=require("fs"),c=require("crypto");const D=process.argv[1],O=process.argv[2];
   const L=fs.readdirSync(D+"/data").filter(f=>/^records(-\d{3})?\.jsonl$/.test(f)).sort().flatMap(f=>fs.readFileSync(D+"/data/"+f,"utf8").split("\n").filter(Boolean).map(JSON.parse));
   const lignes=L.map(l=>({store:l.store,record_id:l.id,data:l.data||{},updated_at:l.updated_at,deleted:l.deleted}));
   fs.mkdirSync(O+"/supabase",{recursive:true});const s=JSON.stringify({table:"medrevise_records",lignes});
   fs.writeFileSync(O+"/supabase/medrevise_records.json",s);
   fs.writeFileSync(O+"/supabase/index.json",JSON.stringify({table:{lignes:lignes.length,sha256:c.createHash("sha256").update(s).digest("hex")},bucket:{fichiers:[]}}));' "<dossier de la copie>" /tmp/copie-cloud
   node scripts/sauvegarde-fsrs/restore-supabase.mjs /tmp/copie-cloud            # simulation, aucune requête
   ```
   (Pour une copie GitHub : `git clone` du dépôt privé, `git checkout <commit>`, puis le dossier du clone.)
4. **Restauration réelle** (clé `service_role` dans le terminal seulement) :
   ```sh
   read -s SUPABASE_SERVICE_ROLE_KEY; export SUPABASE_SERVICE_ROLE_KEY
   node scripts/sauvegarde-fsrs/restore-supabase.mjs /tmp/copie-cloud --executer --sans-bucket
   unset SUPABASE_SERVICE_ROLE_KEY
   ```
5. **Sur chaque appareil**, avant de rouvrir l'app : supprimer les données du site, ou restaurer son
   IndexedDB (§3).

Le journal des révisions (`medrevise_review_log`, ajout seul) se recharge de la même façon :
```sql
insert into medrevise_review_log (...) on conflict (id) do nothing
```
Les lignes viennent de `data/review_log.jsonl`.

## 5. Preuve du test (10/10/2026)

La restauration a été faite depuis le commit `3d879cf` du dépôt de **test** `yoann735/medrevise-backups-test`,
vers un profil Chrome vide. Résultat : **19 stores, comptes et empreintes identiques**, dont
1 583/1 583 questions. Sortie complète : `docs/img/filet-securite/restauration-test.txt`.

Le test automatique `tests/filet/filet.test.js` (« restauration depuis une copie de test ») rejoue la
même chaîne à chaque `npm test`.
