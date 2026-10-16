// Mode Apprentissage — glisser-déposer et notes (16/10). Base LOCALE du banc.
// Préalable : node seed-carnet.mjs && node seed-apprentissage.mjs
import { banc } from '../tests-bibliotheque-fichier/commun.mjs';
import { outilsGlisse } from './commun-appr.mjs';
const b = await banc(1440, 900); const g = outilsGlisse(b);
await b.c.send('Runtime.evaluate', { expression: `localStorage.setItem('medrevise.biblio.tri','manuel')` });
await b.biblio({ recharger: true });
// INDÉPENDANCE : empreinte de tout ce qui touche aux J / FSRS / journal AVANT
const empreinte = () => b.S(`const uu=performance.getEntriesByType('resource').map(e=>e.name);const K=await import(uu.find(n=>n.includes('idb-keyval')));
  const qs=(await S.getAll('questions')).map(q=>{const {updatedAt,...r}=q;return r}).sort((a,b)=>a.id<b.id?-1:1);
  const meta=await K.entries(K.createStore('medrevise-meta','v1'));
  const sl=(await S.getAll('sessionsLog')).length;
  const jr=(await K.entries(K.createStore('medrevise-review_log','v1'))).length, jo=(await K.entries(K.createStore('medrevise-review_log_outbox','v1'))).length;
  return JSON.stringify({qs,meta:meta.map(([k,v])=>[k,JSON.stringify(v)]).sort(),sl,jr,jo})`);
