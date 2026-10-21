// Banc du chantier « réparation du lecteur » (21/10, docs/compte-rendu-pdfreader-reparation.md) — reprend le banc v3/v4.
// Vite :5199 SANS Supabase + Chrome headless 9333, base LOCALE seulement (jamais le vrai cloud).
import { banc as bancV3 } from '../tests-pdfreader-v3/commun.mjs';
import fs from 'node:fs';
export const FICHE = 'f-rep';
export const TITRE = 'Réparation lecteur';
export async function banc(W = 1440, H = 900, opts = {}) {
  const b = await bancV3(W, H, opts);
  // cours de test (une fois) : le PDF texte du banc v3
  b.preparer = async (annotations = []) => {
    const existe = await b.S(`return !!(await S.getOne('fiches',${JSON.stringify(FICHE)}))`);
    if (!existe) await b.semer(FICHE, TITRE, 'cours.pdf');
    await b.S(`for(const a of await S.getAll('annotations'))if(a.ficheId===${JSON.stringify(FICHE)})await S.remove('annotations',a.id);
      for(const r of await S.getAll('reading_position'))if(String(r.id).startsWith('rp:${FICHE}'))await S.remove('reading_position',r.id);
      for(const a of ${JSON.stringify(annotations)})await S.put('annotations',a);return 1`);
  };
  b.ouvrirCours = async ({ ipad = false, zoom = 1 } = {}) => {
    await b.biblio({ recharger: true });
    await b.ouvrir(TITRE); await b.dormir(1500);
    if (ipad) { await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true }); await b.dormir(1500); }
    await b.ev(`window.__mrZoom(${zoom});1`); await b.dormir(1200);
    await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(800);
  };
  b.page = (n = 1) => b.rect(`document.querySelector('.pdfr-page[data-cle="${n}"]')`);
  b.enBase = () => b.S(`return (await S.getAll('annotations')).filter(a=>a.ficheId===${JSON.stringify(FICHE)})`);
  // écart au pixel entre deux captures de ../cap ({ n: pixels différents, max: écart maxi sur 255 })
  b.ecart = async (n1, n2) => {
    const A = fs.readFileSync(`../cap/${n1}.png`).toString('base64'), C = fs.readFileSync(`../cap/${n2}.png`).toString('base64');
    return JSON.parse(await b.ev(`Promise.all(['${A}','${C}'].map(s=>new Promise(ok=>{const i=new Image();i.onload=()=>{const k=document.createElement('canvas');k.width=i.width;k.height=i.height;const x=k.getContext('2d');x.drawImage(i,0,0);ok(x.getImageData(0,0,i.width,i.height).data)};i.src='data:image/png;base64,'+s}))).then(([p,q])=>{let n=0,max=0;if(p.length!==q.length)return JSON.stringify({n:-1,max:-1});for(let k=0;k<p.length;k+=4){const d=Math.max(Math.abs(p[k]-q[k]),Math.abs(p[k+1]-q[k+1]),Math.abs(p[k+2]-q[k+2]));if(d>0){n++;max=Math.max(max,d)}}return JSON.stringify({n,max})})`));
  };
  b.attendreFocus = async () => { for (let i = 0; i < 25; i++) { if (await b.ev(`!!(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('.note-box .ProseMirror'))`)) return true; await b.dormir(100); } return false; };
  return b;
}
