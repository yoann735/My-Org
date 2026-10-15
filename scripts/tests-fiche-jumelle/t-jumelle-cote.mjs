// Fiche jumelle — « Les deux » : original et fiche côte à côte, synchronisés page à page (les deux
// sens), annotations de chaque côté, échange ; tablette paysage oui, portrait / étroit : bascule seule.
import { banc } from './commun.mjs';
const b = await banc();
b.ok(await b.ouvrir('Physiologie rénale (jumelle)', { recharger: true }), 'cours ouvert');
const vue = () => b.ev(`document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')?.innerText`);
const versVue = async (v) => { if ((await vue()) !== v) await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText===${JSON.stringify(v)})`, false), { att: 1500 }); };
await versVue('Original');
await b.clic(await b.pos(`document.querySelector('.ptb-zoom button[title="Ajuster à la largeur"]')`, false), { att: 500 });
if (!(await b.ev(`!!document.querySelector('.pdfr-jumelle')`))) await b.clic(await b.pos(`document.querySelector('.pdfr-jumelle-deux')`, false), { att: 1800 });
b.ok(await b.ev(`!!document.querySelector('.pdfr-jumelle .vj')`), '« Les deux » : la fiche s’affiche à côté de l’original');
// page en haut du miroir
const pageMiroir = () => b.ev(`(()=>{const z=document.querySelector('.vj-zone');const y=z.getBoundingClientRect().top+12;let n=null;z.querySelectorAll('.vj-page').forEach(p=>{const r=p.getBoundingClientRect();if(r.top<=y&&r.bottom>y)n=+p.dataset.page});return n})()`);
const pageLecteur = () => b.ev(`+document.querySelector('.ptb-pages .tnum').innerText.split('/')[0]`);
const allerLecteur = async (page, f = 0.3) => {
  for (let k = 0; k < 6; k++) {
    const ok = await b.ev(`(()=>{const el=document.querySelector('.pdfr-scroll');const p=el.querySelector('.pdfr-page[data-cle="${page}"]');
      if(!p){const n=+document.querySelector('.ptb-pages .tnum').innerText.split('/')[1];el.scrollTop=el.scrollHeight*(${page}-1)/n;return false}
      const r=p.getBoundingClientRect();el.scrollTop+= r.top - el.getBoundingClientRect().top + ${f}*r.height;return true})()`);
    await b.dormir(350); if (ok) return;
  }
};
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await b.dormir(900);
b.ok(await pageMiroir() === 1, 'en haut : original p.1 ↔ fiche p.1');
b.ok(await b.ev(`[...document.querySelectorAll('.vj .note-box')].some(n=>n.innerText.includes('Boîte de la fiche'))`), 'le miroir montre le calque de la FICHE (sa boîte)');
b.ok(await b.ev(`[...document.querySelectorAll('.pdfr-scroll .note-box')].every(n=>!n.innerText.includes('Boîte de la fiche'))`), 'le lecteur garde le calque de l’original');
await allerLecteur(9); await b.dormir(800);
b.ok(await pageMiroir() === 10, 'lecteur → original p.9 : le miroir suit → fiche p.10', 'miroir p.' + await pageMiroir());
await allerLecteur(20); await b.dormir(800);
b.ok(await pageMiroir() === 22, 'original p.20 → fiche p.22 (après deux pages ajoutées)', 'miroir p.' + await pageMiroir());
await b.capt('jumelle-cote-a-cote');
// défilement À LA MAIN dans le miroir : le lecteur suit (sens inverse)
const z = await b.rect(`document.querySelector('.vj-zone')`);
await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: z.cx, y: z.cy });
for (let k = 0; k < 14; k++) { await b.c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: z.cx, y: z.cy, deltaX: 0, deltaY: 400 }); await b.dormir(40); }
await b.dormir(1000);
const pm = await pageMiroir(), pl = await pageLecteur();
const attendu = JSON.parse(await b.S(`return JSON.stringify((await S.getOne('companion_pdf','cp:f-fj')).pageMap)`));
const corresp = attendu.versOrig[pm - 1];
b.ok(pm > 22 && (corresp ? pl === corresp : Math.abs(pl - (attendu.versOrig.slice(0, pm).filter(Boolean).pop())) <= 1), 'défilement dans le miroir : le lecteur suit', `miroir fiche p.${pm} → lecteur original p.${pl}`);
// échange
await b.clic(await b.pos(`[...document.querySelectorAll('.vj-entete button')].find(x=>x.innerText.includes('Annoter ce côté'))`, false), { att: 1800 });
b.ok((await vue()) === 'Fiche' && (await b.ev(`document.querySelector('.vj-titre')?.innerText`)).includes('Original'), '« Annoter ce côté » : la fiche passe dans le lecteur, l’original à côté');
await b.capt('jumelle-cote-echange');
// TABLETTE paysage : « Les deux » disponible ; portrait : bascule seule
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 2, mobile: true }); await b.dormir(1500);
b.ok(await b.ev(`!!document.querySelector('.pdfr-jumelle-deux') && !!document.querySelector('.pdfr-jumelle .vj')`), 'tablette paysage 1 180 × 820 : « Les deux » disponible et affiché');
await b.capt('jumelle-tablette-paysage');
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 2, mobile: true }); await b.dormir(1500);
b.ok(await b.ev(`!document.querySelector('.pdfr-jumelle-deux') && !document.querySelector('.pdfr-jumelle') && !!document.querySelector('.pdfr-jumelle-bascule .seg')`), 'tablette portrait 820 × 1 180 : bascule seule (pas de côte à côte)');
await b.capt('jumelle-tablette-portrait');
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }); await b.dormir(1200);
await b.clic(await b.pos(`document.querySelector('.pdfr-jumelle-deux')`, false), { att: 800 }); // on referme « Les deux »
b.ok(!(await b.ev(`!!document.querySelector('.pdfr-jumelle')`)), '« Les deux » refermé');
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
