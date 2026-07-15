/* ============================================================
   MedRevise — nettoyage d'un transcript de cours video (texte brut).
   REVERSIBLE : on ne perd jamais l'original (conserve sur la fiche) ; le
   nettoyage ne fait que PROPOSER une version lisible. Aucun reseau/IA :
   uniquement des heuristiques regex locales.

   Retire : horodatages, marqueurs de locuteur, hesitations orales, doublons
   de mots consecutifs. Reconstitue des paragraphes a partir de la ponctuation.
   ============================================================ */

// Horodatages : 0:00, 12:34, 1:02:33, [00:12], (00:12.500). Le point CRUCIAL :
// dans les sous-titres auto, l'horodatage est souvent COLLÉ au mot suivant
// ("0:00quand", "0:02fait") — donc PAS de \b final (qui échoue entre "0" et "q").
// On remplace par une espace pour ne jamais souder deux mots.
const TIMESTAMP = /[[(]?\s*(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?\s*[\])]?/g;
// « Intervenant : », « Prof- », « J.D.: » en debut de ligne (court, pas une phrase)
const SPEAKER = /^\s*[-–]?\s*[A-ZÀ-Ý][\wA-Za-zÀ-ÿ'.\- ]{0,28}\s*[:>]\s+/;
// hesitations / tics oraux frequents (fr), en mot entier. Volontairement CONSERVATEUR
// (on ne retire jamais « en fait », « du coup »… qui portent du sens — cf. l'exemple
// « c'est en fait assez naturel »). On ne touche qu'aux tics sans valeur sémantique.
// bornes Unicode (lookaround sur \p{L}) : un simple \b échoue APRÈS une lettre
// accentuée ("voilà" suivi d'une espace) car « à » n'est pas un word-char ASCII.
const FILLERS = /(?<!\p{L})(?:euh+|heu+|hum+|hmm+|ben|bah|voil[aà]|hein)(?!\p{L})/giu;

/** doublons de mots consecutifs : « le le cours » -> « le cours » */
function dedupeWords(s) {
  return s.replace(/\b(\p{L}+)(\s+\1\b)+/giu, '$1');
}

/** majuscule en début de texte ET après chaque ponctuation forte. */
function capitalizeSentences(s) {
  return s.replace(/(^\s*|[.!?]\s+)(\p{Ll})/gu, (_m, pre, ch) => pre + ch.toUpperCase());
}

/**
 * Reconstruit des paragraphes lisibles.
 * - Si le texte contient déjà une ponctuation de phrase suffisante, on regroupe
 *   ~3 phrases par paragraphe.
 * - Sinon (sous-titres SANS ponctuation), on aère par blocs d'environ 55 mots ;
 *   on N'INVENTE PAS de points internes (on ne fabrique pas de fausses phrases,
 *   ce qui altérerait le sens) : on clôt seulement chaque bloc par un point.
 */
function toParagraphs(text) {
  const wordCount = (text.match(/\S+/g) || []).length;
  const strongPunct = (text.match(/[.!?]/g) || []).length;
  const enoughPunct = strongPunct >= Math.max(3, wordCount / 40);

  let paras;
  if (enoughPunct) {
    const sentences = (text.match(/[^.!?]+[.!?]+/g) || [text]).map((s) => s.trim()).filter(Boolean);
    paras = [];
    for (let i = 0; i < sentences.length; i += 3) paras.push(sentences.slice(i, i + 3).join(' '));
  } else {
    const words = text.split(/\s+/).filter(Boolean);
    const PER = 55;
    paras = [];
    for (let i = 0; i < words.length; i += PER) {
      let p = words.slice(i, i + PER).join(' ').trim();
      if (p && !/[.!?…]$/.test(p)) p += '.';
      if (p) paras.push(p);
    }
  }
  return paras.map((p) => capitalizeSentences(p)).filter(Boolean).join('\n\n');
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

  // 1) par ligne : retirer les horodatages (MÊME collés au mot suivant) et le
  //    marqueur de locuteur en début de ligne. On remplace l'horodatage par une
  //    espace → "0:00quand" devient " quand", jamais "0:00quand" soudé.
  const lines = raw.split(/\r?\n/).map((ln) => {
    let s = ln.replace(TIMESTAMP, ' ').replace(/^\s+/, '');
    s = s.replace(SPEAKER, '');
    return s;
  });

  // 2) recoller les fragments d'une ligne en un flux continu (espace entre eux).
  let text = lines.join(' ');

  // 3) tics oraux + doublons de mots consécutifs.
  text = text.replace(FILLERS, ' ');
  text = dedupeWords(text);

  // 4) normaliser espaces/ponctuation orpheline, puis reconstruire les paragraphes.
  text = tidy(text);
  if (!text) return { cleaned: '' };
  return { cleaned: toParagraphs(text) };
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
