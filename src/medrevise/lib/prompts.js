/* ============================================================
   MedRevise — prompts Claude (handoff §6).
   Règle absolue : ne jamais générer une réponse absente de la fiche.
   Sortie JSON strict (sauf évaluations Feynman = texte).
   ============================================================ */

/** 6.1 — génération standard (QCM + flashcards + Feynman) depuis une fiche texte */
export function promptStandard(contenu) {
  return `Tu es un professeur agrégé de médecine spécialisé dans la préparation au concours.
Génère un jeu complet de questions de révision à partir de CETTE fiche uniquement.

RÈGLES :
1. Aucune question dont la réponse n'est pas explicitement dans la fiche. Pas d'invention.
2. Une question = un concept clé (pas de détail trivial).
3. Couvre tous les concepts importants.
4. QCM : distracteurs crédibles et pièges, jamais absurdes.
5. Réponds UNIQUEMENT en JSON valide.

NOMBRE : 10-15 QCM ; 10-15 flashcards ; 2-3 Feynman.

FORMAT :
{ "titre":"...", "categorie":"...",
  "questions":[
    {"type":"qcm","concept":"...","question":"...","choix":["","","",""],"bonneReponse":0,"explication":"..."},
    {"type":"flashcard","concept":"...","recto":"...","verso":"<=30 mots"},
    {"type":"feynman","concept":"..."}
  ] }

Fiche :
<<< ${contenu} >>>`;
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
