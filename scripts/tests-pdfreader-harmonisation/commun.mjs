// Banc du chantier « harmonisation du lecteur » (21/10, docs/compte-rendu-pdfreader-harmonisation.md) — reprend le banc
// de la réparation. Vite :5199 SANS Supabase + Chrome headless 9333, base LOCALE seulement.
export { banc, FICHE, TITRE } from '../tests-pdfreader-reparation/commun.mjs';
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
/** un objet de chaque type sur la page `page` de la fiche `ficheId` (ids préfixés `o-`) */
export function objets(ficheId, page, blobId = null) {
  const base = { ficheId, page, createdAt: '2026-10-21T12:00:00.000Z' };
  return [
    { ...base, id: 'o-boite', kind: 'libre', type: 'boite', gabarit: 'mot', x: 0.05, y: 0.22, width: 0.05, height: 0.02, couleur: 'jaune-franc', fond: 'plein', content: doc('Néphron') },
    { ...base, id: 'o-texte', kind: 'texte', type: 'texte', gabarit: 'mot', x: 0.22, y: 0.22, width: 0.05, height: 0.02, couleur: 'bleu-franc', content: doc('Hile') },
    { ...base, id: 'o-question', kind: 'question', type: 'question', x: 0.38, y: 0.23 },
    { ...base, id: 'o-rect', kind: 'forme', type: 'forme', forme: 'rectangle', x: 0.05, y: 0.36, width: 0.14, height: 0.07, couleur: 'rouge-franc', epaisseur: 0.0025 },
    { ...base, id: 'o-ellipse', kind: 'forme', type: 'forme', forme: 'ellipse', x: 0.24, y: 0.36, width: 0.12, height: 0.08, couleur: 'vert-franc', epaisseur: 0.0025 },
    { ...base, id: 'o-triangle', kind: 'forme', type: 'forme', forme: 'triangle', x: 0.05, y: 0.5, width: 0.12, height: 0.08, couleur: 'violet-franc', epaisseur: 0.0025 },
    { ...base, id: 'o-fleche', kind: 'forme', type: 'forme', forme: 'fleche', x: 0.22, y: 0.52, width: 0.2, height: 0.05, couleur: 'bleu-franc', epaisseur: 0.0012, fleche: { geo: 3 } },
    { ...base, id: 'o-ligne', kind: 'forme', type: 'forme', forme: 'ligne', x: 0.05, y: 0.66, width: 0.2, height: 0.0, couleur: 'noir', epaisseur: 0.0012, fleche: { geo: 3 } },
    { ...base, id: 'o-trait', kind: 'trait', type: 'trait', mode: 'dessin', rendu: 'cr', couleur: 'rose-franc', epaisseur: 0.0042, opacite: 1,
      points: Array.from({ length: 20 }, (_, i) => [+(0.27 + i * 0.008).toFixed(4), +(0.67 + 0.015 * Math.sin(i / 2)).toFixed(4)]) },
    ...(blobId ? [{ ...base, id: 'o-image', kind: 'image', type: 'image', blobId, x: 0.05, y: 0.76, width: 0.16, height: 0.1, z: 0, nom: 'test.png' }] : []),
  ];
}
/** une petite image PNG enregistrée comme blob de la base locale (dégradé + texte) : son id */
export async function blobImage(b) {
  return b.S(`const c=document.createElement('canvas');c.width=360;c.height=200;const x=c.getContext('2d');const g=x.createLinearGradient(0,0,360,200);g.addColorStop(0,'#7c5cff');g.addColorStop(1,'#00c853');x.fillStyle=g;x.fillRect(0,0,360,200);x.fillStyle='#fff';x.font='bold 40px sans-serif';x.fillText('Rein',120,115);
    const bl=await new Promise(ok=>c.toBlob(ok,'image/png'));return await S.putBlob(bl);`);
}
