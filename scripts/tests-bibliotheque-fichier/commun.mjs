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
    // (17/10) bouton « Trier » de la rangée en tête du panneau (.lib-barre-tri)
    await b.clic(await b.pos(`document.querySelector('.lib-barre-tri')`, false), { att: 300 });
    const p = await b.pos(`[...document.querySelectorAll('.ctx-menu-item')].find(x=>x.innerText.trim()===${JSON.stringify(libelle)})`, false);
    await b.clic(p, { att: 500 });
  };
  b.affichage = async (lbl) => { await b.clic(await b.pos(`[...document.querySelectorAll('.lib-modes .seg-btn')].find(x=>x.innerText.trim()===${JSON.stringify(lbl)})`, false), { att: 600 }); };
  // les fiches affichées, dans l'ordre (arbre, liste plate, grille ou liste)
  b.fiches = () => b.ev(`[...document.querySelectorAll('.lt-fiche .lt-nom, .lv-carte-titre, .lv-ligne:not(.lv-entete) .lv-col-titre .lv-texte')].map(e=>e.innerText.replace(/\\s*fiche$/,'').trim())`);
  b.metas = () => b.ev(`[...document.querySelectorAll('.lib-tri-meta')].map(e=>e.innerText.trim())`);
  // (17/10) arbre trié : { titre → date affichée sous la fiche } et fiches de chaque dossier / matière, dans l'ordre
  b.dates = () => b.ev(`Object.fromEntries([...document.querySelectorAll('.lt-fiche')].map(e=>{const n=e.querySelector('.lt-nom');return [n.firstChild.textContent.trim(),(e.querySelector('.lt-date')||{}).textContent||'']}))`);
  b.seaux = () => b.ev(`(()=>{const m=new Map();document.querySelectorAll('.lt-fiche').forEach(e=>{const c=e.closest('.lt-enfants');if(!m.has(c))m.set(c,[]);m.get(c).push(e.querySelector('.lt-nom').firstChild.textContent.trim())});return [...m.values()]})()`);
  b.seauDe = async (titre) => (await b.seaux()).find((l) => l.includes(titre)) || [];
  // assemble des captures côte à côte (canvas dans la page du banc) → ../cap/<sortie>.png
  b.assembler = async (noms, sortie, legendes = [], vertical = false) => {
    const fs = await import('fs');
    const imgs = noms.map((n) => 'data:image/png;base64,' + fs.readFileSync(`../cap/${n}.png`).toString('base64'));
    const out = await b.ev(`(async()=>{const srcs=${JSON.stringify(imgs)},leg=${JSON.stringify(legendes)};
      const im=await Promise.all(srcs.map(s=>new Promise(ok=>{const i=new Image();i.onload=()=>ok(i);i.src=s;})));
      const G=16,T=leg.length?30:0,V=${JSON.stringify(vertical)};
      const W=V?Math.max(...im.map(i=>i.width))+G*2:im.reduce((a,i)=>a+i.width,0)+G*(im.length+1);
      const H=V?im.reduce((a,i)=>a+i.height+T,0)+G*(im.length+1):Math.max(...im.map(i=>i.height))+G*2+T;
      const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.fillStyle='#0b0b0f';x.fillRect(0,0,W,H);
      let px=G,py=G;im.forEach((i,k)=>{x.fillStyle='#c8c8d0';x.font='600 15px system-ui';if(leg[k])x.fillText(leg[k],px,py+16);x.drawImage(i,px,py+T);if(V)py+=i.height+T+G;else px+=i.width+G;});
      return c.toDataURL('image/png').split(',')[1];})()`);
    fs.writeFileSync(`../cap/${sortie}.png`, Buffer.from(out, 'base64'));
  };
  return b;
}
