// Transcript — menu « Copier » (16/10) : 10 × « Copier tout » et 10 × « Copier sans horodatage », ordinateur
// puis tablette au doigt. Menu dans l'écran et au-dessus de tout, aucun clic qui traverse, « Copié ✓ ».
import { banc } from '../tests-bibliotheque-fichier/commun.mjs';
const b = await banc(1440, 900, { tactile: false });
await b.c.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: 'http://localhost:5199' }).catch(() => {});
await b.c.send('Runtime.evaluate', { expression: `localStorage.setItem('medrevise.biblio.tri','manuel')` });
await b.biblio({ recharger: true });
await b.S(`const f=(await S.getAll('fiches')).find(x=>x.titre==='Membre supérieur — repères');const t=Date.now()-3600e3, iso=new Date(t).toISOString();
  await S.put('transcript_session',{id:'ts-tb-copie',kind:'session',courseId:f.id,startedAt:iso,endedAt:new Date(t+600e3).toISOString(),source:'micro',keyterms:[],
  segments:Array.from({length:12},(_,i)=>({id:'sg'+i,t0:i*20,t1:i*20+15,text:'Phrase numéro '+(i+1)+' du cours.',status:'final',speaker:i%2})),notes:[],fontSize:'m',durationS:600,createdAt:iso});return 1`);
await b.biblio({ recharger: true }); await b.ouvrir('Membre supérieur — repères');
const ouvrirSession = async (tape) => {
  await b.ev(`(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.innerText.trim().startsWith('Transcript'));t&&t.click();return 1})()`); await b.dormir(1000);
  const l = await b.pos(`[...document.querySelectorAll('.pis *')].find(x=>x.children.length<4&&/12 lignes/.test(x.innerText)&&x.getBoundingClientRect().height<60)`, false);
  if (l) { if (tape) await b.tape(l); else await b.clic(l, { att: 1000 }); }
  await b.dormir(800);
};
// sonde : tout clic hors du menu pendant qu'on vise une option = clic qui traverse
await b.ev(`window.__trav=[];document.addEventListener('click',e=>{if(window.__vise&&!e.target.closest('.ctx-menu'))window.__trav.push((e.target.className||e.target.tagName)+'')},true);1`);
const presse = () => b.ev(`navigator.clipboard.readText().catch(()=>'ERR')`);
async function serie(nom, appui) {
  let ok = 0, okDans = 0, okDessus = 0, okCopie = 0, okTexte = 0;
  for (let i = 0; i < 10; i++) {
    const sans = i % 2 === 1;
    await b.ev(`navigator.clipboard.writeText('—vide—').catch(()=>0),1`);
    if (sans) {
      await appui(await b.pos(`document.querySelector('.trx-chevron')`, false));
      const d = await b.ev(`(()=>{const m=document.querySelector('.ctx-menu');if(!m)return null;const r=m.getBoundingClientRect();const it=[...m.querySelectorAll('.ctx-menu-item')];
        return {dans:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,dessus:it.every(x=>{const q=x.getBoundingClientRect();const t=document.elementFromPoint(q.x+q.width/2,q.y+q.height/2);return x===t||x.contains(t)}),n:it.length}})()`);
      if (d && d.dans) okDans++; if (d && d.dessus) okDessus++;
      if (i === 1) await b.capture(`${nom}-menu-copie`);
      await b.ev(`window.__vise=1`);
      await appui(await b.pos(`[...document.querySelectorAll('.ctx-menu-item')].find(x=>x.innerText.includes('sans horodatage'))`, false));
    } else {
      await appui(await b.pos(`document.querySelector('.trx-groupe .btn')`, false));
    }
    await b.dormir(150);
    await b.ev(`window.__vise=0`);
    const lbl = await b.ev(`document.querySelector('.trx-groupe .btn')?.innerText.trim()`);
    if (lbl === 'Copié ✓') okCopie++;
    const t = await presse();
    if (sans ? t.startsWith('Phrase numéro 1') || /^[^[]/.test(t) && t.includes('Phrase numéro 1') : t.startsWith('[00:00]')) okTexte++;
    if (!(await b.ev(`!!document.querySelector('.ctx-menu')`))) ok++;
    await b.dormir(1600); // « Copié ✓ » repart au bout de 1,5 s
  }
  const lblApres = await b.ev(`document.querySelector('.trx-groupe .btn')?.innerText.trim()`);
  const trav = await b.ev(`JSON.stringify(window.__trav)`);
  b.ok(okTexte === 10, `${nom} : 10 copies (5 avec horodatage, 5 sans), texte juste à chaque fois`, `${okTexte}/10`);
  b.ok(okDans === 5 && okDessus === 5, `${nom} : menu dans l’écran et au-dessus de tout, à chaque ouverture`, `dans ${okDans}/5, dessus ${okDessus}/5`);
  b.ok(trav === '[]', `${nom} : aucun clic ne traverse le menu`, trav);
  b.ok(okCopie === 10 && lblApres === 'Copier tout', `${nom} : « Copié ✓ » à chaque fois, puis « Copier tout » après 1,5 s`, `${okCopie}/10 · ${lblApres}`);
  b.ok(ok === 10, `${nom} : le menu se ferme après le choix`);
}
await ouvrirSession(false);
await serie('ordinateur', (p) => b.clic(p, { att: 350 }));
// fermeture en cliquant dehors
await b.clic(await b.pos(`document.querySelector('.trx-chevron')`, false), { att: 350 });
await b.clic([600, 450], { att: 300 });
b.ok(!(await b.ev(`!!document.querySelector('.ctx-menu')`)), 'ordinateur : clic dehors → menu fermé');
// tablette au doigt (volet du bas)
await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 1, mobile: true }); await b.dormir(1500);
await ouvrirSession(true);
b.ok(await b.ev(`(()=>{const r=document.querySelector('.trx-pied').getBoundingClientRect();return r.bottom<=innerHeight&&r.top>0})()`), 'tablette : le pied (Copier tout) est visible dans le volet du bas', await b.ev(`(()=>{let e=document.querySelector('.trx-pied');return [...document.querySelector('.trx-panneau').children].map(c=>(c.className+'').slice(0,28)+':'+Math.round(c.getBoundingClientRect().height)+':'+getComputedStyle(c).minHeight).join(' | ')})()`));
await b.capture('trx-tablette-pied');
await serie('tablette', (p) => b.tape(p));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: true }); await b.dormir(1200);
b.ok(await b.ev(`(()=>{const r=document.querySelector('.trx-pied').getBoundingClientRect();return r.bottom<=innerHeight&&r.top>0})()`), 'tablette portrait : pied visible');
b.ok(!b.erreurs.length, 'aucune erreur dans la page', b.erreurs.join(' / '));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: false });
process.exit(0);
