// État d'un document ouvert : images du flux, annotations image, pages. node etat-doc.mjs <ficheId>
import { connecter } from './cdp.mjs';
const c = await connecter();
const id = process.argv[2];
console.log(JSON.stringify(await c.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js')));
const pm=document.querySelector('.pt-flux');const ed=pm&&pm.editor;const imgs=[];
if(ed)ed.state.doc.forEach((n,pos,i)=>{if(n.type.name==='image')imgs.push({i,pos,width:n.attrs.width,height:n.attrs.height,deAnnotation:n.attrs.deAnnotation,blobId:n.attrs.blobId,notions:n.attrs.notions})});
const pages=[...document.querySelectorAll('.pdfr-page')].length;
const doms=[...document.querySelectorAll('.pt-flux .pti')].map(e=>{const r=e.getBoundingClientRect();return [Math.round(r.y),Math.round(r.width),Math.round(r.height)]});
const ann=(await S.getAll('annotations')).filter(a=>a.ficheId===${JSON.stringify(id)}&&a.kind==='image').map(a=>({id:a.id,conv:!!a.convertieEnFlux}));
const nd=await S.getOne('notes_doc',${JSON.stringify(id)});let nImgSaved=0;JSON.stringify(nd&&nd.flux||{}).replace(/"type":"image"/g,()=>nImgSaved++);
const flottantes=document.querySelectorAll('.pdfr-image').length;
const meta=await S.getMeta('images-flux-converties');
return {imgs,doms,ann,nImgSaved,flottantes,pages,meta,blocs:ed&&ed.state.doc.childCount};})()`), null, 1));
c.fermer();
