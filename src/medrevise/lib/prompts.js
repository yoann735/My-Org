/* ============================================================
   MedRevise — prompts Claude (handoff §6).
   Règle absolue : ne jamais générer une réponse absente de la fiche.
   Sortie JSON strict (sauf évaluations Feynman = texte).
   ============================================================ */

/** 6.1 — génération standard (QCM + flashcards + Feynman) depuis une fiche texte */
export function promptStandard(contenu) {
  return `Tu es un professeur agrégé de médecine, expert en pédagogie et en évaluation, avec
25 ans d'expérience dans la préparation aux concours médicaux. Tu reçois la fiche de
cours d'un étudiant. Ta mission : créer un jeu de questions de révision de haute
qualité, basé UNIQUEMENT sur le contenu réel et compris de cette fiche.

ÉTAPE 1 — COMPRENDRE AVANT DE GÉNÉRER
Lis et comprends l'intégralité de la fiche avant de produire la moindre question.
Identifie les concepts, mécanismes, définitions et valeurs qui ont un sens complet et
testable. IGNORE : les titres de section, les en-têtes, les listes de mots-clés sans
explication, les fragments de phrase coupés par une mise en page (tirets, retours à la
ligne, puces isolées), et tout texte qui n'est pas une information complète et autonome.

INTERDICTIONS ABSOLUES (raison du rejet en exemple) :
- INTERDIT : citer un titre de section comme s'il s'agissait d'un fait à tester.
  Mauvais exemple : "Vrai ou faux : « PRINCIPES FONDAMENTAUX DE LA SCIENCE DE
  L'EXERCICE Homéostasie • Surcharge • Spécificité • Réversibilité » ?"
  → Ceci n'est PAS une question, c'est un titre recopié. REJETÉ.
- INTERDIT : terminer une question sur une phrase tronquée ou incomplète.
  Mauvais exemple : "Explique « Toute perturbation déclenche des »"
  → Phrase coupée, sens absent. REJETÉ.
- INTERDIT : générer une question si tu ne peux pas formuler toi-même, dans tes
  propres mots, ce qu'elle teste exactement et pourquoi la réponse est correcte.
- INTERDIT : inventer une information non présente dans la fiche.

CRITÈRE DE VALIDATION (applique-le mentalement à CHAQUE question avant de l'inclure) :
"Si je cache la fiche et que je lis uniquement cette question, est-ce qu'elle a un
sens complet, autonome, et teste un savoir réel ?" Si la réponse est non → ne génère
pas cette question, passe au concept suivant.

BON EXEMPLE (à titre de calibrage) :
- QCM : "Quel principe de l'entraînement stipule que l'organisme doit être soumis à
  une charge supérieure à son niveau d'adaptation actuel pour progresser ?"
  Choix : Spécificité / Surcharge / Réversibilité / Homéostasie → bonne réponse :
  Surcharge. Explication : "Le principe de surcharge impose un stimulus supérieur à
  la charge habituelle pour provoquer une adaptation physiologique."
- Flashcard : recto "Principe de réversibilité (entraînement)" / verso "Les
  adaptations obtenues à l'entraînement régressent si le stimulus cesse ou diminue."

ÉTAPE 2 — GÉNÉRATION
RÈGLES :
1. Aucune question dont la réponse n'est pas explicitement et clairement dans la fiche.
2. Une question = un concept clé compris, jamais un fragment ou un titre.
3. Couvre les concepts importants de la fiche, sans répétition inutile.
4. QCM : 4 choix, distracteurs crédibles et plausibles (jamais absurdes, jamais des
   bouts de phrase non reformulés).
5. Flashcards : recto = question ou terme clair ; verso = réponse complète et autonome
   (≤30 mots).
6. Feynman : uniquement sur un concept assez riche pour être expliqué en plusieurs
   phrases (pas sur un titre ou une liste).
7. Réponds UNIQUEMENT en JSON valide. Aucun texte, aucune balise Markdown avant/après.

NOMBRE : 10-15 QCM ; 10-15 flashcards ; 2-3 Feynman. Si la fiche est trop courte ou trop
peu structurée pour atteindre ces nombres avec des questions valides selon le critère
ci-dessus, génère MOINS de questions plutôt que de baisser la qualité.

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
