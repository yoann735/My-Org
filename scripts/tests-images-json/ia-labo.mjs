// prépare l'export spécial IA dans la page (mêmes modules que l'app) et rend des PNG de comparaison
// node ia-labo.mjs page|cours
import { connecter } from './cdp.mjs';
import fs from 'fs';
const c = await connecter();
const portee = process.argv[2] || 'page';
const r = await c.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const imp=(f)=>import(u.find(n=>n.includes(f)));
const S=await imp('/medrevise/lib/storage.js');const X=await imp('/medrevise/pdf/exportIA.js');const A=await imp('/medrevise/pdf/exportAnnote.js');const P=await imp('/medrevise/pdf/pdfjsSetup.js');
const fiche=await S.getOne('fiches','ia-12');const ann=(await S.getAll('annotations')).filter(a=>a.ficheId==='ia-12');const hl=(await S.getAll('highlights')).filter(h=>h.ficheId==='ia-12');
const ordre=[1,2,3,4,5,6,7,8,9,10,11,12];
const e=await X.preparerExportIA({titre:fiche.titre,pdfId:fiche.pdfId,highlights:hl,annotations:ann,ordrePages:ordre,portee:${JSON.stringify(portee)},pageIndex:0});
const normal=await A.exporterDepuisBlob(fiche.pdfId,hl,ann);
const rendre=async(oct,num)=>{const d=await P.openPdf(oct.slice());const pg=await d.getPage(num);const vp=pg.getViewport({scale:2});const cv=document.createElement('canvas');cv.width=Math.round(vp.width);cv.height=Math.round(vp.height);const g=cv.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,cv.width,cv.height);await pg.render({canvasContext:g,viewport:vp}).promise;return cv};
const cvN=await rendre(normal.octets,1),cvS=await rendre(e.pdf,1);
// pixels qui diffèrent, hors étiquettes (rectangles en px : ×2, y inversé, marge 1 px d'antialias)
const H=842;const lab=e.etiquettes.filter(x=>x.page===0).map(x=>({x0:Math.floor(x.x*2)-1,x1:Math.ceil((x.x+x.w)*2)+1,y0:Math.floor((H-x.y-x.h)*2)-1,y1:Math.ceil((H-x.y)*2)+1}));
const dn=cvN.getContext('2d').getImageData(0,0,cvN.width,cvN.height).data,ds=cvS.getContext('2d').getImageData(0,0,cvS.width,cvS.height).data;
let dehors=0,dedans=0;for(let y=0;y<cvN.height;y++)for(let x=0;x<cvN.width;x++){const k=(y*cvN.width+x)*4;if(dn[k]!==ds[k]||dn[k+1]!==ds[k+1]||dn[k+2]!==ds[k+2]){if(lab.some(l=>x>=l.x0&&x<=l.x1&&y>=l.y0&&y<=l.y1))dedans++;else dehors++}}
// texte du visuel : chaque ref écrite, à l'intérieur de son étiquette
const dv=await P.openPdf(e.pdf.slice());const items=[];for(let i=1;i<=dv.numPages;i++){const tc=await (await dv.getPage(i)).getTextContent();tc.items.forEach(it=>items.push({p:i-1,s:it.str,x:it.transform[4],y:it.transform[5]}))}
const refsVisuel=e.etiquettes.map(l=>{const it=items.find(t=>t.p===l.page&&t.s===l.ref);return {id:l.id,ref:l.ref,ecrit:!!it,place:!!it&&it.x>=l.x&&it.x<=l.x+l.w&&it.y>=l.y&&it.y<=l.y+l.h}});
const dansBoite=e.etiquettes.map(l=>l.x>=l.cadre.x-0.01&&l.x+l.w<=l.cadre.x+l.cadre.w+0.01&&l.y>=l.cadre.y-0.01&&l.y+l.h<=l.cadre.y+l.cadre.h+0.01);
return {json:e.json,base:e.base,pngs:e.pngs.map(p=>p.nom),etiquettes:e.etiquettes.map(l=>({id:l.id,ref:l.ref,page:l.page,taille:l.taille,coin:l.coin,mode:l.mode,r:[l.x,l.y,l.w,l.h].map(v=>+v.toFixed(1)),cadre:[l.cadre.x,l.cadre.y,l.cadre.w,l.cadre.h].map(v=>+v.toFixed(1))})),dansBoite,refsVisuel,diff:{dedans,dehors},png1:cvS.toDataURL('image/png').split(',')[1],pngN:cvN.toDataURL('image/png').split(',')[1]}})()`);
fs.writeFileSync(`../cap/ia-${portee}-special.png`, Buffer.from(r.png1, 'base64'));
fs.writeFileSync(`../cap/ia-${portee}-normal.png`, Buffer.from(r.pngN, 'base64'));
delete r.png1; delete r.pngN;
console.log(JSON.stringify(r, null, 1));
c.fermer();
