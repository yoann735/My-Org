/* ============================================================
   MedRevise — appels Claude (via la fonction serverless /api/generate).
   La génération standard fait 3 appels dédiés (QCM, flashcards, Feynman)
   et fusionne leurs "questions". En local (npm run dev) il n'y a pas de
   serverless → fallback MOCK par type. Chaque appel capture un objet
   "debug" (prompt exact envoyé + réponse brute + statut/temps/parse)
   exploité par le Mode développeur de la card d'import.
   ============================================================ */
import {
  promptQcm, promptFlashcards, promptFeynman,
  promptAnatomie, promptFeynmanIntuition, promptFeynmanExpert, promptQcmSupplementaires,
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
function base(contenu) { const ss = sentences(contenu); return ss.length ? ss : ['Concept clé à compléter après import.']; }

function mockQcm(contenu) {
  return {
    questions: base(contenu).slice(0, 8).map((s, i) => ({
      type: 'qcm', concept: firstWords(s, 4) || ('Notion ' + (i + 1)),
      categorie_question: 'definition', difficulte: 'intermediaire',
      question: `Vrai ou faux (à valider) : « ${firstWords(s, 14)}… » ?`,
      choix: ['Affirmation exacte', 'Affirmation partiellement fausse', 'Hors sujet', 'Aucune de ces réponses'],
      bonneReponse: 0, explication: s,
    })),
  };
}
function mockFlash(contenu) {
  return {
    questions: base(contenu).slice(0, 6).map((s, i) => ({
      type: 'flashcard', concept: firstWords(s, 4) || ('Définition ' + (i + 1)),
      categorie_carte: 'definition', recto: firstWords(s, 6) + ' ?', verso: s.slice(0, 160),
    })),
  };
}
function mockFeynmanGen(contenu) {
  return {
    questions: base(contenu).slice(0, 2).map((s, i) => ({
      type: 'feynman', concept: firstWords(s, 4) || ('Idée ' + (i + 1)),
      explication_simple: s, lien_avec_le_cours: '', pieges_frequents: [], question_verification: `Explique : ${firstWords(s, 5)} ?`,
    })),
    synthese: '',
  };
}
function mockEvalText(level, concept) {
  return `【Évaluation de démonstration (hors-ligne)】
Concept : ${concept} — niveau ${level === 'expert' ? 'Expert' : 'Intuition'}.
Ton explication a été enregistrée. La vraie évaluation par l'IA s'activera une fois l'app déployée sur Vercel avec la clé API.
Note indicative : —/10.`;
}

/* ---------- un "job" de génération JSON, avec capture debug ---------- */
async function runJob(label, prompt, maxTokens, mockFn) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let response = '', ok = false, parseOk = false, error = null, parsed = null;
  try {
    response = await callServer(prompt, maxTokens);
    ok = true;
    try { parsed = parseJSON(response); parseOk = true; } catch (e) { error = 'JSON invalide : ' + e.message; }
  } catch (e) { error = e.message; }
  const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
  if (parseOk && parsed && Array.isArray(parsed.questions)) {
    return { questions: parsed.questions, synthese: parsed.synthese, mock: false,
      debug: { label, prompt, response, ok, ms, parseOk: true, error: null } };
  }
  const m = mockFn();
  return { questions: m.questions || [], synthese: m.synthese, mock: true,
    debug: { label, prompt, response: response || '', ok, ms, parseOk: false, error: error || 'pas de serverless (mock)' } };
}

/* ---------- API publique ---------- */
export async function generateStandard(contenu, titre, n = 15) {
  const [qcm, flash, fey] = await Promise.all([
    runJob('QCM', promptQcm(contenu, n), 8192, () => mockQcm(contenu)),
    runJob('Flashcards', promptFlashcards(contenu, n), 8192, () => mockFlash(contenu)),
    runJob('Feynman', promptFeynman(contenu), 4096, () => mockFeynmanGen(contenu)),
  ]);
  return {
    titre: titre || 'Fiche importée',
    questions: [...qcm.questions, ...flash.questions, ...fey.questions],
    synthese: fey.synthese || '',
    _mock: qcm.mock || flash.mock || fey.mock,
    debug: [qcm.debug, flash.debug, fey.debug],
  };
}

export async function generateAnatomie(structures) {
  const texte = (structures || []).map((s) => {
    const i = s.infos || {};
    return `- ${s.nom} : origine=${i.origine || '—'} ; insertion=${i.insertion || '—'} ; action=${i.action || '—'} ; innervation=${i.innervation || '—'} ; vascularisation=${i.vascularisation || '—'}`;
  }).join('\n');
  const job = await runJob('Anatomie (QCM)', promptAnatomie(texte), 8192, () => ({
    questions: (structures || []).slice(0, 12).map((st) => {
      const infos = st.infos || {};
      const champ = infos.innervation ? 'innervation' : (infos.action ? 'action' : 'origine');
      const val = infos[champ] || 'à compléter';
      return { type: 'qcm', concept: st.nom, question: `Concernant « ${st.nom} », quelle est son/sa ${champ} ?`, choix: [val, 'Réponse erronée A', 'Réponse erronée B', 'Réponse erronée C'], bonneReponse: 0, explication: `${st.nom} — ${champ} : ${val}.` };
    }),
  }));
  return { questions: job.questions, _mock: job.mock, debug: [job.debug] };
}

export async function evaluateFeynman(level, concept, extraitFiche, texteEtudiant) {
  const prompt = level === 'expert'
    ? promptFeynmanExpert(concept, extraitFiche, texteEtudiant)
    : promptFeynmanIntuition(concept, extraitFiche, texteEtudiant);
  try { return await callServer(prompt, 1500); }
  catch (e) { return mockEvalText(level, concept); }
}

export async function generateExtraQcm(concept, extrait) {
  try { return { ...parseJSON(await callServer(promptQcmSupplementaires(concept, extrait), 2048)), _mock: false }; }
  catch (e) { return { questions: [], _mock: true }; }
}
