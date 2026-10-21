// AUDIT de l'onglet Flashcards (avant / après) : chaque état capturé — liste, formulaire de création, chaque sorte de
// carte, carte à trou, image, modification, import, sélection, thème, mobile.   Usage : node audit.mjs avant|apres
import { banc, semer, ouvrirFlashcards, panneau } from './commun.mjs';
const quand = process.argv[2] || 'avant';
const b = await banc(1440, 900);
await semer(b);
const tape = await ouvrirFlashcards(b);
const cap = async (nom, h) => { await b.dormir(500); await b.capture(`fc-${quand}-${nom}`, await panneau(b, h)); };
const bouton = (re, sel = 'button') => b.pos(`[...document.querySelectorAll(${JSON.stringify(sel)})].filter(x=>x.offsetParent&&${re}.test((x.innerText||'')+' '+(x.getAttribute('aria-label')||'')+' '+(x.title||''))).pop()`, true);
const essayer = async (re, sel) => { const p = await bouton(re, sel); if (p) { await tape(p); return true; } console.log('  (absent :', String(re), ')'); return false; };
await cap('liste');
await essayer('/^\\s*(\\+\\s*)?Ajouter\\s*$|Nouvelle carte/'); await cap('formulaire');
for (const nom of ['muscle', 'tableau', 'molecule']) {
  if (quand === 'apres') {
    await tape(await b.pos(`document.querySelector('.fc-type[data-sorte="${nom}"]')`, false)); await b.dormir(1500); await cap('type-' + nom);
    await tape(await b.pos(`document.querySelector('.fc-type[data-sorte="standard"]')`, false));
  } else {
    const re = { muscle: '/[Mm]uscle/', tableau: '/^\\s*(\\+\\s*)?Tableau\\s*$/', molecule: '/Molécule/' }[nom];
    if (await essayer(re)) { await b.dormir(1500); await cap('type-' + nom); }
    await essayer('/Carte standard/');
  }
}
// carte à trou : un recto, un mot sélectionné, « Ajouter un trou »
await b.ev(`(()=>{const t=[...document.querySelectorAll('.pis-add textarea, .fc-form textarea')].find(x=>x.offsetParent);if(!t)return 0;t.focus();return 1})()`);
await b.ecrire('Le glomérule filtre le plasma'); await b.dormir(300);
await b.ev(`(()=>{const t=document.activeElement;if(t&&t.setSelectionRange){t.setSelectionRange(3,12)}return 1})()`);
await essayer('/Ajouter un trou|Trou/'); await cap('trou');
await essayer('/Plus d’options/', '.fcf-plus');
await cap('options');
await essayer('/^\\s*Terminer\\s*$|^\\s*Annuler\\s*$/');
// modifier une carte
await b.ev(`(()=>{const c=document.querySelector('[data-item="fa-texte"]');c&&c.scrollIntoView({block:'center'});return 1})()`); await b.dormir(400);
const ed = await b.pos(`(()=>{const c=document.querySelector('[data-item="fa-texte"]');return c&&(c.querySelector('[title="Éditer"], [aria-label="Modifier"], [data-act="modifier"]'))})()`, true);
if (ed) { await tape(ed); await cap('modification'); await essayer('/^\\s*Annuler\\s*$/'); }
// importer
if (await essayer('/Importer/')) { await b.dormir(600); await b.capture(`fc-${quand}-import`, { x: 300, y: 80, width: 840, height: 740 }); await b.T.Escape(); await b.dormir(400); }
// sélection
if (await essayer('/^\\s*Sélectionner\\s*$/')) { await cap('selection'); await essayer('/Fermer la sélection/'); }
// thème
await cap('theme', 220);
// mobile (le lecteur à 768 px, tactile)
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 2, mobile: true }); await b.dormir(1800);
await essayer('/^\\s*(\\+\\s*)?Ajouter\\s*$|Nouvelle carte/'); await b.dormir(800);
const dep = await b.ev(`(()=>{const p=document.querySelector('.pis-body'),v=[...document.querySelectorAll('.pm-vue')].find(x=>!x.hasAttribute('inert'));if(!p||!v)return null;let max=0;for(const e of v.querySelectorAll('*')){const r=e.getBoundingClientRect();if(r.width&&e.offsetParent)max=Math.max(max,r.right)}return {panneau:Math.round(p.getBoundingClientRect().right),max:Math.round(max)}})()`);
console.log('mobile : bord droit du panneau', JSON.stringify(dep));
await cap('mobile');
console.log('erreurs', b.erreurs.length);
process.exit(0);
