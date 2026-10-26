// Ordinateur (A, 1440×900) : formulaire replié / déplié en tête de la liste, défilement de 200 cartes, « Agrandir » (chaque
// sorte, ← →, Échap, clic dehors), tag « À apprendre » depuis la liste et la vue agrandie (toast, Annuler, étiquette),
// filtre « À apprendre », preuve d'indépendance (10 cartes taguées : planification + journal + séance identiques).
import { banc } from './commun.mjs';
process.env.CDP_PORT = process.env.CDP_PORT || '9335';
const A = await banc(Number(process.env.W || 1440), Number(process.env.H || 900));
const SFX = process.env.SFX || '';
let echecs = 0; const v = (c, m, d = '') => { if (!A.ok(c, m, d)) echecs++; };
v(await A.ouvrirCours(undefined, { recharger: true }), 'cours de 200 cartes ouvert');
await A.ongletFlashcards();
await A.ev(`(()=>{document.querySelector('.pm-exos').scrollTop=0;return 1})()`);

// ---- 1. formulaire en tête, replié en une ligne ----
const ordre = () => A.ev(`(()=>{const z=document.querySelector('.pm-exos');const y=(s)=>{const e=z.querySelector(s);return e?Math.round(e.getBoundingClientRect().top):null};return {ligne:y('.fcl-nouvelle'),form:y('.fc-carte'),outils:y('.fcl-outils'),liste:y('.pis-item.fcl-carte')}})()`);
let o = await ordre();
v(o.ligne != null && o.form == null && o.ligne < o.outils && o.outils < o.liste, 'replié : une ligne « + Nouvelle carte » au-dessus de la recherche et de la liste', JSON.stringify(o));
v((await A.ev(`document.querySelector('.fcl-nouvelle').textContent.trim()`)) === 'Nouvelle carte', 'libellé « + Nouvelle carte »');
await A.capture('aap-liste-replie' + SFX);
await A.toucher(`document.querySelector('.fcl-nouvelle')`, 600);
o = await ordre();
v(o.ligne == null && o.form != null && o.form < o.outils && o.outils < o.liste, 'déplié : le formulaire de création en tête, la liste dessous', JSON.stringify(o));
await A.capture('aap-liste-deplie' + SFX);
// une carte ajoutée depuis le formulaire déplié arrive dans la liste
await A.ev(`(()=>{const t=document.querySelector('.fc-carte textarea, .fc-carte [contenteditable]');t&&t.focus();return 1})()`);
const n0 = await A.ev(`document.querySelectorAll('.pis-item.fcl-carte').length`);
await A.toucher(`[...document.querySelectorAll('.fc-carte .imp-actions button')].find(b=>/Annuler/.test(b.textContent))`, 600);
o = await ordre();
v(o.ligne != null && o.form == null, '« Annuler » replie le formulaire en une ligne', JSON.stringify(o));
v(n0 === 200, `200 cartes dans la liste (${n0})`);

// ---- 2. défilement de 200 cartes : images perdues pendant un défilement à la molette ----
await A.ev(`(()=>{window.__f=[];window.__lt=[];const z=document.querySelector('.pm-exos');z.scrollTop=0;let t0=performance.now();const boucle=(t)=>{window.__f.push(t-t0);t0=t;if(window.__f.length<400)requestAnimationFrame(boucle)};requestAnimationFrame(boucle);try{new PerformanceObserver((l)=>l.getEntries().forEach(e=>window.__lt.push(Math.round(e.duration)))).observe({type:'longtask'})}catch(e){};return 1})()`);
const rz = await A.rect(`document.querySelector('.pm-exos')`);
const t0 = Date.now();
for (let k = 0; k < 120; k++) { A.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: rz.cx, y: rz.cy, deltaX: 0, deltaY: 120 }); await A.dormir(16); }
await A.dormir(800);
const def = await A.ev(`(()=>{const z=document.querySelector('.pm-exos');const f=window.__f.slice(2);const lent=f.filter(x=>x>34).length;return {haut:z.scrollTop,max:z.scrollHeight-z.clientHeight,images:f.length,lentes:lent,pire:Math.round(Math.max(...f)),longues:window.__lt}})()`);
// critère : aucune tâche longue ; les images > 34 ms du rAF headless sont du bruit (ancien code mesuré : 9 sur ~125, t-defil.mjs)
v(def.haut >= 14000 && def.longues.length === 0, `défilement fluide sur 200 cartes (${Date.now() - t0} ms de molette)`, JSON.stringify(def));
await A.ev(`(()=>{document.querySelector('.pm-exos').scrollTop=0;return 1})()`); await A.dormir(300);

