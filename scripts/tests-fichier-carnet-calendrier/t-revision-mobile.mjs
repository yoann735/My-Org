// (17/10) Téléphone (390 × 844, tactile) : après une note, deux boutons pleine largeur ≥ 44 px ; « Carnet
// d'erreurs » ouvre une FEUILLE DU BAS de pré-réponses ; « Apprentissage » en un tap. Série d'une fiche
// (MobileSession) puis séance du jour (SeanceFC). Préalable : seed-revision.mjs. Base LOCALE du banc.
import { banc, bancRevision } from './commun.mjs';
const b = await bancRevision(await banc(390, 844, { tactile: true }));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await b.c.send('Page.reload', { ignoreCache: true }); await b.dormir(4500);
if (await b.ev(`document.body.innerText.includes('Choisis ton espace')`)) { await b.ev(`[...document.querySelectorAll('.hub-card')].find(b=>/^\\s*MedRevise/i.test(b.innerText))?.click();1`); await b.dormir(2000); }
// FICHES › « Nerfs crâniens (test) » › Réviser
const p = await b.ev(`(()=>{const t=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent.trim()==='Nerfs crâniens (test)');let c=t;while(c&&!c.querySelector('button'))c=c.parentElement;const r=[...c.querySelectorAll('button')].find(x=>x.innerText.trim()==='Réviser');r.scrollIntoView({block:'center'});const q=r.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()`);
await b.tape(p); await b.dormir(1200);
b.ok(await b.ev(`!!document.querySelector('.mrm-flash-card')`), 'téléphone : série « Nerfs crâniens (test) » ouverte');
const noter = async () => {
  await b.tape(await b.dans(`document.querySelector('.mrm-flash-card')`, 0.5, 0.5)); await b.dormir(500);
  const n = await b.ev(`document.querySelectorAll('.bf-zone button').length`);
  await b.tape(await b.dans(`document.querySelectorAll('.bf-zone button')[${n >= 4 ? 2 : 1}]`.replace('${n >= 4 ? 2 : 1}', ''), 0.5, 0.5));
  if (await b.ev(`!!document.querySelector('.cp-saisie')`)) await b.tape(await b.dans(`[...document.querySelectorAll('.cp-saisie button')].find(x=>x.innerText.trim()==='Passer')`, 0.5, 0.5));
  await b.dormir(600);
};
// (le sélecteur ci-dessus vise le 3e bouton « Bien » en 4 boutons, sinon le 2e)
await noter();
let s = await b.sn();
b.ok(s && s.deplie && s.boutons.length === 2 && s.boutons.every((x) => x.h >= 44 && x.w >= 160), 'après la note : deux boutons pleine largeur ≥ 44 px', JSON.stringify(s && s.boutons.map((x) => `${x.txt} ${x.w}×${x.h}`)));
const larg = await b.ev(`(()=>{const a=document.querySelector('.sn-actions').getBoundingClientRect();return Math.round(a.width)})()`);
b.ok(larg >= 340, 'les deux boutons occupent toute la largeur', String(larg));
await b.capture('fcc-mobile-suite');
const idCarte = await b.ev(`(()=>{return null})()`);
const avant = await b.diagPlan();
await b.tape(await b.dans(`document.querySelector('[data-sn=carnet]')`, 0.5, 0.5)); await b.dormir(400);
const f = await b.rect(`document.querySelector('.sn-feuille')`);
b.ok(f && Math.round(f.b) === 844 && f.w === 390, 'Carnet d’erreurs → feuille du bas (pleine largeur, collée en bas)', f ? `${f.w}×${Math.round(f.h)} bas=${Math.round(f.b)}` : '');
const items = await b.ev(`[...document.querySelectorAll('.sn-feuille [data-pre]')].map(x=>[x.innerText.trim(),Math.round(x.getBoundingClientRect().height)])`);
b.ok(items.length === 7 && items.every(([, h]) => h >= 44), 'feuille : 6 pré-réponses + « Autre… », cibles ≥ 44 px', items.map(([t, h]) => `${t} (${h})`).join(' · '));
await b.capture('fcc-mobile-feuille');
await b.tape(await b.dans(`document.querySelector('.sn-feuille [data-pre=compris]')`, 0.5, 0.5)); await b.dormir(700);
b.ok(/^Ajouté au carnet · Pas compris/.test(await b.toast() || ''), 'tap « Pas compris » : entrée créée, toast', await b.toast());
const apres = await b.diagPlan();
b.ok(avant === apres, 'carnet (téléphone) : J / FSRS / journal inchangés');
const carnet = await b.S(`return (await S.getAll('questions')).filter(q=>q.id.startsWith('q-rv')&&q.carnetType==='Pas compris').map(q=>({id:q.id,recto:!!q.recto,verso:!!q.verso,at:q.carnetAt}))`);
b.ok(carnet.length === 1 && carnet[0].recto && carnet[0].verso && carnet[0].at, 'entrée « Pas compris » en base (avec recto/verso)', JSON.stringify(carnet));
await b.capture('fcc-mobile-toast');
// carte 2 → Apprentissage, diagnostic STRICT
await b.dormir(4600);
await noter();
const av2 = await b.diag();
const l0 = await b.listeAppr();
await b.tape(await b.dans(`document.querySelector('[data-sn=apprentissage]')`, 0.5, 0.5)); await b.dormir(800);
const l1 = await b.listeAppr();
b.ok(l1.length === l0.length + 1 && /^Ajoutée à l’apprentissage/.test(await b.toast() || ''), 'tap « Apprentissage » : la carte rejoint la liste, toast', await b.toast());
b.ok(av2 === await b.diag(), 'Apprentissage (téléphone) : diagnostic strictement identique avant/après');
// repli après 2 s, l'icône (44 px) rouvre
await noter(); await b.dormir(2300);
const ic = await b.rect(`document.querySelector('[data-sn=deplier]')`);
b.ok(ic && ic.h >= 44, 'repliées après 2 s : icône de 44 px', ic ? `${ic.w}×${ic.h}` : '');
// Séance du jour (SeanceFC) au téléphone : mêmes actions
await b.tape(await b.dans(`document.querySelector('.mrm-quit')`, 0.5, 0.5)); await b.dormir(1500);
const dem = await b.ev(`(()=>{const x=[...document.querySelectorAll('button')].find(x=>/^(Démarrer|Reprendre la séance)$/.test(x.innerText.trim()));if(!x)return null;x.scrollIntoView({block:'center'});const r=x.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
if (dem) { await b.tape(dem); await b.dormir(1800); }
const enSeance = await b.ev(`!!document.querySelector('.sfc-carte')`);
if (!enSeance) console.log('écran :', dem, (await b.ev(`document.body.innerText`)).slice(0, 300));
b.ok(enSeance, 'séance du jour ouverte au téléphone');
if (enSeance) {
  await b.tape(await b.dans(`document.querySelector('.sfc-carte')`, 0.5, 0.5)); await b.dormir(500);
  await b.tape(await b.dans(`document.querySelectorAll('.bf-zone button')[2]`, 0.5, 0.5)); await b.dormir(900);
  s = await b.sn();
  b.ok(s && s.deplie && s.boutons.every((x) => x.h >= 44), 'séance du jour : mêmes deux actions, ≥ 44 px', JSON.stringify(s && s.boutons.map((x) => `${x.txt} ${x.w}×${x.h}`)));
  await b.capture('fcc-mobile-seance');
}
b.ok(!b.erreurs.length, 'aucune erreur dans la page', b.erreurs.join(' / '));
process.exit(0);
