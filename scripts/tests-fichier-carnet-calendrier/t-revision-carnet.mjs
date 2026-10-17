// (17/10) Révision (Réviser, ordinateur) → carnet d'erreurs par pré-réponse et apprentissage en un geste.
// 5 cartes notées ; 2 au carnet (pré-réponses), 2 en apprentissage (bouton), 1 par glisser-déposer vers
// l'onglet Apprentissage ; diagnostic avant/après CHAQUE action : rien ne bouge côté J / FSRS / journal.
// Préalable : seed-revision.mjs. Base LOCALE du banc.
import { banc, bancRevision } from './commun.mjs';
const b = await bancRevision(await banc(1440, 900));
await b.biblio({ recharger: true });
await b.ev(`(() => { const el = [...document.querySelectorAll('.sb-item')].find((b) => (b.getAttribute('title') || '').startsWith('Réviser')); el && el.click(); return true; })()`); await b.dormir(1500);
await b.clic(await b.pos(`[...document.querySelectorAll('button')].find(x=>x.innerText.startsWith('Réviser toute cette fiche'))`, false), { att: 1500 });
b.ok(await b.ev(`!!document.querySelector('.flash-card')`), 'série « Nerfs crâniens (test) » lancée (Réviser › Réviser toute cette fiche)');
b.ok(!(await b.sn()), 'avant toute note : pas d’actions « carte notée »');
const noter = async () => {
  const id = await b.ev(`document.querySelector('.flash-card').dataset.carteGlissable`);
  await b.clic(await b.pos(`document.querySelector('.flash-card')`, false), { att: 700 });
  const n = await b.ev(`document.querySelectorAll('.rev-rate button').length`);
  await b.clic(await b.pos(`document.querySelectorAll('.rev-rate button')[${'${'}n>=4?2:1${'}'}]`.replace('${n>=4?2:1}', String(n >= 4 ? 2 : 1)), false), { att: 200 });
  if (await b.ev(`!!document.querySelector('.cp-saisie')`)) await b.clic(await b.pos(`[...document.querySelectorAll('.cp-saisie button')].find(x=>x.innerText.trim()==='Passer')`, false), { att: 300 });
  await b.dormir(500);
  return id;
};
const etats = [];
const independance = async (quoi, action, strict = true) => {
  const lire = strict ? b.diag : b.diagPlan;
  const avant = await lire();
  await action();
  await b.dormir(700);
  const apres = await lire();
  b.ok(avant === apres, `${quoi} : diagnostic ${strict ? 'STRICTEMENT identique (même updatedAt des cartes)' : 'identique hors champs du carnet'} avant/après (J, FSRS, journal, séance du jour)`, avant === apres ? `${JSON.parse(apres).plan.length} cartes, ${JSON.parse(apres).journal.length} entrées de journal` : 'DIFFÉRENT');
  etats.push({ quoi, egal: avant === apres });
};

/* carte 1 → carnet « Je ne connais pas » (actions visibles juste après la note) */
const c1 = await noter();
let s = await b.sn();
b.ok(s && s.deplie && s.boutons.map((x) => x.txt).join(' | ') === 'Carnet d’erreurs | Apprentissage', 'après la note : « Carnet d’erreurs » et « Apprentissage » sous les boutons', JSON.stringify(s && s.boutons.map((x) => x.txt)));
const r1 = (await b.carte(c1)).recto;
b.ok(s && s.carte === r1 && r1 !== (await b.carte(await b.ev(`document.querySelector('.flash-card').dataset.carteGlissable`))).recto, 'les actions nomment la carte NOTÉE (pas la suivante, déjà affichée)', s && s.carte);
await b.capture('fcc-suite-notation', await b.ev(`(()=>{const r=document.querySelector('[data-suite-notation]').getBoundingClientRect();return {x:r.x-180,y:r.y-60,width:r.width+360,height:r.height+80}})()`));
await independance('carnet « Je ne connais pas »', async () => {
  await b.clic(await b.pos(`document.querySelector('[data-sn=carnet]')`, false), { att: 350 });
  const items = await b.ev(`[...document.querySelectorAll('.sn-menu [data-pre]')].map(x=>x.innerText.trim())`);
  b.ok(items.join(' · ') === 'Je ne connais pas · Pas compris · Confusion avec une autre carte · Inversion (latéral/médial, origine/insertion…) · Oubli d’un élément · Faute d’orthographe du terme · Autre…', 'menu des 7 pré-réponses, dans l’ordre', items.join(' · '));
  await b.capture('fcc-pre-reponses', await b.ev(`(()=>{const r=document.querySelector('.sn-menu').getBoundingClientRect();const s=document.querySelector('[data-suite-notation]').getBoundingClientRect();const x=Math.min(r.x,s.x)-20,y=Math.min(r.y,s.y)-20;return {x,y,width:Math.max(r.right,s.right)-x+20,height:Math.max(r.bottom,s.bottom)-y+20}})()`));
  await b.clic(await b.pos(`document.querySelector('.sn-menu [data-pre=inconnu]')`, false), { att: 600 });
}, false);
b.ok((await b.toast()) === 'Ajouté au carnet · Je ne connais pas Modifier', 'toast « Ajouté au carnet · Modifier »', await b.toast());
let q = await b.carte(c1);
b.ok(q.carnetAt && q.carnetType === 'Je ne connais pas' && q.recto === r1 && q.verso && q.carnetRaison === 'Je ne connais pas', 'entrée créée : la carte (recto/verso), type = la pré-réponse, date', JSON.stringify({ carnetAt: q.carnetAt, carnetType: q.carnetType, carnetRaison: q.carnetRaison }));