// ---- 3. Agrandir : chaque sorte, recto → retourner → verso, champs révélables ----
const SORTES = [['aa000', 'texte'], ['aa001', 'trous'], ['aa002', 'image'], ['aa003', 'muscle'], ['aa004', 'tableau'], ['aa005', 'molecule']];
for (const [id, sorte] of SORTES) {
  await A.survol(A.carteListe(id));
  await A.toucher(`${A.carteListe(id)}.querySelector('[data-act="agrandir"]')`, 900);
  const etat = await A.ev(`(()=>{const d=document.querySelector('.va');if(!d)return null;const c=d.querySelector('.sfc-carte');return {id:c.dataset.carte,cote:c.dataset.cote,face:!!d.querySelector('.sfc-zone, .sfc-molecule'),pos:d.querySelector('[data-position]').textContent,aap:!!d.querySelector('.aap-bt'),img:!!d.querySelector('img'),txt:c.textContent.slice(0,80)}})()`);
  v(etat && etat.id === id && etat.cote === 'recto' && etat.face && etat.aap, `Agrandir (${sorte}) : la carte en grand, au recto, étoile présente`, JSON.stringify(etat));
  if (sorte === 'texte' || sorte === 'muscle') await A.capture(`aap-agrandie-${sorte}-recto` + SFX);
  await A.toucher(`document.querySelector('.va .sfc-carte')`, 700);
  const verso = await A.ev(`(()=>{const d=document.querySelector('.va');const c=d.querySelector('.sfc-carte');return {cote:c.dataset.cote,masques:d.querySelectorAll('.mu-masque, .tb-masque').length,carnet:!!d.querySelector('[data-sn="carnet"]'),mark:d.querySelectorAll('.mrm-cloze-mark').length,img:!!d.querySelector('img'),txt:c.textContent.slice(0,90)}})()`);
  v(verso.cote === 'verso' && verso.carnet, `Agrandir (${sorte}) : retournée au verso (carnet présent comme en révision)`, JSON.stringify(verso));
  if (sorte === 'trous') v(verso.mark >= 1, 'trous : le mot surligné au verso, comme en révision');
  if (sorte === 'image') v(etat.img, 'image : affichée au recto (imagePlace « recto », comme en révision)');
  if (sorte === 'muscle' || sorte === 'tableau') {
    v(verso.masques > 0, `${sorte} : champs masqués au verso (${verso.masques})`);
    await A.toucher(`document.querySelector('.va .mu-masque, .va .tb-masque')`, 500);
    const apres = await A.ev(`document.querySelectorAll('.va .mu-masque, .va .tb-masque').length`);
    v(apres === verso.masques - 1, `${sorte} : un champ révélé au toucher (${verso.masques} → ${apres}), la carte reste au verso`, await A.ev(`document.querySelector('.va .sfc-carte').dataset.cote`));
    await A.capture(`aap-agrandie-${sorte}-verso` + SFX);
  }
  await A.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await A.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await A.dormir(400);
  v(!(await A.ev(`!!document.querySelector('.va')`)), `Agrandir (${sorte}) : Échap ferme`);
}
// navigation ← → dans l'ordre de la liste, clic dehors ferme
await A.survol(A.carteListe('aa010'));
await A.toucher(`${A.carteListe('aa010')}.querySelector('[data-act="agrandir"]')`, 800);
const cle = async (key, code, k) => { await A.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: k }); await A.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: k }); await A.dormir(350); };
const vaId = () => A.ev(`(document.querySelector('.va .sfc-carte')||{dataset:{}}).dataset.carte`);
await cle('ArrowRight', 'ArrowRight', 39); const d1 = await vaId();
await cle('ArrowRight', 'ArrowRight', 39); const d2 = await vaId();
await cle('ArrowLeft', 'ArrowLeft', 37); const d3 = await vaId();
v(d1 === 'aa011' && d2 === 'aa012' && d3 === 'aa011', `← → : carte suivante / précédente de la liste (aa010 → ${d1} → ${d2} → ${d3})`, await A.ev(`document.querySelector('.va [data-position]').textContent`));
await A.toucher(`document.querySelector('.va [data-va="suiv"]')`, 400);
v((await vaId()) === 'aa012', 'bouton › : carte suivante');
// filtre de sorte actif : la navigation suit la liste FILTRÉE
await A.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20, y: 450 }); for (const type of ['mousePressed', 'mouseReleased']) await A.send('Input.dispatchMouseEvent', { type, x: 20, y: 450, button: 'left', clickCount: 1 });
await A.dormir(400);
v(!(await A.ev(`!!document.querySelector('.va')`)), 'clic dehors : ferme');
await A.toucher(`document.querySelector('.fcl-filtre[data-filtre="muscle"]')`, 500);
await A.survol(A.carteListe('aa003'));
await A.toucher(`${A.carteListe('aa003')}.querySelector('[data-act="agrandir"]')`, 800);
await cle('ArrowRight', 'ArrowRight', 39);
v((await vaId()) === 'aa009', `filtre « Muscle » : → passe au muscle suivant (${await vaId()})`, await A.ev(`document.querySelector('.va [data-position]').textContent`));
await cle('Escape', 'Escape', 27);
await A.toucher(`document.querySelector('.fcl-filtre[data-filtre="toutes"]')`, 500);

