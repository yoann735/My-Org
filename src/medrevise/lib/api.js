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

/* ---------- découpage du cours (évite le timeout 60s de la fonction serverless) ----------
   Un cours long fait générer beaucoup de texte en un seul appel Claude, ce qui peut
   dépasser la durée max d'une fonction serverless. Au-delà de CHUNK_CHAR_THRESHOLD, on
   coupe le texte en 2 moitiés (sur une frontière propre : paragraphe > ligne > phrase) et
   on lance un appel par moitié en parallèle — chaque appel génère deux fois moins de
   contenu, donc prend environ deux fois moins de temps. Les résultats sont simplement
   concaténés : chaque moitié ne voit que sa portion du texte, donc pas de doublons. */
const CHUNK_CHAR_THRESHOLD = 6000;

function findSplitPoint(text, near, radius) {
  for (const sep of ['\n\n', '\n', '. ', ' ']) {
    const start = Math.max(0, near - radius);
    const end = Math.min(text.length, near + radius);
    let bestIdx = -1, bestDist = Infinity, from = start;
    while (true) {
      const idx = text.indexOf(sep, from);
      if (idx === -1 || idx > end) break;
      const cut = idx + sep.length;
      const dist = Math.abs(cut - near);
      if (dist < bestDist) { bestDist = dist; bestIdx = cut; }
      from = idx + 1;
    }
    if (bestIdx !== -1) return bestIdx;
  }
  return near;
}

function splitCourseText(text, threshold = CHUNK_CHAR_THRESHOLD) {
  const clean = String(text || '').trim();
  if (clean.length <= threshold) return [clean];
  const mid = Math.floor(clean.length / 2);
  const radius = Math.min(1500, Math.floor(clean.length / 4));
  const cut = findSplitPoint(clean, mid, radius);
  const a = clean.slice(0, cut).trim();
  const b = clean.slice(cut).trim();
  return a && b ? [a, b] : [clean];
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
  const chunks = splitCourseText(contenu);

  if (chunks.length === 1) {
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

  // cours long → 1 appel par moitié et par type, en parallèle (évite le timeout serverless)
  const nPart = Math.max(6, Math.ceil(n / 2));
  const minPart = Math.max(4, Math.ceil(10 / 2));
  const jobs = chunks.flatMap((part, i) => {
    const label = ` (partie ${i + 1}/${chunks.length})`;
    return [
      runJob('QCM' + label, promptQcm(part, nPart, minPart), 4096, () => mockQcm(part)),
      runJob('Flashcards' + label, promptFlashcards(part, nPart, minPart), 4096, () => mockFlash(part)),
      runJob('Feynman' + label, promptFeynman(part, 2, 3), 2048, () => mockFeynmanGen(part)),
    ];
  });
  const results = await Promise.all(jobs);
  const qcmResults = results.filter((_, i) => i % 3 === 0);
  const flashResults = results.filter((_, i) => i % 3 === 1);
  const feyResults = results.filter((_, i) => i % 3 === 2);

  return {
    titre: titre || 'Fiche importée',
    questions: [
      ...qcmResults.flatMap((r) => r.questions),
      ...flashResults.flatMap((r) => r.questions),
      ...feyResults.flatMap((r) => r.questions),
    ],
    synthese: feyResults.map((r) => r.synthese).filter(Boolean).join('\n\n'),
    _mock: results.some((r) => r.mock),
    debug: results.map((r) => r.debug),
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
