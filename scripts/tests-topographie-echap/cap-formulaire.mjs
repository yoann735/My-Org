// capture du bas du tableau Muscle dans le formulaire (Innervation, Topographie) — docs/compte-rendu-flashcards.md
import { banc } from './commun.mjs';
const b = await banc(false);
await b.ouvrirCours('Cours témoin', { recharger: true }); await b.ongletFlashcards();
await b.toucher(`document.querySelector('.fcl-nouvelle')`, 800);
await b.sorte('muscle');
await b.focusEcrire(`document.querySelector('#mu-topographie')`, 'Loge antérieure du bras, sous le biceps brachial');
await b.ev(`(()=>{document.querySelector('[data-zone-image="action"]').scrollIntoView({block:'start'});return 1})()`); await b.dormir(500);
await b.capture('topo-formulaire', await b.ev(`(()=>{const t=document.querySelector('.fc-carte').getBoundingClientRect();const a=document.querySelector('[data-zone-image="action"]').getBoundingClientRect();const z=document.querySelector('[data-zone-image="topographie"]').getBoundingClientRect();return {x:t.x-4,y:a.y-8,width:t.width+8,height:z.bottom-a.y+70}})()`));
await b.toucher(`[...document.querySelectorAll('.fc-carte .imp-actions button')].find(x=>/Annuler/.test(x.textContent)&&x.offsetParent)`, 400);
process.exit(0);