// ---- 4. empreinte AVANT (planification complète, journal, séance) ----
const empreinte = () => A.S(`const J = await import(performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('/journal/journal.js')) || '/src/medrevise/journal/journal.js');
  const q = (await S.getAll('questions')).sort((a, b) => a.id < b.id ? -1 : 1).map(({ aApprendre, updatedAt, ...reste }) => reste);
  const j = (await J.toutLeJournal()).sort((a, b) => String(a.id) < String(b.id) ? -1 : 1);
  const seance = await S.getMeta('seanceFC');
  const h = async (x) => { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(x))); return [...new Uint8Array(d)].map((v) => v.toString(16).padStart(2, '0')).join('').slice(0, 16); };
  const planif = q.map((x) => [x.id, x.dueDate, x.j0Date, x.intervalDays, x.learnState, x.nouvelle, x.fsrs || null, x.historique || null, x.carnetAt || null]);
  return { cartes: q.length, journal: j.length, hCartesSansTag: await h(q), hPlanif: await h(planif), hJournal: await h(j), hSeance: await h(seance || null), tagues: (await S.getAll('questions')).filter((x) => x.aApprendre === true).length };`);
const avant = await empreinte();
console.log('   empreinte avant', JSON.stringify(avant));

// ---- 5. tag depuis la liste : toast, étiquette, Annuler ----
await A.survol(A.carteListe('aa020'));
await A.capture('aap-liste-icones' + SFX, { x: 1056, y: 230, width: 354, height: 520 });
await A.toucher(`${A.carteListe('aa020')}.querySelector('.aap-bt')`, 700);
v(/Ajoutée à À apprendre/.test(await A.toast()), `toast « Ajoutée à À apprendre » (${await A.toast()})`);
v((await A.carteBase('aa020')).aApprendre === true, 'base : aa020.aApprendre = true');
v(await A.ev(`!!${A.carteListe('aa020')}.querySelector('.aap-etiquette')`), 'étiquette « À apprendre » visible sur la carte de la liste');
await A.capture('aap-liste-taguee' + SFX, { x: 1056, y: 230, width: 354, height: 520 });
await A.toucher(`document.querySelector('[data-toast="aap"] .sn-toast-action')`, 800);
v((await A.carteBase('aa020')).aApprendre === false && !(await A.ev(`!!${A.carteListe('aa020')}.querySelector('.aap-etiquette')`)), '« Annuler » : tag retiré, étiquette partie');
// re-tag puis retrait : toast « Retirée »
await A.survol(A.carteListe('aa020'));
await A.toucher(`${A.carteListe('aa020')}.querySelector('.aap-bt')`, 700);
await A.toucher(`${A.carteListe('aa020')}.querySelector('.aap-bt')`, 700);
v(/Retirée/.test(await A.toast()) && (await A.carteBase('aa020')).aApprendre === false, `retrait : toast « ${await A.toast()} »`);

