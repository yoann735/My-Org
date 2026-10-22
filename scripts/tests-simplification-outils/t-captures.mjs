// Captures AVANT / APRÈS (même script sur l'ancien et le nouveau code) : node t-captures.mjs <avant|apres>
//   barre d'outils + rangée, surlignage d'une ligne, boîte sélectionnée et en édition, sélecteur de taille, tableau vide.
import { banc, FICHE } from './commun.mjs';
const v = process.argv[2] || 'apres';
const b = await banc();
const BOITE = { id: 'so-boite', ficheId: FICHE, kind: 'libre', type: 'boite', page: 1, x: 0.55, y: 0.62, width: 0.3, height: 0.08, couleur: 'jaune-franc', fond: 'plein', gabarit: 'carte',
  taille1000: 18, tailleTexte: 1.8, bord1000: 1.5, pad1000: [10, 8], content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Néphron : unité fonctionnelle' }] }] }, createdAt: '2026-10-22T08:00:00.000Z' };
await b.preparer({ annotations: [BOITE] });
await b.ouvrirCours();
const page = await b.rect(`document.querySelector('.pdfr-page[data-cle="1"]')`);
// 1) barre + rangée
{ const r1 = await b.rect(`document.querySelector('.pdfr-barre')`), r2 = await b.rect(`document.querySelector('.pdfr-contexte')`);
  await b.capture(`so-${v}-barre`, { x: Math.round(r1.x - 6), y: Math.round(r1.y - 6), width: Math.round(Math.max(r1.r, r2 ? r2.r : 0) - r1.x + 12), height: Math.round((r2 ? r2.b : r1.b) - r1.y + 12) }); }
// 2) surlignage : outil Surligneur, glisser sur la 2e puce (« Capsule fibreuse, cortex et médullaire »)
await b.ev(`(()=>{const x=[...document.querySelectorAll('.ptb-outil')].find(e=>(e.title||'').startsWith('Surligneur'));x.click();return 1})()`); await b.dormir(400);
const ligne = await b.ev(`(()=>{const sp=[...document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-textlayer span')].filter(s=>/Capsule|médullaire/.test(s.textContent));const a=sp[0].getBoundingClientRect(),z=sp[sp.length-1].getBoundingClientRect();return [a.left+1,a.top+a.height/2,z.right-1,z.top+z.height/2]})()`);
await b.glisser([ligne[0], ligne[1]], [ligne[2], ligne[3]], 14); await b.dormir(700);
await b.ev(`window.getSelection().removeAllRanges();1`);
await b.ev(`(()=>{const x=[...document.querySelectorAll('.ptb-outil')].find(e=>(e.title||'').startsWith('Sélection'));x.click();return 1})()`); await b.dormir(500);
await b.capture(`so-${v}-surlignage`, { x: Math.round(ligne[0] - 30), y: Math.round(ligne[1] - 22), width: Math.round(ligne[2] - ligne[0] + 60), height: 44 });
const rects = await b.ev(`[...document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-hlayer .pdfr-hl-rect')].map(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {x:Math.round(r.x),w:Math.round(r.width),h:+r.height.toFixed(1),rayon:c.borderTopLeftRadius,op:c.opacity,mix:c.mixBlendMode}})`);
console.log('rectangles du surlignage :', JSON.stringify(rects));
// 3) boîte sélectionnée (un clic) : sa mini barre
const pb = await b.pos(`document.querySelector('[data-boite="so-boite"]')`, false);
await b.clic(pb, { att: 600 });
const zone = { x: Math.round(page.x + page.w * 0.25), y: Math.round(page.y + page.h * 0.45), width: Math.round(page.w * 0.75), height: Math.round(page.h * 0.3) };
await b.capture(`so-${v}-boite-selectionnee`, zone);
// 4) en édition (2e clic) : ancien code = grande barre de format au-dessus de la diapo
await b.clic(pb, { att: 900 });
const hautBarre = await b.rect(`document.querySelector('.pdfr-barre')`);
await b.capture(`so-${v}-boite-edition`, { x: Math.round(page.x - 10), y: Math.round(hautBarre.y - 6), width: Math.round(page.w + 20), height: Math.round(page.y + page.h * 0.8 - hautBarre.y) });
// 5) sélecteur de taille ouvert
await b.clic(await b.pos(`[...document.querySelectorAll('.mini-barre .ct-bouton')].find(e=>e.offsetParent)`, false), { att: 500 });
{ const r = await b.rect(`document.querySelector('.ct-pop')`), rb = await b.rect(`[...document.querySelectorAll('.mini-barre .ct-bouton')].find(e=>e.offsetParent)`);
  if (r) { const x0 = Math.min(r.x, rb.x) - 10, y0 = Math.min(r.y, rb.y) - 10; await b.capture(`so-${v}-taille`, { x: Math.round(x0), y: Math.round(y0), width: Math.round(Math.max(r.r, rb.r) - x0 + 10), height: Math.round(Math.max(r.b, rb.b) - y0 + 10) });
    console.log('panneau de taille :', JSON.stringify({ w: Math.round(r.w), h: Math.round(r.h) }), 'bouton :', await b.ev(`(()=>{const e=[...document.querySelectorAll('.mini-barre .ct-bouton')].find(e=>e.offsetParent);return {texte:e.innerText,titre:e.title,w:Math.round(e.getBoundingClientRect().width)}})()`)); } }
await b.T.Escape(); await b.T.Escape(); await b.dormir(300);
// 6) tableau vide (disposition Tableau)
await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-dispo button, .seg-btn, button')].find(e=>/^Tableau$/.test(e.innerText.trim()))`, false), { att: 1800 });
{ const r = await b.rect(`document.querySelector('.tb2-vue')`); if (r) await b.capture(`so-${v}-tableau-vide`, { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.w), height: Math.round(Math.min(r.h, 700)) }); }
console.log('message du tableau vide :', JSON.stringify(await b.ev(`(document.querySelector('.tb2-vide-tableau')||{}).innerText||null`)));
await b.ev(`localStorage.setItem('medrevise.disposition.${FICHE}','pdf');1`);
console.log('erreurs', b.erreurs);
process.exit(0);
