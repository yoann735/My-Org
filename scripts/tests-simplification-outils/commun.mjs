// Banc du chantier « simplification des outils » (22/10, docs/compte-rendu-simplification-outils.md).
// Vite :5199 SANS Supabase + Chrome headless 9333, base LOCALE seulement (jamais le vrai cloud).
// Reprend le banc « réparation » (cours de test, ouverture, captures) avec un cours à lui.
import { banc as bancR } from '../tests-pdfreader-reparation/commun.mjs';
import fs from 'node:fs';
export const FICHE = 'f-simpl';
export const TITRE = 'Simplification outils';
export async function banc(W = 1440, H = 900, opts = {}) {
  const b = await bancR(W, H, opts);
  // cours de test : le PDF texte du banc v3 ; annotations et tableau remis à zéro, puis `annotations` / `surlignages` semés
  b.preparer = async ({ annotations = [], surlignages = [], tableau = true } = {}) => {
    const existe = await b.S(`return !!(await S.getOne('fiches',${JSON.stringify(FICHE)}))`);
    if (!existe) await b.semer(FICHE, TITRE, 'cours.pdf');
    await b.S(`for(const st of ['annotations','highlights'])for(const a of await S.getAll(st))if(a.ficheId===${JSON.stringify(FICHE)})await S.remove(st,a.id);
      for(const r of await S.getAll('reading_position'))if(String(r.id).startsWith('rp:${FICHE}'))await S.remove('reading_position',r.id);
      ${tableau ? `await S.remove('board','board:${FICHE}').catch(()=>{});` : ''}
      for(const a of ${JSON.stringify(annotations)})await S.put('annotations',a);
      for(const h of ${JSON.stringify(surlignages)})await S.put('highlights',h);return 1`);
    await b.ev(`localStorage.setItem('medrevise.disposition.${FICHE}','pdf');localStorage.removeItem('medrevise.focus.notes');localStorage.removeItem('medrevise.modeGomme');1`);
  };
  b.ouvrirCours = async ({ tablette = false, zoom = 1 } = {}) => {
    await b.biblio({ recharger: true });
    await b.ouvrir(TITRE); await b.dormir(1500);
    if (tablette) {
      await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true });
      await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await b.dormir(1500);
    }
    await b.ev(`window.__mrZoom(${zoom});1`); await b.dormir(1200);
    await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(800);
  };
  b.enBase = () => b.S(`return (await S.getAll('annotations')).filter(a=>a.ficheId===${JSON.stringify(FICHE)})`);
  b.surlignagesEnBase = () => b.S(`return (await S.getAll('highlights')).filter(a=>a.ficheId===${JSON.stringify(FICHE)})`);
  b.board = () => b.S(`return await S.getOne('board','board:${FICHE}')`);
  // outil de la barre (6 outils) par son data-outil ; sous-outil de la sous-barre par son data-sous-outil
  b.outil6 = async (id) => { await b.clic(await b.pos(`document.querySelector('[data-outil="${id}"]')`, false), { att: 300 }); };
  b.sousOutil = async (id) => { await b.clic(await b.pos(`document.querySelector('[data-sous-outil="${id}"]')`, false), { att: 300 }); };
  // option d'une mini barre visible (data-option), ou d'un menu « … » ouvert
  b.option = (cle) => `[...document.querySelectorAll('.mini-barre [data-mb="${cle}"] button, .mini-barre [data-option="${cle}"]')].find(e=>e.offsetParent)`;
  b.cliqueOption = async (cle, att = 400) => { const p = await b.pos(b.option(cle), false); if (!p) throw new Error('option introuvable : ' + cle); await b.clic(p, { att }); };
  // (25/10, docs/compte-rendu-boites-tableaux.md §5) + ligne, + colonne, − ligne, − colonne, en-tête sont dans le MENU TABLEAU
  // de la mini barre : `b.tableau(cle)` l'ouvre et clique l'entrée (data-tab) ; `b.margeTableau('lig'|'col', k)` sélectionne une ligne / colonne
  b.tableau = async (cle, att = 600) => {
    if (!(await b.ev(`!!document.querySelector('.mt-pop')`))) await b.clic(await b.pos(`[...document.querySelectorAll('.mini-barre [data-option="tableau"]')].find(e=>e.offsetParent)`, false), { att: 400 });
    const p = await b.pos(`document.querySelector('.mt-pop [data-tab="${cle}"]')`, true);
    await b.clic(p, { att });
    const q = await b.pos(`(document.querySelector('.mt-pop')&&[...document.querySelectorAll('.mini-barre [data-option="tableau"]')].find(e=>e.offsetParent))||null`, false);
    if (q) await b.clic(q, { att: 300 }); // referme
    else console.log('(menu Tableau déjà refermé ; mini barre :', await b.ev(`document.querySelectorAll('.mini-barre').length`), ')');
  };
  b.margeTableau = async (quoi, k, boite = '.btab') => { await b.clic(await b.pos(`document.querySelector('${boite} .btab-marge-${quoi}[data-${quoi}="${k}"]')`, false), { att: 400 }); };
  b.optionsBarre = () => b.ev(`(()=>{const m=[...document.querySelectorAll('.mini-barre')].filter(e=>e.offsetParent&&getComputedStyle(e).visibility!=='hidden');return m.map(x=>[...x.children].map(c=>c.classList.contains('mb-sep')?'|':c.classList.contains('mb-plus')?'…':(c.getAttribute('data-mb')||c.getAttribute('data-option')||(c.querySelector('[data-option]')||{}).getAttribute?.('data-option')||c.getAttribute('aria-label')||c.title||c.className)))})()`);
  b.optionsPlus = () => b.ev(`[...document.querySelectorAll('.mb-plus-pop [data-option]')].map(e=>e.getAttribute('data-option')+' : '+(e.querySelector('.mb-plus-lib')||e).innerText.trim())`);
  b.capRect = async (nom, js, marge = 8) => { const r = await b.rect(js); if (!r) return false; await b.capture(nom, { x: Math.max(0, Math.round(r.x - marge)), y: Math.max(0, Math.round(r.y - marge)), width: Math.round(r.w + 2 * marge), height: Math.round(r.h + 2 * marge) }); return true; };
  b.png = (nom) => fs.readFileSync(`../cap/${nom}.png`);
  return b;
}
