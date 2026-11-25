# Banc « dates de transcript dans la Bibliothèque » (25/11/2026) — docs/compte-rendu-filtre-dates-transcript.md

Outils de test, jamais chargés par l'app. Données de test uniquement (section « Banc dates » : matière « Chimie » de
8 cours + « Physique »), origines locales vidées avant chaque série, jamais le vrai cloud. Chrome **headless et muet**.

- `t-biblio.mjs ordi|ipad` : bouton éteint = arbre identique au code d'avant (HTML + capture), dates, « +N », alignement,
  filtre par jour, ✕, recherche combinée, état par matière, nouveau transcript sans recharger, lecture seule, ouverture d'un cours.
- `t-telephone.mjs` : le shell téléphone (sans Bibliothèque) ne change pas.
- `t-synchro.mjs` : deux ordinateurs + faux Supabase — session reçue par la synchro → date affichée sans recharger ; suppression.
- `t-perf.mjs` : temps d'affichage de la barre latérale OFF / ON, avant / après, CPU ×1 et ×4 ; gestes ; calcul.
- `t-mealweek.mjs` : MealWeek identique (builds de production avant / après).

`./tout.sh` rejoue tout (`SANS_MEALWEEK=1` si les deux serveurs MealWeek ne tournent pas).
