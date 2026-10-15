// Fiche jumelle — bascule Original ⇄ Fiche : au clic, à Tab, à ⌘⇧F ; zoom, position relative et outil
// gardés ; page ajoutée / sans équivalent ; fondu ; position de lecture par document.
import { banc } from './commun.mjs';
const b = await banc();
b.ok(await b.ouvrir('Physiologie rénale (jumelle)', { recharger: true }), 'cours ouvert');
const etat = () => b.ev(`JSON.stringify({vue:document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')?.innerText, page:document.querySelector('.ptb-pages .tnum')?.innerText, zoom:document.querySelector('.ptb-zoom .hint')?.innerText, outil:[...document.querySelectorAll('.ptb-outil.actif, .ptb-outil[aria-pressed=true]')].map(x=>x.title.split(' — ')[0]).join(',')})`).then(JSON.parse);
// position relative dans la page affichée (ligne de lecture du lecteur)
const fraction = () => b.ev(`(()=>{const el=document.querySelector('.pdfr-scroll');const ps=[...el.querySelectorAll('.pdfr-page[data-cle]')];const y=el.getBoundingClientRect().top;let best=null;for(const p of ps){const r=p.getBoundingClientRect();if(r.top<=y+1&&r.bottom>y){best={cle:p.dataset.cle,f:+((y-r.top)/r.height).toFixed(3)}}}return JSON.stringify(best)})()`).then(JSON.parse);
// aller à une page (virtualisée : on s'en approche, puis on vise le haut exact + la fraction)
const aller = async (page, f) => {
  for (let k = 0; k < 6; k++) {
    const ok = await b.ev(`(()=>{const el=document.querySelector('.pdfr-scroll');const p=el.querySelector('.pdfr-page[data-cle="${page}"]');
      if(!p){const n=+document.querySelector('.ptb-pages .tnum').innerText.split('/')[1];el.scrollTop=el.scrollHeight*(${page}-1)/n;return false}
      const r=p.getBoundingClientRect();el.scrollTop+= r.top - el.getBoundingClientRect().top + ${f}*r.height;return true})()`);
    await b.dormir(300);
    if (ok) return;
  }
};
// partir de l'original
if ((await etat()).vue !== 'Original') { await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText==='Original')`, false), { att: 1200 }); }
b.ok((await etat()).vue === 'Original', 'vue Original');
// zoom 132 % (dézoom une fois), outil Surligneur, original p.9 à 40 %
await b.clic(await b.pos(`document.querySelector('.ptb-zoom button[title="Dézoomer"]')`, false), { att: 500 });
await b.clic(await b.bouton('Surligneur'));
await aller(9, 0.4); await b.dormir(600);
const e0 = await etat(), f0 = await fraction();
console.log('   avant :', JSON.stringify(e0), JSON.stringify(f0));
// CLIC sur « Fiche »
await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText==='Fiche')`, false), { att: 1500 });
const e1 = await etat(), f1 = await fraction();
b.ok(e1.vue === 'Fiche' && f1 && f1.cle === '10', 'clic « Fiche » : original p.9 → fiche p.10 (sa correspondante)', JSON.stringify(f1));
b.ok(Math.abs(f1.f - f0.f) < 0.02, 'même position relative dans la page', `${f0.f} → ${f1.f}`);
b.ok(e1.zoom === e0.zoom, 'même zoom', `${e0.zoom} → ${e1.zoom}`);
b.ok(e1.outil.includes('Surligneur'), 'même outil actif (Surligneur)', e1.outil);
await b.capt('jumelle-bascule-fiche');
// TAB : retour à l'original
await b.clic(await b.pos(`document.querySelector('.pdfr-scroll')`, false), { att: 200 });
await b.T.Tab(); await b.dormir(1500);
const f2 = await fraction();
b.ok((await etat()).vue === 'Original' && f2.cle === '9' && Math.abs(f2.f - f0.f) < 0.02, 'touche Tab : retour à l’original p.9, même position', JSON.stringify(f2));
await b.capt('jumelle-bascule-original');
// ⌘⇧F
await b.touche('f', { meta: true, shift: true, code: 'KeyF', vk: 70 }); await b.dormir(1500);
b.ok((await etat()).vue === 'Fiche' && (await fraction()).cle === '10', '⌘⇧F : vers la fiche p.10');
// page AJOUTÉE dans la fiche (p.14) → original p.12 (la plus proche avant) + avis
await aller(14, 0.2); await b.dormir(500);
await b.touche('f', { meta: true, shift: true, code: 'KeyF', vk: 70 }); await b.dormir(400);
const avis = await b.ev(`document.querySelector('.fj-avis')?.innerText`);
await b.dormir(1100);
const fA = await fraction(); b.ok((await etat()).page === '12 / 26' && avis && avis.includes('ajoutée dans la fiche'), 'page ajoutée de la fiche (p.14) → original p.12 + avis', avis + ' ' + JSON.stringify(fA) + ' ' + (await etat()).page);
await b.capt('jumelle-avis-ajoutee');
// diapositive 13 (fusionnée) → fiche p.13
await aller(13, 0.5); await b.dormir(500);
await b.T.Tab(); await b.dormir(1500);
b.ok((await fraction()).cle === '13', 'diapositive 13 (fusionnée avec la 12) → fiche p.13');
// Tab dans un champ de saisie : ne bascule pas
await b.clic(await b.pos(`document.querySelector('.ptb-droite button, .ptb-droite input')`, false), { att: 300 });
const avant = (await etat()).vue;
if (await b.ev(`document.activeElement && document.activeElement.tagName==='INPUT'`)) { await b.T.Tab(); await b.dormir(600); b.ok((await etat()).vue === avant, 'Tab dans la recherche : pas de bascule'); await b.T.Escape(); }
// fondu : animation « page-pose » posée à la bascule
await b.ev(`window.__fondu=0;new MutationObserver(()=>{if(document.querySelector('.pdfr-pages.pose'))window.__fondu++}).observe(document.querySelector('.pdfr-scroll'),{subtree:true,attributes:true,attributeFilter:['class']});1`);
await b.clic(await b.pos(`document.querySelector('.pdfr-scroll')`, false), { att: 100 });
await b.T.Tab(); await b.dormir(1200);
b.ok(await b.ev(`window.__fondu`) > 0, 'fondu court à la bascule (classe « pose », 180 ms)');
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
