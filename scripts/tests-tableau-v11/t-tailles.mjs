// v1.1 — TAILLES EN PX D'UNE PAGE DE 1000 PX, GRILLE DES DÉFAUTS, SÉLECTEUR UNIQUE (docs/compte-rendu-tableau-flashcards.md
// « v1.1 — corrections »). Base LOCALE, Chrome headless.
//   node t-tailles.mjs geo avant|apres     trois cours (A4 portrait, diapo 16:9, capture 390 × 844) chargés d'annotations
//                                          EXISTANTES (sans champ, du 22/10 en %, flèches à facteur) : « apres » compare
//                                          au relevé « avant » (fait sur l'ancien code) — rien ne doit bouger
//   node t-tailles.mjs uniforme [ipad]     16 px choisis au sélecteur sur les trois formats : la même proportion
//   node t-tailles.mjs selecteurs [ipad]   le même sélecteur pour texte, crayon, surligneur, flèche, forme (et bordure) ;
//                                          les nouveaux défauts des NOUVELLES annotations
import { banc } from '../tests-pdfreader-harmonisation/commun.mjs';
import fs from 'node:fs';
const [mode, arg] = process.argv.slice(2);
const appareil = ['ipad', 'mobile'].includes(arg) ? arg : ['ipad', 'mobile'].includes(process.argv[4]) ? process.argv[4] : 'ordinateur';
const ipad = appareil !== 'ordinateur'; // tactile (iPad 1024 px, mobile 768 px)
const b = await banc(1440, 900, { tactile: ipad });
const SP = '/private/tmp/claude-501/-Users-yoannlmr/2137b736-c6a0-4c99-af08-296a4cde0816/scratchpad';
const COURS = [['f-fmt-a4', 'Format A4 portrait'], ['f-fmt-169', 'Format diapo 16:9'], ['f-fmt-cap', 'Format capture']];
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const base = (f) => ({ ficheId: f, page: 1, createdAt: '2026-10-20T12:00:00.000Z' });
const existantes = (f) => [
  // d'avant le 22/10 : sans champ de taille, épaisseurs en fraction de la HAUTEUR
  { ...base(f), id: 'g-bandeau', kind: 'libre', type: 'boite', x: 0.06, y: 0.06, width: 0.3, height: 0.08, couleur: 'jaune', content: doc('Boîte d’avant, bandeau') },
  { ...base(f), id: 'g-mot', kind: 'libre', type: 'boite', gabarit: 'mot', x: 0.06, y: 0.18, width: 0.05, height: 0.02, couleur: 'jaune-franc', fond: 'plein', content: doc('Néphron'),
    fleches: [{ id: 'flg', geo: 3, x: 0.5, y: 0.2 }] },
  { ...base(f), id: 'g-texte', kind: 'texte', type: 'texte', gabarit: 'mot', x: 0.06, y: 0.27, width: 0.05, height: 0.02, couleur: 'bleu-franc', content: doc('Hile rénal') },
  { ...base(f), id: 'g-trait', kind: 'trait', type: 'trait', mode: 'dessin', rendu: 'cr', couleur: 'rose-franc', epaisseur: 0.0042, opacite: 1, points: [[0.06, 0.36], [0.2, 0.39], [0.34, 0.36]] },
  { ...base(f), id: 'g-surl', kind: 'trait', type: 'trait', mode: 'surligneur', rendu: 'droit', couleur: 'jaune', epaisseur: 0.017, opacite: 0.4, points: [[0.5, 0.36], [0.8, 0.36]] },
  { ...base(f), id: 'g-forme', kind: 'forme', type: 'forme', forme: 'rectangle', x: 0.06, y: 0.43, width: 0.3, height: 0.08, couleur: 'rouge-franc', epaisseur: 0.0025, texte: 'Forme' },
  { ...base(f), id: 'g-fl', kind: 'forme', type: 'forme', forme: 'fleche', x: 0.5, y: 0.45, width: 0.3, height: 0.05, couleur: 'vert-franc', epaisseur: 0.0012, fleche: { geo: 3, epaisseur: 1.6 } },
  // du 22/10 : texte en % de la largeur, épaisseurs en fraction de la largeur
  { ...base(f), id: 'u-boite', kind: 'libre', type: 'boite', gabarit: 'carte', tailleTexte: 1.4, x: 0.06, y: 0.58, width: 0.05, height: 0.02, couleur: 'jaune-franc', fond: 'transparent', content: doc('Glomérule') },
  { ...base(f), id: 'u-trait', kind: 'trait', type: 'trait', mode: 'dessin', rendu: 'cr', couleur: 'rose-franc', epaisseurL: 0.003, epaisseur: 0.003, opacite: 1, points: [[0.06, 0.7], [0.5, 0.7]] },
  { ...base(f), id: 'u-forme', kind: 'forme', type: 'forme', forme: 'ellipse', x: 0.55, y: 0.6, width: 0.3, height: 0.1, couleur: 'violet', epaisseurL: 0.0018, epaisseur: 0.0018, tailleTexte: 1.0, texte: 'Tubule' },
];
const mesurer = () => b.ev(`(()=>{const p=document.querySelector('.pdfr-page[data-cle="1"]').getBoundingClientRect();const o={page:{w:+p.width.toFixed(2),h:+p.height.toFixed(2)}};
  const rel=(r)=>({x:+(r.x-p.x).toFixed(2),y:+(r.y-p.y).toFixed(2),w:+r.width.toFixed(2),h:+r.height.toFixed(2)});
  for(const e of document.querySelectorAll('[data-objet]')){const id=e.dataset.objet;if(!/^[gu]-/.test(id))continue;const corps=e.querySelector('.nb-body,.pf-texte');const sc=parseFloat(getComputedStyle(e).scale)||1;
    const cs=getComputedStyle(e);const cb=corps&&getComputedStyle(corps);
    const trace=e.querySelector('.pf-trace');o[id]={...rel(e.getBoundingClientRect()),police:corps?+(parseFloat(cb.fontSize)*sc).toFixed(2):null,pad:corps&&!e.querySelector('.pf-texte')?+(parseFloat(cb.paddingLeft)*sc).toFixed(2):null,
      bordure:+(parseFloat(cs.borderTopWidth)*sc).toFixed(2),bord:trace?+parseFloat(trace.getAttribute('stroke-width')).toFixed(3):null}}
  let i=0;for(const t of document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-inklayer path')){o['trait'+(++i)]={ep:+parseFloat(t.getAttribute('stroke-width')).toFixed(3)}}
  for(const t of document.querySelectorAll('.pdfr-page[data-cle="1"] .nb-conn-trait')){o['conn-'+t.closest('[data-conn]').dataset.conn]={ep:+parseFloat(t.getAttribute('stroke-width')).toFixed(3)}}
  return o})()`);
