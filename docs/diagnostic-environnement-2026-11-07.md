# Diagnostic de l'environnement de travail (07/11/2026)

**Fait en lecture seule.** Aucun fichier de l'app n'a été modifié. Rien n'a été écrit dans Supabase, aucune
migration n'a été appliquée, aucun réglage ni variable Vercel n'a été touché, aucun déploiement n'a été lancé.
L'app n'a été ouverte ni en local ni en production. Aucune valeur secrète n'a été lue ni affichée : seuls des
noms de variables et des codes de réponse ont été regardés.

## Résumé

| Point | État |
|---|---|
| Dossier local, remote, branche | OK |
| Synchro avec GitHub | OK (déjà à jour, aucune branche de sécurité nécessaire) |
| Authentification `gh` | OK |
| Node, dépendances, build | OK (avertissements notés ci-dessous) |
| Lien local Vercel (`.vercel/`) | **Bloqué** : CLI Vercel non installée |
| Dernier déploiement de production | OK (Ready, dernier commit de `main`) |
| Variables d'env de production | OK par déduction (la liste des noms n'a pas pu être lue, voir § 3) |
| Cron `/api/backup-daily` | OK (déclaré, et il a tourné cette nuit) |
| Projet Supabase visé | OK (`deaonugwvbapkdixdowk`) |
| Comptage Supabase avec des identifiants locaux | **Non fait** : pas de `.env` local (rien créé) ; chiffres pris dans la sauvegarde de cette nuit |
| Migrations | 9 sur 10 visiblement appliquées, 1 indéterminée |
| Sauvegarde GitHub | OK (13,4 h) |
| Tag `pre-fsrs-2026-10-10` et branche `backup/pre-fsrs` | OK |

Rien n'a été réparé : aucun point ne le demandait, à part le lien Vercel, qui ne peut pas être refait sans la CLI.

## 1. Dossier local et GitHub

- Dossier : `~/Documents/Dév & projets/Claude/Projets/My Org/My-Org`.
- `origin` → `https://github.com/yoann735/My-Org.git`, branche `main`.
- `git status` propre, `main` = `origin/main` (0 commit d'avance, 0 de retard) après `git fetch`.
  Aucune modification non commitée ni commit non poussé, donc **pas de branche `sauvegarde/avant-reconfig-2026-11-07`**.
- `git pull --ff-only origin main` : « Already up to date ».
- `gh` : connecté au compte `yoann735` (trousseau), lecture du dépôt OK.
- À savoir : le dépôt `yoann735/My-Org` est **public** (le dépôt de sauvegarde, lui, est privé).

## 2. Installation et build

- Node v24.18.0, npm 11.16.0.
- `npm ci` : OK, versions du lockfile. Avertissements :
  - `allow-scripts` : scripts d'installation non approuvés pour `esbuild`, `fsevents`, `tesseract.js` (le build passe quand même) ;
  - `npm audit` : 48 vulnérabilités signalées (2 faibles, 36 modérées, 8 hautes, 2 critiques), dont une XSS de `prosemirror-view` au collage. Non corrigé.
- `npm run build` (un seul build Vite pour le hub, MealWeek et MedRevise) : **OK**, 717 modules, 0 erreur. Avertissements :
  - imports à la fois dynamiques et statiques (pas de découpage) : `src/medrevise/ocr/couches.js`, `pdf-lib`, `src/medrevise/transcription/synchro.js` ;
  - morceaux de plus de 500 kB (`index-*.js` ≈ 3,97 MB, `openchemlib` ≈ 1,1 MB).

## 3. Vercel

- **CLI `vercel` non installée**, donc pas de dossier `.vercel/` : le lien local vers le projet `my-org` n'a pas pu être refait.
- Le connecteur Vercel voit bien le projet `my-org` (`prj_hKmlYmNrbIFZHldxfGwPviOjP19B`), mais il est refusé
  (403/404) pour la lecture des déploiements, des réglages et des variables d'env.
- **Dernier déploiement de production** (lu via GitHub, où Vercel publie le statut) : commit `9fc0fe2` (dernier
  commit de `main`), statut Vercel « success » le 02/11/2026 à 11:34 UTC (Ready). `https://my-org-blue.vercel.app/` répond 200.
- **Cron** : `vercel.json` déclare toujours `/api/backup-daily` (`30 1 * * *` et `30 2 * * *`). Sans le secret, l'appel répond 401, comme prévu.
- **Variables d'env de production**, présence déduite du comportement des endpoints (les noms n'ont pas pu être listés) :

