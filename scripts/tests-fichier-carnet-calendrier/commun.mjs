// Banc du chantier du 17/10 (menu Fichier en sections · carnet/apprentissage depuis la révision ·
// calendrier École) — Vite :5199 SANS Supabase + Chrome headless 9333, base LOCALE seulement.
import { banc as bancBF } from '../tests-bibliotheque-fichier/commun.mjs';
export const FX = process.env.FX || '/private/tmp/claude-501/-Users-yoannlmr/674331a8-6a8d-4fc3-b297-21ed022b7f02/scratchpad/banc/fx';
export async function banc(W = 1440, H = 900, opts = {}) {
  const b = await bancBF(W, H, opts);
  // téléchargements : interceptés (nom gardé, rien n'est écrit sur le disque)
  b.pieger = () => b.ev(`(()=>{window.__dl=[];if(!window.__dlPiege){window.__dlPiege=1;const o=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__dl.push(this.download);return;}return o.call(this)}};return 1})()`);
  b.telecharges = () => b.ev(`window.__dl||[]`);
  b.ouvrirMenu = async () => { if (!(await b.ev(`!!document.querySelector('.mf-menu')`))) await b.clic(await b.pos(`document.querySelector('.mf-bouton')`, false), { att: 450 }); };
  b.fermerMenu = async () => { if (await b.ev(`!!document.querySelector('.mf-menu')`)) { await b.T.Escape(); await b.dormir(200); } };
  // { sections: [{ cle, affiche, retrait, role, nom, entrees: [{ id, label, gris, titre, kbd }] }] }
  b.lireSections = () => b.ev(`[...document.querySelectorAll('.mf-menu .mf-section')].map(s=>({cle:s.dataset.section,affiche:s.classList.contains('affiche'),retrait:s.classList.contains('en-retrait'),
    role:(s.querySelector('.mf-tete-role')||{}).textContent||'',nom:(s.querySelector('.mf-tete-nom')||{}).innerText||'',marque:!!s.querySelector('.mf-affiche'),fond:getComputedStyle(s).backgroundColor,
    entrees:[...s.querySelectorAll('[data-entree]')].map(e=>({id:e.dataset.entree,label:(e.querySelector('.mf-label')||e).innerText.trim(),gris:e.getAttribute('aria-disabled')==='true'||e.classList.contains('indispo'),titre:e.title,kbd:(e.querySelector('.mf-kbd')||{}).innerText||'',danger:e.classList.contains('danger'),
      choix:[...e.querySelectorAll('[data-choix]')].map(c=>({id:c.dataset.choix,gris:c.getAttribute('aria-disabled')==='true',titre:c.title}))}))}))`);
  // clic sur l'entrée `id` de la section `cle` (et la pastille `choix`)
  b.entree = async (cle, id, choix = null) => {
    await b.ouvrirMenu();
    const sel = `.mf-menu .mf-section[data-section=${cle}] [data-entree=${id}]` + (choix ? ` [data-choix=${choix}]` : '');
    await b.ev(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({block:'nearest'});1`);
    const p = await b.pos(`document.querySelector(${JSON.stringify(sel)})`, false);
    if (!p) return false;
    await b.clic(p, { att: 500 });
    return true;
  };
  b.vue = () => b.ev(`(()=>{const a=document.querySelector('.pdfr-jumelle-bascule .seg-btn.active');return a?a.innerText.trim():null})()`);
  b.basculer = async (lbl) => { await b.ev(`(()=>{const x=[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText.trim()===${JSON.stringify(lbl)});x&&x.click();return 1})()`); await b.dormir(1800); };
  return b;
}
