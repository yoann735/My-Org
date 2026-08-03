/* ============================================================
   MedRevise — carnet d'erreurs v2 (étape 2) : validateur du JSON collé pour
   créer des flashcards d'erreur (V2), à partir du retour d'un prompt EXTERNE
   (aucun appel réseau/IA ici — l'app ne fait que lire du JSON, comme partout
   ailleurs dans l'import). Format attendu par entrée :
     { "recto": "...", "verso": "...", "source_error_id": "<id V1>" }
   Accepte un objet seul, un tableau, ou {"items":[...]} — même souplesse que
   parsePastedJson (lib/parsePastedJson.js) — mais validateur DÉDIÉ, pas une
   extension de normalizeV1Item/schema.js : une V2 n'a pas de fiche, n'est pas
   un item v1.0, et `source_error_id` doit résoudre une V1 RÉELLEMENT en
   carnet (fournie par l'appelant, déjà filtrée sur carnetAt non-null).
   Entrées invalides : ignorées et comptées, jamais de crash.
   ============================================================ */
import { cleanPastedJson } from './parsePastedJson.js';

const ERR = 'JSON invalide — recopie toute la réponse du prompt, sans texte autour.';
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * @param {string} raw
 * @param {Array} v1Questions - flashcards V1 réellement en carnet (carnetAt non-null),
 *   pour résoudre/valider source_error_id.
 * @returns {{ok:false, error:string} | {ok:true, cards:Array<{recto,verso,sourceErrorId}>, counts:{created:number, ignored:number}}}
 */
export function parseErrorCardsJson(raw, v1Questions) {
  const cleaned = cleanPastedJson(raw);
  if (!cleaned) return { ok: false, error: ERR };

  let data;
  try { data = JSON.parse(cleaned); }
  catch (e) { return { ok: false, error: ERR }; }
  if (!data || typeof data !== 'object') return { ok: false, error: ERR };

  const rawItems = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [data];
  const byId = new Set((v1Questions || []).map((q) => q.id));

  const counts = { created: 0, ignored: 0 };
  const cards = [];
  for (const it of rawItems) {
    if (!it || typeof it !== 'object') { counts.ignored++; continue; }
    const recto = isStr(it.recto) ? it.recto.trim() : '';
    const verso = isStr(it.verso) ? it.verso.trim() : '';
    const sourceErrorId = isStr(it.source_error_id) ? it.source_error_id.trim() : '';
    if (!recto || !verso || !sourceErrorId || !byId.has(sourceErrorId)) { counts.ignored++; continue; }
    cards.push({ recto, verso, sourceErrorId });
    counts.created++;
  }
  return { ok: true, cards, counts };
}
