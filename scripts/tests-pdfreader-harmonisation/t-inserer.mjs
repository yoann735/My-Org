// « INSÉRER UNE PAGE » (22/10) : entre deux pages, une zone de la hauteur exacte de l'espace inter-pages et de la largeur
// exacte de la page, INVISIBLE hors survol ; au survol (au doigt : au premier toucher), une ligne pointillée de la largeur
// de la page et un « + » rond centré, à l'échelle de la page (18–40 px). De 25 % à 300 %, et après la dernière page.
// Usage : node t-inserer.mjs [ipad]
import { banc } from './commun.mjs';
const ipad = process.argv[2] === 'ipad';
const b = await banc(1440, 900, { tactile: ipad });
await b.preparer([]);
await b.ouvrirCours({ ipad });
const souris = (type, [x, y]) => b.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'none' });
const etat = (sel = '.pdfr-inter[data-apres="1"]') => b.ev(`(()=>{const z=document.querySelector('${sel}');if(!z)return null;const p=document.querySelector('.pdfr-page[data-cle="1"]').getBoundingClientRect();
  const t=z.querySelector('.pdfr-inter-trait'),pl=z.querySelector('.pdfr-inter-plus');const rz=z.getBoundingClientRect(),rt=t.getBoundingClientRect(),rp=pl.getBoundingClientRect();
  return {zone:{x:+rz.x.toFixed(1),w:+rz.width.toFixed(1),h:+rz.height.toFixed(1),y:+rz.y.toFixed(1)},page:{x:+p.x.toFixed(1),w:+p.width.toFixed(1),bas:+p.bottom.toFixed(1)},trait:{w:+rt.width.toFixed(1),o:+getComputedStyle(t).opacity},plus:{w:+rp.width.toFixed(1),cx:+(rp.x+rp.width/2).toFixed(1),o:+getComputedStyle(pl).opacity}}})()`);
const voir = (sel) => b.ev(`(()=>{const z1=document.querySelector('.pdfr-scroll');const e=document.querySelector('${sel}');if(!e)return 0;const r=e.getBoundingClientRect(),q=z1.getBoundingClientRect();z1.scrollTop+=r.y-(q.y+q.height*0.5);return 1})()`);
const lignes = [];
for (const z of [0.25, 0.5, 1, 1.6, 2, 3]) {
  if (ipad) await b.dormir(4200); // la zone montrée au doigt se cache seule après 4 s
  await b.ev(`window.__mrZoom(${z});1`); await b.dormir(1300);
  await voir('.pdfr-inter[data-apres="1"]'); await b.dormir(700);
  await souris('mouseMoved', [5, 5]); await b.dormir(300);
  const repos = await etat();
  const k = (await b.ev(`(()=>{const p=document.querySelector('.pdfr-page[data-cle="1"]');return p.getBoundingClientRect().height})()`)) / 595 / 1.6; // zoom ÷ 160 % (page de 595 pt de haut)
  const att = Math.round(Math.min(40, Math.max(18, 24 * k)));
  const c = [repos.zone.x + repos.zone.w * 0.3, repos.zone.y + repos.zone.h / 2];
  if (ipad) { await b.tape(c); await b.dormir(300); } else { await souris('mouseMoved', c); await b.dormir(350); }
  const vu = await etat();
  const ok = repos.trait.o === 0 && repos.plus.o === 0 && Math.abs(repos.zone.h - 18 * k * 1.6) <= 0.6 && Math.abs(repos.zone.w - repos.page.w) <= 0.6 && Math.abs(repos.zone.x - repos.page.x) <= 0.6
    && vu.trait.o === 1 && vu.plus.o === 1 && Math.abs(vu.trait.w - vu.page.w) <= 0.6 && Math.abs(vu.plus.w - att) <= 0.6 && Math.abs(vu.plus.cx - (vu.page.x + vu.page.w / 2)) <= 1;
  b.ok(ok, `zoom ${Math.round(z * 100)} % : rien hors survol ; ${ipad ? 'au toucher' : 'au survol'} ligne de ${vu.trait.w} px (= page) et « + » de ${vu.plus.w} px centré`, JSON.stringify({ repos, vu, att }));
  lignes.push(`| ${Math.round(z * 100)} % | ${repos.zone.h} px | ${vu.trait.w} px / page ${vu.page.w} px | ${vu.plus.w} px |`);
  if (!ipad && [0.5, 1.6, 3].includes(z)) await b.capture(`inserer-${Math.round(z * 100)}`, { x: Math.max(0, Math.round(vu.page.x - 20)), y: Math.round(vu.zone.y - 60), width: Math.round(Math.min(1400, vu.page.w + 40)), height: Math.round(vu.zone.h + 120) });
}
console.log(['| Zoom | Zone (hauteur) | Ligne / page | « + » |', '|---|---|---|---|', ...lignes].join('\n'));
// cliquer le « + » insère une page ; après la dernière page aussi
if (ipad) await b.dormir(4200);
await b.ev(`window.__mrZoom(1);1`); await b.dormir(1200);
const n0 = (await b.enBase()).filter((a) => a.kind === 'page').length;
await voir('.pdfr-inter[data-apres="1"]'); await b.dormir(600);
let e = await etat();
const c = [e.zone.x + e.zone.w / 2, e.zone.y + e.zone.h / 2];
if (ipad) { await b.tape(c); await b.tape(c); } else { await souris('mouseMoved', c); await b.dormir(300); await b.clic(c, { att: 800 }); }
await b.dormir(800);
const n1 = (await b.enBase()).filter((a) => a.kind === 'page').length;
b.ok(n1 === n0 + 1, `${ipad ? 'toucher puis toucher le « + »' : 'clic sur le « + »'} : une page insérée après la page 1`, `${n0} → ${n1}`);
const der = await b.ev(`(()=>{const l=[...document.querySelectorAll('.pdfr-inter')];return l.length})()`);
const nbPages = await b.ev(`document.querySelectorAll('.pdfr-page[data-cle], .pdfr-placeholder').length`);
b.ok(der >= 1, 'une zone d’insertion après chaque page affichée, la dernière comprise', `${der} zones montées / ${nbPages} pages`);
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
