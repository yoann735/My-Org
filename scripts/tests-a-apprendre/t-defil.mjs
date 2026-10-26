// Défilement de la liste de 200 cartes à la molette : images > 34 ms (rAF) et tâches longues. node t-defil.mjs <étiquette>
import { banc } from './commun.mjs';
process.env.CDP_PORT = process.env.CDP_PORT || '9335';
const A = await banc();
await A.ouvrirCours(undefined, { recharger: true });
await A.ongletFlashcards();
await A.dormir(1500);
await A.ev(`(()=>{window.__f=[];window.__lt=[];const z=document.querySelector('.pm-exos');z.scrollTop=0;let t0=performance.now();const boucle=(t)=>{window.__f.push(t-t0);t0=t;if(window.__f.length<400)requestAnimationFrame(boucle)};requestAnimationFrame(boucle);try{new PerformanceObserver((l)=>l.getEntries().forEach(e=>window.__lt.push(Math.round(e.duration)))).observe({type:'longtask'})}catch(e){};return 1})()`);
const rz = await A.rect(`document.querySelector('.pm-exos')`);
for (let k = 0; k < 120; k++) { A.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: rz.cx, y: rz.cy, deltaX: 0, deltaY: 120 }); await A.dormir(16); }
await A.dormir(800);
const def = await A.ev(`(()=>{const z=document.querySelector('.pm-exos');const f=window.__f.slice(2);return {haut:z.scrollTop,images:f.length,lentes:f.filter(x=>x>34).length,pire:Math.round(Math.max(...f)),longues:window.__lt,cartes:document.querySelectorAll('.pis-item.fcl-carte').length}})()`);
console.log(process.argv[2] || '', JSON.stringify(def));
process.exit(0);
