// §4 finitions des boîtes : menu Tableau À CÔTÉ de la boîte (milieu, bord droit, bas de l'écran) ; cellule / plage
// sélectionnée (contour d'accent, plus de bleu ni de champ incrusté) ; image d'une boîte recadrée en place, élargie /
// rétrécie, remplacée, texte OCR ; icône de taille « A » + valeur entière.   node t-boites.mjs [tablette]
process.env.FX = process.env.FX || '/private/tmp/claude-501/-Users-yoannlmr/0545675d-31a2-4904-9035-057155dd513d/scratchpad/fx';
import { banc, outilsTableau, imagesTest } from '../tests-boites-tableaux/commun.mjs';
import fs from 'node:fs';
const tablette = process.argv[2] === 'tablette';
const app = tablette ? 'tablette' : 'ordinateur';
const b = await banc();
let echecs = 0; const v = (c, m, d = '') => { console.log((c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : '')); if (!c) echecs++; };
const IM = await imagesTest(b);
const G0 = { v: 1, cols: [0.3333, 0.3333, 0.3334], entete: true, lignes: [['Muscle', 'Origine', 'Action'], ['Psoas', 'L1–L4', 'Flexion'], ['Iliaque', 'Fosse iliaque', 'Flexion']] };
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const base = { ficheId: 'f-simpl', page: 1, kind: 'libre', type: 'boite', fond: 'plein', gabarit: 'carte', taille1000: 16, bord1000: 1.5, pad1000: [10, 8], couleur: 'jaune-franc', createdAt: '2026-10-25T08:00:00.000Z' };
const png = fs.readFileSync(IM.schema).toString('base64');
const blobId = await b.S(`const bin=atob(${JSON.stringify(png)});const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return await S.putBlob(new Blob([a],{type:'image/png'}))`);
await b.preparer({ annotations: [
  b.boiteGrille('bt-milieu', G0, { x: 0.02, y: 0.08, width: 0.4 }),
  b.boiteGrille('bt-droite', G0, { x: 0.58, y: 0.5, width: 0.41 }),
  b.boiteGrille('bt-bas', G0, { x: 0.02, y: 0.78, width: 0.96 }),
  { ...base, id: 'bi-img', x: 0.55, y: 0.06, width: 0.3, height: 0.05, largeurFixe: true, content: doc('Schéma du néphron'), image: { blobId, ratio: 520 / 900, position: 'dessus' } },
] });
await b.ouvrirCours({ tablette });
// panneau latéral replié : la page occupe la largeur — une boîte au bord droit touche le bord de l'écran
if (!tablette) { await b.ev(`(()=>{const h=document.querySelector('.pis:not(.collapsed) > .split-handle');h&&h.click();return 1})()`); await b.dormir(1200); await b.ev(`window.__mrZoom&&window.__mrZoom(1.25);1`); await b.dormir(1200); }
const A = async (id) => (await b.enBase()).find((a) => a.id === id);
const box = (id) => `document.querySelector('.note-box[data-boite="${id}"]')`;
// ---- 1. menu Tableau : à côté de la boîte ----
const recouvre = (a, c) => !(a.x + a.w <= c.x || a.x >= c.x + c.w || a.y + a.h <= c.y || a.y >= c.y + c.h);
const cotes = {};
for (const [id, ou] of [['bt-milieu', 'center'], ['bt-droite', 'center'], ['bt-bas', 'end']]) {
  const T = outilsTableau(b, `.note-box[data-boite="${id}"]`);
  await b.T.Escape(); await b.dormir(200);
  await b.ev(`${box(id)}.scrollIntoView({block:'${ou}'});1`); await b.dormir(700);
  await b.clic(await b.pos(box(id), false), { att: 500 });
  await b.clic(await T.posCell(1, 1), { att: 600 });
  await T.ouvrirMenu(); await b.dormir(400);
  const g = await b.ev(`(()=>{const p=document.querySelector('.mt-pop').getBoundingClientRect(),bx=${box(id)}.getBoundingClientRect(),t=${box(id)}.querySelector('.btab-table').getBoundingClientRect();const R=(r)=>({x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)});
    return {pop:R(p),boite:R(bx),table:R(t),cote:document.querySelector('.mt-pop').dataset.cote,W:innerWidth,H:innerHeight,defile:document.querySelector('.mt-pop').scrollHeight>document.querySelector('.mt-pop').clientHeight+1}})()`);
  const dansEcran = g.pop.x >= 0 && g.pop.y >= 0 && g.pop.x + g.pop.w <= g.W && g.pop.y + g.pop.h <= g.H;
  v(!recouvre(g.pop, g.boite) && !recouvre(g.pop, g.table) && dansEcran, `menu Tableau (${id}) : ${g.cote}, ni sur la boîte ni sur le tableau, dans l’écran${g.defile ? ', défile en interne' : ''}`, JSON.stringify(g));
  cotes[id] = g.cote;
  v((await T.focus()) === '1:1', `(${id}) le curseur reste dans la cellule`);
  await b.capture(`boites-${app}-menu-${id}`);
  await T.menu('ins-dessous'); // le menu agit toujours
  v((await A(id)).grille.lignes.length === 4, `(${id}) une entrée du menu agit (insérer en dessous)`);
  await T.fermerMenu();
}
console.log('côtés :', JSON.stringify(cotes));
if (!tablette) v(cotes['bt-milieu'] === 'droite' && cotes['bt-droite'] === 'gauche' && ['dessus', 'dessous'].includes(cotes['bt-bas']), 'bord gauche → à droite ; bord droit → à gauche ; boîte pleine largeur en bas → au-dessus / en dessous');
// ---- 2. cellule sélectionnée / plage ----
{
  const id = 'bt-milieu', T = outilsTableau(b, `.note-box[data-boite="${id}"]`);
  await b.T.Escape(); await b.dormir(200);
  await b.ev(`${box(id)}.scrollIntoView({block:'center'});1`); await b.dormir(600);
  await b.clic(await b.pos(box(id), false), { att: 500 });
  await b.clic(await T.posCell(1, 1), { att: 600 });
  const c = await b.ev(`(()=>{const td=${box(id)}.querySelector('.btab-td.sel'),cl=td.querySelector('.btab-cell'),a=document.activeElement;const s=getComputedStyle(td),k=getComputedStyle(cl);
    return {bg:s.backgroundImage,ombre:s.boxShadow,focus:a===cl,celOmbre:k.boxShadow,celFond:k.backgroundColor,arrondi:k.borderTopLeftRadius,police:k.fontSize===getComputedStyle(${box(id)}.querySelector('.btab-td:not(.sel) .btab-cell')).fontSize}})()`);
  v(c.bg === 'none' && /inset/.test(c.ombre) && (c.ombre.match(/inset/g) || []).length === 4, 'cellule sélectionnée : pas de surlignage, un contour intérieur fin (4 bords)', c.ombre);
  v(c.focus && c.celOmbre === 'none' && /rgba\(0, 0, 0, 0\)|transparent/.test(c.celFond) && c.arrondi === '0px' && c.police, 'édition : on tape dans la cellule, sans champ visible (ni ombre, ni fond, ni arrondi), même typographie');
  await b.c.send('Input.insertText', { text: ' (L1)' }); await b.dormir(300);
  await b.capRect(`boites-${app}-cellule`, box(id), 14);
  await T.glisserSouris(await T.posCell(1, 0), await T.posCell(2, 1), 10); await b.dormir(400);
  const p = await b.ev(`[...${box(id)}.querySelectorAll('.btab-td.sel')].map(td=>({bg:getComputedStyle(td).backgroundImage,n:(getComputedStyle(td).boxShadow.match(/inset/g)||[]).length}))`);
  v(p.length === 4 && p.every((x) => /12%|0\.12/.test(x.bg) || /color-mix|rgba/.test(x.bg)) && p.every((x) => x.n === 2), 'plage : voile d’accent à 12 % + contour extérieur (2 bords par cellule d’un carré 2×2)', JSON.stringify(p.map((x) => x.n)) + ' ' + (p[0] && p[0].bg).slice(0, 80));
  await b.capRect(`boites-${app}-plage`, box(id), 14);
}
// ---- 3. image d'une boîte : recadrer en place, largeur, remplacer, texte ----
await b.T.Escape(); await b.dormir(200);
await b.ev(`${box('bi-img')}.scrollIntoView({block:'center'});1`); await b.dormir(700);
await b.clic(await b.pos(box('bi-img'), false), { att: 600 });
await b.clic(await b.pos(`[...document.querySelectorAll('.mini-barre [data-option="image"]')].find(e=>e.offsetParent)`, false), { att: 500 });
const entrees = await b.ev(`[...document.querySelectorAll('.mb-plus-pop [data-option]')].map(e=>e.dataset.option)`);
v(JSON.stringify(entrees) === JSON.stringify(['image-recadrer', 'image-largeur', 'image-dessus', 'image-dessous', 'image-remplacer', 'image-texte', 'image-retirer']), 'mini barre › une seule entrée « Image » : recadrer · largeur · au-dessus · en dessous · remplacer · texte (OCR) · retirer', entrees.join(' · '));
await b.clic(await b.pos(`document.querySelector('.mb-plus-pop [data-option="image-recadrer"]')`, false), { att: 700 });
v(await b.ev(`!!document.querySelector('.rgn')`), 'recadrer : cadre + poignées posés sur l’image de la boîte');
const se = await b.pos(`document.querySelector('.rgn .rgn-coin.rgn-se')`, false), nw = await b.pos(`document.querySelector('.rgn .rgn-coin.rgn-nw')`, false);
await b.glisser(se, [se[0] - 90, se[1] - 50], 10);
await b.glisser(nw, [nw[0] + 40, nw[1] + 20], 10);
await b.capture(`boites-${app}-recadrage`);
await b.T.Escape ? 0 : 0;
await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await b.dormir(900);
let I = (await A('bi-img')).image;
const vis = await b.ev(`(()=>{const im=${box('bi-img')}.querySelector('.nb-image'),bx=${box('bi-img')}.getBoundingClientRect(),r=im.getBoundingClientRect();return {w:r.width,h:r.height,dans:r.left>=bx.left-0.5&&r.right<=bx.right+0.5&&r.bottom<=bx.bottom+0.5}})()`);
v(I.rognage && I.rognage.w < 0.95 && I.rognage.h < 0.95 && Math.abs(vis.h / vis.w - (520 / 900) * (I.rognage.h / I.rognage.w)) < 0.03 && vis.dans, 'Entrée : recadrage enregistré, l’image affichée = la partie gardée, dans la boîte', JSON.stringify(I.rognage));
await b.capRect(`boites-${app}-image-recadree`, box('bi-img'), 14);
// Échap annule un recadrage
await b.clic(await b.pos(`[...document.querySelectorAll('.mini-barre [data-option="image"]')].find(e=>e.offsetParent)`, false), { att: 500 });
await b.clic(await b.pos(`document.querySelector('.mb-plus-pop [data-option="image-recadrer"]')`, false), { att: 700 });
const se2 = await b.pos(`document.querySelector('.rgn .rgn-coin.rgn-se')`, false);
await b.glisser(se2, [se2[0] - 40, se2[1] - 30], 8);
await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await b.dormir(600);
v(JSON.stringify((await A('bi-img')).image.rognage) === JSON.stringify(I.rognage) && !(await b.ev(`!!document.querySelector('.rgn')`)), 'Échap : recadrage annulé');
// largeur : poignée droite glissée vers la gauche (bornée à la boîte)
await b.clic(await b.pos(box('bi-img'), false), { att: 500 });
const pg = await b.pos(`${box('bi-img')}.querySelector('[data-poignee-image="d"]')`, false);
v(!!pg, 'poignées de largeur sur l’image de la boîte sélectionnée');
const w0 = vis.w;
await b.glisser(pg, [pg[0] - 60, pg[1]], 10); await b.dormir(600);
I = (await A('bi-img')).image;
const w1 = await b.ev(`${box('bi-img')}.querySelector('.nb-image').getBoundingClientRect().width`);
v(I.largeur > 0.15 && I.largeur < 0.85 && Math.abs(w1 - w0 * I.largeur) < 3, `largeur réglée : ${Math.round(I.largeur * 100)} % de la boîte (${Math.round(w0)} → ${Math.round(w1)} px)`);
const pg2 = await b.pos(`${box('bi-img')}.querySelector('[data-poignee-image="d"]')`, false);
await b.glisser(pg2, [pg2[0] + 600, pg2[1]], 10); await b.dormir(600);
v((await A('bi-img')).image.largeur === 1, 'élargie au-delà : bornée à la largeur de la boîte (100 %)');
await b.glisser(await b.pos(`${box('bi-img')}.querySelector('[data-poignee-image="d"]')`, false), [pg[0] - 40, pg[1]], 10); await b.dormir(600);
await b.capRect(`boites-${app}-image-largeur`, box('bi-img'), 14);
// remplacer
await b.clic(await b.pos(`[...document.querySelectorAll('.mini-barre [data-option="image"]')].find(e=>e.offsetParent)`, false), { att: 500 });
const choix = b.choisirFichier(IM.photo);
await b.clic(await b.pos(`document.querySelector('.mb-plus-pop [data-option="image-remplacer"]')`, false), { att: 300 });
await choix; await b.dormir(1500);
const I2 = (await A('bi-img')).image;
v(I2.blobId !== blobId && Math.abs(I2.ratio - 0.5) < 0.01, 'Remplacer… : nouvelle image dans la boîte', JSON.stringify(I2));
// ---- 4. icône de taille ----
await b.T.Escape(); await b.dormir(200);
await b.clic(await b.pos(box('bt-milieu'), true), { att: 600 });
const ct = await b.ev(`(()=>{const x=[...document.querySelectorAll('.mini-barre [data-option="taille"]')].find(e=>e.offsetParent);return x?{val:x.querySelector('.ct-bt-val').textContent,svg:x.querySelector('svg').innerHTML}:null})()`);
v(ct && /^\d+$/.test(ct.val) && /M3 20 9 4/.test(ct.svg), `icône de taille « A + flèche » suivie d’une valeur entière (« ${ct && ct.val} »)`);
await b.capRect(`boites-${app}-taille`, `[...document.querySelectorAll('.mini-barre')].find(e=>e.offsetParent)`, 8);
v(!(b.erreurs && b.erreurs.length), 'console sans erreur', (b.erreurs || []).slice(0, 3).join(' | '));
console.log(echecs ? `❌ ${echecs} échec(s)` : '✅ tout est vert');
process.exit(0);
