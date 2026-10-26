// 300 cartes, chacune avec sa propre image (~100 Ko) : export sans figer l'interface (Chrome C, ordinateur).
// Pendant l'export : tâches longues (PerformanceObserver « longtask »), battement de cœur (setInterval 16 ms : plus
// grand trou), valeurs successives de la barre de progression, une capture à mi-chemin, et un vrai clic qui doit être
// traité pendant l'export.
import { banc, COURS } from './commun.mjs';
import { ouvrirZip } from './aide.mjs';
const b = await banc(false);
await b.ouvrirApp({ recharger: true });
await b.bibliotheque();
await b.ev(`(()=>{const l=[...document.querySelectorAll('.lt-fiche')].find(e=>e.innerText.trim().startsWith(${JSON.stringify(COURS.gros)}));l.scrollIntoView({block:'center'});l.querySelector('[title="Autres actions"]').click();return 1})()`);
await b.dormir(500);
await b.ev(`[...document.querySelectorAll('button')].find(e=>/Exporter les flashcards \\(300\\)/.test(e.textContent)).click()`);
await b.attendre(`!!document.querySelector('[data-export-flashcards]')`, 5000);
b.v(/300 cartes/.test(await b.texte('[data-export-flashcards] [data-compte]')) && (await b.ev(`+document.querySelector('[data-export-flashcards] [data-images]').dataset.images`)) === 300, 'aperçu : 300 cartes, 300 images');
// instruments
await b.ev(`(()=>{window.__m={longues:[],trou:0,progres:[],clics:0};const m=window.__m;
  new PerformanceObserver((l)=>{for(const e of l.getEntries())m.longues.push(Math.round(e.duration))}).observe({type:'longtask'});
  let t=performance.now();m.hb=setInterval(()=>{const n=performance.now();m.trou=Math.max(m.trou,n-t);t=n},16);
  m.mo=new MutationObserver(()=>{const p=document.querySelector('[data-progres]');if(p){const v=+p.dataset.progres;if(m.progres[m.progres.length-1]!==v)m.progres.push(v)}});
  m.mo.observe(document.body,{subtree:true,attributes:true,attributeFilter:['data-progres'],childList:true});
  document.addEventListener('pointerdown',()=>m.clics++,true);return 1})()`);
await b.ev(`window.__dernierExportFC=null;1`);
const t0 = Date.now();
await b.toucher(`document.querySelector('[data-export-flashcards] [data-act="exporter-fc"]')`, 50);
// à mi-chemin : capture et vrai clic (doit être traité tout de suite)
let mi = false, clic = null;
for (let i = 0; i < 400 && !(await b.ev(`!!document.querySelector('[data-export-flashcards] [data-fait]')`)); i++) {
  const p = await b.ev(`+((document.querySelector('[data-progres]')||{dataset:{}}).dataset.progres||0)`);
  if (!mi && p >= 25) {
    mi = true;
    await b.capture('export-300-progression', await b.rect(`document.querySelector('[data-export-flashcards]').closest('.day-pop')`).then((r) => ({ x: r.x, y: r.y, width: r.w, height: r.h })));
    const avant = await b.ev(`window.__m.clics`); const tc = Date.now();
    const r = await b.rect(`document.querySelector('[data-export-flashcards] .hint')`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x: r.cx, y: r.cy, button: 'left', clickCount: 1 });
    clic = { traite: (await b.ev(`window.__m.clics`)) > avant, ms: Date.now() - tc, progres: p };
  }
  await b.dormir(40);
}
const duree = Date.now() - t0;
const m = await b.ev(`(()=>{const m=window.__m;clearInterval(m.hb);m.mo.disconnect();return {longues:m.longues,trou:Math.round(m.trou),progres:m.progres}})()`);
const z = await b.recupererZip('300.zip');
const Z = ouvrirZip(z.chemin);
const imgs = Z.noms.filter((x) => x.startsWith('images/'));
b.v(Z.integre && Z.doc.items.length === 300 && imgs.length === 300 && z.manquantes.length === 0, '300 cartes, 300 images, aucune manquante, archive intègre', `${Math.round(z.octets / 1048576 * 10) / 10} Mo en ${duree} ms`);
b.v(m.progres.length >= 10 && m.progres.every((v, i) => !i || v >= m.progres[i - 1]), `barre de progression : ${m.progres.length} valeurs croissantes`, m.progres.slice(0, 30).join(' → '));
const pire = Math.max(0, ...m.longues);
b.v(pire < 250, `interface jamais figée : plus longue tâche ${pire} ms (${m.longues.length} tâches > 50 ms)`, m.longues.join(' '));
b.v(m.trou < 300, `battement 16 ms : plus grand trou ${m.trou} ms`);
b.v(!!clic && clic.traite && clic.ms < 500, 'un vrai clic pendant l’export est traité aussitôt', JSON.stringify(clic));
b.fin();
