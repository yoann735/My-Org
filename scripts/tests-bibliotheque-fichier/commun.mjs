// Banc du chantier « tris de la Bibliothèque · menu Fichier unique » (15/10)
import { banc as bancJ } from '../tests-fiche-jumelle/commun.mjs';
export async function banc(W = 1440, H = 900, opts = {}) {
  const b = await bancJ(W, H, opts);
  await b.c.send('Network.setCacheDisabled', { cacheDisabled: true });
  // MedRevise › Bibliothèque, lecteur fermé (sans recharger si déjà là)
  b.biblio = async ({ recharger = false } = {}) => {
    const c = b.c;
    if (recharger) { await c.send('Page.reload', { ignoreCache: true }); await c.dormir(4500); }
    const app = await c.ev(`document.body.innerText.includes('Choisis ton espace') ? 'hub' : document.body.innerText.includes('PLANNING REPAS') ? 'mealweek' : 'medrevise'`);
    if (app === 'mealweek') { await c.ev(`[...document.querySelectorAll('button')].find(b=>/Retour à l.accueil|Changer d.app/.test(b.title||b.getAttribute('aria-label')||''))?.click();1`); await c.dormir(1200); }
    if (await c.ev(`document.body.innerText.includes('Choisis ton espace')`)) { await c.ev(`[...document.querySelectorAll('.hub-card')].find(b=>/^\\s*MedRevise/i.test(b.innerText))?.click();1`); await c.dormir(1500); }
    await c.ev(`(()=>{const b=[...document.querySelectorAll('.sb-item, .sidebar [role=button], .sidebar button, .sidebar a')].find(e=>/Biblioth/.test(e.innerText||e.title||''));b&&b.click();return 1})()`); await c.dormir(1000);
    await c.ev(`(()=>{const r=[...document.querySelectorAll('button')].find(b=>(b.title||'')==='Revenir à la liste'||b.getAttribute('aria-label')==='Retour');r&&r.click();return 1})()`); await c.dormir(700);
  };
  b.trier = async (libelle) => {
    await b.clic(await b.pos(`document.querySelector('.lib-tri-bouton')`, false), { att: 300 });
    const p = await b.pos(`[...document.querySelectorAll('.ctx-menu-item')].find(x=>x.innerText.trim()===${JSON.stringify(libelle)})`, false);
    await b.clic(p, { att: 500 });
  };
  b.affichage = async (lbl) => { await b.clic(await b.pos(`[...document.querySelectorAll('.lib-modes .seg-btn')].find(x=>x.innerText.trim()===${JSON.stringify(lbl)})`, false), { att: 600 }); };
  // les fiches affichées, dans l'ordre (arbre, liste plate, grille ou liste)
  b.fiches = () => b.ev(`[...document.querySelectorAll('.lt-fiche .lt-nom, .lv-carte-titre, .lv-ligne:not(.lv-entete) .lv-col-titre .lv-texte')].map(e=>e.innerText.replace(/\\s*fiche$/,'').trim())`);
  b.metas = () => b.ev(`[...document.querySelectorAll('.lib-tri-meta')].map(e=>e.innerText.trim())`);
  return b;
}