| Variable | Présente ? | Preuve |
|---|---|---|
| `VITE_SUPABASE_URL` | oui | URL du projet Supabase compilée dans le bundle de prod ; `/api/backup-status` lit Supabase |
| `VITE_SUPABASE_ANON_KEY` | oui | la copie de cette nuit a lu Supabase (sinon code `supabase_absent`) |
| `GITHUB_BACKUP_TOKEN` | oui | `/api/backup-status` → `configure: true` |
| `GITHUB_BACKUP_REPO` | oui | idem |
| `CRON_SECRET` | oui | la copie automatique de cette nuit (02:05 UTC) a été faite ; sans secret, la route refuse tout |
| `DEEPGRAM_API_KEY` | oui | `/api/deepgram-credits` → `ok: true` (sinon `missing_key`) |
| `HELHA_ICAL_URL` | oui | `/api/timetable` → 200 `ok: true` (sinon 503 `not_configured`) |
| `ANTHROPIC_API_KEY` | non vérifiée | optionnelle (`/api/news`, il y a un repli local sans elle) |

## 4. Supabase (lecture seule)

- Projet visé par la prod : `https://deaonugwvbapkdixdowk.supabase.co`, le même que dans la documentation du dépôt.
- **Aucun identifiant local** (pas de `.env`, seulement `.env.example`) : rien n'a été créé et la base n'a pas été interrogée directement.
- Chiffres pris dans la sauvegarde de cette nuit (`manifest.json` du 07/11, export complet des deux tables) :
  - `medrevise_records` : **4 693** enregistrements, dont 1 742 questions (1 053 flashcards, 395 exercices, 220 QCM, 74 Feynman) ;
  - `medrevise_review_log` : **1 050** lignes (le `review_log.jsonl` de la sauvegarde compte bien 1 050 lignes) ;
  - bucket : 514 fichiers, environ 558 MB.
- Migrations de `supabase/migrations/`, aucune appliquée par moi :

| Migration | Appliquée ? | Indice |
|---|---|---|
| `20261005_ocr_layer.sql` | oui | 43 enregistrements `ocr_layer` |
| `20261005_transcript_session.sql` | oui | 55 `transcript_session` |
| `20261006_apprentissage_flashcards.sql` | oui | 1 `apprentissage` |
| `20261007_reading_position_notes_doc.sql` | oui | 60 `reading_position`, 22 `notes_doc` |
| `20261011_learning_set.sql` | oui | 1 `learning_set` |
| `20261011_medrevise_review_log.sql` | oui | table présente, 1 050 lignes |
| `20261015_companion_pdf.sql` | oui | 9 `companion_pdf` |
| `20261022_board.sql` | oui | 5 `board` |
| `20261024_review_log_evenements.sql` | **indéterminé** | aucune ligne avec `rating` vide (soit pas appliquée, soit aucun événement sans note enregistré). À vérifier dans le SQL Editor : `select is_nullable from information_schema.columns where table_name='medrevise_review_log' and column_name='rating';` |
| `20261025_page_tag.sql` | oui | 11 `page_tag` |

## 5. Filet de sécurité

- `POST /api/backup-status` (prod) : `ok: true`, dernière copie **07/11/2026 à 02:05:52 UTC** (commit `419a6bf`), âge 13,4 h.
- Dépôt privé `yoann735/medrevise-backups` : un commit par jour (05/11, 06/11, 07/11). Le dernier contient
  `data/records.jsonl` (12,9 MB), `data/review_log.jsonl` (0,94 MB), `data/files-index.json` (index des fichiers) et `manifest.json`. Il a moins de 48 h.
- Tag `pre-fsrs-2026-10-10` (→ `7b6c351`) et branche `backup/pre-fsrs` (→ `7b6c351`) présents sur `origin` et en local.

## 6. Contexte pour la suite

`CLAUDE.md` et `progression.md` ont été lus. Dernière passation (02/11) : surlignage aligné terminé et poussé. On attend
ton retour sur iPad réel et sur l'écran Intégrité. `npm test` était à 244/246 (2 échecs déjà présents avant). Un processus
« sync auto » commite parfois tout seul.

