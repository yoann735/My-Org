<!-- PASSATION:DEBUT -->
# 🔁 Passation – My Org (MedRevise)
_Mise à jour le 2026-11-07 16:35_

## 🎯 Objectif
SPA Vite + React (hub + MealWeek + MedRevise), déployée sur Vercel (projet `my-org`) au push sur `main`.
Session du 07/11 : /goal « vérifier et remettre en état l'environnement de travail ». Terminé, en lecture seule, aucun code modifié.

## ✅ Fait (vérifié, poussé)
- Rapport `docs/diagnostic-environnement-2026-11-07.md` (commit c429098, poussé sur `main`).
- Local = `origin/main`, `gh` connecté (yoann735), Node 24.18 / npm 11.16, `npm ci` + `npm run build` OK (0 erreur ; avertissements : chunks > 500 kB, imports mixtes, 48 vulnérabilités npm audit non traitées).
- Prod : le déploiement de 9fc0fe2 est Ready (vu via le statut GitHub), `https://my-org-blue.vercel.app` répond 200, le cron `/api/backup-daily` est déclaré dans `vercel.json` et a tourné cette nuit.
- Variables de prod présentes par déduction (endpoints) : Supabase, GITHUB_BACKUP_*, CRON_SECRET, DEEPGRAM_API_KEY, HELHA_ICAL_URL. ANTHROPIC_API_KEY non vérifiée.
- Supabase `deaonugwvbapkdixdowk` : 4 693 enregistrements et 1 050 lignes de review_log (chiffres de la sauvegarde, pas de `.env` local).
- Sauvegarde du 07/11 à 02:05 UTC dans `yoann735/medrevise-backups` (records, review_log, files-index, manifest). Tag `pre-fsrs-2026-10-10` et branche `backup/pre-fsrs` présents.

## 🚧 En cours
- Rien. Antérieur, toujours non vérifié : surlignage sur iPad RÉEL, écran Intégrité (retour utilisateur attendu).

## ➡️ Prochaines étapes (dans l'ordre)
1. Attendre le feu vert ou la nouvelle demande de l'utilisateur (environnement prêt pour coder).
2. Côté utilisateur : installer la CLI Vercel et lier le dossier : `npm i -g vercel`, `vercel login`, puis `vercel link --yes --project my-org`.
3. Côté utilisateur : vérifier si la migration `supabase/migrations/20261024_review_log_evenements.sql` est appliquée : `select is_nullable from information_schema.columns where table_name='medrevise_review_log' and column_name='rating';` (YES = appliquée). Les 9 autres semblent appliquées.
4. Retours iPad réel (surlignage, Intégrité) et test sur un vrai cours.

## 🧭 Décisions prises (ne pas rediscuter)
- Aucune écriture Supabase, aucun réglage Vercel ni déploiement manuel sans demande explicite.
- Pas de `.env` local créé : les bancs utilisent le faux Supabase.
- Surlignage : bornes à 20 % (lettre) / 50 % (ponctuation) ; fusion des surlignages contigus voulue ; registre des suppressions sur 120 jours.

## 🛠️ Commandes utiles
- Build : `npm run build` · Tests : `npm test` (244/246 au 02/11, 2 échecs déjà présents avant).
- Statut sauvegarde (lecture) : `curl -s -X POST -H "Origin: https://my-org-blue.vercel.app" -H 'Content-Type: application/json' -d '{}' https://my-org-blue.vercel.app/api/backup-status`
- Bancs (`.claude/launch.json`) : `medrevise-banc` (:5302), `faux-supabase` (:54399), `medrevise-faux-cloud` (:5300).

## ⚠️ Pièges et préférences
- Ne jamais toucher MealWeek ni `src/shared/` ; jamais le vrai cloud dans les bancs ; ne pas ouvrir l'app réelle (synchro) ; données réelles en lecture seule.
- Ne jamais afficher de secret (clés, tokens, URL iCal).
- Le connecteur Vercel MCP renvoie 403/404 sur ce projet : lire les déploiements via `gh api repos/yoann735/My-Org/deployments`.
- Dépôt `My-Org` PUBLIC. Un processus « sync auto » commite parfois tout seul.
- Français ; commits conventionnels et push autonomes ; jamais de force push.
<!-- PASSATION:FIN -->

## Historique des clôtures
- 2026-11-07 16:35 – /goal environnement : tout vérifié (build, prod Ready, sauvegarde 07/11), rapport poussé ; restent CLI Vercel et migration 20261024 à vérifier.
- 2026-11-02 11:11 – Cartes manquantes : suppressions volontaires, bouton « C'est moi… », cartes disparues reconnaissables (recto, cours) ; poussé, attente retour utilisateur.
- 2026-10-31 20:55 – /goal : diagnostic des 12 flashcards manquantes (suppressions manuelles confirmées), alerte d'intégrité corrigée pour les suppressions volontaires, testée et poussée.
- 2026-10-31 20:09 – Tableau masque choisi + espace deux lignes livrés, poussés ; attente test utilisateur sur vrai cours.
- 2026-10-31 15:15 – Synchro rapide, surlignage exact, listes dans les boîtes livrés et poussés ; question ouverte : espace sur surlignage deux lignes.
- 2026-10-31 (soir) – /goal Tableau : masque par case livré, testé (ordinateur, tablette, téléphone), poussé ; puis correctif « espace entre deux lignes » livré et poussé.
