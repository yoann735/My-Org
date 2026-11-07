// Captures AVANT (téléphone) : en séance, toucher l'image d'une carte la RETOURNE (aucun agrandissement possible).
// Pour atteindre la carte image, les autres cartes sont reportées (banc seulement). node avant.mjs [tel|tablette]
import { dispositif } from './commun.mjs';
const b = await dispositif(process.argv[2] || 'tel');
await b.recharger(); await b.attendrePhase(['ajour'], 60000); await b.dormir(1500);
await b.S(`const q = await S.getAll('questions'); await S.putMany('questions', q.filter((x) => x.type === 'flashcard' && !x.id.startsWith('img-') && x.dueDate !== '2099-01-01').map((x) => ({ ...x, dueDate: '2099-01-01', nouvelle: false }))); return 1;`);
await b.recharger(); await b.attendrePhase(['ajour'], 60000); await b.dormir(1500);
const prefixe = b.type === 'tel' ? 'avant-tel' : 'avant-tablette';
if (b.type === 'tel') await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1500);
else { await b.reviser?.(); await b.ev(`(() => { const x = [...document.querySelectorAll('.sb-item')].find((e) => /^Réviser/.test(e.title || e.innerText || '')); x && x.click(); return 1; })()`); await b.dormir(1200); await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1500); }
for (let i = 0; i < 8; i++) { const id = await b.ev(`(document.querySelector('.sfc-carte[data-carte]') || {}).dataset?.carte || null`); if (id === 'img-recto') break; await b.dormir(300); }
const carte = await b.ev(`(document.querySelector('.sfc-carte[data-carte]') || {}).dataset?.carte || null`);
console.log('carte affichée :', carte);
await b.capture(prefixe + '-1-recto');
const r = await b.rect(`document.querySelector('.sfc-carte .fc-image img')`);
console.log('image', JSON.stringify(r));
await b.point(r.cx, r.cy, 600);
const apres = await b.ev(`(() => { const c = document.querySelector('.sfc-carte[data-carte]'); return { verso: !!document.querySelector('.sfc-carte .sfc-verso'), notation: !!document.querySelector('.sfc-notes, [data-note]'), agrandie: !!document.querySelector('.vz-fond, .mui-visionneuse') }; })()`);
console.log('après un toucher sur l’image :', JSON.stringify(apres));
await b.capture(prefixe + '-2-apres-toucher-image');
process.exit(0);