const avant = await empreinte();
// 1) depuis le panneau Flashcards d'une fiche : 1 carte, puis une sélection de 2
await b.ouvrir('Psychologie du développement');
await b.ev(`(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.innerText.trim().startsWith('Exercices'));t&&t.click();return 1})()`); await b.dormir(600);
await b.ev(`(()=>{const t=[...document.querySelectorAll('.pm-sous-btn')].find(x=>/Flash/i.test(x.innerText));t&&t.click();return 1})()`); await b.dormir(600);
const compteur = () => b.ev(`+(document.querySelector('.sb-appr .sb-compte')?.innerText||0)`);
let r = await g.glisserVers(await b.pos(`document.querySelectorAll('.pis-item.alib-glissable')[0]`), await g.onglet(), { pendant: () => b.ev(`document.querySelector('.sb-appr').className`) });
b.ok(r.ok && /depot-proche/.test(r.pendant), 'panneau : pendant le glisser, l’onglet Apprentissage s’illumine à l’approche', r.pendant);
b.ok((await compteur()) === 1, 'compteur de l’onglet : 1');
await b.clic(await b.pos(`document.querySelector('.alib-selectionner')`), { att: 400 });
await b.clic(await b.pos(`document.querySelectorAll('.pis-item .alib-case')[1]`), { att: 200 });
await b.clic(await b.pos(`document.querySelectorAll('.pis-item .alib-case')[2]`), { att: 200 });
r = await g.glisserVers(await b.pos(`document.querySelectorAll('.pis-item.alib-glissable')[2]`), await g.onglet());
b.ok((await compteur()) === 3, 'une sélection de 2 glissée d’un coup : compteur 3', String(await compteur()));
await b.capture('appr-panneau-glisse');
await b.fermerLecteur();
// 2) depuis la Bibliothèque : 2 cartes d'une fiche « cartes seules »
await b.biblio();
await b.clic(await b.pos(`[...document.querySelectorAll('.lt-fiche .lt-rangee')].find(e=>e.innerText.startsWith('Cartes d’anatomie'))`), { att: 500 });
for (let i = 0; i < 2; i++) await g.glisserVers(await b.pos(`document.querySelectorAll('.lt-carte.alib-glissable')[${i}]`), await g.onglet());
b.ok((await compteur()) === 5, 'Bibliothèque : 2 cartes glissées → compteur 5', String(await compteur()));
const ordreFiches = await b.S(`return JSON.stringify((await S.getAll('fiches')).map(f=>[f.id,f.ordre??null,f.dossierId||null]).sort())`);
// 3) onglet Apprentissage : rangé par matière puis par cours
await b.ev(`document.querySelector('.sb-appr').click(),1`); await b.dormir(900);
const rang = await b.ev(`[...document.querySelectorAll('.alib-matiere')].map(m=>m.querySelector('.alib-mtitre').childNodes[0].textContent.trim()+' > '+[...m.querySelectorAll('.alib-groupe')].map(gr=>gr.querySelector('.alib-gtitre').innerText+' ('+gr.querySelectorAll('.alib-carte').length+')').join(', ')).join(' | ')`);
b.ok(rang === 'Anatomie palpatoire > Cartes d’anatomie (test) (2) | Psychologie > Psychologie du développement (3)', 'rangées par matière puis par cours (ordre de la Bibliothèque), quel que soit le chemin d’ajout', rang);
// 4) notes : crayon → champ, sauvegarde auto, dans learning_set seulement
const carte0 = await b.ev(`document.querySelector('.alib-carte').dataset.carte`);
await b.clic(await b.pos(`document.querySelector('.alib-carte .alib-crayon')`), { att: 300 });
await b.c.send('Input.insertText', { text: 'Penser à la tubérosité : « T » comme Trois quarts du bras.' });
await b.dormir(1200);
const lst = await g.liste();
b.ok(lst.notes && lst.notes[carte0] === 'Penser à la tubérosité : « T » comme Trois quarts du bras.' && lst.cardIds.length === 5, 'note enregistrée automatiquement, dans learning_set (notes[cardId])', JSON.stringify(lst.notes));
b.ok(await b.ev(`document.querySelector('.alib-note-etat').innerText==='Enregistré'`), 'indication « Enregistré »');
await b.clic(await b.pos(`[...document.querySelectorAll('.alib-carte')].find(x=>x.innerText.includes('Piaget')).querySelector('.alib-crayon')`), { att: 300 });
await b.c.send('Input.insertText', { text: 'Piaget : préopératoire = 2-7 ans (pensée symbolique).' });
await b.T.Tab(); await b.dormir(700);
await b.capture('appr-onglet-notes');
// 5) session : la note s'affiche après retournement, sous la réponse
await b.clic(await b.pos(`document.querySelector('.alib-barre .alib-coche input')`), { att: 300 });
await b.clic(await b.pos(`document.querySelector('.alib-lancer')`), { att: 900 });
let vue = false, sansNote = true;
for (let i = 0; i < 8 && !vue; i++) {
  const id = await b.ev(`document.querySelector('.sfc-carte')?.dataset.carte`);
  b.ok(!(await b.ev(`!!document.querySelector('.alib-note-session')`)) || i > 0, 'avant retournement : pas de note');
  await b.clic(await b.pos(`document.querySelector('.sfc-carte')`), { att: 500 });
  const n = await b.ev(`document.querySelector('.alib-note-session')?.innerText||''`);
  if (id === carte0) { vue = n.includes('tubérosité'); if (vue) await b.capture('appr-session-note'); }
  else if (n && !(await g.liste()).notes[id]) sansNote = false;
  await b.clic(await b.pos(`document.querySelector('.alib-passu')`), { att: 500 });
}
b.ok(vue, 'session : la note apparaît sous la réponse, après retournement');
b.ok(sansNote, 'session : rien sous les cartes sans note');
await b.ev(`document.querySelector('.sfc-quitter').click(),1`); await b.dormir(600);
// 6) une matière vidée disparaît d'elle-même
await b.ev(`document.querySelector('.sb-appr').click(),1`); await b.dormir(700);
for (let i = 0; i < 2; i++) { await b.clic(await b.pos(`document.querySelector('[data-matiere="mat-tb-ap"] .alib-retirer')`), { att: 500 }); }
b.ok(!(await b.ev(`!!document.querySelector('[data-matiere="mat-tb-ap"]')`)) && (await compteur()) === 3, 'Anatomie palpatoire vidée : la matière disparaît, compteur 3');
// 7) INDÉPENDANCE : J, FSRS, journal, séance du jour inchangés ; aucune fiche rangée autrement
b.ok((await empreinte()) === avant, 'indépendance : cartes (dueDate, intervalles, FSRS, historique), méta (séance du jour), journal des révisions et sessions inchangés');
b.ok((await b.S(`return JSON.stringify((await S.getAll('fiches')).map(f=>[f.id,f.ordre??null,f.dossierId||null]).sort())`)) === ordreFiches, 'glisser une carte de la Bibliothèque ne déplace aucune fiche');
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
process.exit(0);
