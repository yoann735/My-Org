/* ============================================================
   MedRevise — validateur d'import « coller le JSON » (aucun réseau).
   Accepte le schéma unifié v1.0 ({schema_version, meta, items}) ET
   l'ancien format ({questions, synthese}) via l'adaptateur rétrocompatible.
   Items invalides : IGNORÉS et COMPTÉS. Sortie = items v1.0 canoniques.
   ============================================================ */
import { normalizeV1Item, emptyCounts } from './schema.js';
import { isLegacyDoc, legacyDocToV1 } from './adapter.js';

const ERR = 'JSON invalide — recopie toute la réponse de Claude, sans texte autour.';

/** Retire d'éventuelles balises ```json … ``` (ou ```) au début/fin, puis trim. */
export function cleanPastedJson(raw) {
  let s = (raw || '').trim();
  s = s.replace(/^```[a-zA-Z]*\s*\n?/, ''); // fence d'ouverture
  s = s.replace(/\n?```\s*$/, '');          // fence de fermeture
  return s.trim();
}

const str = (v) => (v == null ? '' : String(v));

/**
 * `errors` (parallèle à `counts.ignored`, jamais un simple compteur muet) donne,
 * pour CHAQUE item rejeté, son rang (1-based), son type déclaré et la raison
 * précise (voir schema.js#normalizeV1Item) — affiché à l'utilisateur au lieu de
 * "X items ignorés" (voir ImportFlow.jsx#ImportPreviewCard / AddItemForm.jsx#PasteJsonForm).
 * @returns {{ok:false, error:string}
 *   | {ok:true, items:Array, meta:object, counts:{qcm,flashcard,feynman,exercice,ignored}, synthese:string, errors:Array<{index,type,reason}>}}
 */
export function parsePastedJson(raw) {
  const cleaned = cleanPastedJson(raw);
  if (!cleaned) return { ok: false, error: ERR };

  let data;
  try { data = JSON.parse(cleaned); }
  catch (e) { return { ok: false, error: ERR }; }
  if (!data || typeof data !== 'object') return { ok: false, error: ERR };

  const legacy = isLegacyDoc(data);
  let meta = {};
  let synthese = '';
  let rawItems;
  if (legacy) {
    // Ancien format → converti en v1.0 par l'adaptateur (seul lecteur du legacy).
    const v1 = legacyDocToV1(data);
    meta = v1.meta; synthese = v1._legacySynthese;
    rawItems = data.questions; // re-validé item par item pour compter les ignorés
  } else if (Array.isArray(data.items)) {
    meta = data.meta && typeof data.meta === 'object' ? data.meta : {};
    synthese = str(meta.resume);
    rawItems = data.items;
  } else if (typeof data.type === 'string') {
    // item v1.x SEUL, sans wrapper {items:[...]} — ex. "Ajouter un item" → Coller
    // du JSON (un item collé isolément). Re-normalisé comme les autres ci-dessous.
    rawItems = [data];
  } else {
    return { ok: false, error: ERR };
  }

  const counts = emptyCounts();
  const items = [];
  const errors = [];
  rawItems.forEach((it, i) => {
    // legacy : repasse par l'adaptateur ; v1.0 : normalisation directe.
    const src = legacy ? legacyDocToV1({ questions: [it] }).items[0] : it;
    const res = src ? normalizeV1Item(src) : { ok: false, reason: 'entrée invalide (legacy non convertible)' };
    if (!res.ok) {
      counts.ignored++;
      errors.push({ index: i + 1, type: (it && typeof it === 'object' && str(it.type)) || 'inconnu', reason: res.reason || 'format invalide' });
      return;
    }
    counts[res.item.type]++;
    items.push(res.item);
  });

  return { ok: true, items, meta, counts, synthese: str(synthese), errors };
}
