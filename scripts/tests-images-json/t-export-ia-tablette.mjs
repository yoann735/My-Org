// Partie A sur tablette (820 × 1180, tactile) : menu Fichier › Export spécial IA, panneau à l'écran, aperçu
import { banc } from './commun-doc.mjs';
import { tablette } from './tab-commun.mjs';
const B = await banc(820, 1180);
const { ev, ok, dormir } = B;
const T = await tablette(B);
await T.tap(await B.pos(`document.querySelector('.mf-bouton')`, false));
await T.tap(await B.pos(`[...document.querySelectorAll('.mf-item')].find(b=>b.innerText.startsWith('Export spécial IA'))`, false), 600);
const rp = await ev(`(()=>{const r=document.querySelector('.eia-panneau').getBoundingClientRect();return [Math.round(r.left),Math.round(r.top),Math.round(r.right),Math.round(r.bottom),innerWidth]})()`);
ok(rp[0] >= 0 && rp[2] <= rp[4] && rp[3] <= 1180, 'tablette : panneau « Export spécial IA » entièrement à l’écran', JSON.stringify(rp));
await T.tap(await B.pos(`[...document.querySelectorAll('.eia-panneau button')].find(b=>b.innerText.includes('Aperçu'))`, false), 400);
for (let i = 0; i < 40 && !(await ev(`!!document.querySelector('.eia-page img')`)); i++) await dormir(250);
await dormir(500);
const ap = await ev(`(()=>{const i=document.querySelector('.eia-page img');const r=i.getBoundingClientRect();return {w:i.naturalWidth,aff:Math.round(r.width),vue:innerWidth}})()`);
ok(ap.w === 1190 && ap.aff <= ap.vue, 'tablette : aperçu (PNG 2×) ajusté à la largeur', JSON.stringify(ap));
await B.capture('ia-apercu-tablette');
ok(!B.erreurs.length, 'aucune exception JS', B.erreurs.join(' | '));
B.c.fermer();
