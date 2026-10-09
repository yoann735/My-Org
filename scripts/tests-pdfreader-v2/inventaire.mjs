// inventaire des commandes visibles du lecteur → ../cap/inventaire-<prefixe>.json
import { banc } from './commun-doc.mjs';
import fs from 'fs';
const P = process.argv[2];
const b = await banc(1440, 900);
const c = b.c;
const Echap = async () => { await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await b.dormir(300); };
const noms = (sel) => b.ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>e.offsetParent||e.getClientRects().length).map(e=>((e.getAttribute('title')||e.getAttribute('aria-label')||e.innerText||'').split(' — ')[0].split('\\n')[0].trim()||e.tagName)).filter(Boolean)`);
const ouvrir = async (titre) => {
  await b.ev(`(()=>{const r=[...document.querySelectorAll('button')].find(b=>(b.title||'')==='Revenir à la liste');r&&r.click();return 1})()`); await b.dormir(900);
  const pos = await b.ev(`(()=>{const l=[...document.querySelectorAll('.lt-fiche')].find(e=>e.innerText.trim().startsWith(${JSON.stringify(titre)}));l.scrollIntoView({block:'center'});const r=l.getBoundingClientRect();return [r.x+Math.min(60,r.width/3),r.y+r.height/2]})()`);
  await b.clic(pos, { att: 2800 });
};
const inv = {};
await ouvrir('Document test v2');
await b.clic(await b.bouton('Sélection'));
inv.doc_barre = await noms('.pdfr-barre button, .pdfr-barre input');
await b.clic(await b.pos(`document.querySelector('.mf-bouton')`), { att: 400 }); inv.doc_fichier = await noms('.mf-item'); await Echap();
await b.clic(await b.pos(`document.querySelector('.pt-flux p')`), { att: 600 });
inv.doc_mise_en_forme = await noms('.pdfr-edit-toolbar button, .pdfr-edit-toolbar select');
for (const o of ['Surligneur', 'Crayon', 'Forme', 'Boîte', 'Texte']) { await b.clic(await b.bouton(o), { att: 400 }); inv['contexte_' + o] = await noms('.pdfr-contexte button, .pdfr-contexte input'); }
await b.clic(await b.bouton('Sélection'));
await ouvrir('PDF image test');
await b.clic(await b.bouton('Sélection'));
inv.pdf_barre = await noms('.pdfr-barre button, .pdfr-barre input');
await b.clic(await b.pos(`document.querySelector('.mf-bouton')`), { att: 400 }); inv.pdf_fichier = await noms('.mf-item'); await Echap();
const bt = await b.pos(`[...document.querySelectorAll('.note-box')].find(x=>x.innerText.includes('Note boîte')).querySelector('.nb-body')`);
await b.clic(bt, { att: 700 });
inv.boite_mise_en_forme = await noms('.pdfr-edit-toolbar button, .pdfr-edit-toolbar select');
inv.boite_actions = await noms('.nb-actions button');
await Echap();
await c.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: true });
await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await b.dormir(1500);
inv.tablette_barre = await noms('.tab-barres button, .lecteur-entete button');
fs.writeFileSync(`../cap/inventaire-${P}.json`, JSON.stringify(inv, null, 1));
console.log(P, Object.fromEntries(Object.entries(inv).map(([k, v]) => [k, v.length])));
c.fermer();
