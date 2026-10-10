// Partie C : révision d'une carte Muscle avec images — séance Apprendre, recto déjà affiché
// (« Compris, suivante » fait). node t-muscle-seance.mjs [ordi|mobile] [auRecto]
import { banc } from './commun-doc.mjs';
const mode = process.argv[2] || 'ordi';
const mobile = mode !== 'ordi'; // tactile (téléphone ou tablette)
const tel = mode === 'mobile';
const auRecto = process.argv[3] === 'auRecto';
const B = await banc(tel ? 390 : mode === 'tablette' ? 820 : 1440, tel ? 844 : mode === 'tablette' ? 1180 : 900);
const { c, ev, ok, clic, dormir } = B;
if (mobile) { await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await dormir(1200); }
const tap = async (p, att = 500) => { if (!mobile) return clic(p, { att }); await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p[0], y: p[1] }] }); await dormir(50); await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await dormir(att); };
if (mobile) {
  // shell mobile : reprendre la séance d'apprentissage ; présentation → « Compris, suivante »
  if (!(await ev(`!![...document.querySelectorAll('button')].find(b=>/Reprendre la séance|Commencer la séance|Démarrer la séance/.test(b.innerText))`))) {
    await ev(`(()=>{const b=[...document.querySelectorAll('.sb-item, button')].find(e=>/^Réviser$/.test((e.title||e.innerText||'').trim()));b&&b.click();return 1})()`); await dormir(1500);
  }
  const b = await B.pos(`[...document.querySelectorAll('button')].find(b=>/Reprendre la séance|Commencer la séance|Démarrer la séance/.test(b.innerText))`);
  await tap(b, 1500);
  const comp = await ev(`!![...document.querySelectorAll('button')].find(b=>/Compris, suivante/.test(b.innerText))`);
  if (comp) { await B.capture('muscle-presentation-mobile'); await tap(await B.pos(`[...document.querySelectorAll('button')].find(b=>/Compris, suivante/.test(b.innerText))`), 1200); }
}
const suffixe = (mobile ? '-' + mode : '') + (auRecto ? '-aurecto' : '');
// RECTO : le nom ; l'image générale seulement si « au recto »
const recto = await ev(`({gen:!!document.querySelector('.mu-image-generale img'),tableau:!!document.querySelector('.mu-tableau')})`);
ok(recto.gen === auRecto && !recto.tableau, `recto : nom seul${auRecto ? ' + image générale (option cochée)' : ' (image générale au verso, par défaut)'}`, JSON.stringify(recto));
await B.capture('muscle-recto' + suffixe);
await tap(await B.pos(`[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Voir la réponse')`), 900);
// VERSO, ligne par ligne : contenus ET images masqués
let etat = await ev(`({gen:!!document.querySelector('.mu-image-generale img'),cachees:document.querySelectorAll('.mu-ligne.cachee').length,vign:document.querySelectorAll('.mu-tableau .mui-vignette').length})`);
ok(etat.gen && etat.cachees === 3 && etat.vign === 0, 'verso : image générale visible, 3 lignes remplies masquées avec leurs images', JSON.stringify(etat));
await B.capture('muscle-verso-masque' + suffixe);
// toucher Origine → texte + image de cette ligne seulement
await tap(await B.pos(`document.querySelector('.mu-ligne[data-ligne="origine"]')`), 600);
etat = await ev(`({orig:!!document.querySelector('.mu-ligne[data-ligne="origine"] .mui-vignette img'),masques:document.querySelectorAll('.mu-ligne[data-ligne="origine"] .mui-masque').length,action:!!document.querySelector('.mu-ligne[data-ligne="action"] .mui-vignette'),cachees:document.querySelectorAll('.mu-ligne.cachee').length})`);
ok(etat.orig && etat.masques === 2 && !etat.action && etat.cachees === 2, 'Origine révélée : son image apparaît (avec ses 2 mots masqués), les autres restent cachées', JSON.stringify(etat));
await B.capture('muscle-ligne-origine' + suffixe);
// toucher la vignette → visionneuse (la carte ne bouge pas)
await tap(await B.pos(`document.querySelector('.mu-ligne[data-ligne="origine"] .mui-vignette')`), 900);
const vis = await ev(`({ouverte:!!document.querySelector('.mui-visionneuse img'),masques:document.querySelectorAll('.mui-visionneuse .mui-masque').length})`);
for (let i = 0; i < 40 && !(await ev(`(()=>{const b=[...document.querySelectorAll('.mui-visionneuse button')].find(b=>/^Texte/.test(b.innerText.trim()));return !!b&&!b.disabled})()`)); i++) await dormir(250);
await tap(await B.pos(`[...document.querySelectorAll('.mui-visionneuse button')].find(b=>/^Texte/.test(b.innerText.trim()))`, false), 600);
const mots = await ev(`(()=>{const s=[...document.querySelectorAll('.mui-v-mots span')];return {n:s.length,select:s.length?getComputedStyle(s[0]).userSelect:null,texte:s.map(x=>x.textContent).join('').slice(0,60)}})()`);
// sélectionner du texte reconnu (glisser sur 3 mots)
const sel = await ev(`(()=>{const s=[...document.querySelectorAll('.mui-v-mots span')];const r=document.createRange();r.setStart(s[1].firstChild,0);r.setEnd(s[3].firstChild,s[3].firstChild.length);getSelection().removeAllRanges();getSelection().addRange(r);return getSelection().toString()})()`);
ok(vis.ouverte && vis.masques === 2 && mots.n > 20 && mots.select === 'text' && sel.trim().split(/\s+/).length === 3, 'visionneuse : OCR « Texte » → mots sélectionnables ; 2 masques', `${mots.n} mots · « ${sel.trim()} »`);
await B.capture('muscle-visionneuse-ocr' + suffixe);
await tap(await B.pos(`[...document.querySelectorAll('.mui-visionneuse button')].find(b=>/^Révéler/.test(b.innerText.trim()))`, false), 400);
const rev = await ev(`document.querySelectorAll('.mui-visionneuse .mui-masque').length`);
ok(rev === 0, '« Révéler » enlève les masques de la ligne');
await tap(await B.pos(`.mui-visionneuse button[aria-label="Fermer"]`.length ? `document.querySelector('.mui-visionneuse button[aria-label="Fermer"]')` : '', false), 500);
const toujours = await ev(`({vis:!!document.querySelector('.mui-visionneuse'),verso:!!document.querySelector('.mu-tableau'),cachees:document.querySelectorAll('.mu-ligne.cachee').length})`);
ok(!toujours.vis && toujours.verso && toujours.cachees === 2, 'fermée : la carte est toujours au verso, rien d’autre révélé', JSON.stringify(toujours));
// Tout révéler → image de la ligne Action
await tap(await B.pos(`document.querySelector('.mu-tout-btn')`), 600);
const tout = await ev(`({action:!!document.querySelector('.mu-ligne[data-ligne="action"] .mui-vignette img'),cachees:document.querySelectorAll('.mu-ligne.cachee').length})`);
ok(tout.action && tout.cachees === 0, '« Tout révéler » : image de la ligne Action visible');
await B.capture('muscle-verso-tout' + suffixe);
if (tel) {
  const larg = await ev(`({page:document.documentElement.scrollWidth,vue:innerWidth,coupe:[...document.querySelectorAll('.mui-vignette img, .mu-image-generale img')].some(i=>{const r=i.getBoundingClientRect();return r.right>innerWidth+1||r.left<-1})})`);
  ok(larg.page <= larg.vue && !larg.coupe, 'mobile : pas de défilement horizontal, aucune image coupée', JSON.stringify(larg));
}
ok(!B.erreurs.length, 'aucune exception JS', B.erreurs.join(' | '));
c.fermer();
