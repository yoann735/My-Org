// Banc du chantier « lecteur v3 » (20/10, docs/compte-rendu-pdfreader-v3.md) — Vite :5199 SANS Supabase
// + Chrome headless 9333, base LOCALE seulement (jamais le vrai cloud). Reprend le banc du 17/10.
import { banc as bancN } from '../tests-import-tableau-nettete/commun.mjs';
import fs from 'node:fs';
export const FX = process.env.FX || '/private/tmp/claude-501/-Users-yoannlmr/e0f88ca9-d61e-4d20-8846-e97d1d544ded/scratchpad/fx';
export async function banc(W = 1440, H = 900, opts = {}) {
  const b = await bancN(W, H, opts);
  // sème un cours PDF (fichier de FX) dans la base locale du banc
  b.semer = (id, titre, fichier) => b.S(`const bin=atob(${JSON.stringify(fs.readFileSync(FX + '/' + fichier).toString('base64'))});const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
    await S.put('sources',{id:'src-v3',nom:'Source v3',couleur:'#7c5cff'});await S.put('matieres',{id:'mat-v3',nom:'Lecteur v3 test',sourceId:'src-v3'});
    const pdfId=await S.putBlob(new Blob([a],{type:'application/pdf'}));
    await S.put('fiches',{id:${JSON.stringify(id)},matiereId:'mat-v3',dossierId:null,titre:${JSON.stringify(titre)},type:'standard',pdfId,pdfName:${JSON.stringify(fichier)},dateImport:'2026-10-20'});return pdfId;`);
  // outil de la barre par son libellé (aria-label en tablette, title sinon)
  b.outil = async (label) => { const p = await b.pos(`[...document.querySelectorAll('.ptb-outil, .tab-outil')].find(x=>(x.getAttribute('aria-label')||x.title||'').startsWith(${JSON.stringify(label)}))`, false); await b.clic(p, { att: 250 }); };
  b.zoomPct = () => b.ev(`(document.querySelector('.tab-zoom, .ptb-zoom .hint')||{}).innerText||''`);
  // fait défiler le lecteur jusqu'à la page de clé n (pages virtualisées : on avance par écrans jusqu'à ce qu'elle soit montée)
  b.allerPage = async (n, marge = 6) => {
    for (let i = 0; i < 40; i++) {
      const fait = await b.ev(`(()=>{const p=document.querySelector('.pdfr-page[data-cle="${n}"]');const s=document.querySelector('.pdfr-scroll');if(p){s.scrollTop+=p.getBoundingClientRect().top-s.getBoundingClientRect().top-${marge};return true}
        const vus=[...document.querySelectorAll('.pdfr-page[data-cle]')].map(e=>+e.dataset.cle).filter(Number.isFinite);const max=Math.max(...vus,0);s.scrollTop+=(${n}>max?1:-1)*s.clientHeight*0.8;return false})()`);
      await b.dormir(fait ? 700 : 250);
      if (fait) return true;
    }
    return false;
  };
  b.png = (nom) => fs.readFileSync(`../cap/${nom}.png`);
  return b;
}
