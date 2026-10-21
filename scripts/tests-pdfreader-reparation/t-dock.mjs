// Dock de couleurs : pour chaque outil, EXACTEMENT 7 couleurs franches │ noir blanc │ « + » puis ≤ 3 favoris ; le « + »
// ouvre le sélecteur complet, une couleur choisie là devient un favori (3 au plus, retirables) ; animation des
// pastilles inchangée ; les 9 couleurs sur fond blanc et sur fond noir (capture) ; saturation mesurée.
import { banc } from './commun.mjs';
const b = await banc(1440, 900);
await b.preparer([]);
await b.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const m=u.find(n=>n.includes('/medrevise/lib/couleursPerso.js'));if(!m)return 0;const C=await import(m);if(C.viderCouleursPerso)await C.viderCouleursPerso();return 1})()`);
await b.ev(`localStorage.removeItem('medrevise.couleursPerso');1`);
await b.ouvrirCours();
const ATTENDU = [['Rouge', '#ff1f2d'], ['Orange', '#ff7a00'], ['Jaune', '#ffd500'], ['Vert', '#00c853'], ['Bleu', '#0a64ff'], ['Violet', '#8a2bff'], ['Rose', '#ff2d95'], '|', ['Noir', '#1f1f24'], ['Blanc', '#ffffff'], '|', '+'];
const hex = (rgb) => '#' + rgb.match(/\d+/g).slice(0, 3).map((x) => (+x).toString(16).padStart(2, '0')).join('');
const dock = () => b.ev(`[...document.querySelector('.pdfr-contexte .sc-couleurs').children].map(e=>e.classList.contains('sc-sep')?'|':e.classList.contains('sc-plus')?'+':e.classList.contains('sc-perso')?'fav:'+getComputedStyle(e.firstChild).backgroundColor:[(e.getAttribute('aria-label')||'').split(' —')[0],getComputedStyle(e).backgroundColor])`);
const norm = (l) => l.map((x) => (Array.isArray(x) ? [x[0], hex(x[1])] : x));
for (const outil of ['Surligneur', 'Crayon', 'Boîte', 'Forme', 'Texte']) {
  await b.outil(outil); await b.dormir(300);
  const d = norm(await dock());
  const reste = d.slice(ATTENDU.length);
  b.ok(JSON.stringify(d.slice(0, ATTENDU.length)) === JSON.stringify(ATTENDU) && reste.length <= 3 && reste.every((x) => String(x).startsWith('fav:')), `${outil} : 7 couleurs │ noir blanc │ « + » puis ≤ 3 favoris — rien d’autre`, d.map((x) => (Array.isArray(x) ? x[1] : x)).join(' '));
}
// saturation des 7 (HSL)
const sat = (h) => { const [r, g, bb] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); const M = Math.max(r, g, bb), m = Math.min(r, g, bb), l = (M + m) / 2; return M === m ? 0 : (M - m) / (1 - Math.abs(2 * l - 1)); };
const s7 = ATTENDU.slice(0, 7).map((x) => Math.round(sat(x[1]) * 100));
b.ok(s7.every((s) => s >= 99), '7 couleurs franches : saturation 100 % (palette du 20/10 : 68 à 100 %)', s7.join(' '));
// animation des pastilles : la même qu'avant (transition transform + box-shadow 0,15 s, survol agrandi)
await b.outil('Surligneur');
const anim = await b.ev(`getComputedStyle(document.querySelector('.pdfr-contexte .sc-pastille')).transition`);
const p = await b.pos(`document.querySelector('.pdfr-contexte .sc-pastille')`, false);
await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1] }); await b.dormir(300);
const survol = await b.ev(`getComputedStyle(document.querySelector('.pdfr-contexte .sc-pastille')).transform`);
b.ok(/transform 0\.15s/.test(anim) && /box-shadow 0\.15s/.test(anim) && survol !== 'none', 'animation des pastilles conservée (transition 0,15 s, agrandie au survol)', `${anim} · ${survol}`);
// « + » → sélecteur complet ; 4 couleurs choisies → 3 favoris au plus, retirables
const favs = [];
for (let i = 0; i < 4; i++) {
  await b.clic(await b.pos(`document.querySelector('.pdfr-contexte .sc-plus')`, false), { att: 400 });
  const ouvert = await b.ev(`!!document.querySelector('.scw-panneau')`);
  if (i === 0) b.ok(ouvert, '« + » ouvre le sélecteur complet');
  const c = await b.pos(`document.querySelectorAll('.scw-panneau .scw-ligne:not(.base):not(.scw-recentes) .scw-cellule')[${3 + i * 7}]`, false);
  favs.push(await b.ev(`(document.querySelectorAll('.scw-panneau .scw-ligne:not(.base):not(.scw-recentes) .scw-cellule')[${3 + i * 7}]||{}).title||''`));
  await b.clic(c, { att: 500 });
}
let d = norm(await dock());
const nf = d.filter((x) => typeof x === 'string' && x.startsWith('fav:')).length;
b.ok(nf === 3 && d.indexOf('+') === 11 && d.slice(12).every((x) => String(x).startsWith('fav:')) && favs.every((f) => f), 'couleurs choisies au « + » : 3 favoris au plus, juste après le « + »', d.slice(11).join(' '));
await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...(await b.ev(`(()=>{const r=document.querySelector('.pdfr-contexte .sc-perso').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)) }); await b.dormir(300);
await b.clic(await b.pos(`document.querySelector('.pdfr-contexte .sc-perso .sc-retirer')`, false), { att: 400 });
d = norm(await dock());
b.ok(d.filter((x) => String(x).startsWith('fav:')).length >= 2, 'un favori se retire par sa croix', d.slice(10).join(' '));
// les 9 couleurs sur fond blanc et sur fond noir
const pastilles = ATTENDU.filter(Array.isArray);
await b.ev(`(()=>{const d=document.createElement('div');d.id='banc-dock';d.style.cssText='position:fixed;left:0;top:0;z-index:99999;display:flex;flex-direction:column;font:600 12px system-ui';
  for(const fond of ['#ffffff','#000000']){const l=document.createElement('div');l.style.cssText='display:flex;gap:10px;padding:14px;background:'+fond;
  for(const [n,h] of ${JSON.stringify(pastilles)}){const c=document.createElement('div');c.style.cssText='display:flex;flex-direction:column;align-items:center;gap:6px;color:'+(fond==='#000000'?'#ddd':'#333');c.innerHTML='<span style="width:44px;height:44px;border-radius:50%;background:'+h+';box-shadow:inset 0 0 0 1px rgba(127,127,127,.35)"></span><span style="width:60px;height:12px;border-radius:3px;background:'+h+'"></span>'+n;l.appendChild(c)}d.appendChild(l)}document.body.appendChild(d);return 1})()`);
await b.dormir(300);
const r = await b.rect(`document.getElementById('banc-dock')`);
await b.capture('dock-fonds', { x: 0, y: 0, width: Math.round(r.w), height: Math.round(r.h) });
await b.ev(`document.getElementById('banc-dock').remove();1`);
await b.outil('Crayon'); await b.dormir(300); // (le Surligneur est déjà l'outil actif : un re-clic le quitterait)
const rd = await b.rect(`document.querySelector('.pdfr-contexte')`);
await b.capture('dock', { x: Math.round(rd.x), y: Math.round(rd.y), width: Math.round(Math.min(rd.w, 720)), height: Math.round(rd.h) });
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
