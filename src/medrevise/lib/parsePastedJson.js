/* ============================================================
   MedRevise — validateur d'import « coller le JSON » (aucun réseau).
   Accepte le schéma unifié v1.0 ({schema_version, meta, items}) ET
   l'ancien format ({questions, synthese}) via l'adaptateur rétrocompatible.
   Items invalides : IGNORÉS et COMPTÉS. Sortie = items v1.0 canoniques.

   TOLÉRANCE AUX PARASITES (parseLooseJson ci-dessous, partagée avec
   lib/parseErrorCardsJson.js) : le modèle qui génère le JSON colle parfois
   un texte avant/après, une accolade en trop, une virgule finale, ou des
   fences ```json — le CONTENU reste bon, seul l'emballage varie. Plutôt que
   d'exiger que TOUT le texte collé soit du JSON valide (JSON.parse strict),
   on extrait le premier objet/tableau JSON COMPLET (accolades/crochets
   équilibrés, en ignorant ceux à l'intérieur des chaînes) et on ignore tout
   le reste — même esprit qu'un `raw_decode` (json Python stdlib).
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

/** Repère le premier "{" ou "[" du texte, puis équilibre les accolades/crochets
   (en ignorant ceux dans une chaîne "…", échappements compris) jusqu'à la
   fermeture correspondante — retourne CE SEUL substring (tout ce qui précède
   ou suit, texte parasite ou accolade surnuméraire, est ignoré). `null` si
   aucun "{"/"[" n'est jamais refermé (JSON réellement tronqué). */
export function extractFirstJsonValue(text) {
  const s = text || '';
  let start = -1, openCh, closeCh;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{' || s[i] === '[') { start = i; openCh = s[i]; closeCh = s[i] === '{' ? '}' : ']'; break; }
  }
  if (start === -1) return null;

  let depth = 0, inString = false, escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === openCh) depth++;
    else if (c === closeCh) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null; // jamais refermé
}

/** Retire les virgules finales avant "}" ou "]" (courant chez les modèles qui
   génèrent du JSON à la main) — appliqué APRÈS extraction, sur le substring
   déjà isolé, jamais sur du texte brut non délimité. */
function stripTrailingCommas(s) {
  return s.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Parsing TOLÉRANT partagé par parsePastedJson (items) et parseErrorCardsJson
 * (cartes_erreur) : fences → extraction du premier objet/tableau complet →
 * virgules finales retirées → JSON.parse. Ne valide RIEN sur le CONTENU (voir
 * normalizeV1Item/parseErrorCardsJson pour la validation carte par carte) —
 * juste la tolérance à l'emballage.
 * @returns {{ok:true, data:any} | {ok:false, error:string}}
 */
export function parseLooseJson(raw) {
  const cleaned = cleanPastedJson(raw);
  if (!cleaned) return { ok: false, error: ERR };

  const extracted = extractFirstJsonValue(cleaned);
  if (!extracted) return { ok: false, error: ERR };

  try {
    return { ok: true, data: JSON.parse(stripTrailingCommas(extracted)) };
  } catch (e) {
    return { ok: false, error: `JSON invalide (${e.message}) — vérifie qu'il n'y a pas de guillemet non échappé dans un texte de carte.` };
  }
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
  const parsed = parseLooseJson(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const data = parsed.data;
  if (!data || typeof data !== 'object') return { ok: false, error: ERR };

  const legacy = !Array.isArray(data) && isLegacyDoc(data);
  let meta = {};
  let synthese = '';
  let rawItems;
  if (legacy) {
    // Ancien format → converti en v1.0 par l'adaptateur (seul lecteur du legacy).
    const v1 = legacyDocToV1(data);
    meta = v1.meta; synthese = v1._legacySynthese;
    rawItems = data.questions; // re-validé item par item pour compter les ignorés
  } else if (Array.isArray(data)) {
    // tableau nu [...] — format parfois renvoyé directement par le prompt, sans
    // wrapper {items:[...]} ; note_couverture n'existe pas sous cette forme.
    rawItems = data;
  } else if (Array.isArray(data.items)) {
    meta = data.meta && typeof data.meta === 'object' ? data.meta : {};
    synthese = str(meta.resume);
    // "note_couverture" (prompts récents) n'est pas une carte — jamais rejetée,
    // simplement ignorée ici (pas un champ d'item, rien à valider dessus).
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
