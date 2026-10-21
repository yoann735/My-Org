// NOUVELLE BOÎTE ET TAILLE DU TEXTE (22/10) : une boîte posée à l'outil Boîte a le dessin « carte » (coins 10 px, marges
// 10 × 8 px, interligne 1,35, ombre légère, contour seulement à la sélection) et la taille « M » (1 % de la largeur de
// la page) ; la mini barre « Aa » ouvre S / M / L / XL avec aperçu et un réglage fin ; la boîte suivante naît à la
// dernière taille choisie ; la barre de mise en forme propose les mêmes tailles.   Usage : node t-taille.mjs [ipad]
import { banc } from './commun.mjs';
const ipad = process.argv[2] === 'ipad';
const b = await banc(1440, 900, { tactile: ipad });
await b.ev(`localStorage.removeItem('medrevise.tailleTexte');1`);
await b.preparer([]);
await b.ouvrirCours({ ipad });
const P = await b.page(1);
const pt = (fx, fy) => [P.x + P.w * fx, P.y + P.h * fy];
const souris = (type, [x, y], ex = {}) => b.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...ex });
const poser = async (p) => { const ex = ipad ? { pointerType: 'pen' } : {}; await souris('mouseMoved', p, ex); await souris('mousePressed', p, { ...ex, buttons: 1 }); await souris('mouseReleased', p, ex); await b.dormir(500); };
const toucher = (p) => (ipad ? b.tape(p) : b.clic(p, { att: 400 }));
const boites = async () => (await b.enBase()).filter((a) => a.kind === 'libre');
const dessin = () => b.ev(`(()=>{const n=document.querySelector('.note-box.carte');const c=getComputedStyle(n),cb=getComputedStyle(n.querySelector('.nb-body'));const sc=parseFloat(c.scale)||1;
  const p=document.querySelector('.pdfr-page[data-cle="1"]').getBoundingClientRect();
  return {coins:c.borderTopLeftRadius,pad:[cb.paddingTop,cb.paddingLeft],lh:+(parseFloat(cb.lineHeight)/parseFloat(cb.fontSize)).toFixed(3),police:+(parseFloat(cb.fontSize)*sc/p.width*100).toFixed(3),ombre:c.boxShadow!=='none',bord:c.borderTopWidth,cadre:!!n.querySelector('.sel-cadre')}})()`);
await b.outil('Boîte');
await poser(pt(0.1, 0.12));
await b.attendreFocus(); await b.ecrire('Néphron'); await b.dormir(300);
let bt = (await boites())[0];
let d = await dessin();
b.ok(bt.gabarit === 'carte' && bt.tailleTexte === 1.0 && d.coins === '10px' && d.pad[0] === '8px' && d.pad[1] === '10px' && d.lh === 1.35 && Math.abs(d.police - 1.0) < 0.01 && d.ombre && d.bord === '0px',
  'nouvelle boîte : gabarit « carte » — coins 10 px, marges 10 × 8 px, interligne 1,35, ombre légère, sans bordure, texte « M » = 1 % de la largeur', JSON.stringify({ gabarit: bt.gabarit, taille: bt.tailleTexte, ...d }));
await b.T.Escape(); await b.dormir(300);
d = await dessin();
b.ok(d.cadre, 'sélectionnée : le contour fin du cadre de sélection, rien d’autre');
await b.T.Escape(); await b.dormir(300);
d = await dessin();
b.ok(!d.cadre, 'non sélectionnée : aucun contour');
await b.capture('boite-carte' + (ipad ? '-ipad' : ''), { x: Math.round(P.x), y: Math.round(P.y), width: 360, height: 140 });
// le sélecteur de taille
await b.outil('Sélection'); await b.dormir(300);
const bx = await b.rect(`document.querySelector('.note-box.carte')`);
await toucher([bx.cx, bx.cy]);
await toucher(await b.pos(`document.querySelector('.mini-barre [data-option="taille"]')`, false));
const pop = await b.ev(`(()=>{const p=document.querySelector('.tt-pop');return p?{presets:[...p.querySelectorAll('.tt-preset')].map(x=>x.dataset.taille+':'+x.classList.contains('actif')),fin:!!p.querySelector('input[type=range]'),apercus:[...p.querySelectorAll('.tt-apercu')].map(x=>parseFloat(getComputedStyle(x).fontSize))}:null})()`);
b.ok(pop && pop.presets.join(',') === 'S:false,M:true,L:false,XL:false' && pop.fin && pop.apercus.every((v, i, a) => !i || v > a[i - 1]), 'mini barre « Aa » : S / M / L / XL (M actif) avec un aperçu croissant, et un réglage fin', JSON.stringify(pop));
await b.capture('taille-texte' + (ipad ? '-ipad' : ''), await b.ev(`(()=>{const r=document.querySelector('.tt-pop').getBoundingClientRect(),m=document.querySelector('.mini-barre').getBoundingClientRect();const x=Math.min(r.x,m.x)-12,y=Math.min(r.y,m.y)-12;return {x:Math.round(x),y:Math.round(y),width:Math.round(Math.max(r.right,m.right)-x+12),height:Math.round(Math.max(r.bottom,m.bottom)-y+12)}})()`));
await toucher(await b.pos(`document.querySelector('.tt-preset[data-taille="L"]')`, false));
bt = (await boites())[0];
d = await dessin();
b.ok(bt.tailleTexte === 1.4 && Math.abs(d.police - 1.4) < 0.01, 'L : 1,4 % de la largeur, enregistré', JSON.stringify({ taille: bt.tailleTexte, police: d.police }));
// réglage fin (clavier sur le curseur)
await b.ev(`(()=>{const i=document.querySelector('.tt-pop input[type=range]');return !!i})()`) || await toucher(await b.pos(`document.querySelector('.mini-barre [data-option="taille"]')`, false));
await b.ev(`(()=>{const i=document.querySelector('.tt-pop input[type=range]');i.focus();return 1})()`);
for (let k = 0; k < 4; k++) { await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }); await b.dormir(120); }
await b.dormir(400);
bt = (await boites())[0];
b.ok(Math.abs(bt.tailleTexte - 1.6) < 0.001, 'réglage fin : 4 crans de 0,05 % → 1,6 %', String(bt.tailleTexte));
await b.T.Escape(); await b.T.Escape(); await b.dormir(300);
// la boîte suivante naît à la dernière taille choisie
await b.outil('Boîte');
await poser(pt(0.1, 0.4));
await b.attendreFocus(); await b.ecrire('Uretère'); await b.dormir(300);
const b2 = (await boites()).find((x) => x.id !== bt.id);
b.ok(b2 && b2.tailleTexte === 1.6, 'la boîte suivante naît à la dernière taille choisie (mémorisée sur l’appareil)', String(b2 && b2.tailleTexte));
// barre de mise en forme : les mêmes tailles, en % de la largeur
const opts = await b.ev(`[...document.querySelectorAll('.pdfr-edit-toolbar select.et-select')][0]?[...document.querySelectorAll('.pdfr-edit-toolbar select.et-select')[0].options].map(o=>o.textContent).join(' | '):null`);
b.ok(opts === null || /S · 0,8 %/.test(opts), 'barre de mise en forme d’une boîte : tailles S / M / L / XL en %', String(opts));
await b.ev(`localStorage.removeItem('medrevise.tailleTexte');1`); // les autres bancs partent de « M »
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
