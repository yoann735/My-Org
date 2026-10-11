// Finitions boîtes / barre latérale (11/10) — sur le profil de TEST (A, 9335) : 4 boîtes sur la page 1
// du cours « Myologie — membre supérieur » (seed de tests-apprentissage-libre) : 3 avec une version IA
// (petite, moyenne, grande), 1 sans. Les textes IA passent par avecTexteAlt (le chemin de l'import).
import { appareil } from '../tests-collage/outils.mjs';
const A = await appareil(9335);
const r = await A.ev(`(async () => {
  const st = ${A.st};
  const T = await import('/src/medrevise/lib/textesAnnotations.js');
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
  const vieux = (await st.getAll('annotations')).filter((a) => a.ficheId === 'fMyo');
  for (const a of vieux) await st.remove('annotations', a.id);
  const b = (id, x, y, w, h, texte, ia, couleur) => {
    const base = { ...st.newNoteBox({ ficheId: 'fMyo', page: 1, x, y, width: w, height: h, couleur, fond: 'teinte', content: doc(texte) }), id };
    return ia ? T.avecTexteAlt(base, ia) : base;
  };
  const boites = [
    b('anPetite', 0.08, 0.16, 0.16, 0.05, 'Biceps', 'Biceps brachial', 'ambre'),
    b('anMoyenne', 0.36, 0.16, 0.30, 0.10, 'Le biceps fléchit le coude et supine l’avant-bras.', 'Biceps : flexion du coude, supination de l’avant-bras (n. musculo-cutané).', 'bleu'),
    b('anGrande', 0.08, 0.40, 0.62, 0.22, 'Loge antérieure du bras : biceps brachial, brachial, coraco-brachial. Tous innervés par le nerf musculo-cutané, issu du faisceau latéral du plexus brachial.', 'Loge antérieure : biceps, brachial, coraco-brachial — nerf musculo-cutané (faisceau latéral du plexus brachial). Fléchisseurs du coude.', 'vert'),
    b('anSimple', 0.72, 0.16, 0.20, 0.08, 'Triceps : extenseur du coude.', null, 'rose'),
  ];
  await st.putMany('annotations', boites);
  return boites.map((x) => x.id + ':' + (x.displayVersion || '-'));
})()`);
console.log('boîtes', r, A.erreurs);
A.fermer();
