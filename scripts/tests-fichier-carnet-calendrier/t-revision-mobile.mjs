// (17/10 soir) Téléphone (390 × 844, tactile) : icônes carnet / apprentissage de 40 px dans l'en-tête de la CARTE
// AFFICHÉE, dès qu'elle est retournée ; feuille du bas de pré-réponses ; boutons de notation toujours visibles et
// jamais masqués par les icônes (point 6). Série d'une fiche (MobileSession) puis séance du jour (SeanceFC).
// Préalable : seed-revision.mjs. Base LOCALE du banc.
import { banc, bancRevision } from './commun.mjs';
const b = await bancRevision(await banc(390, 844, { tactile: true }));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await b.c.send('Page.reload', { ignoreCache: true }); await b.dormir(4500);
if (await b.ev(`document.body.innerText.includes('Choisis ton espace')`)) { await b.ev(`[...document.querySelectorAll('.hub-card')].find(b=>/^\\s*MedRevise/i.test(b.innerText))?.click();1`); await b.dormir(2000); }
const p = await b.ev(`(()=>{const t=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent.trim()==='Nerfs crâniens (test)');let c=t;while(c&&!c.querySelector('button'))c=c.parentElement;const r=[...c.querySelectorAll('button')].find(x=>x.innerText.trim()==='Réviser');r.scrollIntoView({block:'center'});const q=r.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()`);
await b.tape(p); await b.dormir(1200);
b.ok(await b.ev(`!!document.querySelector('.mrm-flash-card')`), 'téléphone : série « Nerfs crâniens (test) » ouverte');
const recto = () => b.ev(`document.querySelector('.mrm-flash-card .mrm-flash-text')?.innerText||''`);
const retourner = async () => { await b.tape(await b.dans(`document.querySelector('.mrm-flash-card')`, 0.5, 0.6)); await b.dormir(500); };
const noter = async () => {
  const n = await b.ev(`document.querySelectorAll('.bf-zone button').length`);
  await b.tape(await b.dans(`document.querySelectorAll('.bf-zone button')[${n >= 4 ? 2 : 1}]`, 0.5, 0.5));
  if (await b.ev(`!!document.querySelector('.cp-saisie')`)) await b.tape(await b.dans(`[...document.querySelectorAll('.cp-saisie button')].find(x=>x.innerText.trim()==='Passer')`, 0.5, 0.5));
  await b.dormir(600);
};
const boutonsNotation = () => b.ev(`(()=>{const l=[...document.querySelectorAll('.bf-zone button')];const ic=[...document.querySelectorAll('.ac-icone')].map(e=>e.getBoundingClientRect());return {n:l.length,visibles:l.every(x=>{const r=x.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.height>=44}),libres:l.every(x=>{const r=x.getBoundingClientRect();const e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e&&x.contains(e)}),separes:l.every(x=>{const r=x.getBoundingClientRect();return ic.every(i=>i.bottom<=r.top||i.top>=r.bottom||i.right<=r.left||i.left>=r.right)})}})()`);

