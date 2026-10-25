// INFOBULLES — liste EXHAUSTIVE des commandes de chaque barre et mini barre (barre principale, sous-barres des 6 outils,
// mini barres de chaque objet et leur « … », menu Tableau, dock / panneau de couleurs, Transcript, tableau Miro) :
// chaque commande a un nom ; au survol (souris), la bulle apparaît après 400 ms avec ce nom (et le raccourci s'il existe).
// Écrit la liste dans $LISTE (markdown).   FX=… node t-infobulles.mjs
import { banc } from '../tests-boites-tableaux/commun.mjs';
import fs from 'node:fs';
const b = await banc();
let echecs = 0; const v = (c, m, d = '') => { console.log((c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : '')); if (!c) echecs++; };
const G0 = { v: 1, cols: [0.5, 0.5], lignes: [['A', 'B'], ['C', 'D']] };
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const png = await b.ev(`(()=>{const c=document.createElement('canvas');c.width=300;c.height=160;const x=c.getContext('2d');x.fillStyle='#2e7';x.fillRect(0,0,300,160);return c.toDataURL('image/png').split(',')[1]})()`);
const objets = await b.S(`const bin=atob(${JSON.stringify(png)});const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);const blobId=await S.putBlob(new Blob([a],{type:'image/png'}));
  const F='f-simpl';
  return [
    {...S.newNoteBox({ficheId:F,page:1,x:0.05,y:0.05,width:0.25,height:0.06,couleur:'jaune-franc',fond:'plein'}),id:'o-boite',content:${JSON.stringify(doc('Boîte'))}},
    {...S.newNoteBox({ficheId:F,page:1,x:0.05,y:0.2,width:0.15,height:0.12,couleur:'jaune-franc',fond:'plein'}),id:'o-postit',postit:true,content:${JSON.stringify(doc('Post-it'))}},
    {...S.newTexteLibre({ficheId:F,page:1,x:0.05,y:0.4,width:0.25,height:0.05,couleur:'noir',content:${JSON.stringify(doc('Texte libre'))}}),id:'o-texte'},
    {...S.newImageCollee({ficheId:F,page:1,x:0.4,y:0.05,width:0.2,height:0.1,blobId}),id:'o-image'},
    {...S.newForme({ficheId:F,page:1,x:0.4,y:0.25,width:0.15,height:0.1,couleur:'rouge-franc',epaisseur:2,forme:'rectangle'}),id:'o-forme'},
    {...S.newForme({ficheId:F,page:1,x:0.4,y:0.42,width:0.2,height:0.02,couleur:'bleu-franc',epaisseur:2,forme:'fleche'}),id:'o-fleche'},
    {...S.newTrait({ficheId:F,page:1,points:[[0.7,0.1],[0.75,0.14],[0.8,0.11],[0.85,0.16]],couleur:'vert-franc',epaisseur:3,mode:'crayon'}),id:'o-trait'},
  ];`);
await b.preparer({ annotations: [...objets, b.boiteGrille('o-tableau', G0, { x: 0.65, y: 0.3, width: 0.3 })] });
await b.ouvrirCours({});
const LISTE = []; const vus = new Set();
const lister = (cont) => b.ev(`(()=>{const out=[];for(const r of document.querySelectorAll(${JSON.stringify(cont)})){for(const e of r.querySelectorAll('button, [role="button"], [role="tab"], [role="radio"], select, .sc-cellule, .scw-cellule')){if(!e.offsetParent&&getComputedStyle(e).position!=='fixed')continue;const q=e.getBoundingClientRect();if(!q.width||!q.height)continue;
  const lab=(e.getAttribute('data-infobulle')||e.getAttribute('title')||e.getAttribute('aria-label')||'').trim();const txt=(e.innerText||'').trim().replace(/\\s+/g,' ').slice(0,30);
  out.push({lab,txt,x:q.x+q.width/2,y:q.y+q.height/2,dans:q.x>=0&&q.y>=0&&q.right<=innerWidth&&q.bottom<=innerHeight,cle:(e.dataset.option||e.dataset.outil||e.dataset.sousOutil||e.dataset.tab||e.dataset.mb||'')+'|'+lab+'|'+txt})}}return out})()`);
