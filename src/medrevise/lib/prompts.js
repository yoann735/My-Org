/* ============================================================
   MedRevise — prompts Claude (handoff §6).
   Règle absolue : ne jamais générer une réponse absente de la fiche.
   Sortie JSON strict (sauf évaluations Feynman = texte).
   ============================================================ */

/** 6.1a — génération QCM (un appel dédié) — {course_text} et {N} substitués.
 * `min`/`n` bornent le nombre de questions ; réduits automatiquement quand le
 * cours est découpé en plusieurs appels (cours long → risque de timeout serverless). */
export function promptQcm(courseText, n = 15, min = 10) {
  return `Tu es un expert en pédagogie scientifique et médicale. Tu vas créer un QCM de révision
exhaustif à partir du texte de cours ci-dessous. Ce texte peut être le cours complet ou un extrait
d'un cours plus long — dans les deux cas, ne t'appuie que sur ce texte : ne fais jamais référence à
un contenu que tu ne vois pas, même si tu devines qu'il existe ailleurs dans le cours.

ÉTAPE 1 — CARTOGRAPHIE (interne, ne génère pas encore de questions)
Lis le cours en entier. Dresse une liste interne et exhaustive de TOUTES les notions
testables :
- Définitions et concepts clés
- Mécanismes (cause → effet, étape par étape)
- Données chiffrées, valeurs de référence, pourcentages
- Comparaisons et distinctions importantes entre deux notions
- Cascades moléculaires ou physiologiques (chaque maillon)
- Exemples concrets et leurs conclusions
- Applications pratiques et implications cliniques

IGNORE : titres de section, en-têtes, listes de mots-clés sans explication, fragments
de phrase coupés par la mise en page. Une notion n'est testable que si elle a un sens
complet et autonome, compréhensible sans regarder le cours.

ÉTAPE 2 — GÉNÉRATION
Génère entre ${min} et ${n} questions selon la densité du texte. Chaque notion identifiée à
l'étape 1 doit être couverte par au moins une question. Ne baisse jamais la qualité pour
atteindre un quota : génère moins de questions plutôt que d'inclure une question floue,
tronquée, ou recopiant un titre.

RÈGLES ABSOLUES :
- 4 propositions par question (A à D), une seule correcte.
- Les mauvaises réponses doivent être plausibles — jamais absurdes, jamais des bouts de
  phrase non reformulés.
- Aucune question ambiguë, tronquée, ou basée sur un titre de section.
- Aucune information hors du cours fourni.
- Répartis les questions sur ces types : DÉFINITION, MÉCANISME, APPLICATION,
  COMPARAISON, DONNÉES, CAUSE_EFFET.
- Varie la difficulté : ~30% facile, ~50% intermédiaire, ~20% difficile.
- Réponds UNIQUEMENT en JSON valide. Aucun texte, aucune balise Markdown avant/après.

FORMAT DE SORTIE (JSON strict) :
{
  "questions": [
    {
      "type": "qcm",
      "concept": "<nom court de la notion testée>",
      "categorie_question": "definition" | "mecanisme" | "application" | "comparaison" | "donnees" | "cause_effet",
      "difficulte": "facile" | "intermediaire" | "difficile",
      "question": "<énoncé complet et autonome>",
      "choix": ["<A>", "<B>", "<C>", "<D>"],
      "bonneReponse": <index 0 à 3>,
      "explication": "<pourquoi c'est correct + pourquoi le distracteur le plus proche est faux, 2-3 phrases>"
    }
  ]
}

COURS :
${courseText}`;
}

/** 6.1b — génération FLASHCARDS (un appel dédié). `min`/`n` réduits automatiquement
 * quand le cours est découpé en plusieurs appels (cours long → risque de timeout serverless). */
export function promptFlashcards(courseText, n = 15, min = 10) {
  return `Tu es un expert en mémorisation à long terme (méthode de répétition espacée). Tu vas
créer un jeu de flashcards exhaustif à partir du texte de cours ci-dessous. Ce texte peut être le
cours complet ou un extrait d'un cours plus long — dans les deux cas, ne t'appuie que sur ce texte.

ÉTAPE 1 — EXTRACTION EXHAUSTIVE (interne)
Lis le cours en entier. Identifie TOUTES les informations mémorisables :
- Définitions précises (terme → sens exact)
- Relations causales (X provoque Y parce que Z)
- Mécanismes étape par étape
- Valeurs numériques, seuils, durées
- Classifications et catégories (avec leurs caractéristiques)
- Comparaisons binaires (A vs B : en quoi ils diffèrent)
- Cascades (signal → intermédiaire → effet final)
- Exemples canoniques et ce qu'ils illustrent

IGNORE les titres de section et fragments non autonomes — une flashcard doit avoir un
sens complet, lisible isolément du cours.

ÉTAPE 2 — CRÉATION
Transforme chaque information en flashcard, entre ${min} et ${n} selon la densité du texte.

RÈGLE D'ATOMICITÉ : une seule idée par carte. Si une information contient 2 faits
distincts → 2 cartes séparées.

RÈGLE DU RECTO ACTIF : le recto doit être une vraie question, jamais une phrase à trou.
  BON : "Quel est le rôle de PGC-1α dans l'adaptation à l'endurance ?"
  MAUVAIS : "PGC-1α est responsable de..."

RÈGLE DU VERSO COMPLET : le verso contient la réponse + le contexte minimal pour être
compréhensible sans relire le cours. Maximum 30 mots.

TYPES À COUVRIR : définitions du glossaire, mécanismes (une carte par étape si la
cascade est longue), comparaisons A vs B, valeurs chiffrées, exemples d'application.

Réponds UNIQUEMENT en JSON valide. Aucun texte, aucune balise Markdown avant/après.

FORMAT DE SORTIE (JSON strict) :
{
  "questions": [
    {
      "type": "flashcard",
      "concept": "<nom court de la notion>",
      "categorie_carte": "definition" | "mecanisme" | "comparaison" | "donnees" | "application",
      "recto": "<question active>",
      "verso": "<réponse + contexte minimal, <=30 mots>"
    }
  ]
}

COURS :
${courseText}`;
}

