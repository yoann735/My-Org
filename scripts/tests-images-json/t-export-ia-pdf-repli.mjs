// Export IA en PDF (11/10) — repli à 120 dpi. Prérequis : seed-ia-bruit.mjs, cours « Cours bruit IA » ouvert.
// Une page de bruit dépasse 1 Mo en JPEG à 150 dpi → refaite à 120 dpi (992 × 1 403 px), et le message le dit.
import { banc } from './commun-doc.mjs';
import fs from 'fs';
const B = await banc();
const { ev, ok, clic, dormir } = B;
await ev(`(()=>{window.__telecharges=[];const o=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__telecharges.push({nom:this.download,href:this.href});return}return o.call(this)};return 1})()`);
await clic(await B.pos(`document.querySelector('.mf-bouton')`, false), { att: 400 });
await clic(await B.pos(`[...document.querySelectorAll('.mf-item')].find(b=>b.innerText.startsWith('Export spécial IA'))`, false), { att: 600 });
await clic(await B.pos(`[...document.querySelectorAll('.eia-panneau .mep-pre')].find(b=>b.innerText.startsWith('Cours'))`, false), { att: 300 });
await clic(await B.bouton('Télécharger (PDF + JSON)'), { att: 100 });
for (let i = 0; i < 600 && (await ev(`window.__telecharges.length`)) < 3; i++) await dormir(100);
const f = await ev(`(async()=>{const t=window.__telecharges[0];const b=await (await fetch(t.href)).blob();const r=new FileReader();return await new Promise(ok=>{r.onload=()=>ok({nom:t.nom,b64:r.result.split(',')[1]});r.readAsDataURL(b)})})()`);
fs.mkdirSync('../cap/pdf-ia/repli', { recursive: true });
fs.writeFileSync(`../cap/pdf-ia/repli/${f.nom}`, Buffer.from(f.b64, 'base64'));
const s = Buffer.from(f.b64, 'base64').toString('latin1');
const images = [...s.matchAll(/\/Subtype\s*\/Image[\s\S]{0,300}?>>/g)].map((m) => `${(/\/Width\s+(\d+)/.exec(m[0]) || [])[1]}x${(/\/Height\s+(\d+)/.exec(m[0]) || [])[1]}`);
const msg = await ev(`(document.querySelector('.eia-panneau .ta-message')||{}).innerText||''`);
const taille = Buffer.from(f.b64, 'base64').length;
ok(images.length === 2 && images.every((x) => x === '992x1403') && /refaites? à 120 dpi/.test(msg) && /par page, 120 dpi/.test(msg) && taille / 2 < 1024 * 1024, `repli : pages de plus de 1 Mo à 150 dpi refaites à 120 dpi (${images.join(', ')}), ${(taille / 1024 / 1024).toFixed(2)} Mo, signalé`, msg);
await B.touche('Escape', { vk: 27 });
ok(!B.erreurs.length, 'aucune exception JS', B.erreurs.join(' | '));
B.c.fermer();
