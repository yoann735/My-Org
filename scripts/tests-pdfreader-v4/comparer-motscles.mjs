// (20/10 soir) Mots-clés proposés AVANT (keyterms-v3.js) / APRÈS (transcription/keyterms.js) sur de vrais cours,
// dans le navigateur du banc (pdf.js de l'app). Les PDF restent en local. node comparer-motscles.mjs <pdf>...
import { banc } from './commun.mjs';
import fs from 'node:fs';
const b = await banc(1440, 900);
const res = {};
for (const f of process.argv.slice(2)) {
  const b64 = fs.readFileSync(f).toString('base64');
  await b.ev(`window.__pdf64=${JSON.stringify(b64)};1`);
  const r = await b.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);
    const P=await import(u.find(n=>n.includes('/pdf/pdfjsSetup.js'))||'/src/medrevise/pdf/pdfjsSetup.js');
    const N=await import('/src/medrevise/transcription/keyterms.js?v='+Date.now());
    const A=await import('/scripts/tests-pdfreader-v4/keyterms-v3.js');
    const bin=atob(window.__pdf64);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
    const doc=await P.pdfjsLib.getDocument({data:a}).promise;
    let natif=0;for(let p=1;p<=Math.min(doc.numPages,5);p++){const t=await (await doc.getPage(p)).getTextContent();natif+=t.items.length}
    const C=await import(u.find(n=>n.includes('/ocr/couches.js'))||'/src/medrevise/ocr/couches.js');let ocrPages=null;
    for(const c0 of await C.toutesLesCouches()){if(c0.pageCount!==doc.numPages)continue;const c=(await C.lireCouche(c0.id))||c0;if((c.pages||[]).some(p=>p&&p.words&&p.words.length)){ocrPages=c.pages;break}}
    const avant=await A.proposerTermes(doc,{ocrPages});const apres=await N.proposerTermesDetail(doc,{ocrPages});
    return JSON.stringify({pages:doc.numPages,itemsTexte5p:natif,ocr:!!ocrPages,avant,apres:apres.map(x=>({t:x.terme,s:x.score,p:x.pourquoi}))})})()`);
  res[f.split('/').pop()] = JSON.parse(r);
}
fs.writeFileSync('../cap/motscles-comparaison.json', JSON.stringify(res, null, 1));
for (const [f, r] of Object.entries(res)) {
  console.log(`\n== ${f} — ${r.pages} pages, ${r.itemsTexte5p} éléments de texte sur 5 pages, OCR ${r.ocr}`);
  console.log('AVANT (' + r.avant.length + ') :', r.avant.slice(0, 50).join(' | '));
  console.log('APRÈS (' + r.apres.length + ') :', r.apres.map((x) => x.t).join(' | '));
}
process.exit(0);