/** 6.1c — génération FEYNMAN (un appel dédié) — l'objet sert de RÉFÉRENCE d'évaluation.
 * `minConcepts`/`maxConcepts` réduits automatiquement quand le cours est découpé en
 * plusieurs appels (cours long → risque de timeout serverless). */
export function promptFeynman(courseText, minConcepts = 3, maxConcepts = 5) {
  return `Tu es un pédagogue expert qui maîtrise la technique Feynman. À partir du texte de cours
ci-dessous (le cours complet ou un extrait d'un cours plus long — dans les deux cas, ne t'appuie
que sur ce texte), tu vas préparer des explications qui forcent la vraie compréhension — pas
la mémorisation superficielle.

PRINCIPE : expliquer un concept comme à quelqu'un d'intelligent mais sans connaissance
préalable. Là où l'explication devient floue ou nécessite du jargon non défini → c'est
une zone de compréhension réelle à travailler.

ÉTAPE 1 — ANALYSE (interne)
Identifie entre ${minConcepts} et ${maxConcepts} concepts fondamentaux de ce texte (ceux sans
lesquels le reste ne tient pas), leurs liens logiques, et les points contre-intuitifs ou erreurs
fréquentes.

ÉTAPE 2 — GÉNÉRATION
Pour chaque concept fondamental, prépare le contenu Feynman correspondant.
Note : la zone de SAISIE de l'étudiant n'est pas générée ici (il écrira sa propre
explication dans l'app). Tu fournis uniquement la matière de référence et d'évaluation
qui servira ensuite à juger sa réponse.

Réponds UNIQUEMENT en JSON valide. Aucun texte, aucune balise Markdown avant/après.

FORMAT DE SORTIE (JSON strict) :
{
  "questions": [
    {
      "type": "feynman",
      "concept": "<nom du concept fondamental>",
      "explication_simple": "<100-200 mots, sans jargon non défini, analogie si possible — sert de référence pour évaluer l'étudiant>",
      "lien_avec_le_cours": "<2-3 phrases : pourquoi ce concept est clé, ce qu'on ne comprendrait pas sans lui>",
      "pieges_frequents": ["<erreur fréquente formulée \\"on croit que X, mais en réalité Y parce que Z\\">"],
      "question_verification": "<question ouverte, non récitable, qui nécessite une vraie compréhension>"
    }
  ],
  "synthese": "<100-150 mots : comment les concepts s'enchaînent, exemple fil conducteur>"
}

COURS :
${courseText}`;
}

/** 6.2 — génération ANATOMIE : QCM de raisonnement depuis le TEXTE des structures (jamais l'image) */
export function promptAnatomie(structuresTexte) {
  return `Tu es professeur d'anatomie. À partir des données TEXTE de structures anatomiques
ci-dessous, génère des QCM de RAISONNEMENT (origine, insertion, action, innervation,
vascularisation, rapports). N'invente rien hors des données fournies.
Réponds UNIQUEMENT en JSON :
{ "questions":[
  {"type":"qcm","concept":"<nom structure>","question":"...","choix":["","","",""],"bonneReponse":0,"explication":"..."}
] }

Structures :
<<< ${structuresTexte} >>>`;
}

/** 6.3 — évaluation Feynman Intuition (texte) */
export function promptFeynmanIntuition(concept, extraitFiche, texteEtudiant) {
  return `Tu es un élève de 12 ans curieux ET un professeur bienveillant.
L'étudiant explique : "${concept}".
Référence : <<< ${extraitFiche} >>>
Son explication : <<< ${texteEtudiant} >>>
1. Ce qu'il a bien expliqué. 2. Zones floues/manquantes. 3. 1-2 questions naïves d'enfant.
4. Note /10 + encouragement. Évalue la CLARTÉ et le SENS, pas la terminologie.
Réponds en texte simple.`;
}

/** 6.4 — évaluation Feynman Expert (texte) */
export function promptFeynmanExpert(concept, extraitFiche, texteEtudiant) {
  return `Tu es un membre de jury de concours de médecine, exigeant mais juste.
L'étudiant explique : "${concept}" comme à un oral.
Référence : <<< ${extraitFiche} >>>
Son explication : <<< ${texteEtudiant} >>>
1. Vérifie les TERMES TECHNIQUES EXACTS (signale chaque approximation).
2. Vérifie valeurs chiffrées et mécanismes précis. 3. Signale toute imprécision.
4. Note de rigueur /10 + 2-3 corrections prioritaires. Sois exigeant sur la PRÉCISION.
Réponds en texte simple.`;
}

/** 6.5 — QCM supplémentaires sur un concept souvent raté */
export function promptQcmSupplementaires(concept, extrait) {
  return `Professeur de médecine. L'étudiant rate souvent "${concept}". Génère 5 NOUVEAUX QCM plus
difficiles, sous des angles différents, à partir de : <<< ${extrait} >>>
Réponds UNIQUEMENT en JSON : { "questions":[ {"type":"qcm","concept":"${concept}","question":"...","choix":["","","",""],"bonneReponse":0,"explication":"..."} ] }`;
}
