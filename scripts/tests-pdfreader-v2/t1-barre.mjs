// Barre de mise en forme : 20 bascules texte <-> outil d'annotation, présence de la barre à chaque fois
import { banc } from './commun-doc.mjs';
const b = await banc(+(process.argv[2] || 1440), +(process.argv[3] || 900));
const SEL = process.env.SEL || '.pdfr-edit-toolbar';
const visible = () => b.ev(`(()=>{const e=document.querySelector(${JSON.stringify(SEL)});if(!e)return false;const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return r.height>10&&cs.visibility!=='hidden'&&+cs.opacity>0.5&&!e.closest('[aria-hidden=true]')})()`);
const pTexte = async (i) => b.ev(`(()=>{const ps=[...document.querySelectorAll('.pt-flux p, .pt-zone p')];const p=ps[${'${i}'}%ps.length]||ps[0];const r=p.getBoundingClientRect();return [r.x+30+(${'${i}'}*13)%200,r.y+8]})()`.replace(/\$\{i\}/g, 0));
const outil = (nom) => b.bouton(nom);
let manques = 0, sauts = 0; const det = [];
const haut0 = await b.ev(`document.querySelector('.pdfr-scroll').getBoundingClientRect().top`);
for (let k = 0; k < 20; k++) {
  const pts = await b.ev(`(()=>{const ps=[...document.querySelectorAll('.pt-flux p, .pt-zone p')].filter(p=>{const r=p.getBoundingClientRect();return r.top>200&&r.bottom<850});const p=ps[${k}%ps.length];const r=p.getBoundingClientRect();return [r.x+40+(${k}*17)%300,r.y+10]})()`);
  await b.clic(pts, { att: 350 });
  // second clic dans le texte, déjà focalisé (cas du bug)
  if (k % 2) { await b.clic([pts[0] + 60, pts[1]], { att: 350 }); }
  const v = await visible();
  if (!v) { manques++; det.push('manquée au tour ' + (k + 1)); }
  const top = await b.ev(`document.querySelector('.pdfr-scroll').getBoundingClientRect().top`);
  if (Math.abs(top - haut0) > 1) { sauts++; det.push(`saut ${top - haut0}px tour ${k + 1}`); }
  // outil d'annotation (crayon) puis retour à Sélection
  await b.clic(await outil('Crayon'), { att: 300 });
  const v2 = await visible();
  if (v2) det.push('encore visible avec Crayon tour ' + (k + 1));
  await b.clic(await outil('Sélection'), { att: 300 });
}
b.ok(manques === 0, '20 bascules : barre présente à chaque clic dans le texte', manques + ' manquée(s) ' + det.join(' ; '));
b.ok(sauts === 0, 'aucun saut du contenu', sauts + ' saut(s)');
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
