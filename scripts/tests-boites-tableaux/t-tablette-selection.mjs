// §3 TABLETTE : LA PAGE NE BOUGE PLUS À LA SÉLECTION (iPad émulé, tactile). 20 mots sélectionnés sur la diapo puis dans
// une boîte (en édition et affichée) : aucun élément du haut ne bouge (au pixel), défilement du lecteur et de la fenêtre
// inchangés, aucune barre ni menu n'entre dans le flux. Puis : un défilement parasite (comme Safari pour « montrer » la
// sélection) est annulé ; un vrai glisser du doigt défile ; clavier virtuel simulé.   node t-tablette-selection.mjs [avant]
import { banc } from './commun.mjs';
const b = await banc();
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const TXT = 'Le néphron est l’unité fonctionnelle du rein : chaque néphron filtre le plasma sanguin dans le glomérule, puis le tubule réabsorbe l’eau, les ions, le glucose et les acides aminés avant que l’anse de Henle et le tube collecteur concentrent l’urine finale';
const base = { ficheId: 'f-simpl', kind: 'libre', type: 'boite', fond: 'plein', gabarit: 'carte', taille1000: 16, couleur: 'jaune-franc', largeurFixe: true };
await b.preparer({ annotations: [{ ...base, id: 'ts-1', page: 1, x: 0.45, y: 0.55, width: 0.5, height: 0.1, content: doc(TXT) }, { ...base, id: 'ts-2', page: 1, x: 0.05, y: 0.78, width: 0.4, height: 0.08, couleur: 'vert-franc', content: doc(TXT) }] });
await b.ouvrirCours({ tablette: true });
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=60;1`); await b.dormir(600);
await b.ev(`(()=>{window.__ajouts=[];new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1&&!n.closest('.pdfr-scroll'))window.__ajouts.push(String(n.className||n.tagName))}).observe(document.body,{childList:true,subtree:true});return 1})()`);
// photographie : tout ce qui est au-dessus du lecteur (barres, en-tête), le défilement, la fenêtre, le visualViewport
const photo = () => b.ev(`(()=>{const sc=document.querySelector('.pdfr-scroll');const lim=sc.getBoundingClientRect().top+2;const h=[];
  document.querySelectorAll('body *').forEach((e)=>{const r=e.getBoundingClientRect();if(r.height>0&&r.width>0&&r.bottom<=lim&&e.children.length<40&&getComputedStyle(e).visibility!=='hidden')h.push((e.className&&e.className.baseVal===undefined?e.className:e.tagName)+':'+[r.left,r.top,r.width,r.height].map(v=>Math.round(v*100)/100).join(','))});
  const p=document.querySelector('.pdfr-page[data-cle="1"]').getBoundingClientRect();const vv=visualViewport;
  return {haut:h.join('|'),scroll:sc.scrollTop+','+sc.scrollLeft,fenetre:scrollX+','+scrollY,vv:vv.offsetTop+','+vv.offsetLeft+','+vv.height,page:[p.left,p.top].map(v=>Math.round(v*100)/100).join(',')}})()`);
const diff = (a, c) => Object.keys(a).filter((k) => a[k] !== c[k]);
const motsDe = (js, n) => b.ev(`(()=>{const out=[];const w=document.createTreeWalker(${js},NodeFilter.SHOW_TEXT);let t;while((t=w.nextNode())&&out.length<${n}){const re=/[A-Za-zÀ-ÿ’]{4,}/g;let m;while((m=re.exec(t.textContent))&&out.length<${n}){const r=document.createRange();r.setStart(t,m.index);r.setEnd(t,m.index+m[0].length);const q=r.getBoundingClientRect();if(q.width>4&&q.top>0&&q.bottom<innerHeight)out.push([q.left+1.5,q.top+q.height/2,q.right-1.5])}}return out})()`);
const vingtMots = async (js, nom, programme = false) => {
  const p0 = await photo();
  const mots = await motsDe(js, 20);
  let bouges = [], vus = 0;
  for (const m of mots) {
    if (programme) { // sélection telle que la laisse un appui long (iOS) sur un texte non modifiable
      await b.ev(`(()=>{const a=document.caretRangeFromPoint(${m[0]},${m[1]}),z=document.caretRangeFromPoint(${m[2]},${m[1]});const r=document.createRange();r.setStart(a.startContainer,a.startOffset);r.setEnd(z.startContainer,z.startOffset);const g=getSelection();g.removeAllRanges();g.addRange(r);return 1})()`);
      await b.dormir(260);
    } else { await b.glisser([m[0], m[1]], [m[2], m[1]], 6); await b.dormir(260); }
    if ((await b.ev(`String(getSelection()).trim().length`)) > 2) vus++;
    const p1 = await photo();
    const d = diff(p0, p1);
    if (d.length) bouges.push(d.join('+'));
  }
  const ajouts = await b.ev(`window.__ajouts.splice(0).filter(c=>!/mini-barre|nb-actions|sc-|mb-pop|pdfr-vers-carte|ct-pop/.test(c))`);
  b.ok(mots.length === 20 && vus >= 18 && !bouges.length, `${nom} : 20 mots sélectionnés (${vus} sélections réelles), rien ne bouge (haut, page, défilement, fenêtre, viewport)`, bouges.length ? JSON.stringify(bouges.slice(0, 4)) : `${mots.length} mots`);
  b.ok(!ajouts.length, `${nom} : aucune barre ni menu n’entre dans le flux pendant les sélections`, JSON.stringify([...new Set(ajouts)]));
  return p0;
};
// 1. DIAPO (couche de texte pdf.js)
await vingtMots(`document.querySelector('.pdfr-page[data-cle="1"] .pdfr-textlayer')`, 'diapo');
await b.capture('bt-ipad-selection-diapo');
// 2. BOÎTE AFFICHÉE (texte non modifiable de la boîte)
await b.ev(`getSelection().removeAllRanges();1`); await b.T.Escape(); await b.dormir(300);
await vingtMots(`document.querySelector('[data-boite="ts-2"] .nb-body')`, 'boîte affichée', true);
// 3. BOÎTE EN ÉDITION
await b.ev(`getSelection().removeAllRanges();1`); await b.T.Escape(); await b.dormir(300);
await b.clic(await b.pos(`document.querySelector('[data-boite="ts-1"]')`, false), { att: 400 });
await b.clic(await b.pos(`document.querySelector('[data-boite="ts-1"]')`, false), { att: 900 });
b.ok(await b.ev(`!!document.querySelector('[data-boite="ts-1"] .ProseMirror')`), 'boîte en édition');
await b.ev(`window.__ajouts=[];1`);
const pe = await vingtMots(`document.querySelector('[data-boite="ts-1"] .ProseMirror')`, 'boîte en édition');
await b.capture('bt-ipad-selection-boite');
// 4. DÉFILEMENT PARASITE pendant une sélection (Safari qui « montre » la sélection) : annulé au pixel près
const m1 = (await motsDe(`document.querySelector('[data-boite="ts-1"] .ProseMirror')`, 3))[1];
await b.glisser([m1[0], m1[1]], [m1[2], m1[1]], 6); await b.dormir(700);
const avant = await b.ev(`document.querySelector('.pdfr-scroll').scrollTop`);
await b.ev(`(()=>{const sc=document.querySelector('.pdfr-scroll');sc.scrollTop+=140;return 1})()`); await b.dormir(400);
const apres = await b.ev(`({top:document.querySelector('.pdfr-scroll').scrollTop,n:window.__mrDefilementAnnule||0,sel:String(getSelection())})`);
b.ok(apres.top === avant && apres.n >= 1 && apres.sel.length > 2, 'défilement non demandé pendant une sélection : annulé au pixel près (sélection gardée)', JSON.stringify({ avant, ...apres }));
await b.ev(`window.scrollTo(0,300);1`); await b.dormir(200);
b.ok((await b.ev(`scrollY`)) === 0, 'la fenêtre ne défile pas pendant une sélection');
// 5. un vrai glisser du doigt (hors de la boîte) défile, même avec une sélection
const z = await b.rect(`document.querySelector('.pdfr-scroll')`);
await b.doigt([z.x + 30, z.y + z.h * 0.7], [z.x + 30, z.y + z.h * 0.3], 14); await b.dormir(600);
const doigt = await b.ev(`document.querySelector('.pdfr-scroll').scrollTop`);
b.ok(doigt > avant + 80, 'un vrai glisser du doigt fait défiler (geste de l’utilisateur respecté)', `${avant} → ${doigt}`);
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=${avant};1`); await b.dormir(500);
// 6. CLAVIER VIRTUEL (hauteur visible réduite) pendant une sélection dans la boîte : la page ne bouge pas
await b.ev(`getSelection().removeAllRanges();1`);
if (!(await b.ev(`!!document.querySelector('[data-boite="ts-1"] .ProseMirror')`))) {
  await b.ev(`document.querySelector('[data-boite="ts-1"]').scrollIntoView({block:'center'});1`); await b.dormir(500);
  await b.clic(await b.pos(`document.querySelector('[data-boite="ts-1"]')`, false), { att: 400 });
  await b.clic(await b.pos(`document.querySelector('[data-boite="ts-1"]')`, false), { att: 900 });
}
const m2 = (await motsDe(`document.querySelector('[data-boite="ts-1"] .ProseMirror')`, 2))[0];
await b.glisser([m2[0], m2[1]], [m2[2], m2[1]], 6); await b.dormir(500);
const k0 = await photo();
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1000, deviceScaleFactor: 2, mobile: true }); await b.dormir(1200);
const k1 = await photo();
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true }); await b.dormir(800);
const dk = diff(k0, k1).filter((k) => k !== 'vv');
b.ok(!dk.length, 'clavier virtuel ouvert (hauteur visible 1366 → 1000) : haut, page et défilement immobiles', dk.join(', ') || k0.scroll);
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
