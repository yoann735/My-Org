// Boîtes et zones de texte « un mot » : taille d'une boîte vide et d'un mot (hauteur d'une ligne + 6 px, largeur du
// contenu + 12 px, au moins 40 px), 10 déplacements sans variation de taille (mesurée à chaque image), grandit avec le
// texte seulement, dessin (fond plein, coins 8 px, pas de bordure sauf sélection 1,5 px d'accent, ombre légère, 13 px,
// poignée et épingle visibles au survol / à la sélection), épingle → flèche. Zoom 160 % = échelle de référence (k = 1).
// Usage : node t-boites.mjs [ipad]
import { banc } from './commun.mjs';
const ipad = process.argv[2] === 'ipad';
const b = await banc(1440, 900, { tactile: ipad });
await b.preparer([]);
await b.ev(`localStorage.setItem('medrevise.fondBoite','plein');1`);
await b.ouvrirCours({ ipad, zoom: 1.6 });
const P = await b.page(1);
const vue = await b.rect(`document.querySelector('.pdfr-scroll')`);
const pt = (fx, fy) => [P.x + P.w * fx, P.y + P.h * fy];
const souris = (type, [x, y], extra = {}) => b.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
const poser = async (p) => { const ex = ipad ? { pointerType: 'pen' } : {}; await souris('mouseMoved', p, ex); await souris('mousePressed', p, { ...ex, buttons: 1 }); await souris('mouseReleased', p, ex); await b.dormir(500); };
const mesure = () => b.ev(`(()=>{const n=document.querySelector('.note-box.active');if(!n)return null;const r=n.getBoundingClientRect();const pm=n.querySelector('.ProseMirror')||n.querySelector('.nb-body');
  const t=pm&&pm.querySelector('p');let lt=0;if(t&&t.firstChild){const g=document.createRange();g.selectNodeContents(t);lt=g.getBoundingClientRect().width}
  const cs=getComputedStyle(n),cb=getComputedStyle(n.querySelector('.nb-body'));
  return {w:+r.width.toFixed(2),h:+r.height.toFixed(2),texte:+lt.toFixed(2),ligne:parseFloat(cb.lineHeight),police:cb.fontSize,coins:cs.borderTopLeftRadius,bord:cs.borderTopWidth,contour:(()=>{const c=n.querySelector('.sel-cadre');return c?(getComputedStyle(c).boxShadow.match(/0px 0px 0px ([\\d.]+px)/)||[])[1]||'aucun':'aucun'})(),ombre:cs.boxShadow!=='none',fond:cs.backgroundColor,couleur:cs.color}})()`);
// 1) boîte vide = un mot
await b.outil('Boîte');
const ici = [vue.x + 200, vue.y + 160];
await poser(ici);
await b.attendreFocus();
let m = await mesure();
b.ok(m && Math.abs(m.h - (m.ligne + 6)) <= 1 && Math.abs(m.w - 40) <= 1, 'boîte vide : compacte — une ligne + 6 px de haut, 40 px de large', JSON.stringify({ w: m.w, h: m.h, ligne: m.ligne }));
await b.ecrire('Rein'); await b.dormir(300);
m = await mesure();
b.ok(Math.abs(m.w - Math.max(40, m.texte + 12)) <= 1.5 && Math.abs(m.h - (m.ligne + 6)) <= 1, 'un mot : largeur = mot + 12 px, hauteur = une ligne + 6 px (aucune marge superflue)', JSON.stringify({ w: m.w, h: m.h, texte: m.texte }));
b.ok(m.coins === '8px' && m.bord === '0px' && m.contour === '1.5px' && m.ombre && m.police === '13px', 'dessin : coins 8 px, pas de bordure, contour 1,5 px à la sélection, ombre, 13 px', JSON.stringify(m));
const motUn = m;
// (21/10, harmonisation) sélectionnée : le cadre unique (contour + 4 coins) et la mini barre — plus de poignée ni d'épingle
const sel1 = await b.ev(`({coins:document.querySelectorAll('.note-box.active .sel-cadre .sel-coin').length,barre:!!document.querySelector('.mini-barre [data-option="fleche"]'),poignee:!!document.querySelector('.note-box.active .nb-epingle')})`);
b.ok(sel1.coins === 4 && sel1.barre && !sel1.poignee, 'sélectionnée : cadre à 4 coins et mini barre (flèche), sans poignée ni épingle', JSON.stringify(sel1));
await b.capture('boite-mot' + (ipad ? '-ipad' : ''), { x: Math.round(ici[0] - 30), y: Math.round(ici[1] - 50), width: 200, height: 100 });
// 2) grandit avec le texte seulement ; texte long : retour à la ligne à 45 % de la page
await b.ecrire(' droit plus bas que le gauche, capsule fibreuse, cortex et médullaire, pyramides de Malpighi et colonnes de Bertin, hile rénal'); await b.dormir(300);
m = await mesure();
b.ok(m.w <= P.w * 0.45 + 1 && m.h >= motUn.h + m.ligne - 0.5, 'texte long : la boîte s’élargit jusqu’à 45 % de la page puis passe à la ligne', JSON.stringify({ w: m.w, h: m.h, max: +(P.w * 0.45).toFixed(1) }));
for (let i = 0; i < 125; i++) await b.T.Retour();
await b.dormir(300);
m = await mesure();
b.ok(Math.abs(m.w - motUn.w) <= 1.5 && Math.abs(m.h - motUn.h) <= 1, 'texte effacé jusqu’à « Rein » : la boîte revient exactement à la taille d’un mot', JSON.stringify({ w: m.w, h: m.h }));
await b.T.Escape(); await b.outil('Sélection'); await b.dormir(300);
// au repos (non sélectionnée, sans survol) : pas de poignée visible
await souris('mouseMoved', [vue.x + 20, vue.y + 20]); await b.dormir(400);
const repos = await b.ev(`(()=>{const n=[...document.querySelectorAll('.note-box.mot')][0];return {cadre:!!n.querySelector('.sel-cadre'),bar:!!n.querySelector('.nb-bar'),anneau:/0px 0px 0px 1.5px/.test(getComputedStyle(n).boxShadow)}})()`);
b.ok(!repos.cadre && !repos.bar && !repos.anneau, 'au repos : ni poignée, ni coin, ni contour', JSON.stringify(repos));
await b.capture('boite-mot-repos' + (ipad ? '-ipad' : ''), { x: Math.round(ici[0] - 30), y: Math.round(ici[1] - 50), width: 200, height: 100 });
// 3) 10 déplacements en glissant la boîte elle-même (règle unique du 21/10) : taille mesurée à CHAQUE image
await b.ev(`(()=>{window.__tailles=[];const f=()=>{const n=document.querySelector('.note-box.mot');if(n){const r=n.getBoundingClientRect();window.__tailles.push([+r.width.toFixed(2),+r.height.toFixed(2)])}if(window.__ech)requestAnimationFrame(f)};window.__ech=true;requestAnimationFrame(f);return 1})()`);
let pos0 = null;
for (let i = 0; i < 10; i++) {
  const r = await b.rect(`document.querySelector('.note-box.mot')`);
  if (!pos0) pos0 = r;
  const de = [r.cx, r.cy], a = [r.cx + (i % 2 ? -40 : 45), r.cy + (i % 3 ? 25 : -20)];
  await (ipad ? b.doigt(de, a, 8) : b.glisser(de, a, 8));
}
await b.ev(`window.__ech=false;1`);
const tailles = await b.ev(`window.__tailles`);
const ws = tailles.map((t) => t[0]), hs = tailles.map((t) => t[1]);
const r1 = await b.rect(`document.querySelector('.note-box.mot')`);
b.ok(tailles.length > 40 && Math.max(...ws) - Math.min(...ws) <= 0.5 && Math.max(...hs) - Math.min(...hs) <= 0.5 && Math.hypot(r1.x - pos0.x, r1.y - pos0.y) > 5,
  '10 déplacements : taille identique à chaque image (aucune variation)', `${tailles.length} images, largeur ${Math.min(...ws)}–${Math.max(...ws)}, hauteur ${Math.min(...hs)}–${Math.max(...hs)}`);