const survoler = async (x, y) => { await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3 }); await b.dormir(60); await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); };
let premier = true;
const contexte = async (nom, cont) => {
  const l = await lister(cont);
  let n = 0, ok = 0, sans = [];
  for (const e of l) {
    if (vus.has(nom + e.cle)) continue; // une fois par contexte
    vus.add(nom + e.cle); n++;
    if (!e.lab) { sans.push(e.txt || '(icône)'); LISTE.push({ nom, lab: '— SANS NOM —', txt: e.txt, ok: false }); continue; }
    let vu = null;
    if (e.dans) {
      await survoler(e.x, e.y);
      if (premier) { await b.dormir(250); v(!(await b.ev(`!!document.querySelector('[data-infobulle-visible]')`)), 'délai : rien à 250 ms'); premier = false; await b.dormir(250); } else await b.dormir(470);
      vu = await b.ev(`(()=>{const x=document.querySelector('[data-infobulle-visible]');return x?x.innerText.replace(/\\s+/g,' ').trim():null})()`);
    }
    const bon = e.dans ? !!vu && vu.replace(/\s+/g, '').length > 0 : true;
    if (bon) ok++;
    LISTE.push({ nom, lab: e.lab, txt: e.txt, vu, ok: bon, hors: !e.dans });
  }
  await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3 });
  v(n > 0 && ok === n && !sans.length, `${nom} : ${n} commande(s), ${ok} infobulle(s)`, sans.length ? 'sans nom : ' + sans.join(', ') : '');
};
const clicJs = (js) => b.ev(`(()=>{const x=${js};if(!x)return false;x.click();return true})()`);
const echap = async () => { await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await b.dormir(250); };
// 1. barre principale (en-tête + barre d'outils)
await contexte('Barre principale', '.lecteur-entete, .pdfr-toolbar');
// 2. sous-barres des outils
for (const o of ['surligneur', 'dessin', 'ecrire', 'forme', 'inserer']) {
  await b.clic(await b.pos(`document.querySelector('[data-outil="${o}"]')`, false), { att: 500 });
  await contexte(`Sous-barre ${o}`, '.tab-barres');
  // dock / panneau de couleurs de l'outil
  if (await clicJs(`[...document.querySelectorAll('.tab-barres .sc-bouton, .tab-barres [data-mb="couleur"] button')].find(e=>e.offsetParent)`)) { await b.dormir(500); await contexte(`Dock de couleurs (${o})`, '.sc-pop, .sc-panneau, .scw-panneau'); await echap(); }
}
await b.clic(await b.pos(`document.querySelector('[data-outil="main"]')`, false), { att: 400 });
// 3. mini barres des objets (+ leur « … »)
let couleursVues = false;
const page1 = async () => { await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(500); };
for (const [id, sel] of [['boîte', `.note-box[data-boite="o-boite"]`], ['post-it', `.note-box[data-boite="o-postit"]`], ['texte libre', `.note-box[data-boite="o-texte"]`], ['boîte-tableau', `.note-box[data-boite="o-tableau"]`],
  ['image collée', `[data-objet="o-image"], .pdfr-image[data-id="o-image"]`], ['forme', `[data-objet="o-forme"]`], ['flèche', `[data-objet="o-fleche"]`], ['trait', `[data-trait="o-trait"]`]]) {
  await echap(); await page1();
  const p = await b.pos(`document.querySelector('${sel}')`, false);
  if (!p) { v(false, `objet « ${id} » introuvable sur la page`); continue; }
  // un clic au bord de l'objet le sélectionne (au centre d'une boîte déjà choisie, il ouvrirait l'écriture)
  const r0 = await b.rect(`document.querySelector('${sel}')`);
  await b.clic(id.includes('texte') || id === 'post-it' || id === 'boîte' ? [r0.x + 3, r0.y + r0.h / 2] : p, { att: 600 });
  if (!(await b.ev(`[...document.querySelectorAll('.mini-barre')].some(e=>e.offsetParent)`))) { const r = await b.rect(`document.querySelector('${sel}')`); await b.clic([r.x + 4, r.y + r.h / 2], { att: 600 }); }
  await contexte(`Mini barre › ${id}`, '.mini-barre');
  if (await clicJs(`[...document.querySelectorAll('.mini-barre .mb-plus > button')].find(e=>e.offsetParent)`)) { await b.dormir(400); await contexte(`Mini barre › ${id} › …`, '.mb-plus-pop'); await clicJs(`[...document.querySelectorAll('.mini-barre .mb-plus > button')].find(e=>e.offsetParent)`); }
  if (!couleursVues && await clicJs(`[...document.querySelectorAll('.mini-barre [data-mb="couleur"] button, .mini-barre .sc-bouton')].find(e=>e.offsetParent)`)) { couleursVues = true; await b.dormir(500); await contexte(`Panneau de couleurs (${id})`, '.sc-pop, .sc-panneau, .scw-panneau'); await echap(); await b.clic(await b.pos(`document.querySelector('${sel}')`, false), { att: 500 }); }
  if (id === 'boîte-tableau') {
    await clicJs(`[...document.querySelectorAll('.mini-barre [data-option="tableau"]')].find(e=>e.offsetParent)`); await b.dormir(600);
    await contexte('Menu Tableau', '.mt-pop');
    await clicJs(`[...document.querySelectorAll('.mini-barre [data-option="tableau"]')].find(e=>e.offsetParent)`);
  }
  if (id === 'image collée' || id === 'boîte') {
    await clicJs(`[...document.querySelectorAll('.mini-barre [data-option="taille"]')].find(e=>e.offsetParent)`); await b.dormir(400);
    if (await b.ev(`!!document.querySelector('.ct-pop')`)) { await contexte(`Taille du texte (${id})`, '.ct-pop'); await echap(); }
  }
}
await echap();
// 4. panneau : Transcript
const seg = await b.pos(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Trans'))`, false);
if (seg) { await b.clic(seg, { att: 900 }); await contexte('Panneau › sélecteur de modes', '.pm-seg'); await contexte('Transcript', '.pm-vue[data-mode="transcript"]'); }
// 5. tableau Miro (disposition « Tableau »)
await clicJs(`[...document.querySelectorAll('.lecteur-entete-droite button, .seg button')].find(x=>/Tableau/.test(x.innerText))`); await b.dormir(1800);
await contexte('Tableau Miro', '.pdfr-tableau');
const total = LISTE.length, sansNom = LISTE.filter((x) => x.lab === '— SANS NOM —').length, vues = LISTE.filter((x) => x.vu).length, hors = LISTE.filter((x) => x.hors).length;
v(sansNom === 0, `aucune commande sans nom (${total} commandes)`);
console.log(`bulles vues au survol : ${vues} · hors écran (nom vérifié seulement) : ${hors}`);
const md = ['| Contexte | Nom affiché | Bulle vue au survol |', '|---|---|---|', ...LISTE.map((x) => `| ${x.nom} | ${x.lab.replace(/\|/g, '/').replace(/\n/g, ' ')}${x.txt && !x.lab.includes(x.txt) ? ` (« ${x.txt.replace(/\|/g, '/')} »)` : ''} | ${x.vu ? '✅ ' + x.vu.replace(/\|/g, '/').slice(0, 90) : x.hors ? '— (hors écran : nom présent)' : x.ok ? '' : '❌'} |`)].join('\n');
if (process.env.LISTE) fs.writeFileSync(process.env.LISTE, md);
v(!(b.erreurs && b.erreurs.length), 'console sans erreur', (b.erreurs || []).slice(0, 3).join(' | '));
console.log(echecs ? `❌ ${echecs} échec(s)` : '✅ tout est vert');
process.exit(0);
