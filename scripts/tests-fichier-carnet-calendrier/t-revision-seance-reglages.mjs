// (17/10) Séance du jour (SeanceFC, ordinateur) : mêmes actions après une note ; Réglages › Carnet d'erreurs :
// les pré-réponses s'éditent et le menu suit. Préalable : seed-revision.mjs. Base LOCALE du banc.
import { banc, bancRevision } from './commun.mjs';
const b = await bancRevision(await banc(1440, 900));
await b.S(`const {set,createStore}=await import(performance.getEntriesByType('resource').map(e=>e.name).find(n=>n.includes('idb-keyval'))||'idb-keyval');await set('carnetPreReponses',undefined,createStore('medrevise-prompts','v1'));return 1`).catch(() => null);
await b.biblio({ recharger: true });
// Réglages › Carnet d'erreurs : renommer « Pas compris » en « Pas compris du tout »
await b.ev(`(()=>{const el=[...document.querySelectorAll('.sb-item')].find(x=>(x.getAttribute('title')||'').startsWith('Réglages'));el&&el.click();return 1})()`); await b.dormir(1200);
const zone = `document.querySelector('[data-reglages=pre-reponses]')`;
b.ok(await b.ev(`!!${zone}`), 'Réglages › Carnet d’erreurs : section « Pré-réponses rapides »');
const champs = await b.ev(`[...${zone}.querySelectorAll('input')].map(i=>i.value)`);
b.ok(champs.join(' · ') === 'Je ne connais pas · Pas compris · Confusion avec une autre carte · Inversion (latéral/médial, origine/insertion…) · Oubli d’un élément · Faute d’orthographe du terme', 'les 6 pré-réponses par défaut, éditables', champs.join(' · '));
await b.ev(`${zone}.scrollIntoView({block:'center'});1`); await b.dormir(300);
await b.capture('fcc-reglages-pre-reponses', await b.ev(`(()=>{const r=${zone}.closest('.card, section, .rg-card')||${zone};const q=r.getBoundingClientRect();return {x:q.x-8,y:Math.max(0,q.y-50),width:q.width+16,height:Math.min(860,q.height+60)}})()`));
await b.clic(await b.pos(`${zone}.querySelectorAll('input')[1]`, false), { att: 150 });
await b.ev(`(()=>{const i=${zone}.querySelectorAll('input')[1];i.setSelectionRange(i.value.length,i.value.length);return 1})()`);
await b.c.send('Input.insertText', { text: ' du tout' });
await b.clic(await b.pos(`${zone}.querySelector('.hint')`, false), { att: 600 }); // sortie du champ → enregistré
const rec = await b.S(`const {get,createStore}=await import(performance.getEntriesByType('resource').map(e=>e.name).find(n=>n.includes('idb-keyval'))||'idb-keyval');return (await get('carnetPreReponses',createStore('medrevise-prompts','v1')))`).catch((e) => String(e));
b.ok(rec && rec.liste && rec.liste[1].label === 'Pas compris du tout', 'enregistré dans « carnetPreReponses » (store prompts, synchronisé)', JSON.stringify(rec && rec.liste && rec.liste.map((x) => x.label)));
// Séance du jour (ordinateur, Réviser › « Aujourd'hui ») : noter une carte → le menu suit la liste éditée
await b.ev(`(()=>{const el=[...document.querySelectorAll('.sb-item')].find(x=>(x.getAttribute('title')||'')==='Réviser');el&&el.click();return 1})()`); await b.dormir(1200);
const dem = await b.pos(`[...document.querySelectorAll('.revise-seance button')].find(x=>/^(Démarrer|Reprendre)/.test(x.innerText.trim()))`, false);
await b.clic(dem, { att: 1500 });
b.ok(await b.ev(`!!document.querySelector('.sfc-carte')`), 'séance du jour ouverte');
await b.clic(await b.pos(`document.querySelector('.sfc-carte')`, false), { att: 500 });
await b.clic(await b.pos(`document.querySelectorAll('.bf-zone button')[2]`, false), { att: 900 });
let s = await b.sn();
b.ok(s && s.deplie && s.boutons.length === 2, 'séance du jour : « Carnet d’erreurs » et « Apprentissage » après la note');
await b.clic(await b.pos(`document.querySelector('[data-sn=carnet]')`, false), { att: 350 });
const items = await b.ev(`[...document.querySelectorAll('.sn-menu [data-pre]')].map(x=>x.innerText.trim())`);
b.ok(items[1] === 'Pas compris du tout' && items[items.length - 1] === 'Autre…', 'le menu reprend la pré-réponse éditée', items.join(' · '));
// « Autre… » : le formulaire complet
await b.clic(await b.pos(`document.querySelector('.sn-menu [data-pre=autre]')`, false), { att: 600 });
b.ok(await b.ev(`!!document.querySelector('.day-pop .cp-saisie')`), '« Autre… » ouvre le formulaire complet (type d’erreur, note, astuce)');
await b.capture('fcc-carnet-autre', await b.ev(`(()=>{const r=document.querySelector('.day-pop').getBoundingClientRect();return {x:r.x-10,y:r.y-10,width:r.width+20,height:r.height+20}})()`));
await b.T.Escape(); await b.dormir(300);
// glisser la carte de la séance vers l'onglet Apprentissage (ordinateur)
const id = await b.ev(`document.querySelector('.sfc-carte').dataset.carte`);
const l0 = await b.listeAppr();
const av = await b.diag();
const ok = await b.glisserHTML5(await b.dans(`document.querySelector('.sfc-carte')`, 0.5, 0.4), await b.dans(`document.querySelector('.sb-appr')`, 0.5, 0.5));
const l1 = await b.listeAppr();
b.ok(ok && (l1.includes(id) && (l0.includes(id) || l1.length === l0.length + 1)), 'séance du jour : la carte glissée sur l’onglet Apprentissage rejoint la liste', `${l0.length} → ${l1.length}`);
b.ok(av === await b.diag(), 'glisser-déposer : diagnostic strictement identique avant/après');
// remise de la liste par défaut (base de test)
await b.ev(`(()=>{const el=[...document.querySelectorAll('.sfc-quitter')][0];el&&el.click();return 1})()`); await b.dormir(1200);
await b.S(`const {set,createStore}=await import(performance.getEntriesByType('resource').map(e=>e.name).find(n=>n.includes('idb-keyval'))||'idb-keyval');await set('carnetPreReponses',undefined,createStore('medrevise-prompts','v1'));return 1`).catch(() => null);
b.ok(!b.erreurs.length, 'aucune erreur dans la page', b.erreurs.join(' / '));
process.exit(0);
