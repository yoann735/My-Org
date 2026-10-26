// « Aucune écriture Supabase » : Chrome A (9335) branché sur le FAUX Supabase local (scripts/faux-supabase.mjs, :54399),
// export de toutes les flashcards depuis les Réglages : AUCUNE requête vers le cloud entre le clic « Exporter » et la fin
// de l'export ; puis synchro relancée : enregistrements et fichiers du cloud identiques (rien n'a été mis en file).
// NB : la synchro relancée par l'événement « online » envoie toujours un medrevise_push de routine, avec ou sans export
// (essai témoin) ; l'écran Réglages liste le bucket (POST …/list = lecture).
import { banc as bancAA } from '../tests-a-apprendre/commun.mjs';
import { ouvrirZip } from './aide.mjs';
import fs from 'node:fs';
import { SORTIE } from './commun.mjs';
process.env.CDP_FILTRE = '5300'; process.env.CDP_PORT = '9335';
const b = await bancAA(1440, 900);
let echecs = 0;
const v = (c, m, d = '') => { if (!b.ok(c, m, d)) echecs++; };
const etat = async () => (await fetch('http://localhost:54399/__etat')).json();
const empreinte = (e) => JSON.stringify([e.rows.map((r) => [r.store, r.record_id, r.updated_at, r.deleted]).sort(), e.blobs.map((x) => x.id + ':' + x.taille).sort()]);
await b.ouvrirApp({ recharger: true });
await b.ev(`(window.dispatchEvent(new Event('online')),1)`); await b.dormir(6000); // synchro au repos
const e0 = await etat();
await b.ev(`(()=>{const x=[...document.querySelectorAll('.sb-item')].find(e=>(e.title||'')==='Réglages');x.click();return 1})()`);
await b.attendre(`!!document.querySelector('[data-act="exporter-toutes-fc"]')`, 8000);
await b.ev(`document.querySelector('[data-act="exporter-toutes-fc"]').scrollIntoView({block:'center'});document.querySelector('[data-act="exporter-toutes-fc"]').click();1`); await b.dormir(3000);
const t0 = new Date().toISOString();
await b.ev(`window.__dernierExportFC=null;document.querySelector('[data-export-flashcards] [data-act="exporter-fc"]').click();1`);
await b.attendre(`!!document.querySelector('[data-export-flashcards] [data-fait]')`, 120000);
await b.dormir(1500);
const pendant = (await etat()).journal.filter((j) => j.t >= t0 && !j.p.startsWith('/__'));
const r = await b.ev(`(async()=>{const e=window.__dernierExportFC;const a=new Uint8Array(await e.blob.arrayBuffer());let s='';for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode.apply(null,a.subarray(i,i+0x8000));return {nom:e.nom,cartes:e.cartes,b64:btoa(s)}})()`);
fs.writeFileSync(SORTIE + '/cloud.zip', Buffer.from(r.b64, 'base64'));
const Z = ouvrirZip(SORTIE + '/cloud.zip');
v(Z.integre && Z.doc.items.length === r.cartes && r.cartes > 0, `export de toutes les flashcards de l’appareil A : ${r.cartes} cartes`, r.nom);
await b.ev(`(window.dispatchEvent(new Event('online')),1)`); await b.dormir(6000); // synchro relancée après l'export
const e1 = await etat();
v(pendant.length === 0, 'pendant l’export : aucune requête vers le cloud (ni écriture, ni lecture)', pendant.map((j) => j.m + ' ' + j.p).join(', '));
v(empreinte(e0) === empreinte(e1), 'enregistrements et fichiers du cloud identiques avant / après', `${e1.rows.length} enregistrements · ${e1.blobs.length} fichiers`);
console.log(echecs ? `❌ ${echecs} échec(s)` : '✅ tout est vert');
process.exit(0);
