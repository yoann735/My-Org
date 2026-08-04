/* ============================================================
   MedRevise — carnet d'erreurs v2 : validateur du JSON collé pour créer des
   flashcards d'erreur (V2), à partir du retour d'un prompt EXTERNE (aucun
   appel réseau/IA ici — l'app ne fait que lire du JSON, comme partout
   ailleurs dans l'import).

   Formats acceptés (dans cet ordre) :
   - { "cartes_erreur": [...] }  — format du prompt externe (1 à 3 cartes),
     chaque entrée : { recto, verso, cloze: [...]|null, indice: "..."|null,
     a_retenir, source_error_id, angle: "coeur"|"piege"|"transfert" }.
   - un tableau nu [...]
   - { "items": [...] }
   - un objet seul {...}
   Mapping vers le modèle V2 interne (storage.js#newErrorCard) : recto/verso
   tels quels ; cloze → MÊME représentation que les flashcards v1.0
   (schema.js normFlashcard : tableau de mots masqués, le recto est censé
   porter les "{{mot}}" correspondants — lib/cloze.js#parseCloze gère déjà
   gracieusement un décalage éventuel, rien à revalider ici) ; indice/
   a_retenir passe-plat ; angle = champ informatif, stocké tel quel si présent
   (aucune valeur imposée, juste affiché dans le tableau de bord).

   Rattachement : `targetV1Id`, fourni par l'UI (l'id RÉEL de la V1 cliquée,
   CarnetDashboard.jsx), est la SEULE source de vérité pour sourceErrorId —
   jamais le `source_error_id` du JSON, qui n'est qu'une vérification
   secondaire NON BLOQUANTE (compté dans `counts.mismatched`, ne rejette
   jamais une carte).

   Validation bloquante : recto ET verso non vides. Une carte rejetée est
   tracée dans `errors` (index 1-based + raison précise), pas juste comptée —
   pour un message qui dit LAQUELLE et POURQUOI, pas un total générique.
   ============================================================ */
import { parseLooseJson } from './parsePastedJson.js';
import { asArray } from './schema.js';

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * @param {string} raw
 * @param {string} targetV1Id - id RÉEL de la V1 depuis laquelle "Ajouter" a été
 *   cliqué — rattachement de TOUTES les cartes valides, quel que soit le
 *   contenu de source_error_id dans le JSON.
 * @returns {{ok:false, error:string}
 *   | {ok:true, cards:Array<{recto,verso,sourceErrorId,cloze?,indice?,a_retenir?,angle?}>,
 *      counts:{created:number, ignored:number, mismatched:number}, errors:Array<{index:number, reason:string}>}}
 */
export function parseErrorCardsJson(raw, targetV1Id) {
  const parsed = parseLooseJson(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const data = parsed.data;
  if (!data || typeof data !== 'object') return { ok: false, error: 'JSON invalide — recopie toute la réponse du prompt, sans texte autour.' };

  const shape = Array.isArray(data) ? 'tableau nu'
    : Array.isArray(data.cartes_erreur) ? 'cartes_erreur'
    : Array.isArray(data.items) ? 'items'
    : 'objet seul';
  const rawItems = Array.isArray(data) ? data
    : Array.isArray(data.cartes_erreur) ? data.cartes_erreur
    : Array.isArray(data.items) ? data.items
    : [data];
  // debug TEMPORAIRE : confirme quel format a été détecté + combien d'entrées
  // trouvées, avant même la validation carte par carte ci-dessous.
  console.warn(`[parseErrorCardsJson] format détecté : ${shape} (${rawItems.length} carte${rawItems.length > 1 ? 's' : ''})`);

  const counts = { created: 0, ignored: 0, mismatched: 0 };
  const errors = [];
  const cards = [];
  // debug TEMPORAIRE (à retirer une fois confirmé stable en usage réel) : trace
  // dans la console navigateur POURQUOI une carte est jugée invalide — voir
  // aussi errors[] (raison exacte, déjà remontée à l'utilisateur dans la modale).
  const debugIgnore = (n, reason, it) => { errors.push({ index: n, reason }); counts.ignored++; console.warn(`[parseErrorCardsJson] carte ${n} ignorée : ${reason}`, it); };
  rawItems.forEach((it, i) => {
    const n = i + 1;
    if (!it || typeof it !== 'object') { debugIgnore(n, 'entrée invalide (pas un objet)', it); return; }
    const recto = isStr(it.recto) ? it.recto.trim() : '';
    const verso = isStr(it.verso) ? it.verso.trim() : '';
    if (!recto && !verso) { debugIgnore(n, 'recto et verso manquants', it); return; }
    if (!recto) { debugIgnore(n, 'recto manquant', it); return; }
    if (!verso) { debugIgnore(n, 'verso manquant', it); return; }

    // filet non bloquant : juste comptabilisé si absent/différent, jamais un motif de rejet.
    const claimedSourceId = isStr(it.source_error_id) ? it.source_error_id.trim() : '';
    if (claimedSourceId && claimedSourceId !== targetV1Id) counts.mismatched++;

    const cloze = asArray(it.cloze).map(String).map((s) => s.trim()).filter(Boolean);
    const indice = isStr(it.indice) ? it.indice.trim() : null;
    const a_retenir = isStr(it.a_retenir) ? it.a_retenir.trim() : '';
    const angle = isStr(it.angle) ? it.angle.trim() : null;

    cards.push({
      recto, verso, sourceErrorId: targetV1Id,
      ...(cloze.length ? { cloze } : {}),
      indice, a_retenir,
      ...(angle ? { angle } : {}),
    });
    counts.created++;
  });
  return { ok: true, cards, counts, errors };
}