const r1 = await recto();
b.ok(!(await b.ac()), 'recto : pas d’icônes');
await retourner();
let a = await b.ac();
const carte = await b.rect(`document.querySelector('.mrm-flash-card')`);
b.ok(a && a.icones.length === 2 && a.icones.every((x) => x.h === 40 && x.w === 40), 'carte retournée : deux icônes de 40 px', JSON.stringify(a && a.icones));
b.ok(a && a.y - carte.y <= 14 && carte.r - a.r <= 14, 'dans l’en-tête de la carte (coin supérieur droit)', a && `${a.y - carte.y} px du haut, ${carte.r - a.r} px du bord`);
let bn = await boutonsNotation();
b.ok(bn.n >= 3 && bn.visibles && bn.libres && bn.separes, 'point 6 : boutons de notation visibles (≥ 44 px), non recouverts par les icônes', JSON.stringify(bn));
await b.capture('fcc-mobile-icones');
const avant = await b.diagPlan();
await b.tape(await b.dans(`document.querySelector('[data-sn=carnet]')`, 0.5, 0.5)); await b.dormir(450);
const f = await b.rect(`document.querySelector('.sn-feuille')`);
b.ok(f && Math.round(f.b) === 844 && f.w === 390, 'icône Carnet → feuille du bas (pleine largeur, collée en bas)', f ? `${f.w}×${Math.round(f.h)} bas=${Math.round(f.b)}` : '');
const items = await b.ev(`[...document.querySelectorAll('.sn-feuille [data-pre]')].map(x=>[x.innerText.trim(),Math.round(x.getBoundingClientRect().height)])`);
b.ok(items.length === 7 && items.every(([, h]) => h >= 44), 'feuille : 6 pré-réponses + « Autre… », cibles ≥ 44 px', items.map(([t, h]) => `${t} (${h})`).join(' · '));
b.ok((await b.ev(`document.querySelector('.sn-feuille-sous').innerText`)) === r1, 'la feuille nomme la carte affichée', r1);
await b.capture('fcc-mobile-feuille');
await b.tape(await b.dans(`document.querySelector('.sn-feuille [data-pre=compris]')`, 0.5, 0.5)); await b.dormir(700);
b.ok(/^Ajouté au carnet · Pas compris/.test(await b.toast() || ''), 'tap « Pas compris » : entrée créée, toast', await b.toast());
const carnet = await b.S(`return (await S.getAll('questions')).filter(q=>q.id.startsWith('q-rv')&&q.carnetType==='Pas compris').map(q=>({recto:q.recto,at:q.carnetAt}))`);
b.ok(carnet.length === 1 && carnet[0].recto === r1 && carnet[0].at, 'entrée « Pas compris » sur la BONNE carte (même recto)', JSON.stringify(carnet));
b.ok(avant === await b.diagPlan(), 'carnet (téléphone) : J / FSRS / journal inchangés');
await b.capture('fcc-mobile-toast');
await noter();
// carte 2 : icônes disparues jusqu'au retournement, puis Apprentissage (diagnostic STRICT)
b.ok(!(await b.ac()), 'carte suivante : plus d’icônes avant le retournement');
const r2 = await recto();
await retourner();
const av2 = await b.diag();
const l0 = await b.listeAppr();
await b.tape(await b.dans(`document.querySelector('[data-sn=apprentissage]')`, 0.5, 0.5)); await b.dormir(800);
const l1 = await b.listeAppr();
const ajoute = l1.filter((x) => !l0.includes(x));
const recAjoute = ajoute.length === 1 ? (await b.carte(ajoute[0])).recto : null;
b.ok(ajoute.length === 1 && recAjoute === r2 && /^Ajoutée à l’apprentissage/.test(await b.toast() || ''), 'tap « Apprentissage » : c’est la carte affichée qui rejoint la liste', recAjoute);
b.ok(av2 === await b.diag(), 'Apprentissage (téléphone) : diagnostic strictement identique avant/après');
bn = await boutonsNotation();
b.ok(bn.visibles && bn.libres && bn.separes, 'point 6 (après l’action) : boutons de notation toujours visibles et libres', JSON.stringify(bn));
await noter();
// Séance du jour (SeanceFC) au téléphone : mêmes icônes
await b.tape(await b.dans(`document.querySelector('.mrm-quit')`, 0.5, 0.5)); await b.dormir(1500);
const dem = await b.ev(`(()=>{const x=[...document.querySelectorAll('button')].find(x=>/^(Démarrer|Reprendre la séance)$/.test(x.innerText.trim()));if(!x)return null;x.scrollIntoView({block:'center'});const r=x.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
if (dem) { await b.tape(dem); await b.dormir(1800); }
b.ok(await b.ev(`!!document.querySelector('.sfc-carte')`), 'séance du jour ouverte au téléphone');
await b.tape(await b.dans(`document.querySelector('.sfc-carte')`, 0.5, 0.5)); await b.dormir(500);
a = await b.ac();
const cs = await b.rect(`document.querySelector('.sfc-carte')`);
b.ok(a && a.id === await b.ev(`document.querySelector('.sfc-carte').dataset.carte`) && a.icones.every((x) => x.h === 40) && a.y - cs.y <= 14, 'séance du jour : icônes de 40 px de CETTE carte, dans son en-tête');
bn = await boutonsNotation();
b.ok(bn.n === 4 && bn.visibles && bn.libres && bn.separes, 'séance du jour : 4 boutons de notation visibles, non recouverts', JSON.stringify(bn));
await b.capture('fcc-mobile-seance');
b.ok(!b.erreurs.length, 'aucune erreur dans la page', b.erreurs.join(' / '));
process.exit(0);
