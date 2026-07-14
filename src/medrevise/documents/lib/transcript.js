/* ============================================================
   MedRevise — nettoyage d'un transcript de cours video (texte brut).
   REVERSIBLE : on ne perd jamais l'original (conserve sur la fiche) ; le
   nettoyage ne fait que PROPOSER une version lisible. Aucun reseau/IA :
   uniquement des heuristiques regex locales.

   Retire : horodatages, marqueurs de locuteur, hesitations orales, doublons
   de mots consecutifs. Reconstitue des paragraphes a partir de la ponctuation.
   ============================================================ */

// [00:12], 00:12, 00:12:33, (00:12:33), 1:02:03 — debut de ligne ou inline
const TIMESTAMP = /(\[|\()?\b\d{1,2}:\d{2}(:\d{2})?(\.\d{1,3})?\b(\]|\))?/g;
// « Intervenant : », « Prof- », « J.D.: » en debut de ligne (court, pas une phrase)
const SPEAKER = /^\s*[-–]?\s*[A-ZÀ-Ý][\wA-Za-zÀ-ÿ'.\- ]{0,28}\s*[:>]\s+/;
// hesitations / tics oraux frequents (fr), en mot entier
const FILLERS = /\b(euh+|heu+|hum+|hmm+|ben|bah|voila|du coup|en fait|genre|hein|tu vois|vous voyez)\b/gi;

/** doublons de mots consecutifs : « le le cours » -> « le cours » */
function dedupeWords(s) {
  return s.replace(/\b(\p{L}+)(\s+\1\b)+/giu, '$1');
}

/** normalise espaces et ponctuation orpheline apres nettoyage */
function tidy(s) {
  return s
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?]){2,}/g, '$1')
    .replace(/^[\s,;:.–-]+/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * Nettoie un transcript brut -> { cleaned }.
 * Reconstruit des paragraphes : ~3 phrases par paragraphe pour aerer.
 */
export function cleanTranscript(raw) {
  if (!raw || !raw.trim()) return { cleaned: '' };

  const lines = raw.split(/\r?\n/).map((ln) => {
    let s = ln.replace(TIMESTAMP, ' ').replace(/^\s+/, ''); // horodatage d'abord (peut precéder le locuteur)
    s = s.replace(SPEAKER, '');
    s = s.replace(FILLERS, ' ');
    s = dedupeWords(s);
    return s;
  });

  let text = tidy(lines.join(' '));
  if (!text) return { cleaned: '' };

  const sentences = (text.match(/[^.!?]+[.!?]*/g) || [text])
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1));

  const paras = [];
  for (let i = 0; i < sentences.length; i += 3) paras.push(sentences.slice(i, i + 3).join(' '));
  return { cleaned: paras.join('\n\n') };
}

/** transcript brut (texte) -> document ProseMirror (un paragraphe par ligne non vide). */
export function textToDoc(text) {
  const paras = String(text || '')
    .split(/\n{2,}|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const content = paras.length
    ? paras.map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] }))
    : [{ type: 'paragraph' }];
  return { type: 'doc', content };
}