/* carte 2 → carnet « Confusion avec une autre carte » puis « Modifier » (note) */
const c2 = await noter();
await independance('carnet « Confusion » + note via Modifier', async () => {
  await b.clic(await b.pos(`document.querySelector('[data-sn=carnet]')`, false), { att: 350 });
  await b.clic(await b.pos(`document.querySelector('.sn-menu [data-pre=confusion]')`, false), { att: 600 });
  await b.clic(await b.pos(`document.querySelector('.sn-toast-action')`, false), { att: 500 });
  await b.ev(`(()=>{const t=document.querySelector('#sn-note');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,'Confondu avec le droit latéral (VI)');t.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
  await b.capture('fcc-carnet-modifier', await b.ev(`(()=>{const r=document.querySelector('.sn-modif').closest('.day-pop').getBoundingClientRect();return {x:r.x-10,y:r.y-10,width:r.width+20,height:r.height+20}})()`));
  await b.clic(await b.pos(`document.querySelector('[data-sn=enregistrer]')`, false), { att: 600 });
}, false);
q = await b.carte(c2);
b.ok(q.carnetType === 'Confusion avec une autre carte' && q.carnetRaison === 'Confondu avec le droit latéral (VI)' && q.recto && q.verso && q.carnetAt, 'entrée 2 : type « Confusion… », note optionnelle enregistrée', JSON.stringify({ carnetType: q.carnetType, carnetRaison: q.carnetRaison }));

/* carte 3 → Apprentissage (pendant les 2 s) */
const c3 = await noter();
await independance('Apprentissage (bouton)', async () => { await b.clic(await b.pos(`document.querySelector('[data-sn=apprentissage]')`, false), { att: 500 }); });
b.ok(/^Ajoutée à l’apprentissage · Neurologie \(test 17\/10\) › Nerfs crâniens \(test\)/.test(await b.toast()), 'toast « Ajoutée à l’apprentissage » (matière › cours)', await b.toast());
await b.capture('fcc-toast-apprentissage', await b.ev(`(()=>{const r=document.querySelector('.sn-toast').getBoundingClientRect();return {x:r.x-20,y:r.y-20,width:r.width+40,height:r.height+40}})()`));

/* carte 4 → les actions se replient après 2 s, l'icône les rouvre, puis Apprentissage */
const c4 = await noter();
await b.dormir(2300);
s = await b.sn();
b.ok(s && s.replie && !s.boutons.length && await b.ev(`!!document.querySelector('[data-sn=deplier]')`), 'après 2 s : repliées dans une icône');
const hAvant = await b.ev(`document.querySelector('.rev-stage').scrollHeight`);
await b.capture('fcc-suite-repliee', await b.ev(`(()=>{const r=document.querySelector('[data-suite-notation]').getBoundingClientRect();return {x:r.x-200,y:r.y-50,width:r.width+400,height:r.height+70}})()`));
await b.clic(await b.pos(`document.querySelector('[data-sn=deplier]')`, false), { att: 300 });
b.ok((await b.sn()).deplie, 'l’icône rouvre les deux actions (toujours accessibles)');
await independance('Apprentissage (après repli)', async () => { await b.clic(await b.pos(`document.querySelector('[data-sn=apprentissage]')`, false), { att: 500 }); });

/* carte 5 → glisser-déposer de la carte vers l'onglet Apprentissage de la barre latérale, puis notée */
const c5 = await b.ev(`document.querySelector('.flash-card').dataset.carteGlissable`);
const de = await b.dans(`document.querySelector('.flash-card')`, 0.5, 0.4);
const vers = await b.dans(`document.querySelector('.sb-appr')`, 0.5, 0.5);
let glisse = false;
await independance('glisser-déposer vers l’onglet Apprentissage', async () => { glisse = await b.glisserHTML5(de, vers); });
b.ok(glisse && /depot-proche/.test(b.__surCible || ''), 'glisser la carte : l’onglet Apprentissage s’illumine au survol', b.__surCible);
await noter();

/* résultats */
const liste = await b.listeAppr();
b.ok([c3, c4, c5].every((id) => liste.includes(id)) && ![c1, c2].some((id) => liste.includes(id)), 'liste Apprentissage : les 3 cartes envoyées (bouton ×2, glisser ×1), pas les autres', [c3, c4, c5].map((id) => liste.includes(id)).join(','));
b.ok(etats.length === 5 && etats.every((e) => e.egal), 'preuve d’indépendance : 5 actions, 5 diagnostics identiques avant/après');
// l'écran Apprentissage range par matière puis cours
await b.ev(`(() => { const el = document.querySelector('.sb-appr'); el && el.click(); return 1; })()`); await b.dormir(1200);
const groupes = await b.ev(`document.querySelector('.screen')?.innerText||''`);
b.ok(/Neurologie \(test 17\/10\)[\s\S]*Nerfs crâniens \(test\)/i.test(groupes), 'mode Apprentissage : cartes rangées sous « Neurologie (test 17/10) › Nerfs crâniens (test) »');
await b.capture('fcc-apprentissage-range');
b.ok(!b.erreurs.length, 'aucune erreur dans la page', b.erreurs.join(' / '));
process.exit(0);
