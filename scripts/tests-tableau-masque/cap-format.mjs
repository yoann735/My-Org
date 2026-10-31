// capture de « Voir le format attendu » sur l'exemple « tableau (masque choisi) » — docs/compte-rendu-flashcards.md
import { banc, COURS } from './commun.mjs';
const b = await banc(false);
await b.ouvrirCours(COURS[2], { recharger: true }); await b.ongletFlashcards();
await b.toucher(`document.querySelector('[data-act="importer-fc"]')`, 700);
await b.toucher(`document.querySelector('[data-act="format"]')`, 500);
await b.ev(`(()=>{const e=document.querySelector('[data-exemple]');const l=e.textContent.split('\\n');const i=l.findIndex(x=>x.includes('"masque": {'));const lh=parseFloat(getComputedStyle(e).lineHeight)||16;e.scrollTop=Math.max(0,(i-18)*lh);return i})()`);
await b.dormir(300);
await b.capture('tm-format', await b.ev(`(()=>{const p=document.querySelector('[data-import-flashcards]').getBoundingClientRect();const e=document.querySelector('[data-exemple]').getBoundingClientRect();return {x:p.x,y:Math.max(0,p.y),width:p.width,height:e.bottom-p.y+10}})()`));
process.exit(0);
