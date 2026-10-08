// Ouvre un cours par son titre (Bibliothèque > arbre), en vérifiant l'app affichée.
// node ouvrir-cours.mjs "Cours 20 pages" [--recharger] [largeur hauteur]
import { connecter } from './cdp.mjs';
const c = await connecter();
const titre = process.argv[2];
const recharger = process.argv.includes('--recharger');
const nums = process.argv.slice(3).filter((x) => /^\d+$/.test(x)).map(Number);
const [W, H] = nums.length === 2 ? nums : [1440, 900];
await c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 1200 });
if (recharger) { await c.send('Page.reload', { ignoreCache: true }); await c.dormir(4500); }
const app = await c.ev(`document.body.innerText.includes('Choisis ton espace') ? 'hub' : document.body.innerText.includes('PLANNING REPAS') ? 'mealweek' : 'medrevise'`);
if (app === 'mealweek') { await c.ev(`[...document.querySelectorAll('button')].find(b=>/Retour à l.accueil|Changer d.app/.test(b.title||b.getAttribute('aria-label')||''))?.click();1`); await c.dormir(1200); }
if (await c.ev(`document.body.innerText.includes('Choisis ton espace')`)) { await c.ev(`[...document.querySelectorAll('.hub-card')].find(b=>/^\\s*MedRevise/i.test(b.innerText))?.click();1`); await c.dormir(1500); }
// Bibliothèque
await c.ev(`(()=>{const b=[...document.querySelectorAll('.sb-item, .sidebar [role=button], .sidebar button, .sidebar a')].find(e=>/Biblioth/.test(e.innerText||e.title||''));b&&b.click();return 1})()`); await c.dormir(1200);
// fermer un document ouvert (bouton Retour du lecteur)
await c.ev(`(()=>{const r=[...document.querySelectorAll('button')].find(b=>(b.title||'')==='Revenir à la liste'||b.getAttribute('aria-label')==='Retour');r&&r.click();return 1})()`); await c.dormir(800);
const pos = await c.ev(`(()=>{const l=[...document.querySelectorAll('.lt-fiche')].find(e=>e.innerText.trim().startsWith(${JSON.stringify(titre)}));if(!l)return null;l.scrollIntoView({block:'center'});const r=l.getBoundingClientRect();return [r.x+Math.min(60,r.width/3),r.y+r.height/2]})()`);
let ok = 'introuvable';
if (pos) { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await c.send('Input.dispatchMouseEvent', { type, x: pos[0], y: pos[1], button: 'left', clickCount: 1 }); ok = 'ok'; }
await c.dormir(2500);
console.log('ouverture :', ok, '| lecteur :', await c.ev(`!!document.querySelector('.pdfr-scroll, .nd')`));
c.fermer();
