// Carnet d'erreurs — pré-réponses (16/10) : puces « Type d'erreur », gabarit, Tab, astuce suggérée depuis la
// flashcard ratée, enregistrement, affichage dans le carnet, édition des puces dans Réglages. Base LOCALE du banc.
// Préalable : node seed-carnet.mjs
import { banc } from '../tests-bibliotheque-fichier/commun.mjs';
const W = Number(process.argv[2] || 1440), H = Number(process.argv[3] || 900), nom = process.argv[4] || 'ordinateur';
const b = await banc(1440, 900, { tactile: W < 1200 });
await b.biblio({ recharger: true });
await b.S(`await S.setCarnetPuces(null).catch(()=>0);const st=await import(performance.getEntriesByType('resource').map(e=>e.name).find(n=>n.includes('idb-keyval')));await st.del('carnetPuces',st.createStore('medrevise-prompts','v1'));return 1`).catch(() => {});
const avant = JSON.parse(await b.S(`return JSON.stringify((await S.getAll('questions')).filter(q=>/^q-tb-fc/.test(q.srcId||'')).map(q=>({id:q.id,carnetAt:q.carnetAt||null,carnetRaison:q.carnetRaison||null})))`));
await b.biblio({ recharger: true });
// séance sur la fiche
const sel = `[...document.querySelectorAll('.lt-fiche .lt-rangee')].find(e=>e.innerText.startsWith('Psychologie du développement'))`;
const row = await b.pos(sel, false);
await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: row[0], y: row[1] }); await b.dormir(300);
await b.clic(await b.pos(`${sel}.querySelector('[title="Réviser cette fiche"]')`, false), { att: 1500 });
if (W < 1200) { await b.c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true }); await b.dormir(1500); }
const appui = (p) => (W < 1200 ? b.tape(p) : b.clic(p, { att: 500 }));
const rater = async () => {
  // la carte se retourne au clic (ou au doigt) sur la carte elle-même
  const carte = await b.ev(`(()=>{const t=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&/pour révéler/.test(e.innerText||''));if(!t)return null;let c=t;for(let k=0;k<6&&c.parentElement;k++){c=c.parentElement;if(c.getBoundingClientRect().height>200)break;}const r=c.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
  if (carte) await appui(carte); await b.dormir(700);
  await appui(await b.pos(`[...document.querySelectorAll('button')].find(x=>x.offsetParent&&/^(À revoir|Raté)/.test(x.innerText.trim()))`, false)); await b.dormir(900);
};
const recto2 = await b.ev(`document.body.innerText.match(/(Muscle innervé[^\\n]*\\?|Origine du biceps[^\\n]*\\?|Stade de Piaget[^\\n]*\\?)/)?.[1]`);
await rater();
b.ok(await b.ev(`!!document.querySelector('.cp-saisie')`), `${nom} : 2e raté consécutif de la carte (règle existante) → « Pourquoi tu l’as loupée ? » avec les puces`);
const puces = await b.ev(`[...document.querySelectorAll('.cp-puce')].map(x=>x.innerText.trim())`);
b.ok(puces.join('|') === 'Inversion latéral/médial|Confusion origine/insertion|Oubli d’un élément de liste|Terme mal orthographié|Mauvaise innervation|Mauvais chiffre/valeur|Raisonnement|Autre', `${nom} : les 8 puces par défaut`, puces.join(' · '));
const ast = await b.ev(`document.querySelector('#cp-astuce').value`);
b.ok(ast.startsWith('Retenir : « ' + recto2.slice(0, 20)) && ast.includes('→'), `${nom} : astuce suggérée depuis la carte ratée (recto + verso)`, ast);
await b.capture(`carnet-${nom}-vide`);
await appui(await b.pos(`[...document.querySelectorAll('.cp-puce')].find(x=>x.innerText==='Mauvaise innervation')`, true)); await b.dormir(300);
const s1 = await b.ev(`(()=>{const t=document.querySelector('#cp-raison');return {v:t.value,sel:t.value.slice(t.selectionStart,t.selectionEnd),actif:document.activeElement===t}})()`);
b.ok(s1.v === 'J’ai dit innervé par ___ au lieu de ___' && s1.sel === '___' && s1.actif, `${nom} : la puce pré-remplit le gabarit, 1er « ___ » sélectionné`, JSON.stringify(s1));
await b.c.send('Input.insertText', { text: 'le nerf radial' }); await b.dormir(100);
await b.T.Tab(); await b.c.send('Input.insertText', { text: 'le nerf axillaire' }); await b.dormir(200);
const v = await b.ev(`document.querySelector('#cp-raison').value`);
b.ok(v === 'J’ai dit innervé par le nerf radial au lieu de le nerf axillaire', `${nom} : on tape, Tab passe au « ___ » suivant`, v);
await b.capture(`carnet-${nom}-puce`);
await appui(await b.pos(`[...document.querySelectorAll('.cp-saisie button')].find(x=>x.innerText.includes('Ajouter au carnet'))`, true)); await b.dormir(900);
const apres = JSON.parse(await b.S(`return JSON.stringify((await S.getAll('questions')).filter(q=>/^q-tb-fc/.test(q.srcId||'')).map(q=>({id:q.id,recto:q.recto,carnetAt:q.carnetAt||null,carnetRaison:q.carnetRaison||null,carnetType:q.carnetType||null,carnetAstuce:q.carnetAstuce||null})))`));
const e = apres.find((q) => q.recto === recto2);
b.ok(e && e.carnetAt && e.carnetRaison === v && e.carnetType === 'Mauvaise innervation' && e.carnetAstuce === ast, `${nom} : entrée enregistrée (raison, type, astuce)`, JSON.stringify(e));
b.ok(apres.filter((q) => q.recto !== recto2).every((q) => !q.carnetType && !q.carnetAstuce), `${nom} : les autres cartes ne changent pas`);
// carnet
await b.ev(`(()=>{const q=[...document.querySelectorAll('button')].find(x=>/^Quitter/.test(x.innerText.trim()));q&&q.click();return 1})()`); await b.dormir(800);
if (W >= 1200) {
  // Réviser › ligne « carnet d'erreurs »
  await b.ev(`(()=>{const x=[...document.querySelectorAll('.sb-item')].find(e=>/^Réviser/i.test(e.title||e.innerText||''));x&&x.click();return !!x})()`); await b.dormir(1000);
  await b.ev(`(()=>{const x=document.querySelector('.carnet-line');x&&x.click();return !!x})()`); await b.dormir(1200);
  const c = await b.ev(`document.body.innerText`);
  b.ok(c.includes('Mauvaise innervation') && /astuce/i.test(c) && c.includes(v), `${nom} : carnet → type (puce), note et astuce affichés`);
  await b.capture(`carnet-${nom}-liste`);
}
if (W >= 1200) {
  // Réglages › Carnet d'erreurs : renommer, ajouter, supprimer — puis la séance propose la nouvelle liste
  await b.ev(`(()=>{const x=[...document.querySelectorAll('.sb-item')].find(e=>/Réglages/i.test(e.title||e.innerText||''));x&&x.click();return !!x})()`); await b.dormir(1000);
  b.ok(await b.ev(`document.querySelectorAll('.cp-reglage').length===8`), 'Réglages › Carnet d’erreurs : les 8 puces, éditables');
  const champ = async (i, txt) => { const p = await b.pos(`document.querySelectorAll('.cp-reglage input')[${i}]`); await b.clic(p, { n: 3, att: 150 }); await b.c.send('Input.insertText', { text: txt }); await b.T.Tab(); await b.dormir(400); };
  await champ(14, 'Autre erreur'); // « Autre » = 8e puce (index 7 × 2 champs)
  await b.clic(await b.pos(`[...document.querySelectorAll('.cp-reglage')][6].querySelector('[title="Supprimer cette puce"]')`), { att: 500 }); // « Raisonnement »
  await b.clic(await b.bouton('Ajouter une puce'), { att: 500 });
  await champ(14, 'Mauvais côté'); // la nouvelle puce, en dernier (7 puces → index 7 = 8e ligne : 14)
  await b.capture('carnet-reglages', await b.ev(`(()=>{const r=document.querySelector('.cp-reglages').closest('.card')||document.querySelector('.cp-reglages');const q=r.getBoundingClientRect();return {x:q.x-8,y:q.y-8,width:q.width+16,height:q.height+16}})()`));
  const enr = await b.S(`const r=await S.getCarnetPuces();return JSON.stringify(r&&r.puces.map(p=>p.label))`);
  b.ok(enr === JSON.stringify(['Inversion latéral/médial', 'Confusion origine/insertion', 'Oubli d’un élément de liste', 'Terme mal orthographié', 'Mauvaise innervation', 'Mauvais chiffre/valeur', 'Autre erreur', 'Mauvais côté']), 'puces enregistrées : renommée, supprimée, ajoutée', enr);
  const prem = JSON.stringify(await b.S(`return JSON.stringify((await S.getAll('questions')).filter(q=>q.carnetAt).map(q=>[q.id,q.carnetRaison,q.carnetType||null]))`));
  b.ok(prem.includes('Mauvaise innervation'), 'l’entrée déjà dans le carnet garde son type (rien de réécrit)');
}
b.ok(!b.erreurs.length, `${nom} : aucune erreur`, b.erreurs.join(' / '));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
process.exit(0);
