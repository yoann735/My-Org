// Captures des barres et menus du lecteur : node captures.mjs <prefixe>   (avant | apres)
// Enchaîne ordinateur (document + PDF) puis tablette, dans UNE connexion (l'émulation saute à la déconnexion).
import { banc } from './commun-doc.mjs';
import { execSync } from 'child_process';
const P = process.argv[2] || 'x';
const b = await banc(1440, 900);
const c = b.c;
const ouvrir = async (titre) => {
  await b.ev(`(()=>{const r=[...document.querySelectorAll('button')].find(b=>(b.title||'')==='Revenir à la liste');r&&r.click();return 1})()`); await b.dormir(900);
  const pos = await b.ev(`(()=>{const l=[...document.querySelectorAll('.lt-fiche')].find(e=>e.innerText.trim().startsWith(${JSON.stringify(titre)}));if(!l)return null;l.scrollIntoView({block:'center'});const r=l.getBoundingClientRect();return [r.x+Math.min(60,r.width/3),r.y+r.height/2]})()`);
  await b.clic(pos, { att: 2800 });
};
const Echap = async () => { await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await b.dormir(300); };
const haut = { x: 120, y: 0, width: 1320, height: 210 };
const cap = (n, clip) => b.capture(`${P}-${n}`, clip || null);
const sansSouris = async () => { await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1430, y: 890 }); await b.dormir(350); };
// ---------- ORDINATEUR : document ----------
await ouvrir('Document test v2');
await b.clic(await b.bouton('Sélection')); await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await sansSouris();
await cap('d1-barre-selection', haut);
await b.clic(await b.bouton('Surligneur')); await sansSouris(); await cap('d2-barre-surligneur', haut);
await b.clic(await b.bouton('Crayon')); await sansSouris(); await cap('d3-barre-crayon', haut);
await b.clic(await b.bouton('Forme')); await sansSouris(); await cap('d3b-barre-forme', haut);
await b.clic(await b.bouton('Sélection'));
await b.clic(await b.pos(`document.querySelector('.mf-bouton')`), { att: 500 }); await cap('d4-menu-fichier', { x: 120, y: 0, width: 620, height: 560 }); await Echap();
await b.clic(await b.pos(`document.querySelector('.pt-flux p')`), { att: 600 }); await sansSouris();
await cap('d5-mise-en-forme');
await b.clic(await b.pos(`[...document.querySelectorAll('.sc-bouton')][0]`), { att: 500 });
await cap('d6-couleur-texte'); await Echap();
await b.clic(await b.bouton('Sélection'));
// ---------- ORDINATEUR : PDF ----------
await ouvrir('PDF image test');
await b.clic(await b.bouton('Sélection')); await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await b.dormir(500); await sansSouris();
await cap('p1-barre-pdf', haut);
const boite = await b.pos(`[...document.querySelectorAll('.note-box')].find(x=>x.innerText.includes('Note boîte')) && [...document.querySelectorAll('.note-box')].find(x=>x.innerText.includes('Note boîte')).querySelector('.nb-body')`);
if (boite) {
  await b.clic(boite, { att: 700 });
  await cap('p2-boite-active');
  await Echap();
}
// ---------- TABLETTE ----------
await c.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: true });
await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await b.dormir(1800);
const hautT = { x: 0, y: 0, width: 820, height: 210 };
await cap('t1-barre-tablette', hautT);
await b.clic(await b.bouton('Crayon'), { att: 500 }); await cap('t2-tablette-crayon', hautT);
await b.clic(await b.bouton('Sélection'), { att: 400 });
const plus = await b.pos(`document.querySelector('.mf-bouton.mf-compact, .mf-bouton')`);
if (plus) { await b.clic(plus, { att: 500 }); await cap('t3-tablette-menu', { x: 0, y: 0, width: 820, height: 640 }); await Echap(); }
await cap('t4-tablette-ecran');
console.log('captures', P, 'faites ; erreurs JS :', b.erreurs.length);
c.fermer();
