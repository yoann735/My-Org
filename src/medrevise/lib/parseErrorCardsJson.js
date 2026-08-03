/* ============================================================
   MedRevise — carnet d'erreurs v2 : validateur du JSON collé pour créer des
   flashcards d'erreur (V2), à partir du retour d'un prompt EXTERNE (aucun
   appel réseau/IA ici — l'app ne fait que lire du JSON, comme partout
   ailleurs dans l'import). Format attendu par entrée :
     { "recto": "...", "verso": "...", "source_error_id": "<id V1>" }
   Accepte un objet seul, un tableau, ou {"items":[...]} — même souplesse que
   parsePastedJson (lib/parsePastedJson.js) — mais validateur DÉDIÉ, pas une
   extension de normalizeV1Item/schema.js : une V2 n'a pas de fiche, n'est pas
   un item v1.0.

   Rattachement (fix : "Ajouter" est maintenant déclenché DEPUIS une V1
   précise, CarnetDashboard.jsx) : `targetV1Id`, fourni par l'UI (l'id RÉEL de
   la V1 cliquée), est la SEULE source de vérité pour sourceErrorId — jamais
   le `source_error_id` du JSON, qui n'est qu'une vérification secondaire NON
   BLOQUANTE (le prompt externe peut le recopier de travers ou l'halluciner ;
   compté dans `counts.mismatched` pour information, ne rejette jamais une
   carte). Seule validation bloquante restante : recto/verso non vides.
   ============================================================ */
import { cleanPastedJson } from './parsePastedJson.js';

const ERR = 'JSON invalide — recopie toute la réponse du prompt, sans texte autour.';
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * @param {string} raw
 * @param {string} targetV1Id - id RÉEL de la V1 depuis laquelle "Ajouter" a été
 *   cliqué (CarnetDashboard.jsx) — rattachement de TOUTES les cartes valides,
 *   quel que soit le contenu de source_error_id dans le JSON.
 * @returns {{ok:false, error:string} | {ok:true, cards:Array<{recto,verso,sourceErrorId}>, counts:{created:number, ignored:number, mismatched:number}}}
 */
export function parseErrorCardsJson(raw, targetV1Id) {
  const cleaned = cleanPastedJson(raw);
  if (!cleaned) return { ok: false, error: ERR };

  let data;
  try { data = JSON.parse(cleaned); }
  catch (e) { return { ok: false, error: ERR }; }
  if (!data || typeof data !== 'object') return { ok: false, error: ERR };

  const rawItems = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [data];

  const counts = { created: 0, ignored: 0, mismatched: 0 };
  const cards = [];
  for (const it of rawItems) {
    if (!it || typeof it !== 'object') { counts.ignored++; continue; }
    const recto = isStr(it.recto) ? it.recto.trim() : '';
    const verso = isStr(it.verso) ? it.verso.trim() : '';
    if (!recto || !verso) { counts.ignored++; continue; }
    // filet non bloquant : juste comptabilisé si absent/différent, jamais un motif de rejet.
    const claimedSourceId = isStr(it.source_error_id) ? it.source_error_id.trim() : '';
    if (claimedSourceId && claimedSourceId !== targetV1Id) counts.mismatched++;
    cards.push({ recto, verso, sourceErrorId: targetV1Id });
    counts.created++;
  }
  return { ok: true, cards, counts };
}
