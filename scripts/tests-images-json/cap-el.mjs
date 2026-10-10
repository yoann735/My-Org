// capture centrée sur un élément : node cap-el.mjs nom "sélecteur" [index] [marge]
import { connecter } from './cdp.mjs';
import fs from 'fs';
const c = await connecter();
const [nom, sel, idx = '0', marge = '40'] = process.argv.slice(2);
const r = await c.ev(`(async()=>{const e=document.querySelectorAll(${JSON.stringify(sel)})[${idx}];if(!e)return null;e.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,500));const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height}})()`);
if (!r) { console.log('introuvable'); process.exit(1); }
const m = Number(marge);
const clip = { x: Math.max(0, r.x - m), y: Math.max(0, r.y - m), width: r.w + 2 * m, height: Math.min(900, r.h + 2 * m), scale: 1 };
const s = await c.send('Page.captureScreenshot', { format: 'png', clip });
fs.writeFileSync('../cap/' + nom + '.png', Buffer.from(s.data, 'base64'));
console.log('capture', nom, JSON.stringify(clip));
c.fermer();
