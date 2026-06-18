/* ============================================================
   MedRevise — appels Claude (via la fonction serverless /api/generate).
   En local (npm run dev) il n'y a pas de serverless : on bascule
   automatiquement sur un FALLBACK MOCK qui fabrique des questions
   d'exemple depuis le texte, pour que l'import reste testable hors-ligne.
   En production (Vercel + ANTHROPIC_API_KEY), c'est la vraie IA Claude.
   ============================================================ */
import {
  promptStandard, promptAnatomie, promptFeynmanIntuition, promptFeynmanExpert, promptQcmSupplementaires,
} from './prompts.js';

/** parse le JSON renvoyé par Claude (retire d'éventuelles balises ```json) */
export function parseJSON(text) {
  return JSON.parse(String(text).replace(/```json|```/g, '').trim());
}

async function callServer(prompt, maxTokens) {
  const r = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, max_tokens: maxTokens }),
  });
  if (!r.ok) throw new Error('serverless indisponible (' + r.status + ')');
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data.text;
}

/* ---------- MOCK (dev / hors-ligne) ---------- */
function sentences(txt) {
  return String(txt || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);
}
function firstWords(s, n) { return s.split(' ').slice(0, n).join(' '); }

function mockStandard(contenu, titre) {
  const ss = sentences(contenu);
  const base = ss.length ? ss : ['Concept clé à compléter après import.'];
  const questions = [];
  base.slice(0, 8).forEach((s, i) => {
    questions.push({
      type: 'qcm', concept: firstWords(s, 4) || ('Notion ' + (i + 1)),
      question: `Vrai ou faux (à valider) : « ${firstWords(s, 14)}… » ?`,
      choix: ['Affirmation exacte', 'Affirmation partiellement fausse', 'Hors sujet', 'Aucune de ces réponses'],
      bonneReponse: 0,
      explication: s,
    });
  });
  base.slice(0, 6).forEach((s, i) => {
    questions.push({ type: 'flashcard', concept: firstWords(s, 4) || ('Définition ' + (i + 1)), recto: firstWords(s, 6) + ' ?', verso: s.slice(0, 160) });
  });
  base.slice(0, 2).forEach((s, i) => {
    questions.push({ type: 'feynman', concept: firstWords(s, 4) || ('Idée ' + (i + 1)) });
  });
  return { titre: titre || 'Fiche importée', categorie: '', questions, _mock: true };
}

function mockAnatomie(structures) {
  // structures: [{ nom, infos:{...} }]
  const questions = (structures || []).slice(0, 12).map((st) => {
    const infos = st.infos || {};
    const champ = infos.innervation ? 'innervation' : (infos.action ? 'action' : 'origine');
    const val = infos[champ] || 'à compléter';
    return {
      type: 'qcm', concept: st.nom,
      question: `Concernant « ${st.nom} », quelle est son/sa ${champ} ?`,
      choix: [val, 'Réponse erronée A', 'Réponse erronée B', 'Réponse erronée C'],
      bonneReponse: 0,
      explication: `${st.nom} — ${champ} : ${val}.`,
    };
  });
  return { questions, _mock: true };
}

function mockFeynman(level, concept) {
  return `【Évaluation de démonstration (hors-ligne)】
Concept : ${concept} — niveau ${level === 'expert' ? 'Expert' : 'Intuition'}.
Ton explication a été enregistrée. La vraie évaluation par l'IA s'activera une fois l'app déployée sur Vercel avec la clé API.
Note indicative : —/10.`;
}

/* ---------- API publique ---------- */
export async function generateStandard(contenu, titre) {
  try { return { ...parseJSON(await callServer(promptStandard(contenu), 8192)), _mock: false }; }
  catch (e) { return mockStandard(contenu, titre); }
}

export async function generateAnatomie(structures) {
  const texte = (structures || []).map((s) => {
    const i = s.infos || {};
    return `- ${s.nom} : origine=${i.origine || '—'} ; insertion=${i.insertion || '—'} ; action=${i.action || '—'} ; innervation=${i.innervation || '—'} ; vascularisation=${i.vascularisation || '—'}`;
  }).join('\n');
  try { return { ...parseJSON(await callServer(promptAnatomie(texte), 8192)), _mock: false }; }
  catch (e) { return mockAnatomie(structures); }
}

export async function evaluateFeynman(level, concept, extraitFiche, texteEtudiant) {
  const prompt = level === 'expert'
    ? promptFeynmanExpert(concept, extraitFiche, texteEtudiant)
    : promptFeynmanIntuition(concept, extraitFiche, texteEtudiant);
  try { return await callServer(prompt, 1500); }
  catch (e) { return mockFeynman(level, concept); }
}

export async function generateExtraQcm(concept, extrait) {
  try { return { ...parseJSON(await callServer(promptQcmSupplementaires(concept, extrait), 2048)), _mock: false }; }
  catch (e) { return { questions: [], _mock: true }; }
}
