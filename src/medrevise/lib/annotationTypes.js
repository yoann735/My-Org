/* ============================================================
   MedRevise — TYPES D'ANNOTATION D'UN DOCUMENT (PDF), séparés et nommés.

   Les annotations vivaient dans deux stores, dont un « fourre-tout » :
     highlights  → les surlignages de texte ;
     annotations → trois choses différentes, distinguées seulement par
                   l'absence ou la valeur d'un champ `kind` (bloc de texte
                   remplacé : pas de kind ; boîte : 'libre' ; trait : 'trait',
                   lui-même en mode 'dessin' ou 'surligneur').

   Ce module est désormais LA définition des catégories. Chaque annotation a un
   TYPE explicite et un seul :
     'surlignage'  surlignage de texte (store highlights)
     'boite'       boîte de texte / rectangle posé sur la page
     'trait'       trait de crayon (dessin fin)
     'surligneur'  trait de surligneur à main levée (épais, translucide)
     'bloc'        bloc de texte d'origine remplacé par un texte édité

   - Les annotations CRÉÉES à partir de maintenant portent leur `type` écrit
     (voir storage.js : newHighlight, newNoteBox, newTrait, newTextEdit).
   - Les ANCIENNES ne sont pas réécrites (aucune migration, aucune écriture
     cloud) : `typeAnnotation` les classe avec les règles d'avant, à la lecture.
     Le champ `type` est purement additif : le retirer, c'est revenir à l'état
     d'avant, rien d'autre ne change.
   - Le lecteur (pdf/PdfReader.jsx) tient ses annotations en mémoire en
     collections SÉPARÉES par type (`separerParType`).

   Stockage PHYSIQUE inchangé (mêmes deux stores, même synchro) : déplacer les
   enregistrements existants dans un store par type réécrirait toutes les
   annotations dans le cloud — voir docs/rapport-nuit.md.
   ============================================================ */
import { getAll } from './storage.js';

export const TYPES_ANNOTATION = {
  surlignage: { store: 'highlights', libelle: 'surlignage', pluriel: 'surlignages' },
  boite: { store: 'annotations', libelle: 'boîte', pluriel: 'boîtes' },
  trait: { store: 'annotations', libelle: 'trait', pluriel: 'traits' },
  surligneur: { store: 'annotations', libelle: 'trait de surligneur', pluriel: 'traits de surligneur' },
  bloc: { store: 'annotations', libelle: 'bloc remplacé', pluriel: 'blocs remplacés' },
  // édition « à la Aperçu » (01/10, docs/archi-edition-pdf.md)
  texte: { store: 'annotations', libelle: 'texte', pluriel: 'textes' },
  question: { store: 'annotations', libelle: 'point d’interrogation', pluriel: 'points d’interrogation' },
  image: { store: 'annotations', libelle: 'image', pluriel: 'images' },
  page: { store: 'annotations', libelle: 'page ajoutée', pluriel: 'pages ajoutées' },
};
export const ORDRE_TYPES = ['surlignage', 'boite', 'trait', 'surligneur', 'bloc', 'texte', 'question', 'image', 'page'];
/** kinds des ajouts du 01/10 : leur type est leur kind. */
const KINDS_AJOUTS = new Set(['texte', 'question', 'image', 'page']);

/** Type d'un enregistrement. `store` = store d'où il vient ('highlights' |
    'annotations'). Le `type` écrit fait foi ; à défaut (enregistrement
    d'avant), on le déduit exactement comme le lecteur le faisait. */
export function typeAnnotation(rec, store = 'annotations') {
  if (!rec) return null;
  if (rec.type && TYPES_ANNOTATION[rec.type]) return rec.type;
  if (store === 'highlights') return 'surlignage';
  if (rec.kind === 'libre') return 'boite';
  if (rec.kind === 'trait') return rec.mode === 'surligneur' ? 'surligneur' : 'trait';
  if (KINDS_AJOUTS.has(rec.kind)) return rec.kind;
  if (!rec.kind) return 'bloc';
  return null; // kind inconnu (version future) : ignoré, jamais mal classé
}

/** Sépare en collections par type. `highlights` et `annotations` = contenus
    des deux stores (déjà filtrés sur un document, ou non). */
export function separerParType(highlights = [], annotations = []) {
  const par = Object.fromEntries(ORDRE_TYPES.map((t) => [t, []]));
  for (const h of highlights || []) { const t = typeAnnotation(h, 'highlights'); if (t) par[t].push(h); }
  for (const a of annotations || []) { const t = typeAnnotation(a, 'annotations'); if (t) par[t].push(a); }
  return par;
}

/** Annotations d'UN document, séparées par type (lecture seule). */
export async function annotationsParType(ficheId) {
  const [hs, ans] = await Promise.all([getAll('highlights'), getAll('annotations')]);
  return separerParType((hs || []).filter((h) => h.ficheId === ficheId), (ans || []).filter((a) => a.ficheId === ficheId));
}

/** Nombre d'annotations par type, pour TOUS les documents, en une lecture :
    { [ficheId]: { surlignage: n, boite: n, … , total: n } }. Lecture pure. */
export async function comptesParType() {
  const [hs, ans] = await Promise.all([getAll('highlights'), getAll('annotations')]);
  const map = {};
  const ajouter = (r, store) => {
    if (!r || !r.ficheId) return;
    const t = typeAnnotation(r, store); if (!t) return;
    const c = map[r.ficheId] || (map[r.ficheId] = { total: 0 });
    c[t] = (c[t] || 0) + 1; c.total += 1;
  };
  (hs || []).forEach((h) => ajouter(h, 'highlights'));
  (ans || []).forEach((a) => ajouter(a, 'annotations'));
  return map;
}

/** « 2 surlignages · 1 boîte » — dans l'ordre des types, zéros omis. */
export function resumeParType(c) {
  if (!c || !c.total) return '';
  return ORDRE_TYPES.filter((t) => c[t]).map((t) => `${c[t]} ${c[t] > 1 ? TYPES_ANNOTATION[t].pluriel : TYPES_ANNOTATION[t].libelle}`).join(' · ');
}
