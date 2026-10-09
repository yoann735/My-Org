import { banc } from './commun-doc.mjs';
const b = await banc(1440, 900);
const txt = (s) => b.ev(`[...document.querySelectorAll('button')].filter(x=>x.offsetParent).map(x=>(x.innerText||x.title).trim()).filter(t=>${JSON.stringify(s)}.split('|').some(k=>t.includes(k))).slice(0,8)`);
await b.clic(await b.pos(`[...document.querySelectorAll('button,[role=tab]')].find(x=>x.innerText.trim()==='Transcript')`), { att: 800 });
console.log('boutons', await txt('Démarrer|Lancer|Transcrire'));
await b.clic(await b.pos(`[...document.querySelectorAll('button')].find(x=>/Démarrer|Lancer la transcription|Transcrire/.test(x.innerText)&&x.offsetParent)`), { att: 1200 });
console.log('boutons feuille', await txt('Démarrer|Lancer'));
await b.clic(await b.pos(`[...document.querySelectorAll('button')].filter(x=>/Démarrer|Lancer/.test(x.innerText)&&x.offsetParent).pop()`), { att: 4000 });
// tablette
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: true });
await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await b.dormir(1500);
console.log('modeTab', await b.ev(`!!document.querySelector('.lecteur-tab')`), 'volet', await b.ev(`document.querySelector('.lecteur-tab')?.className`));
await b.clic(await b.pos(`document.querySelector('.tab-sep-replier')`), { att: 1000 });
const etats = [];
for (let i = 0; i < 6; i++) { await b.dormir(2500); etats.push(await b.ev(`(()=>{const p=document.querySelector('.tab-poignee');return p?{texte:p.innerText.trim(),point:!!p.querySelector('.pm-live'),badge:!!p.querySelector('.tab-resume-n')}:null})()`)); }
console.log(JSON.stringify(etats));
const r = await b.ev(`(()=>{const r=document.querySelector('.tab-poignee').getBoundingClientRect();return {x:r.x,y:r.y-30,width:r.width,height:r.height+30}})()`);
await b.capture('apres-poignee-tablette', r);
await b.capture('apres-tablette-poignee-plein');
const ok = etats.filter(Boolean);
b.ok(ok.length && ok.every((e) => e.point && !e.badge), 'point rouge présent, aucun badge +N');
b.ok(new Set(ok.map((e) => e.texte)).size > 1 && ok.every((e) => e.texte.length <= 25), 'derniers mots qui défilent, ≤ 24 caractères', ok.map((e) => e.texte).join(' | '));
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