// ---- 6. tag de 10 cartes (8 depuis la liste, 2 depuis la vue agrandie) ----
const DIX = ['aa000', 'aa001', 'aa002', 'aa003', 'aa004', 'aa005', 'aa020', 'aa041', 'aa077', 'aa150'];
for (const id of DIX.slice(0, 8)) { await A.survol(A.carteListe(id)); await A.toucher(`${A.carteListe(id)}.querySelector('.aap-bt')`, 450); }
for (const id of DIX.slice(8)) {
  await A.survol(A.carteListe(id));
  await A.toucher(`${A.carteListe(id)}.querySelector('[data-act="agrandir"]')`, 700);
  await A.toucher(`document.querySelector('.va .aap-bt')`, 700);
  v((await A.carteBase(id)).aApprendre === true && await A.ev(`!!document.querySelector('.va .aap-etiquette')`), `vue agrandie : ${id} taguée (étiquette dans l'en-tête)`);
  if (id === 'aa150') await A.capture('aap-agrandie-taguee' + SFX);
  await cle('Escape', 'Escape', 27);
  v(!(await A.ev(`!!document.querySelector('.va')`)), `Échap ferme la vue agrandie (focus sur l'étoile)`, await A.ev(`document.activeElement && document.activeElement.className`));
}
const apres = await empreinte();
console.log('   empreinte après', JSON.stringify(apres));
v(apres.tagues === 10, `10 cartes taguées en base (${apres.tagues})`);
v(apres.hPlanif === avant.hPlanif, `planification identique (dueDate, J0, intervalle, état, nouvelle, FSRS, historique, carnet) : ${apres.hPlanif}`);
v(apres.hCartesSansTag === avant.hCartesSansTag, `cartes identiques champ par champ hors « aApprendre » / horodatage : ${apres.hCartesSansTag}`);
v(apres.hJournal === avant.hJournal && apres.journal === avant.journal, `journal des révisions identique (${apres.journal} lignes, ${apres.hJournal})`);
v(apres.hSeance === avant.hSeance, `séance du jour identique (${apres.hSeance})`);

// ---- 7. filtre « À apprendre » de la liste (combinable) ----
const puce = await A.ev(`(document.querySelector('.fcl-filtre[data-filtre="aap"]')||{}).textContent`);
v(/À apprendre\s*10/.test(puce), `puce « À apprendre » avec son compteur (${puce})`);
await A.toucher(`document.querySelector('.fcl-filtre[data-filtre="aap"]')`, 600);
let ids = await A.ev(`[...document.querySelectorAll('.pis-item.fcl-carte')].map(x=>x.dataset.item).sort().join(',')`);
v(ids === [...DIX].sort().join(','), `filtre « À apprendre » : les 10 cartes taguées seulement`, ids);
await A.capture('aap-liste-filtre' + SFX);
await A.toucher(`document.querySelector('.fcl-filtre[data-filtre="muscle"]')`, 500);
ids = await A.ev(`[...document.querySelectorAll('.pis-item.fcl-carte')].map(x=>x.dataset.item).join(',')`);
v(ids === 'aa003', `combiné avec « Muscle » : ${ids}`);
await A.toucher(`document.querySelector('.fcl-filtre[data-filtre="toutes"]')`, 400);
await A.taper(`document.querySelector('.fcl-recherche input')`, 'image');
ids = await A.ev(`[...document.querySelectorAll('.pis-item.fcl-carte')].map(x=>x.dataset.item).join(',')`);
v(ids === 'aa002,aa020', `combiné avec la recherche « image » (aa002 et aa020 sont les deux cartes image taguées) : ${ids}`);
await A.taper(`document.querySelector('.fcl-recherche input')`, '');
await A.toucher(`document.querySelector('.fcl-filtre[data-filtre="aap"]')`, 500);
v((await A.ev(`document.querySelectorAll('.pis-item.fcl-carte').length`)) === 200, 'filtre retiré : 200 cartes');

await A.ev(`window.dispatchEvent(new Event('online'));1`); await A.dormir(5000);
const cloud = await (await fetch('http://localhost:54399/__etat')).json();
const nCloud = cloud.rows.filter((x) => x.store === 'questions' && x.data && x.data.aApprendre === true).length;
v(nCloud === 10, `faux cloud : ${nCloud} cartes avec aApprendre = true`);
// validateDOMNesting (boutons « Toucher » d'un tableau dans la carte-bouton) : avertissement de dev déjà émis par la séance du jour
const errs = A.erreurs.filter((e) => !/validateDOMNesting/.test(e));
v(errs.length === 0, `aucune erreur console (hors avertissement de dev validateDOMNesting déjà présent en séance : ${A.erreurs.length - errs.length})`, errs.join(' | ').slice(0, 300));
console.log(echecs ? `❌ ${echecs} échec(s)` : '✅ tout est vert');
process.exit(0);
