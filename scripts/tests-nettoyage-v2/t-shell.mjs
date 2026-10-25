// §5 Réglages → « Afficher l'onglet Réviser sur ordinateur » ; §6 mode focus supprimé ; §7 matières glissées dans la Bibliothèque.
// FX=… node t-shell.mjs [ordinateur|tablette|telephone]
import { banc } from '../tests-boites-tableaux/commun.mjs';
const app = process.argv[2] || 'ordinateur';
const b = await banc();
let echecs = 0; const v = (c, m, d = '') => { console.log((c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : '')); if (!c) echecs++; };
const [W, H] = app === 'telephone' ? [390, 844] : app === 'tablette' ? [1024, 1366] : [1440, 900];
const ecran = async () => {
  await b.c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: app !== 'ordinateur' });
  await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: app !== 'ordinateur', maxTouchPoints: 5 });
};
const recharger = async () => {
  await b.c.send('Page.reload', { ignoreCache: true }); await b.dormir(3000); await ecran(); await b.dormir(800);
  for (let i = 0; i < 20; i++) { const ou = await b.ev(`document.querySelector('[data-app="medrevise"], .mrm-app, .mrm') ? 'app' : document.querySelector('.hub-card') ? 'hub' : ''`); if (ou === 'app') break; if (ou === 'hub') await b.ev(`[...document.querySelectorAll('.hub-card')].find(x=>/MedRevise/i.test(x.innerText))?.click();1`); await b.dormir(500); }
  await b.dormir(1200);
};
const onglets = () => b.ev(`[...document.querySelectorAll('.sidebar .sb-nav .sb-item')].filter(e=>e.offsetParent).map(e=>e.title||e.innerText.trim())`);
await ecran();
await b.ev(`localStorage.removeItem('medrevise.onglet.reviser.ordinateur'); localStorage.setItem('medrevise.focus.notes','true'); 1`); // (§6) un ancien « focus » mémorisé n'a plus d'effet
await recharger();
if (app === 'telephone') {
  await b.ev(`localStorage.setItem('medrevise.onglet.reviser.ordinateur','false');1`); await recharger(); // réglage OFF : le téléphone n'en tient pas compte
  const t = await b.ev(`document.body.innerText`);
  v(/Commencer la série|Séance|Réviser/.test(t), 'téléphone, réglage OFF : le shell mobile garde la révision');
  v(!(await b.ev(`!!document.querySelector('.sb-focus')`)) && !/Mode focus/.test(t), 'téléphone : aucune trace du mode focus');
  await b.capture(`nettoyage-telephone-accueil`);
  await b.ev(`localStorage.removeItem('medrevise.onglet.reviser.ordinateur');1`);
} else {
  // §6
  const o0 = await onglets();
  v(!(await b.ev(`!!document.querySelector('.sb-focus')`)) && !(await b.ev(`/Mode focus/.test(document.body.innerText)`)), 'plus de bouton « Mode focus » dans la barre latérale');
  v(o0.includes('Réviser') && o0.includes('Bibliothèque') && o0.length >= 5, 'un ancien réglage « focus » ne restreint plus rien : tous les onglets sont là', o0.join(' · '));
  // §5
  await b.ev(`[...document.querySelectorAll('.sb-item')].find(e=>(e.title||'')==='Réglages').click();1`); await b.dormir(1200);
  const sw = `document.querySelector('[data-reglage="onglet-reviser"] .switch')`;
  v(await b.ev(`${sw}.getAttribute('aria-checked')==='true'`), 'Réglages → Apparence : « Afficher l’onglet Réviser sur ordinateur » ON par défaut');
  await b.ev(`${sw}.scrollIntoView({block:'center'});1`); await b.dormir(400);
  await b.capRect(`nettoyage-${app}-reglage`, `document.querySelector('[data-reglage="onglet-reviser"]').closest('.card')`, 6);
  await b.clic(await b.pos(sw, false), { att: 600 });
  v(await b.ev(`${sw}.getAttribute('aria-checked')==='false'`), 'interrupteur passé sur OFF');
  const o1 = await onglets();
  if (app === 'ordinateur') v(!o1.includes('Réviser') && o1.includes('Bibliothèque'), 'OFF : l’onglet Réviser disparaît de la barre latérale (ordinateur)', o1.join(' · '));
  else v(o1.includes('Réviser'), 'OFF : sur tablette (écran tactile), l’onglet Réviser reste', o1.join(' · '));
  await recharger();
  const o2 = await onglets();
  v(app === 'ordinateur' ? !o2.includes('Réviser') : o2.includes('Réviser'), 'après rechargement : le réglage tient', o2.join(' · '));
  if (app === 'ordinateur') await b.capRect(`nettoyage-ordinateur-barre-sans-reviser`, `document.querySelector('.sidebar')`, 0);
  await b.ev(`[...document.querySelectorAll('.sb-item')].find(e=>(e.title||'')==='Réglages').click();1`); await b.dormir(1000);
  await b.ev(`${sw}.scrollIntoView({block:'center'});1`); await b.dormir(300);
  await b.clic(await b.pos(sw, false), { att: 600 });
  v((await onglets()).includes('Réviser'), 'ON : l’onglet Réviser revient');
  // §7 matières glissées
  await b.S(`await S.put('sources',{id:'src-v3',nom:'Source v3',couleur:'#7c5cff'});await S.put('sources',{id:'src-dnd',nom:'Section B',couleur:'#2e9'});
    for(const m of await S.getAll('matieres')) if(m.id.startsWith('mat-d')) await S.remove('matieres',m.id);
    for(const [id,nom,src] of [['mat-dA','Anatomie (test)','src-v3'],['mat-dB','Biochimie (test)','src-v3'],['mat-dC','Chimie (test)','src-v3'],['mat-dZ','Zoologie (test)','src-dnd']]) await S.put('matieres',{id,nom,sourceId:src,icon:'book'});
    await S.put('fiches',{id:'f-dnd-1',matiereId:'mat-dA',dossierId:null,titre:'Cours glissé (A)',type:'standard',ordre:0});return 1`);
  await b.ev(`localStorage.setItem('medrevise.bibliotheque.affichage', JSON.stringify('arbre'));1`);
  await recharger();
  await b.ev(`[...document.querySelectorAll('.sb-item')].find(e=>/Biblioth/.test(e.title||e.innerText)).click();1`); await b.dormir(1500);
  const ordre = (srcNom) => b.ev(`(()=>{const s=[...document.querySelectorAll('.lt-section')].find(x=>x.querySelector('.lt-sec .lt-nom')&&x.querySelector('.lt-sec .lt-nom').textContent.startsWith(${JSON.stringify(srcNom)}));return s?[...s.querySelectorAll('.lt-mat .lt-nom')].map(e=>e.textContent).filter(t=>/(test)/.test(t)):null})()`);
  console.log('avant :', JSON.stringify(await ordre('Source v3')), JSON.stringify(await ordre('Section B')));
  const ligne = (nom) => `[...document.querySelectorAll('.lt-mat')].find(e=>e.querySelector('.lt-nom')&&e.querySelector('.lt-nom').textContent===${JSON.stringify(nom)})`;
  const tactile = app !== 'ordinateur';
  const glisser = async (de, versJs, fin = 'haut') => {
    await b.ev(`${de}.scrollIntoView({block:'center'});1`); await b.dormir(400);
    const p = await b.pos(de, false);
    if (tactile) {
      await b.c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p[0], y: p[1], id: 1 }] }); await b.dormir(320); // maintenir
      for (let k = 1; k <= 4; k++) { await b.c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p[0], y: p[1] + k * 6, id: 1 }] }); await b.dormir(60); }
    } else {
      await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1] }); await b.c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p[0], y: p[1], button: 'left', clickCount: 1 });
      for (let k = 1; k <= 4; k++) { await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1] + k * 4, buttons: 1 }); await b.dormir(50); }
    }
    await b.dormir(300);
    const r = await b.rect(versJs);
    const q = [r.cx, fin === 'haut' ? r.y + 2 : r.cy];
    for (let k = 1; k <= 12; k++) {
      const x = p[0] + (q[0] - p[0]) * k / 12, y = p[1] + 24 + (q[1] - p[1] - 24) * k / 12;
      if (tactile) await b.c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
      else await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 1 });
      await b.dormir(40);
    }
    await b.dormir(350);
    const indic = await b.ev(`!!document.querySelector('.dnd-slot.over, .dnd-zone.over')`);
    if (!tactile) await b.capture(`nettoyage-${app}-glisser-matiere`);
    if (tactile) await b.c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await b.c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: q[0], y: q[1], button: 'left', clickCount: 1 });
    await b.dormir(1200);
    return indic;
  };
  // C avant A (même section) : viser le haut de la ligne de A (son créneau, ouvert pendant le glisser)
  const ind1 = await glisser(ligne('Chimie (test)'), ligne('Anatomie (test)'));
  const o3 = await ordre('Source v3');
  v(ind1 && o3 && o3.indexOf('Chimie (test)') < o3.indexOf('Anatomie (test)'), 'matière glissée avant une autre (même section) : réordonnée, avec l’indicateur de dépôt pendant le glisser', JSON.stringify(o3));
  // B vers l'autre section (en fin de section)
  const finB = `(()=>{const s=[...document.querySelectorAll('.lt-section')].find(x=>x.querySelector('.lt-sec .lt-nom')&&x.querySelector('.lt-sec .lt-nom').textContent.startsWith('Section B'));return s&&s.querySelector('.lt-ajout')})()`;
  await glisser(ligne('Biochimie (test)'), finB);
  const oB = await ordre('Section B'), oV = await ordre('Source v3');
  const enBase = await b.S(`return (await S.getAll('matieres')).filter(m=>m.id.startsWith('mat-d')).map(m=>m.id+':'+m.sourceId+':'+m.ordre).sort().join(' ')`);
  v(oB && oB.includes('Biochimie (test)') && !oV.includes('Biochimie (test)'), 'matière glissée dans une autre section : elle y passe (sourceId changé)', JSON.stringify({ oB, oV, enBase }));
  const fiche = await b.S(`return (await S.getOne('fiches','f-dnd-1')).matiereId`);
  v(fiche === 'mat-dA', 'les cours suivent leur matière (rien d’autre ne bouge)');
}
v(!(b.erreurs && b.erreurs.length), 'console sans erreur', (b.erreurs || []).slice(0, 3).join(' | '));
console.log(echecs ? `❌ ${echecs} échec(s)` : '✅ tout est vert');
process.exit(0);
