# Migration FSRS — répétition à blanc (2026-10-10)

Exécutée le 2026-10-10 17:39 UTC par `scripts/fsrs/migration-a-blanc.mjs`, sur une **copie en mémoire**
de la sauvegarde `pre-fsrs-2026-10-10` (../backups/pre-fsrs-2026-10-10). Aucune vraie donnée n'a été migrée : ni IndexedDB, ni Supabase.
Les fichiers de la sauvegarde ont les mêmes empreintes SHA-256 avant et après (35 fichiers) : **oui**.

## Verdict : **RAPPORT PARFAIT**

| Contrôle | Attendu | Obtenu |
|---|---|---|
| Flashcards avant = après | 894 | 894 |
| Cartes dont `dueDate` change (migration) | 0 | **0** |
| Cartes dont l'échéance FSRS ≠ `dueDate` | 0 | **0** |
| Cartes dont le contenu change (tout sauf `fsrs`/`updatedAt`, SHA-256 par carte) | 0 | **0** |
| Contenu riche intact (Muscle, molécules, images, masques : 41 cartes) | oui | **oui** |
| Autres questions (QCM, exercices, Feynman : 689) identiques | oui | **oui** |
| Charge par jour sur 30 jours avant = après | oui | **oui** |
| Bascule ON juste après : dates modifiées | 0 | **0** (étalement : 0) |

Empreinte globale du contenu des flashcards (hors `fsrs`) : avant `d7ef0271efdf95f4…`, après `d7ef0271efdf95f4…`.

## 1. Installation de l'étape 2 : conversion des cartes en apprentissage

| En apprentissage | Converties | Séance du jour → 2026-10-10 | Date future gardée | Demain | Hors planning | En rattrapage après |
| --- | --- | --- | --- | --- | --- | --- |
| 297 | 297 | 77 | 0 | 220 | 220 | 0 |

Les 220 cartes « demain » sont toutes hors planning (cours Rattrapage aux rappels J coupés, fiches archivées) : elles n'apparaissent nulle part tant qu'on ne les replanifie pas.

## 2. Migration FSRS (bloc `fsrs` initialisé, `dueDate` inchangée)

| Source de l’état | Cartes |
| --- | --- |
| Historique rejoué (notes J, répétitions du même jour fusionnées, difficulté de départ 7) | 582 |
| Estimation (vue mais jamais notée : stabilité ≈ intervalle, difficulté 7) | 26 |
| Nouvelle (jamais vue : paramètres FSRS par défaut à la 1re réponse) | 286 |
| État ombre conservé | 0 |
| **Total** | 894 |

Cartes en révision après migration : stabilité médiane 18.8 j (min 0.2, max 353.9), difficulté médiane 5.98.

## 3. Charge par jour sur 30 jours (flashcards planifiées)

| Jour | Avant migration | Après migration |
| --- | --- | --- |
| en retard | 0 | 0 |
| 2026-10-10 | 116 | 116 |
| 2026-10-11 | 28 | 28 |
| 2026-10-12 | 50 | 50 |
| 2026-10-13 | 0 | 0 |
| 2026-10-14 | 0 | 0 |
| 2026-10-15 | 6 | 6 |
| 2026-10-16 | 0 | 0 |
| 2026-10-17 | 0 | 0 |
| 2026-10-18 | 3 | 3 |
| 2026-10-19 | 0 | 0 |
| 2026-10-20 | 0 | 0 |
| 2026-10-21 | 0 | 0 |
| 2026-10-22 | 0 | 0 |
| 2026-10-23 | 0 | 0 |
| 2026-10-24 | 0 | 0 |
| 2026-10-25 | 0 | 0 |
| 2026-10-26 | 0 | 0 |
| 2026-10-27 | 0 | 0 |
| 2026-10-28 | 4 | 4 |
| 2026-10-29 | 0 | 0 |
| 2026-10-30 | 0 | 0 |
| 2026-10-31 | 0 | 0 |
| 2026-11-01 | 0 | 0 |
| 2026-11-02 | 0 | 0 |
| 2026-11-03 | 0 | 0 |
| 2026-11-04 | 0 | 0 |
| 2026-11-05 | 0 | 0 |
| 2026-11-06 | 0 | 0 |
| 2026-11-07 | 0 | 0 |
| 2026-11-08 | 0 | 0 |
| au-delà de 30 j | 0 | 0 |
| sans date | 0 | 0 |

## 4. Pour information : prochaine échéance si « Correct » le jour prévu (FSRS ON, sans fuzz, plafond 45 j)

Rien de ceci n'est appliqué par la migration : c'est ce qui se passerait à la **prochaine** réponse.

| Intervalle maison actuel | Cartes | À revoir (médiane) | Difficile (médiane) | Correct (médiane) |
| --- | --- | --- | --- | --- |
| 1 j | 26 | 1 j | 3 j | 4 j |
| 3 j | 24 | 1 j | 6 j | 8 j |
| 5 j | 78 | 1 j | 14 j | 19 j |
| 8 j | 6 | 2 j | 28 j | 35 j |
| 10 j | 3 | 1 j | 18 j | 23 j |
| 20 j | 4 | 2 j | 38 j | 45 j |
