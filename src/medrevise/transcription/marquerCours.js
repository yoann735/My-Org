/* ============================================================
   MedRevise — LA TRANSCRIPTION MARQUE LE COURS (29/10, docs/compte-rendu-transcription-marque-cours.md).
   « Transcrire le cours » avec la case « Marquer le début du cours sur la page N » (cochée par défaut) :
     - au démarrage : tag Début sur la page affichée, lié à la session (lib/tagsPages.js#poserTag, comme à la main) ;
     - quand CETTE session s'arrête (n'importe quel bouton « Arrêter ») : tag Fin sur la page affichée du MÊME document.
   Mémoire de l'appareil (`medrevise.trx.finAuto.<cours>` = { sid, doc, debutId }) : survit à un rechargement ou une
   reprise. Les tags sont ceux d'avant (même store, mêmes champs), modifiables et retirables à la main.
   Logique pure, dépendances injectées (testée sans audio : tests/transcription-marque/marquerCours.test.js) ;
   le lecteur (pdf/PdfReader.jsx) branche les vraies fonctions.
   ============================================================ */

export const cleFinAuto = (courseId) => 'medrevise.trx.finAuto.' + courseId;
const lire = (stockage, cle) => { try { return JSON.parse(stockage.getItem(cle) || 'null'); } catch (e) { return null; } };

/** pose le Début sur la page affichée `page` = { page, cle, doc } ; retient de quoi poser la Fin. → tag posé */
export async function marquerDebutCours({ courseId, page, sessionId, tags, poserTag, modifierTag = null, stockage }) {
  if (!courseId || !page || !page.page) return null;
  const doc = page.doc || 'original';
  // un Début déjà posé sur CETTE page (même sans clé de page, ex. un ancien tag) est réutilisé : jamais de doublon
  const deja = modifierTag && (tags || []).find((x) => x && !x.supprime && x.courseId === courseId && x.kind === 'debut' && (x.document || 'original') === doc
    && ((page.cle != null && x.pageCle != null && String(x.pageCle) === String(page.cle)) || +x.page === +page.page));
  const t = deja
    ? await modifierTag(deja, { transcriptSessionId: sessionId || null })
    : await poserTag({ courseId, document: doc, page: page.page, pageCle: page.cle, kind: 'debut', transcriptSessionId: sessionId || null }, tags);
  try { stockage.setItem(cleFinAuto(courseId), JSON.stringify({ sid: sessionId || null, doc: page.doc || 'original', debutId: t && t.id })); } catch (e) { /* mode privé : pas de fin automatique */ }
  return t;
}

const EN_COURS = new Set(['live', 'paused', 'stopping', 'starting']);

/** écouteur des états du moteur (engine.js#abonner) : pose la Fin quand la session marquée s'arrête.
    `phaseInitiale` : la phase au moment de l'abonnement. `onAvis(texte)` : message à afficher. */
export function suiveurArret({ courseId, phaseInitiale, lirePage, lireTags, poserTag, modifierTag, stockage, onAvis = () => {} }) {
  let avant = phaseInitiale;
  return async (e) => {
    const etaitEnCours = EN_COURS.has(avant);
    avant = e && e.phase;
    if (!e || !etaitEnCours || e.phase !== 'idle' || e.courseId !== courseId) return null;
    const fa = lire(stockage, cleFinAuto(courseId));
    if (!fa || (e.derniereFinie && fa.sid && e.derniereFinie !== fa.sid)) return null; // pas posé par le direct, ou une autre session
    try { stockage.removeItem(cleFinAuto(courseId)); } catch (x) { /* ignore */ }
    // session vide (rien n'a été dit) : non enregistrée → le Début ne pointe vers aucune session
    if (!e.derniereFinie && fa.debutId) { const d = (lireTags() || []).find((t) => t.id === fa.debutId); if (d) await modifierTag(d, { transcriptSessionId: null }); }
    const p = lirePage();
    if (!p || !p.page || (p.doc || 'original') !== fa.doc) { onAvis('Fin du cours non marquée (autre document affiché) — pose-la à la main si besoin'); return null; }
    const t = await poserTag({ courseId, document: fa.doc, page: p.page, pageCle: p.cle, kind: 'fin', transcriptSessionId: e.derniereFinie || null }, lireTags());
    onAvis(`Fin du cours marquée page ${p.page}`);
    return t;
  };
}