10 comptes rendus, diagnostics et audits les plus récents (date du dernier commit) :

| Date | Fichier | Résumé |
|---|---|---|
| 02/11 | `docs/compte-rendu-surlignage-alignement.md` | Surlignage décalé du PdfReader (« rps virt ») corrigé : couche de texte alignée au caractère |
| 31/10 | `docs/diagnostic-elements-manquants.md` | Cartes signalées manquantes par le contrôle d'intégrité : suppressions manuelles, en lecture seule |
| 31/10 | `docs/compte-rendu-synchro-rapide-surlignage-listes.md` | Synchro plus rapide, surlignage précis, listes dans les boîtes |
| 31/10 | `docs/compte-rendu-flashcards.md` | Types de flashcards (dont la carte Muscle) et leurs évolutions |
| 31/10 | `docs/compte-rendu-filet-securite.md` | Les trois mécanismes de sauvegarde (copie GitHub quotidienne, dossier local, etc.) |
| 29/10 | `docs/compte-rendu-transcription-marque-cours.md` | « Transcrire le cours » marque le début et la fin du cours sur les pages |
| 29/10 | `docs/compte-rendu-statut-synchro.md` | Statut de synchro juste (faux « en attente d'envoi ») et case à cocher unique |
| 29/10 | `docs/compte-rendu-plusieurs-fiches.md` | Plusieurs fiches de résumé par cours au lieu d'une seule |
| 29/10 | `docs/compte-rendu-diapo-origine.md` | Bouton « Diapo p. N » sur chaque page de fiche |
| 28/10 | `docs/diagnostic-retard-26.md` | « 26 cartes en retard » puis 1 : cause trouvée, en lecture seule |

15 derniers commits de `main` :

```
9fc0fe2 2026-11-02 docs(medrevise): compte rendu du surlignage aligné (cause, captures avant/après, 16 cas, non-régression), passation
f142bdf 2026-11-02 fix(medrevise): l'export (PDF annoté, PNG, IA) dessine les surlignages sur leurs caractères, même ceux posés avant l'alignement
e42bdf4 2026-11-02 test(medrevise): banc des 16 cas du surlignage aligné et relecture des surlignages existants ; ponctuation prise à mi-largeur
cf5acd6 2026-11-02 fix(medrevise): couche de texte du PDF alignée au caractère, surlignage exact même après un geste de zoom
34c9531 2026-11-02 sync auto
0416252 2026-10-31 feat(medrevise): écran Intégrité, chaque carte disparue montre son recto, son cours et sa date de suppression
6d02511 2026-10-31 feat(medrevise): écran Intégrité, « C'est moi qui les ai supprimées » efface l'alerte des cartes disparues
d86089b 2026-10-31 docs(medrevise): diagnostic des cartes manquantes, correction de l'alerte d'intégrité, passation
f4fd00e 2026-10-31 test(medrevise): banc des suppressions volontaires (un appareil, deux appareils sur le faux Supabase)
7fe5945 2026-10-31 fix(medrevise): le contrôle d'intégrité ne signale plus les suppressions faites depuis l'interface
005d293 2026-10-31 sync auto
b25023b 2026-10-31 sync auto
6d32970 2026-10-31 docs(medrevise): compte rendu de l'espace entre deux lignes d'un surlignage, passation
5c9b1c1 2026-10-31 fix(medrevise): surlignage à cheval sur deux lignes, l'espace entre les lignes est gardé
519bf7a 2026-10-31 docs(medrevise): compte rendu Tableau, masque choisi (captures éditeur et révision), passation
```

## Ce qui reste à faire de ton côté

1. Lien Vercel local : `npm i -g vercel`, puis `vercel login`, puis dans le dossier : `vercel link --yes --project my-org`
   (ensuite `vercel env ls production` donne la liste exacte des noms de variables).
2. Migration `20261024_review_log_evenements.sql` : vérifier dans le SQL Editor avec la requête du § 4 (`is_nullable = YES` → appliquée).
3. Optionnel : un `.env` local n'est utile que si tu veux une synchro réelle en dev. Les bancs utilisent le faux Supabase.
