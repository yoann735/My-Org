// Banc du chantier « boîtes & tableaux » (25/10, docs/compte-rendu-boites-tableaux.md) — image dans une boîte,
// boîte → flashcard, tablette stable, choix des pages à l'export, système de tableau.
// Vite :5199 SANS Supabase + Chrome headless 9333, base LOCALE seulement (jamais le vrai cloud).
process.env.FX = process.env.FX || '/private/tmp/claude-501/-Users-yoannlmr/6d3ea7a4-79cc-48d7-af62-c818283c9d0f/scratchpad/fx';
const { banc: bancSO } = await import('../tests-simplification-outils/commun.mjs');
export { FICHE, TITRE } from '../tests-simplification-outils/commun.mjs';
export async function banc(W = 1440, H = 900, opts = {}) {
  const b = await bancSO(W, H, opts);
  // une boîte-tableau semée (grille donnée), page 1
  b.boiteGrille = (id, grille, extra = {}) => ({ id, ficheId: 'f-simpl', page: 1, kind: 'libre', type: 'boite', x: 0.1, y: 0.1, width: 0.42, height: 0.1, couleur: 'jaune-franc', fond: 'plein', taille1000: 14, gabarit: 'carte', largeurFixe: true, grille, content: { type: 'doc', content: [{ type: 'paragraph' }] }, ...extra });
  // intercepte les téléchargements (aucun fichier écrit dans ~/Downloads) : window.__telecharges = [{ nom, taille }]
  b.intercepter = () => b.ev(`(()=>{if(window.__telecharges)return 1;window.__telecharges=[];const o=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){const u=this.href;const nom=this.download;fetch(u).then(r=>r.blob()).then(bl=>{window.__telecharges.push({nom,taille:bl.size,type:bl.type});window.__dernierBlob=bl;}).catch(()=>window.__telecharges.push({nom,taille:-1}));return;}return o.call(this)};return 1})()`);
  return b;
}

/* outils « tableau » : menu Tableau de la mini barre, cellules, sélection */
export function outilsTableau(b, sel = '.note-box.boite-tableau') {
  const T = {};
  T.box = sel;
  T.cell = (i, j) => `document.querySelector('${sel} .btab-td[data-i="${i}"][data-j="${j}"]')`;
  T.posCell = (i, j) => b.pos(T.cell(i, j), false);
  T.selTd = () => b.ev(`[...document.querySelectorAll('${sel} .btab-td.sel')].map(t=>t.dataset.i+':'+t.dataset.j).join(' ')`);
  T.focus = () => b.ev(`(()=>{const a=document.activeElement;return a&&a.classList.contains('btab-cell')?a.dataset.i+':'+a.dataset.j:null})()`);
  T.ouvrirMenu = async () => {
    if (await b.ev(`!!document.querySelector('.mt-pop')`)) return;
    const p = await b.pos(`[...document.querySelectorAll('.mini-barre [data-option="tableau"]')].find(e=>e.offsetParent)`, false);
    if (!p) throw new Error('bouton Tableau introuvable');
    await b.clic(p, { att: 400 });
  };
  T.menu = async (cle, att = 500) => {
    await T.ouvrirMenu();
    const p = await b.pos(`document.querySelector('.mt-pop [data-tab="${cle}"]')`, true);
    if (!p) throw new Error('entrée du menu introuvable : ' + cle);
    await b.clic(p, { att });
  };
  T.fermerMenu = async () => { if (await b.ev(`!!document.querySelector('.mt-pop')`)) { await b.clic(await b.pos(`[...document.querySelectorAll('.mini-barre [data-option="tableau"]')].find(e=>e.offsetParent)`, false), { att: 300 }); } };
  T.resume = () => b.ev(`(document.querySelector('.mt-pop [data-resume]')||{}).textContent||null`);
  T.debord = () => b.ev(`(()=>{const bx=document.querySelector('${sel}');const t=bx.querySelector('.btab-table');const r=bx.getBoundingClientRect(),q=t.getBoundingClientRect();return {bas:Math.round(q.bottom-r.bottom),droite:Math.round(q.right-r.right),haut:Math.round(r.top-q.top),gauche:Math.round(r.left-q.left)}})()`);
  T.clicCell = async (i, j, att = 500) => { await T.fermerMenu(); await b.clic(await T.posCell(i, j), { att }); };
  T.marge = async (quoi, k, shift = false) => { await T.fermerMenu(); const p = await b.pos(`document.querySelector('${sel} .btab-marge-${quoi}[data-${quoi}="${k}"]')`, false); if (shift) await T.shiftClic(p); else await b.clic(p, { att: 400 }); };
  // couleur d'un sélecteur ouvert depuis le menu (valeur de la grille du thème : 'cyan', 'bleufonce'…)
  T.couleur = async (cle, valeur) => {
    await T.menu(cle, 500);
    const p = await b.pos(`document.querySelector('.scw-panneau .scw-cellule[data-valeur="${valeur}"]')`, false);
    if (!p) return false;
    await b.clic(p, { att: 500 }); return true;
  };
  T.glisserSouris = async (de, a, pas = 8) => b.glisser(de, a, pas);
  T.shiftClic = async (p) => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.c.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', clickCount: 1, modifiers: 8 }); await b.dormir(300); };
  return T;
}
