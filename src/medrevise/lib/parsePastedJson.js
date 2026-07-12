/* ============================================================
   MedRevise — parsing LOCAL d'une réponse JSON de Claude
   (mode « coller le JSON »). Aucun appel réseau : on lit le JSON
   déjà généré dans le chat et on valide sa structure avant import.
   ============================================================ */

const ERR = 'JSON invalide — recopie toute la réponse de Claude, sans texte autour.';

/** Retire d'éventuelles balises ```json … ``` (ou ```) au début/fin, puis trim. */
export function cleanPastedJson(raw) {
  let s = (raw || '').trim();
  s = s.replace(/^```[a-zA-Z]*\s*\n?/, ''); // fence d'ouverture
  s = s.replace(/\n?```\s*$/, '');          // fence de fermeture
  return s.trim();
}

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

function validQcm(q) {
  return isStr(q.concept) && isStr(q.categorie_question) && isStr(q.difficulte)
    && isStr(q.question) && Array.isArray(q.choix) && q.choix.length === 4
    && Number.isInteger(q.bonneReponse) && q.bonneReponse >= 0 && q.bonneReponse <= 3
    && isStr(q.explication);
}
function validFlashcard(q) {
  return isStr(q.concept) && isStr(q.categorie_carte) && isStr(q.recto) && isStr(q.verso);
}
function validFeynman(q) {
  return isStr(q.concept) && isStr(q.explication_simple) && isStr(q.lien_avec_le_cours)
    && Array.isArray(q.pieges_frequents) && isStr(q.question_verification);
}
const VALIDATORS = { qcm: validQcm, flashcard: validFlashcard, feynman: validFeynman };

/**
 * @returns {{ok:false, error:string}
 *   | {ok:true, questions:Array, synthese:string, counts:{qcm,flashcard,feynman,ignored}}}
 */
export function parsePastedJson(raw) {
  const cleaned = cleanPastedJson(raw);
  if (!cleaned) return { ok: false, error: ERR };

  let data;
  try { data = JSON.parse(cleaned); }
  catch (e) { return { ok: false, error: ERR }; }

  if (!data || typeof data !== 'object' || !Array.isArray(data.questions)) {
    return { ok: false, error: ERR };
  }

  const counts = { qcm: 0, flashcard: 0, feynman: 0, ignored: 0 };
  const questions = [];
  for (const q of data.questions) {
    const validate = q && VALIDATORS[q.type];
    if (!validate || !validate(q)) { counts.ignored++; continue; }
    counts[q.type]++;
    questions.push(q);
  }

  const synthese = isStr(data.synthese) ? data.synthese.trim() : '';
  return { ok: true, questions, synthese, counts };
}
