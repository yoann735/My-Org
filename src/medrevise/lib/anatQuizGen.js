/* ============================================================
   MedRevise — génération LOCALE des cartes de THÉORIE d'un schéma
   (mode « Théorie seule »). 100 % local, AUCUNE IA.

   À partir des coches qui portent des champs (théorie intrinsèque, cf. refonte),
   pour CHAQUE (coche × champ non vide) :
   - une FLASHCARD est TOUJOURS générée (recto question / verso valeur) ;
   - un QCM est ajouté EN PLUS si l'on dispose d'assez de DISTRACTEURS = valeurs du
     MÊME champ chez d'AUTRES coches du MÊME type (jamais inventés). Les flashcards
     ne sont donc jamais remplacées par des QCM : on révise les deux formats.
   Items ÉPHÉMÈRES (ephemeral:true) : joués dans la session existante mais JAMAIS
   persistés / planifiés SM-2 (aucun impact sur la méthode des J).
   Pas de Feynman en anatomie.
   ============================================================ */
import { champsFor } from './anatParse.js';
import { normalizeAnat } from './anatMatch.js';

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** coches réellement porteuses de théorie (type + au moins un champ rempli). */
export function theoryCoches(coches) {
  return (coches || []).filter((c) => c.type && c.champs && champsFor(c.type).some((d) => (c.champs[d.key] || '').trim()));
}

/** nombre de coches avec théorie (pour l'UI de lancement). */
export function theoryCount(coches) { return theoryCoches(coches).length; }

/**
 * Génère les items éphémères (qcm/flashcard) de la théorie d'un schéma.
 * @param fiche  la fiche anat_schema (pour ficheId → matière/couleur en session)
 * @param coches ses coches
 * @returns items[] prêts pour ctx.startSession(items, title, { ephemeral:true })
 */
export function genTheoryItems(fiche, coches) {
  const tcs = theoryCoches(coches);

  // pool de valeurs par (type|champ) → sert de vivier de distracteurs.
  const pool = {};
  tcs.forEach((c) => champsFor(c.type).forEach((d) => {
    const v = (c.champs[d.key] || '').trim();
    if (!v) return;
    (pool[c.type + '|' + d.key] || (pool[c.type + '|' + d.key] = [])).push({ cocheId: c.id, value: v, norm: normalizeAnat(v) });
  }));

  const items = [];
  let n = 0;
  tcs.forEach((c) => {
    champsFor(c.type).forEach((d) => {
      const v = (c.champs[d.key] || '').trim();
      if (!v) return;
      const label = d.label;
      const enonce = `${c.texte || 'Structure'} — ${label} ?`;
      const vNorm = normalizeAnat(v);

      // distracteurs : même type + même champ, autres coches, valeur normalisée distincte
      const seen = new Set([vNorm]);
      const distractors = [];
      for (const o of shuffle(pool[c.type + '|' + d.key] || [])) {
        if (o.cocheId === c.id || seen.has(o.norm)) continue;
        seen.add(o.norm); distractors.push(o.value);
        if (distractors.length >= 3) break;
      }

      // FLASHCARD — TOUJOURS générée (recto = question, verso = valeur du champ).
      items.push({
        id: 'th-f-' + n, ephemeral: true, ficheId: fiche.id, type: 'flashcard',
        theme: c.texte || label, recto: enonce, verso: v, interval: 0,
      });

      // QCM — EN PLUS de la flashcard, seulement si assez de distracteurs RÉELS
      // (valeurs du même champ chez d'autres structures du même type). Jamais inventés.
      if (distractors.length >= 2) {
        const built = shuffle([{ t: v, ok: true }, ...distractors.map((t) => ({ t, ok: false }))]);
        const options = built.map((o, i) => ({ id: 'o' + i, texte: o.t }));
        const reponses_correctes = built.map((o, i) => (o.ok ? 'o' + i : null)).filter(Boolean);
        items.push({
          id: 'th-q-' + n, ephemeral: true, ficheId: fiche.id, type: 'qcm',
          theme: c.texte || label, enonce, options, reponses_correctes, multiple: false,
          explication: `${label} : ${v}.`, interval: 0,
        });
      }
      n++;
    });
  });
  return items;
}
