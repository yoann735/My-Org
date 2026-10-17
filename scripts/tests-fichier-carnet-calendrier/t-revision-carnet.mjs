// (17/10 soir) Révision (Réviser, ordinateur) : les icônes « Carnet d'erreurs » / « Apprentissage » appartiennent à
// la CARTE AFFICHÉE — dès qu'elle est retournée (avant de noter), dans l'en-tête de la carte, fixes quel que soit
// le défilement interne ; remplacées à la carte suivante. 5 cartes notées ; 2 au carnet (pré-réponses), 2 en
// apprentissage, 1 glissée vers l'onglet Apprentissage ; diagnostic avant/après CHAQUE action.
// Préalable : seed-revision.mjs. Base LOCALE du banc.
import { banc, bancRevision } from './commun.mjs';
const b = await bancRevision(await banc(1440, 900));
await b.biblio({ recharger: true });
await b.ev(`(() => { const el = [...document.querySelectorAll('.sb-item')].find((b) => (b.getAttribute('title') || '').startsWith('Réviser')); el && el.click(); return true; })()`); await b.dormir(1500);
await b.clic(await b.pos(`[...document.querySelectorAll('button')].find(x=>x.innerText.startsWith('Réviser toute cette fiche'))`, false), { att: 1500 });
b.ok(await b.ev(`!!document.querySelector('.flash-card')`), 'série « Nerfs crâniens (test) » lancée (Réviser › Réviser toute cette fiche)');
const courante = () => b.ev(`document.querySelector('.flash-card').dataset.carteGlissable`);
const retourner = async () => { await b.clic(await b.pos(`document.querySelector('.flash-card')`, false), { att: 750 }); };
const noter = async () => {
  const n = await b.ev(`document.querySelectorAll('.rev-rate button').length`);
  await b.clic(await b.pos(`document.querySelectorAll('.rev-rate button')[${n >= 4 ? 2 : 1}]`, false), { att: 200 });
  if (await b.ev(`!!document.querySelector('.cp-saisie')`)) await b.clic(await b.pos(`[...document.querySelectorAll('.cp-saisie button')].find(x=>x.innerText.trim()==='Passer')`, false), { att: 300 });
  await b.dormir(500);
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

/* carte 1 : avant retournement, pas d'icônes ; retournée → les icônes de CETTE carte, dans l'en-tête */
const c1 = await courante();
b.ok(!(await b.ac()), 'recto : pas encore d’icônes');
await retourner();
let a = await b.ac();
const carteR = await b.rect(`document.querySelector('.flash-card')`);
b.ok(a && a.id === c1 && a.icones.map((x) => x.label).join(' | ') === 'Carnet d’erreurs | Apprentissage', 'carte retournée (avant de noter) : icônes « Carnet d’erreurs » et « Apprentissage » de CETTE carte', JSON.stringify(a && a.icones.map((x) => x.label)));
b.ok(a && a.y - carteR.y < 30 && carteR.r - a.r < 30 && a.icones.every((x) => x.h === 30), 'dans l’en-tête de la carte, coin supérieur droit (30 px)', a && `${a.x - carteR.x},${a.y - carteR.y} depuis le coin`);
await b.capture('fcc-icones-carte', { x: carteR.x - 10, y: carteR.y - 10, width: carteR.w + 20, height: Math.min(560, carteR.h + 20) });
await independance('carnet « Je ne connais pas » (avant la note)', async () => {
  await b.clic(await b.pos(`document.querySelector('[data-sn=carnet]')`, false), { att: 350 });
  const items = await b.ev(`[...document.querySelectorAll('.sn-menu [data-pre]')].map(x=>x.innerText.trim())`);
  b.ok(items.join(' · ') === 'Je ne connais pas · Pas compris · Confusion avec une autre carte · Inversion (latéral/médial, origine/insertion…) · Oubli d’un élément · Faute d’orthographe du terme · Autre…', 'le menu des pré-réponses s’ouvre depuis l’icône', items.join(' · '));
  await b.capture('fcc-pre-reponses', await b.ev(`(()=>{const r=document.querySelector('.sn-menu').getBoundingClientRect();const s=document.querySelector('.flash-card').getBoundingClientRect();const x=Math.min(r.x,s.x)-10,y=Math.min(r.y,s.y)-10;return {x,y,width:Math.max(r.right,s.right)-x+10,height:Math.min(600,Math.max(r.bottom,s.y+300)-y+10)}})()`));
  await b.clic(await b.pos(`document.querySelector('.sn-menu [data-pre=inconnu]')`, false), { att: 600 });
}, false);
b.ok(/^Ajouté au carnet · Je ne connais pas/.test(await b.toast() || ''), 'toast « Ajouté au carnet · Modifier »', await b.toast());
let q = await b.carte(c1);
const r1 = q.recto;
b.ok(q.carnetAt && q.carnetType === 'Je ne connais pas' && q.recto === r1 && q.verso && await b.ev(`document.querySelector('.flash-face.front').innerText.includes(${JSON.stringify(r1.slice(0, 25))})`), 'entrée créée pour la carte AFFICHÉE (bon recto), type = la pré-réponse, date', JSON.stringify({ recto: q.recto, carnetType: q.carnetType, carnetAt: q.carnetAt }));
await noter();

/* carte 2 : nouvelle carte → plus d'icônes tant qu'elle n'est pas retournée, puis les SIENNES */
const c2 = await courante();
b.ok(c2 !== c1 && !(await b.ac()), 'carte suivante (recto) : les icônes de la carte précédente ont disparu');
await retourner();
a = await b.ac();
b.ok(a && a.id === c2, 'retournée : icônes mises à jour pour la nouvelle carte', a && a.id);
await independance('carnet « Confusion » + note via Modifier', async () => {
  await b.clic(await b.pos(`document.querySelector('[data-sn=carnet]')`, false), { att: 350 });
  await b.clic(await b.pos(`document.querySelector('.sn-menu [data-pre=confusion]')`, false), { att: 600 });
  await b.clic(await b.pos(`document.querySelector('.sn-toast-action')`, false), { att: 500 });
  await b.ev(`(()=>{const t=document.querySelector('#sn-note');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,'Confondu avec le droit latéral (VI)');t.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
  await b.capture('fcc-carnet-modifier', await b.ev(`(()=>{const r=document.querySelector('.sn-modif').closest('.day-pop').getBoundingClientRect();return {x:r.x-10,y:r.y-10,width:r.width+20,height:r.height+20}})()`));
  await b.clic(await b.pos(`document.querySelector('[data-sn=enregistrer]')`, false), { att: 600 });
}, false);
q = await b.carte(c2);
b.ok(q.carnetType === 'Confusion avec une autre carte' && q.carnetRaison === 'Confondu avec le droit latéral (VI)', 'entrée 2 : type « Confusion… », note enregistrée', JSON.stringify({ carnetType: q.carnetType, carnetRaison: q.carnetRaison }));
b.ok(await b.ev(`document.querySelector('[data-sn=carnet]').classList.contains('fait')`), 'l’icône du carnet signale la carte déjà au carnet');
await noter();

/* carte 3 → Apprentissage (bonne carte) */
const c3 = await courante();
await retourner();
await independance('Apprentissage (icône)', async () => { await b.clic(await b.pos(`document.querySelector('[data-sn=apprentissage]')`, false), { att: 500 }); });
b.ok(/^Ajoutée à l’apprentissage · Neurologie \(test 17\/10\) › Nerfs crâniens \(test\)/.test(await b.toast() || ''), 'toast « Ajoutée à l’apprentissage » (matière › cours)', await b.toast());
b.ok((await b.listeAppr()).includes(c3), 'Apprentissage : c’est la carte affichée qui est ajoutée', c3);
await noter();

/* carte 4 → Apprentissage ; et si c'est la carte au verso long : les icônes ne bougent pas au défilement */
const c4 = await courante();
await retourner();
const longue = await b.ev(`(()=>{const z=document.querySelector('.flash-face.back .zd-defil, .flash-face.back .ff-zone');return z?z.scrollHeight>z.clientHeight+40:false})()`);
const a0 = await b.ac();
await b.ev(`(()=>{const z=[...document.querySelectorAll('.flash-face.back *')].find(e=>e.scrollHeight>e.clientHeight+40&&/(auto|scroll)/.test(getComputedStyle(e).overflowY));if(z)z.scrollTop=z.scrollHeight;return 1})()`); await b.dormir(200);
const a1 = await b.ac();
b.ok(a0 && a1 && a0.y === a1.y && a0.x === a1.x, `icônes fixes quel que soit le défilement interne de la carte${longue ? ' (verso long défilé jusqu’en bas)' : ''}`, `${a0 && a0.y} → ${a1 && a1.y}`);
await independance('Apprentissage (2e carte)', async () => { await b.clic(await b.pos(`document.querySelector('[data-sn=apprentissage]')`, false), { att: 500 }); });
await noter();

/* carte 5 → glisser-déposer de la carte vers l'onglet Apprentissage, puis notée */
const c5 = await courante();
const de = await b.dans(`document.querySelector('.flash-card')`, 0.5, 0.6);
const vers = await b.dans(`document.querySelector('.sb-appr')`, 0.5, 0.5);
let glisse = false;
await independance('glisser-déposer vers l’onglet Apprentissage', async () => { glisse = await b.glisserHTML5(de, vers); });
b.ok(glisse && /depot-proche/.test(b.__surCible || ''), 'glisser la carte : l’onglet Apprentissage s’illumine au survol', b.__surCible);
await retourner(); await noter();

const liste = await b.listeAppr();
b.ok([c3, c4, c5].every((id) => liste.includes(id)) && ![c1, c2].some((id) => liste.includes(id)), 'liste Apprentissage : les 3 cartes envoyées, pas les autres', [c3, c4, c5].map((id) => liste.includes(id)).join(','));
b.ok(etats.length === 5 && etats.every((e) => e.egal), 'preuve d’indépendance : 5 actions, 5 diagnostics identiques avant/après');
await b.ev(`(() => { const el = document.querySelector('.sb-appr'); el && el.click(); return 1; })()`); await b.dormir(1200);
b.ok(/Neurologie \(test 17\/10\)[\s\S]*Nerfs crâniens \(test\)/i.test(await b.ev(`document.querySelector('.screen')?.innerText||''`)), 'mode Apprentissage : cartes rangées sous « Neurologie (test 17/10) › Nerfs crâniens (test) »');
b.ok(!b.erreurs.length, 'aucune erreur dans la page', b.erreurs.join(' / '));
process.exit(0);
