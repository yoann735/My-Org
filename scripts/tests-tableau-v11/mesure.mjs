import { banc } from '../tests-flashcards-refonte/commun.mjs';
const b = await banc(1440, 900);
console.log(JSON.stringify(await b.ev(`(()=>{const o={};for(const [k,sel] of [['carte','.tb-carte,.tb2-carte'],['texte','.tb-texte:not(.vide),.tb2-corps'],['vide','.tb-texte.vide,.tb2-vide']]){const e=document.querySelector(sel);if(!e)continue;const s=getComputedStyle(e);o[k]={fs:s.fontSize,fw:s.fontWeight,lh:s.lineHeight,ff:s.fontFamily.slice(0,40),c:s.color,fst:s.fontStyle,ls:s.letterSpacing,op:s.opacity}}return o})()`)));
process.exit(0);