// 4) « Ajouter une flèche » (mini barre) puis un clic sur la page = une flèche
const nb = await b.rect(`document.querySelector('.note-box.mot')`);
await (ipad ? b.tape([nb.x + 8, nb.cy]) : b.clic([nb.x + 8, nb.cy], { att: 400 })); // sélectionne
const ep = await b.rect(`document.querySelector('.mini-barre [data-option="fleche"]')`);
if (ep) { if (ipad) await b.tape([ep.cx, ep.cy]); else await b.clic([ep.cx, ep.cy], { att: 300 }); }
const vise = await b.ev(`!!document.querySelector('.pdfr-ancrage')`);
await (ipad ? b.tape([nb.x + 300, nb.y + 160]) : b.clic([nb.x + 300, nb.y + 160], { att: 500 }));
const bt = (await b.enBase()).find((a) => a.kind === 'libre');
b.ok(ep && vise && bt && (bt.fleches || []).length === 1 && (await b.ev(`!!document.querySelector('.note-box.mot.active')`)), '« Ajouter une flèche » : une flèche posée au clic suivant, la boîte reste sélectionnée', JSON.stringify({ vise, fleches: bt && (bt.fleches || []).length }));
await b.T.Escape(); await b.dormir(300);
// 5) zone de texte : mêmes règles
await b.outil('Texte'); await poser([vue.x + 200, vue.y + 420]); await b.attendreFocus();
let z = await mesure();
b.ok(z && Math.abs(z.w - 40) <= 1 && Math.abs(z.h - (z.ligne + 6)) <= 1, 'zone de texte vide : un mot (40 px, une ligne + 6 px)', JSON.stringify(z && { w: z.w, h: z.h, ligne: z.ligne }));
await b.ecrire('Hile'); await b.dormir(300);
z = await mesure();
b.ok(Math.abs(z.w - Math.max(40, z.texte + 12)) <= 1.5 && z.contour === '1.5px', 'zone de texte « Hile » : largeur = mot + 12 px, contour de sélection 1,5 px', JSON.stringify({ w: z.w, texte: z.texte, contour: z.contour }));
await b.T.Escape(); await b.dormir(300);
// 6) redimension à la main : taille gardée, jamais sous un mot
await b.outil('Sélection');
const bx = await b.rect(`document.querySelector('.note-box.mot:not(.texte-libre)')`);
await (ipad ? b.tape([bx.cx, bx.cy]) : b.clic([bx.cx, bx.cy], { att: 350 })); // sélection : les 4 coins
const coin = await b.rect(`document.querySelector('.note-box.mot:not(.texte-libre) .sel-coin.sel-se')`);
await (ipad ? b.doigt([coin.cx, coin.cy], [coin.cx - 200, coin.cy - 100], 8) : b.glisser([coin.cx, coin.cy], [coin.cx - 200, coin.cy - 100], 8));
const petit = await b.rect(`document.querySelector('.note-box.mot:not(.texte-libre)')`);
b.ok(petit.w >= 39.5 && petit.h >= 23.5, 'redimension vers le bas : jamais sous la taille d’un mot', JSON.stringify({ w: petit.w, h: petit.h }));
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
