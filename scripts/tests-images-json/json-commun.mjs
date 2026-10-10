// Outils des tests « textes d'annotations » (10/10)
import fs from 'fs';
export function outilsJson(B) {
  const { c, ev, dormir, clic } = B;
  // page 1 entière à l'écran : zoom réduit (Dézoomer ×3 depuis 160 %), haut de page
  const cadrer = async () => {
    await clic(await B.bouton('Ajuster à la largeur'), { att: 500 });
    for (let i = 0; i < 4; i++) await clic(await B.bouton('Dézoomer'), { att: 350 });
    await ev(`(()=>{const s=document.querySelector('.pdfr-scroll');const p=document.querySelector('.pdfr-page[data-cle="1"]');s.scrollTop+=p.getBoundingClientRect().top-s.getBoundingClientRect().top-10;return 1})()`);
    await dormir(800);
  };
  const rectPage = () => ev(`(()=>{const r=document.querySelector('.pdfr-page[data-cle="1"]').getBoundingClientRect();return {x:Math.round(r.x),y:Math.max(0,Math.round(r.y)),width:Math.round(r.width),height:Math.min(900-Math.max(0,Math.round(r.y)),Math.round(r.height))}})()`);
  const capturer = async (nom, clip) => { const r = await c.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } }); fs.writeFileSync(`../cap/${nom}.png`, Buffer.from(r.data, 'base64')); return `../cap/${nom}.png`; };
  const diff = async (a, z) => {
    const A = fs.readFileSync(a).toString('base64'), Z = fs.readFileSync(z).toString('base64');
    return ev(`(async()=>{const ld=(s)=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src='data:image/png;base64,'+s});const [i1,i2]=await Promise.all([ld(${JSON.stringify(A)}),ld(${JSON.stringify(Z)})]);const W=i1.width,H=i1.height;if(W!==i2.width||H!==i2.height)return {taille:[W,H,i2.width,i2.height]};const g=(i)=>{const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,W,H).data};const d1=g(i1),d2=g(i2);let x0=W,y0=H,x1=-1,y1=-1,n=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const k=(y*W+x)*4;if(d1[k]!==d2[k]||d1[k+1]!==d2[k+1]||d1[k+2]!==d2[k+2]){n++;if(x<x0)x0=x;if(y<y0)y0=y;if(x>x1)x1=x;if(y>y1)y1=y}}return {n,x0,y0,x1,y1,W,H}})()`);
  };
  const fichier = async (libelle) => {
    await clic(await B.pos(`document.querySelector('.mf-bouton')`, false), { att: 400 });
    await clic(await B.pos(`[...document.querySelectorAll('.mf-item')].find(b=>b.innerText.trim().startsWith(${JSON.stringify(libelle)}))`, false), { att: 500 });
  };
  const boites = (fiche) => B.S(`return (await S.getAll('annotations')).filter(a=>a.ficheId===${JSON.stringify(fiche)}&&(a.kind==='libre'||a.kind==='texte')).sort((a,b)=>a.id.localeCompare(b.id))`);
  return { cadrer, rectPage, capturer, diff, fichier, boites };
}