const ouvrir = async (id, titre, annotations) => {
  await b.S(`for(const a of await S.getAll('annotations'))if(a.ficheId===${JSON.stringify(id)})await S.remove('annotations',a.id);for(const r of await S.getAll('reading_position'))if(String(r.id).startsWith('rp:${id}'))await S.remove('reading_position',r.id);
    for(const a of ${JSON.stringify(annotations)})await S.put('annotations',a);return 1`);
  // la Bibliothèque replie sa liste sous 900 px : le cours s'ouvre en 1 440 px, l'appareil vient après
  if (ipad) { await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }); await b.dormir(600); }
  await b.biblio({ recharger: true }); await b.ouvrir(titre); await b.dormir(1500);
  if (ipad) { await b.c.send('Emulation.setDeviceMetricsOverride', { width: appareil === 'mobile' ? 768 : 1024, height: appareil === 'mobile' ? 1024 : 1366, deviceScaleFactor: 2, mobile: true }); await b.dormir(1500); }
  await b.ev(`window.__mrZoom(1);1`); await b.dormir(1200);
  await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(900);
  await b.outil('Sélection'); await b.dormir(300);
};
const souris = (type, [x, y], ex = {}) => b.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...ex });
const poser = async (p) => { const ex = ipad ? { pointerType: 'pen' } : {}; await souris('mouseMoved', p, ex); await souris('mousePressed', p, { ...ex, buttons: 1 }); await souris('mouseReleased', p, ex); await b.dormir(500); };
const toucher = (p) => (ipad ? b.tape(p) : b.clic(p, { att: 400 }));
const tirer = async (de, a) => { const ex = ipad ? { pointerType: 'pen' } : {}; await souris('mouseMoved', de, ex); await souris('mousePressed', de, { ...ex, buttons: 1 }); for (let k = 1; k <= 10; k++) { await souris('mouseMoved', [de[0] + (a[0] - de[0]) * k / 10, de[1] + (a[1] - de[1]) * k / 10], { ...ex, buttons: 1 }); await b.dormir(30); } await souris('mouseReleased', a, ex); await b.dormir(500); };
/** le sélecteur ouvert : sa structure (préréglages, champ, aperçus) */
const lireSelecteur = () => b.ev(`(()=>{const p=document.querySelector('.ct-pop');if(!p)return null;return {titre:p.querySelector('.ct-titre').textContent,presets:[...p.querySelectorAll('.ct-preset')].map(x=>+x.dataset.px),actif:(p.querySelector('.ct-preset.actif')||{dataset:{}}).dataset.px||null,
  champ:(p.querySelector('[data-champ="px"]')||{}).value,unite:(p.querySelector('.ct-unite')||{}).textContent,apercus:p.querySelectorAll('.ct-ap .ct-aa, .ct-ap .ct-trait').length,liste:p.querySelectorAll('.ct-liste-bt').length}})()`);
