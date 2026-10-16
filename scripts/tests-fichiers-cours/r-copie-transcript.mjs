// Reproduction : menu « Copier » du transcript (chevron → « Copier sans horodatage »). Base LOCALE du banc.
import { banc } from '../tests-bibliotheque-fichier/commun.mjs';
const b = await banc(1440, 900);
await b.c.send('Runtime.evaluate', { expression: `localStorage.setItem('medrevise.biblio.tri','manuel')` });
await b.biblio({ recharger: true });
// une session terminée, avec 2 intervenants, sur « Membre supérieur — repères »
const fid = await b.S(`const f=(await S.getAll('fiches')).find(x=>x.titre==='Membre supérieur — repères');
  const t=Date.now()-3600e3, iso=new Date(t).toISOString();
  await S.put('transcript_session',{id:'ts-tb-copie',kind:'session',courseId:f.id,startedAt:iso,endedAt:new Date(t+600e3).toISOString(),source:'micro',keyterms:[],
    segments:Array.from({length:12},(_,i)=>({id:'sg'+i,t0:i*20,t1:i*20+15,text:'Phrase numéro '+(i+1)+' du cours sur le membre supérieur.',status:'final',speaker:i%2})),notes:[],fontSize:'m',durationS:600,createdAt:iso});
  return f.id;`);
await b.biblio({ recharger: true }); await b.ouvrir('Membre supérieur — repères');
await b.ev(`(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.innerText.trim().startsWith('Transcript'));t&&t.click();return 1})()`); await b.dormir(1200);
// ouvrir la session si une liste est affichée
const ligne = await b.pos(`[...document.querySelectorAll('.pis *')].find(x=>x.children.length<4&&/12 lignes/.test(x.innerText)&&x.getBoundingClientRect().height<60)`, false);
if (ligne) await b.clic(ligne, { att: 1200 });
await b.capture('trx-0');
const chev = await b.pos(`document.querySelector('.trx-chevron')`, false);
console.log('chevron', chev);
if (!chev) process.exit(0);
await b.clic(chev, { att: 400 });
const diag = await b.ev(`(()=>{const it=[...document.querySelectorAll('.ctx-menu-item')].find(x=>x.innerText.includes('sans horodatage'));if(!it)return 'pas de menu';const r=it.getBoundingClientRect();
  const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);const m=document.querySelector('.ctx-menu');
  const chaine=[];let e=top;while(e&&chaine.length<6){chaine.push(e.className||e.tagName);e=e.parentElement;}
  return JSON.stringify({menuZ:getComputedStyle(m).zIndex,parent:m.parentElement.tagName+'.'+m.parentElement.className,dessus:top===it||it.contains(top),sous:chaine})})()`);
console.log('diag', diag);
await b.capture('trx-1-menu');
await b.c.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: 'http://localhost:5199' }).catch(() => {});
await b.clic(await b.pos(`[...document.querySelectorAll('.ctx-menu-item')].find(x=>x.innerText.includes('sans horodatage'))`, false), { att: 600 });
console.log('après clic : menu ouvert ?', await b.ev(`!!document.querySelector('.ctx-menu')`), ' bouton :', await b.ev(`document.querySelector('.trx-groupe .btn')?.innerText`));
console.log('presse-papiers :', await b.ev(`navigator.clipboard.readText().then(t=>t.slice(0,80)).catch(e=>'ERR '+e.message)`));
process.exit(0);
