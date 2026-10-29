// (29/10) La transcription marque le cours — partie visible, sans audio : la feuille « Transcrire le cours » propose
// « Marquer le début du cours sur la page N » (N = page affichée), cochée par défaut ; Annuler ne pose rien.
// (La session complète, avec l'audio : t-transcription-marque.mjs — demande un Chrome dont l'audio répond.)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { banc } from './commun.mjs';
const b = await banc(1440, 900);
const CAP = fileURLToPath(new URL('../../docs/img/transcription-marque-cours/', import.meta.url)); fs.mkdirSync(CAP, { recursive: true });
const C = 'f-v3-rein';
await b.S(`for(const t of await S.getAll('page_tag'))if(t.courseId==='${C}')await S.remove('page_tag',t.id);return 1`);
await b.biblio({ recharger: true });
await b.ouvrir('Rein v3'); await b.dormir(1500);
for (const p of [5, 12]) {
  await b.allerPage(p); await b.dormir(900);
  if (!(await b.ev(`!!document.querySelector('.trx-accueil')`))) { await b.ev(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>/^\\s*Trans/.test(x.innerText)).click();1`); await b.dormir(700); }
  await b.ev(`[...document.querySelectorAll('.trx-accueil button')].find(x=>/Transcrire le cours/.test(x.innerText)).click();1`); await b.dormir(1500);
  const c = await b.ev(`(()=>{const i=document.querySelector('[data-champ=marquer-debut]');if(!i)return null;const r=i.closest('.mr-case').getBoundingClientRect();return {coche:i.checked,texte:i.closest('.mr-case').innerText.replace(/\\s+/g,' ').trim(),h:Math.round(r.height)}})()`);
  b.ok(c && c.coche && new RegExp('page ' + p + '\\b').test(c.texte), `page ${p} affichée : « Marquer le début du cours sur la page ${p} », cochée`, c && c.texte);
  if (p === 5) { const s = await b.c.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(CAP + 'feuille-demarrage.png', Buffer.from(s.data, 'base64')); }
  await b.ev(`(()=>{const i=document.querySelector('[data-champ=marquer-debut]');i.click();return 1})()`); await b.dormir(200);
  b.ok(!(await b.ev(`document.querySelector('[data-champ=marquer-debut]').checked`)), 'la case se décoche');
  await b.ev(`[...document.querySelectorAll('.trx-feuille button, .day-pop button')].find(x=>x.innerText.trim()==='Annuler').click();1`); await b.dormir(600);
}
const t = await b.S(`return (await S.getAll('page_tag')).filter(t=>t.courseId==='${C}'&&!t.supprime).length`);
b.ok(t === 0, 'Annuler : aucun tag posé', String(t));
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer(); process.exit(0);