const ouvrirSelecteur = async (dans, option) => {
  const js = `document.querySelector('${dans} [data-option="${option}"]')`;
  if (dans === '.ct-barre') { await b.ev(`(()=>{const x=${js};x&&x.scrollIntoView({block:'nearest',inline:'nearest'});return 1})()`); await b.dormir(ipad ? 800 : 150); }
  await toucher(await b.pos(js, false)); await b.dormir(350); return lireSelecteur();
};
const fermer = async () => { await b.T.Escape(); await b.dormir(250); };

if (mode === 'geo') {
  const releve = {};
  for (const [id, titre] of COURS) {
    await ouvrir(id, titre, existantes(id)); releve[id] = await mesurer();
    const p = await b.page(1); await b.capture(`v11-migration-${id}-${arg}`, { x: Math.round(p.x), y: Math.round(Math.max(0, p.y)), width: Math.round(Math.min(p.w, 900)), height: Math.round(Math.min(p.h, 800)) });
  }
  fs.writeFileSync(`${SP}/tailles-${arg}.json`, JSON.stringify(releve, null, 1));
  if (arg === 'apres') {
    const avant = JSON.parse(fs.readFileSync(`${SP}/tailles-avant.json`, 'utf8'));
    for (const [id] of COURS) {
      const ecarts = [];
      for (const k of Object.keys(avant[id])) {
        const a = avant[id][k], c = releve[id][k];
        if (!c) { ecarts.push(k + ' absent'); continue; }
        for (const ch of Object.keys(a)) if (a[ch] != null && Math.abs(a[ch] - (c[ch] ?? 1e9)) > 0.6) ecarts.push(`${k}.${ch} ${a[ch]} → ${c[ch]}`);
      }
      b.ok(!ecarts.length, `${id} : annotations existantes inchangées (position, taille, police, marges, bordures, traits, flèches)`, ecarts.join(' | ') || `${Object.keys(avant[id]).length - 1} objets identiques`);
    }
    // et rien n'a été réécrit en base par la seule lecture
    // (`updatedAt` est posé par le stockage au moment où le banc sème les annotations)
    const enBase = await b.S(`return (await S.getAll('annotations')).filter(a=>a.ficheId==='f-fmt-cap').map(a=>{const c={...a};delete c.updatedAt;return JSON.stringify(c)}).sort()`);
    b.ok(JSON.stringify(enBase) === JSON.stringify(existantes('f-fmt-cap').map((a) => JSON.stringify(a)).sort()), 'migration à la LECTURE : rien n’est réécrit en base');
  } else console.log('relevé', Object.keys(releve).join(' '));
} else if (mode === 'uniforme') {
  const r = [];
  for (const [id, titre] of COURS) {
    await ouvrir(id, titre, []);
    const P = await b.page(1);
    await b.outil('Boîte'); await poser([P.x + P.w * 0.1, P.y + Math.min(P.h, 700) * 0.15]);
    await b.attendreFocus(); await b.ecrire('Néphron'); await b.dormir(300);
    await b.T.Escape(); await b.dormir(300);
    await b.outil('Sélection'); await b.dormir(300);
    const bx = await b.rect(`document.querySelector('.note-box')`); await toucher([bx.cx, bx.cy]);
    await ouvrirSelecteur('.mini-barre', 'taille');
    await b.ev(`(()=>{const i=document.querySelector('.ct-pop [data-champ="px"]');i.focus();i.select();return 1})()`);
    await b.ev(`document.execCommand('insertText',false,'16')`); await b.dormir(150);
    await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await b.dormir(500);
    await fermer(); await fermer();
    const m = await b.ev(`(()=>{const p=document.querySelector('.pdfr-page[data-cle="1"]').getBoundingClientRect();const e=document.querySelector('.note-box');const sc=parseFloat(getComputedStyle(e).scale)||1;const c=e.querySelector('.nb-body');
      const t=c.querySelector('p');const g=document.createRange();g.selectNodeContents(t);return {page:+p.width.toFixed(1),police:+(parseFloat(getComputedStyle(c).fontSize)*sc).toFixed(3),mot:+g.getBoundingClientRect().width.toFixed(2)}})()`);
    const en = (await b.S(`return (await S.getAll('annotations')).filter(a=>a.ficheId===${JSON.stringify(id)}&&a.kind==='libre')`))[0];
    r.push({ id, ...m, prop: +(m.police / m.page * 1000).toFixed(3), propMot: +(m.mot / m.page * 1000).toFixed(2), stocke: en && en.taille1000 });
    const P2 = await b.page(1); await b.capture(`v11-16px-${id}${ipad ? '-' + appareil : ''}`, { x: Math.round(P2.x), y: Math.round(Math.max(0, P2.y)), width: Math.round(Math.min(P2.w, 900)), height: Math.round(Math.min(P2.h * 0.35, 300)) });
  }
  const ecart = (k) => Math.max(...r.map((x) => x[k])) - Math.min(...r.map((x) => x[k]));
  b.ok(r.every((x) => x.stocke === 16) && r.every((x) => Math.abs(x.prop - 16) < 0.05) && ecart('propMot') < 0.6,
    '16 px choisis au sélecteur sur A4, 16:9 et capture : stockés 16, police = 16/1000 de la largeur de chaque page, le mot occupe la même proportion', JSON.stringify(r));
  console.log(['| Format | Page affichée | Police à l’écran | Police / largeur × 1000 | « Néphron » / largeur × 1000 |', '|---|---|---|---|---|', ...r.map((x) => `| ${x.id} | ${x.page} px | ${x.police} px | ${x.prop} | ${x.propMot} |`)].join('\n'));
} else if (mode === 'selecteurs') {
  for (const k of ['texte', 'crayon', 'surligneur', 'fleche', 'forme', 'bordure']) await b.ev(`localStorage.removeItem('medrevise.px1000.${k}');1`);
  await b.ev(`localStorage.setItem('medrevise.fondBoite','plein');1`);
  const [id, titre] = COURS[1];
  await ouvrir(id, titre, []);
  const P = await b.page(1);
  const pt = (fx, fy) => [P.x + P.w * fx, P.y + P.h * fy];
  const enBase = () => b.S(`return (await S.getAll('annotations')).filter(a=>a.ficheId===${JSON.stringify(id)})`);
  const sel = {};
  // boîte : texte 18, bordure 1,5, marges 10 × 8 ; une flèche depuis la boîte : 2,5
  await b.outil('Boîte'); await poser(pt(0.1, 0.1));
  await b.attendreFocus(); await b.ecrire('Néphron'); await b.dormir(300);
  await b.T.Escape(); await b.dormir(300);
  await b.outil('Sélection'); await b.dormir(300);
  let bx = await b.rect(`document.querySelector('.note-box')`); await toucher([bx.cx, bx.cy]);
  sel.texte = await ouvrirSelecteur('.mini-barre', 'taille');
  await b.capture('v11-selecteur-texte' + (ipad ? '-' + appareil : ''), await b.ev(`(()=>{const m=document.querySelector('.mini-barre').getBoundingClientRect(),p=document.querySelector('.ct-pop').getBoundingClientRect();const x=Math.min(m.x,p.x)-10,y=Math.min(m.y,p.y)-10;return {x:Math.round(x),y:Math.round(y),width:Math.round(Math.max(m.right,p.right)-x+10),height:Math.round(Math.max(m.bottom,p.bottom)-y+10)}})()`));
  await toucher(await b.pos(`document.querySelector('.ct-pop .ct-liste-bt')`, false));
  const liste = await b.ev(`[...document.querySelectorAll('.ct-liste button')].map(x=>+x.dataset.px)`);
  await fermer();
  await toucher(await b.pos(`document.querySelector('.mini-barre [data-option="fleche"]')`, false));
  await toucher(pt(0.45, 0.3)); await b.dormir(400);
  await b.outil('Sélection'); await b.dormir(300);
  let boite = (await enBase()).find((a) => a.kind === 'libre');
  // fond transparent : la bordure apparaît, avec son sélecteur
  bx = await b.rect(`document.querySelector('.note-box')`); await toucher([bx.cx, bx.cy]);
  await toucher(await b.pos(`document.querySelector('.mini-barre [data-option="fond"]')`, false)); await b.dormir(300);
  sel.bordure = await ouvrirSelecteur('.mini-barre', 'bordure');
  await fermer(); await fermer();
  const rendu = await b.ev(`(()=>{const p=document.querySelector('.pdfr-page[data-cle="1"]').getBoundingClientRect();const e=document.querySelector('.note-box');const sc=parseFloat(getComputedStyle(e).scale)||1;const c=e.querySelector('.nb-body');
    const bw=parseFloat(getComputedStyle(e).borderTopWidth);return {page:p.width,police:parseFloat(getComputedStyle(c).fontSize)*sc,padX:(parseFloat(getComputedStyle(c).paddingLeft)+bw)*sc,padY:(parseFloat(getComputedStyle(c).paddingTop)+bw)*sc,bord:bw*sc,
      bordVoulu:parseFloat(e.style.borderWidth)*sc,
      fleche:+((document.querySelector('.nb-conn-trait')||{getAttribute:()=>0}).getAttribute('stroke-width'))}})()`);
  const k1000 = (v) => +((v / rendu.page) * 1000).toFixed(2);
  boite = (await enBase()).find((a) => a.kind === 'libre');
  b.ok(boite.taille1000 === 18 && boite.bord1000 === 1.5 && JSON.stringify(boite.pad1000) === '[10,8]' && boite.fleches[0].ep1000 === 2.5
    && Math.abs(k1000(rendu.police) - 18) < 0.1 && Math.abs(k1000(rendu.padX) - 10) < 0.6 && Math.abs(k1000(rendu.padY) - 8) < 0.6 && Math.abs(k1000(rendu.bordVoulu) - 1.5) < 0.05 && Math.abs(rendu.bord - rendu.bordVoulu) <= 0.5 && Math.abs(k1000(rendu.fleche) - 2.5) < 0.1,
    'nouvelle boîte : texte 18, retrait du texte 10 × 8 (bordure comprise), bordure 1,5 (Chrome l’arrondit au pixel d’écran) ; sa flèche 2,5 — en px d’une page de 1000 px', JSON.stringify({ stocke: { t: boite.taille1000, b: boite.bord1000, p: boite.pad1000, f: boite.fleches[0].ep1000 }, rendu1000: { police: k1000(rendu.police), padX: k1000(rendu.padX), padY: k1000(rendu.padY), bord: k1000(rendu.bordVoulu), bordEcran: [rendu.bordVoulu, rendu.bord], fleche: k1000(rendu.fleche) } }));
  // la flèche de la boîte : son sélecteur
  const surChemin = await b.ev(`(()=>{const p=document.querySelector('.nb-conn-cible');const L=p.getTotalLength();const q=p.getPointAtLength(L*0.5);const m=p.getScreenCTM();return [q.x*m.a+m.e,q.y*m.d+m.f]})()`);
  await toucher(surChemin);
  sel.fleche = await ouvrirSelecteur('.mini-barre', 'epaisseur');
  await b.capture('v11-selecteur-fleche' + (ipad ? '-' + appareil : ''), await b.ev(`(()=>{const m=document.querySelector('.mini-barre').getBoundingClientRect(),p=document.querySelector('.ct-pop').getBoundingClientRect();const x=Math.min(m.x,p.x)-10,y=Math.min(m.y,p.y)-10;return {x:Math.round(x),y:Math.round(y),width:Math.round(Math.max(m.right,p.right)-x+10),height:Math.round(Math.max(m.bottom,p.bottom)-y+10)}})()`));
  await toucher(await b.pos(`document.querySelector('.ct-pop .ct-preset[data-px="4"]')`, false)); await b.dormir(400);
  const fl4 = (await enBase()).find((a) => a.kind === 'libre').fleches[0];
  await fermer(); await fermer();
  // crayon et surligneur : la barre d'outils porte le même sélecteur ; traits à 3 et 14
  await b.outil('Crayon'); await b.dormir(300);
  sel.crayon = await ouvrirSelecteur('.ct-barre', 'epaisseur');
  await b.capture('v11-selecteur-crayon' + (ipad ? '-' + appareil : ''), await b.ev(`(()=>{const p=document.querySelector('.ct-pop').getBoundingClientRect(),m=document.querySelector('.ct-barre').getBoundingClientRect();const x=Math.min(m.x,p.x)-10,y=Math.min(m.y,p.y)-10;return {x:Math.round(x),y:Math.round(y),width:Math.round(Math.max(m.right,p.right)-x+10),height:Math.round(Math.max(m.bottom,p.bottom)-y+10)}})()`));
  await fermer();
  await tirer(pt(0.1, 0.5), pt(0.4, 0.52));
  await toucher(await b.pos(`document.querySelector('[data-mode="surligneur"]')`, false));
  sel.surligneur = await ouvrirSelecteur('.ct-barre', 'epaisseur');
  await fermer();
  await tirer(pt(0.5, 0.5), pt(0.8, 0.5));
  await toucher(await b.pos(`document.querySelector('[data-mode="dessin"]')`, false));
  const traits = (await enBase()).filter((a) => a.kind === 'trait');
  // forme : 2,5 ; flèche de Formes : 2,5
  await b.outil('Forme'); await b.dormir(300);
  await toucher(await b.pos(`document.querySelector('.ptb-forme[title^="Rectangle"]')`, false));
  await tirer(pt(0.1, 0.62), pt(0.35, 0.72));
  await b.ev(`localStorage.removeItem('medrevise.px1000.fleche');1`); // le 4 px choisi plus haut serait repris (la dernière épaisseur choisie)
  await toucher(await b.pos(`document.querySelector('.ptb-forme[title^="Flèche"]')`, false));
  await tirer(pt(0.5, 0.65), pt(0.8, 0.7));
  await b.outil('Sélection'); await b.dormir(300);
  const formes = (await enBase()).filter((a) => a.kind === 'forme');
  const rect = formes.find((f) => f.forme === 'rectangle'), flf = formes.find((f) => f.forme === 'fleche');
  const fr = await b.rect(`document.querySelector('.pdfr-forme[data-objet="${rect.id}"]')`);
  await toucher([fr.x + 2, fr.cy]);
  sel.forme = await ouvrirSelecteur('.mini-barre', 'epaisseur');
  await fermer(); await fermer();
  const rf = await b.ev(`(()=>{const p=document.querySelector('.pdfr-page[data-cle="1"]').getBoundingClientRect();const t=document.querySelector('.pdfr-forme[data-objet="${rect.id}"] .pf-trace');const ink=[...document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-inklayer path')].map(x=>+x.getAttribute('stroke-width'));return {page:p.width,forme:+t.getAttribute('stroke-width'),ink}})()`);
  b.ok(traits.length === 2 && traits.some((t) => t.mode !== 'surligneur' && t.ep1000 === 3) && traits.some((t) => t.mode === 'surligneur' && t.ep1000 === 14) && rect.ep1000 === 2.5 && rect.taille1000 === 18 && flf.fleche && flf.fleche.ep1000 === 2.5
    && rf.ink.some((v) => Math.abs((v / rf.page) * 1000 - 3) < 0.1) && rf.ink.some((v) => Math.abs((v / rf.page) * 1000 - 14) < 0.2) && Math.abs((rf.forme / rf.page) * 1000 - 2.5) < 0.1,
    'nouveaux défauts : crayon 3, surligneur 14, forme 2,5 (texte 18), flèche de Formes 2,5 — stockés et rendus en px d’une page de 1000 px', JSON.stringify({ traits: traits.map((t) => [t.mode, t.ep1000]), forme: [rect.ep1000, rect.taille1000], fleche: flf.fleche, rendu1000: { ink: rf.ink.map((v) => +((v / rf.page) * 1000).toFixed(2)), forme: +((rf.forme / rf.page) * 1000).toFixed(2) } }));
  b.ok(fl4.ep1000 === 4 && Number.isFinite(fl4.epaisseur), 'un préréglage choisi (4 px) : `ep1000` écrit, et le facteur d’avant à côté (appareils pas à jour)', JSON.stringify(fl4));
  const struct = (s) => s && JSON.stringify({ n: s.presets.length, champ: s.champ != null, unite: s.unite, apercus: s.apercus });
  const tous = Object.entries(sel);
  b.ok(tous.length === 6 && tous.every(([, s]) => struct(s) === JSON.stringify({ n: 3, champ: true, unite: 'px', apercus: 4 })),
    'le MÊME sélecteur partout (texte, bordure, flèche, crayon, surligneur, forme) : 3 préréglages + champ en px, 4 aperçus à l’échelle', JSON.stringify(Object.fromEntries(tous.map(([k, s]) => [k, s && { titre: s.titre, presets: s.presets, actif: s.actif, champ: s.champ }]))));
  b.ok(JSON.stringify(sel.texte.presets) === '[14,18,24]' && sel.texte.actif === '18' && JSON.stringify(sel.crayon.presets) === '[2,3,5]' && sel.crayon.actif === '3' && JSON.stringify(sel.surligneur.presets) === '[10,14,20]' && sel.surligneur.actif === '14'
    && JSON.stringify(sel.fleche.presets) === '[1.5,2.5,4]' && sel.fleche.actif === '2.5' && JSON.stringify(sel.forme.presets) === '[1.5,2.5,4]' && sel.forme.actif === '2.5' && JSON.stringify(sel.bordure.presets) === '[1,1.5,3]' && sel.bordure.actif === '1.5'
    && JSON.stringify(liste) === '[10,12,14,16,18,20,24,28,32,40]' && sel.texte.liste === 1,
    'préréglages : texte 14 / 18 / 24 (+ liste 10 → 40), crayon 2 / 3 / 5, surligneur 10 / 14 / 20, flèche et forme 1,5 / 2,5 / 4, bordure 1 / 1,5 / 3 ; défauts actifs', JSON.stringify({ liste }));
  const anciens = await b.ev(`({tt:document.querySelectorAll('.tt-pop,.tt-bouton').length,seg:document.querySelectorAll('[data-epaisseur]').length,pct:/%/.test([...document.querySelectorAll('.ct-pop, .ct-bouton')].map(x=>x.textContent).join(''))})`);
  b.ok(!anciens.tt && !anciens.seg && !anciens.pct, 'plus d’anciens réglages (S / M / L / XL, %, boutons Fin / Moyen / Épais)', JSON.stringify(anciens));
}
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
