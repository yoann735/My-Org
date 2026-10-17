// Bibliothèque : les tris par date gardent l'arbre (sections → matières → dossiers, ordre manuel,
// pliages, compteurs) et réordonnent seulement les fiches dans chaque dossier / matière ; date en
// gris sous chaque fiche ; retour à l'ordre manuel intact ; rangée « Chercher une fiche · Trier »
// (40 px) en tête du panneau ; recherche qui filtre l'arbre en place ; tri mémorisé, pas la recherche.
import { ouvrir } from './commun.mjs';

// signature de l'arbre affiché : chaque ligne (type, texte, compteur, ouvert ?) + le conteneur de chaque fiche
const SIGNATURE = `(()=>{const t=document.querySelector('.lib-tree');const conts=new Map();let n=0;
  return [...t.querySelectorAll('.lt-sec, .lt-mat, .lt-dos, .lt-fiche')].map(e=>{
    const type=e.classList.contains('lt-sec')?'S':e.classList.contains('lt-mat')?'M':e.classList.contains('lt-dos')?'D':'F';
    const ln=e.querySelector('.lt-nom');const nom=ln?(ln.firstChild&&ln.firstChild.nodeType===3?ln.firstChild.textContent:ln.textContent):'';
    const cpt=((type==='F'?e.querySelector(':scope > .lt-rangee > .lt-compte'):e.querySelector(':scope > .lt-compte, .lt-compte'))||{}).textContent||'';
    const pli=(e.querySelector('.lt-pli')||{}).outerHTML||'';
    let cont='';if(type==='F'){const c=e.closest('.lt-enfants');if(!conts.has(c))conts.set(c,'b'+(n++));cont=conts.get(c);}
    return {type,nom,cpt,ouvert:/chevD|M6 9/.test(pli),cont,date:((e.querySelector('.lt-date')||{}).textContent)||''};})})()`;
const structure = (sig) => sig.filter((x) => x.type !== 'F').map((x) => `${x.type}:${x.nom}:${x.cpt}:${x.ouvert}`).join('\n');
const parSeau = (sig) => { const m = {}; sig.filter((x) => x.type === 'F').forEach((x) => (m[x.cont] = m[x.cont] || []).push(x)); return m; };
// « à l’instant » < « il y a 5 min » < « il y a 2 h » < « hier » < « il y a 3 j » < « 12 oct. » (plus ancien = plus grand)
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const age = (t) => {
  if (/l’instant/.test(t)) return 0;
  let m = /il y a (\d+) min/.exec(t); if (m) return +m[1];
  m = /il y a (\d+) h/.exec(t); if (m) return +m[1] * 60;
  if (t === 'hier') return 1440;
  m = /il y a (\d+) j/.exec(t); if (m) return +m[1] * 1440;
  m = /^(\d+) (\S+)(?: (\d{4}))?$/.exec(t); if (m) { const d = new Date(+(m[3] || 2026), MOIS.indexOf(m[2]), +m[1]); return (Date.now() - d) / 60000; }
  return NaN;
};

async function choisirTri(b, label, tactile) {
  const p = await b.pos(`document.querySelector('.lib-barre-tri')`, false);
  if (tactile) await b.tape(p); else await b.clic(p, { att: 400 });
  const q = await b.pos(`[...document.querySelectorAll('.lib-tri-choix')].find(x=>x.textContent.trim()===${JSON.stringify(label)})`, false);
  if (tactile) await b.tape(q); else await b.clic(q, { att: 700 });
}

// ---------------- ordinateur ----------------
let b = await ouvrir({ ecran: 'aucun' });
await b.ev(`localStorage.setItem('medrevise.biblio.tri','manuel');1`);
await b.recharger(); await b.allerA('Bibliothèque'); await b.dormir(1200);
const ordreBase = () => b.S(`const st=await S.getStats();const f=(await S.getAll('fiches')).map(x=>[x.id,x.ordre,x.dossierId||'',x.matiereId]).sort();const d=(await S.getAll('dossiers')).map(x=>[x.id,x.ordre,x.parentId||'']).sort();const m=(await S.getAll('matieres')).map(x=>[x.id,x.ordre??'',x.sourceId]).sort();return JSON.stringify({f,d,m,sec:st&&st.ordreSections||null})`);
const base0 = await ordreBase();
const sigManuel = await b.ev(SIGNATURE);
b.ok(sigManuel.filter((x) => x.type === 'F').length > 10 && sigManuel.every((x) => !x.date), `ordre manuel : ${sigManuel.filter((x) => x.type === 'F').length} fiches, aucune date affichée`);
// la rangée
const r = await b.ev(`(()=>{const bar=document.querySelector('.lib-master-body > .lib-barre');const sec=document.querySelector('.lt-sec');const s=document.querySelector('.lib-barre-recherche').getBoundingClientRect();const t=document.querySelector('.lib-barre-tri').getBoundingClientRect();const br=bar.getBoundingClientRect();return {h:br.height,auDessus:br.bottom<=sec.getBoundingClientRect().top,uneRangee:Math.abs(s.top+s.height/2-(t.top+t.height/2))<1,rechercheAGauche:s.left<t.left,triADroite:Math.abs(t.right-br.right)<4,ph:document.querySelector('.lib-barre input').placeholder,doublons:document.querySelectorAll('.lib-barre').length+document.querySelectorAll('.topbar .lib-recherche, .topbar .lib-tri-bouton, .topbar input[type=search]').length}})()`);
b.ok(r.h === 40 && r.auDessus && r.uneRangee && r.rechercheAGauche && r.triADroite && r.ph === 'Chercher une fiche', 'rangée de 40 px au-dessus de la 1re section : recherche à gauche, Trier à droite', JSON.stringify(r));
b.ok(r.doublons === 1, 'un seul emplacement recherche / tri (rien dans l’en-tête de page)', String(r.doublons));
await b.png('bt-rangee-ordi', '.lib-master-body > .lib-barre', 6);
// la recherche s'étend au focus
const l0 = await b.ev(`document.querySelector('.lib-barre-recherche').getBoundingClientRect().width`);
await b.clic(await b.pos(`document.querySelector('.lib-barre input')`, false), { att: 400 });
const l1 = await b.ev(`document.querySelector('.lib-barre-recherche').getBoundingClientRect().width`);
b.ok(l1 > l0 + 40, `la recherche s’étend au focus (${Math.round(l0)} → ${Math.round(l1)} px)`);
await b.ev(`document.activeElement.blur();1`);
// survol de Trier : libellé du tri actif
await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...(await b.ev(`(()=>{const r=document.querySelector('.lib-barre-tri').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)) }); await b.dormir(300);
const survol = await b.ev(`(()=>{const l=document.querySelector('.lib-barre-tri-lbl');return [l.textContent,getComputedStyle(l).opacity]})()`);
b.ok(survol[0] === 'Ordre manuel' && survol[1] === '1', 'survol de Trier : « Ordre manuel » rappelé sous l’icône');
await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 600 });

// ---- Dernière modification
await choisirTri(b, 'Dernière modification');
const menuOk = true;
const sigModif = await b.ev(SIGNATURE);
b.ok(structure(sigModif) === structure(sigManuel), 'Dernière modification : sections, matières, dossiers, pliages et compteurs identiques');
const seauxM = parSeau(sigManuel); const seauxModif = parSeau(sigModif);
const memesFiches = Object.keys(seauxM).every((k) => JSON.stringify(seauxM[k].map((x) => x.nom).sort()) === JSON.stringify((seauxModif[k] || []).map((x) => x.nom).sort()));
const decroissant = Object.values(seauxModif).every((l) => l.every((x, i) => i === 0 || age(l[i - 1].date) <= age(x.date)));
const toutesDatees = sigModif.filter((x) => x.type === 'F').every((x) => x.date && !Number.isNaN(age(x.date)));
const change = Object.keys(seauxM).some((k) => seauxM[k].map((x) => x.nom).join() !== (seauxModif[k] || []).map((x) => x.nom).join());
b.ok(memesFiches && decroissant && toutesDatees, 'fiches réordonnées DANS chaque dossier / matière, la plus récemment modifiée en premier, date sous chaque fiche', [...new Set(sigModif.filter((x) => x.type === 'F').map((x) => x.date))].slice(0, 6).join(' · '));
if (!decroissant) console.log(JSON.stringify(Object.values(seauxModif).map((l) => l.map((x) => x.nom + ' [' + x.date + ']'))));
b.ok(change, 'l’ordre a réellement changé dans au moins un dossier');
await b.png('bt-arbre-modif', '.lib-master-body');
// survol : rappel du tri actif
await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...(await b.ev(`(()=>{const r=document.querySelector('.lib-barre-tri').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)) }); await b.dormir(300);
b.ok(await b.ev(`document.querySelector('.lib-barre-tri-lbl').textContent`) === 'Dernière modification' && await b.ev(`document.querySelector('.lib-barre-tri').classList.contains('actif')`), 'Trier : tri actif rappelé (« Dernière modification »), icône en accent');
await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 600 });
// menu à 3 choix avec coche
await b.clic(await b.pos(`document.querySelector('.lib-barre-tri')`, false), { att: 400 });
const choix = await b.ev(`[...document.querySelectorAll('.lib-tri-choix')].map(x=>(x.querySelector('.lib-tri-coche svg')?'✓ ':'')+x.textContent.trim())`);
b.ok(choix.join(' | ') === 'Ordre manuel | ✓ Dernière modification | Date d’ajout', 'menu Trier : 3 choix, coche sur le tri actif', choix.join(' | '));
await b.T.Escape(); await b.dormir(300);
// glisser suspendu
b.ok(await b.ev(`[...document.querySelectorAll('.lt-fiche')].every(e=>e.style.cursor==='default')`), 'tri par date : glisser des fiches suspendu (l’ordre manuel ne peut pas bouger)');

// ---- Date d'ajout
await choisirTri(b, 'Date d’ajout');
const sigAjout = await b.ev(SIGNATURE);
b.ok(structure(sigAjout) === structure(sigManuel), 'Date d’ajout : arbre identique');
const attendu = await b.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const D=await import(u.find(n=>n.includes('/lib/datesFiches.js')));const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js')));const f=await S.getAll('fiches');const m={};f.forEach(x=>m[x.titre]=[D.dateAjout(x),x.ordre??0]);return m})()`);
const ordreAjoutOk = Object.values(parSeau(sigAjout)).every((l) => l.every((x, i) => i === 0 || (attendu[l[i - 1].nom][0] > attendu[x.nom][0]) || (attendu[l[i - 1].nom][0] === attendu[x.nom][0] && attendu[l[i - 1].nom][1] <= attendu[x.nom][1])));
b.ok(ordreAjoutOk && sigAjout.filter((x) => x.type === 'F').every((x) => /^\d{1,2} \S+\.?( \d{4})?$/.test(x.date)), 'fiches par date d’ajout décroissante dans chaque dossier, « 12 oct. » sous chaque fiche', [...new Set(sigAjout.filter((x) => x.type === 'F').map((x) => x.date))].slice(0, 5).join(' · '));
await b.png('bt-arbre-ajout', '.lib-master-body');

// ---- mémorisé par appareil, la recherche non
await b.ev(`(()=>{const i=document.querySelector('.lib-barre input');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'repères');i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`); await b.dormir(400);
await b.recharger(); await b.allerA('Bibliothèque'); await b.dormir(1200);
b.ok(await b.ev(`localStorage.getItem('medrevise.biblio.tri')`) === 'ajout' && (await b.ev(SIGNATURE)).some((x) => x.date), 'tri mémorisé après rechargement');
b.ok(await b.ev(`document.querySelector('.lib-barre input').value`) === '', 'recherche non mémorisée');

// ---- retour à l'ordre manuel : intact
await choisirTri(b, 'Ordre manuel');
const sigRetour = await b.ev(SIGNATURE);
b.ok(JSON.stringify(sigRetour) === JSON.stringify(sigManuel), 'retour à l’ordre manuel : arbre et ordre des fiches identiques à l’origine');
b.ok(await ordreBase() === base0, 'aucune écriture : ordres des fiches, dossiers, matières et sections inchangés');

// ---- recherche : filtre l'arbre en place, parents visibles, Échap efface
await b.clic(await b.pos(`document.querySelector('.lib-barre input')`, false), { att: 200 });
await b.ecrire('reperes');
await b.dormir(400);
const sigQ = await b.ev(SIGNATURE);
const fichesQ = sigQ.filter((x) => x.type === 'F').map((x) => x.nom);
b.ok(fichesQ.length === 2 && fichesQ.every((n) => /repères/.test(n)) && sigQ.some((x) => x.type === 'S') && sigQ.some((x) => x.type === 'M' && x.nom === 'Anatomie palpatoire'), 'recherche « reperes » (sans accent) : 2 fiches, section et matière parentes visibles, dans l’arbre', fichesQ.join(', '));
await b.png('bt-recherche', '.lib-master-body');
await b.T.Escape(); await b.dormir(300);
b.ok(await b.ev(`document.querySelector('.lib-barre input').value`) === '' && JSON.stringify(await b.ev(SIGNATURE)) === JSON.stringify(sigManuel), 'Échap efface la recherche : arbre complet revenu');

// ---- Grille : mêmes sections / matières, cartes réordonnées dans chaque matière
await choisirTri(b, 'Dernière modification');
await b.clic(await b.pos(`[...document.querySelectorAll('.lib-modes .seg-btn')].find(x=>x.textContent.includes('Grille'))`, false), { att: 900 });
const g = await b.ev(`({barre:!!document.querySelector('.lib-vue-pleine > .lib-barre'),sections:document.querySelectorAll('.lv-section').length,matieres:document.querySelectorAll('.lv-matiere').length})`);
b.ok(g.barre && g.sections >= 2 && g.matieres >= 3, 'Grille triée : rangée en tête, sections et matières conservées (plus de grille plate)', JSON.stringify(g));
await b.clic(await b.pos(`[...document.querySelectorAll('.lib-modes .seg-btn')].find(x=>x.textContent.includes('Arbre'))`, false), { att: 900 });
await choisirTri(b, 'Ordre manuel');
b.ok(b.erreurs.length === 0, '0 erreur console (ordinateur)', b.erreurs.join(' | '));
b.c.fermer();

// ---------------- tablette (820 × 1180, tactile) et fenêtre étroite (761 px) ----------------
for (const [W, H, nom] of [[820, 1180, 'tablette'], [761, 900, 'etroit'], [1180, 820, 'tablette-paysage']]) {
  b = await ouvrir({ ecran: 'aucun', W, H, tactile: W < 1200 });
  await b.ev(`localStorage.setItem('medrevise.biblio.tri','modif');1`);
  await b.recharger(); await b.allerA('Bibliothèque'); await b.dormir(1200);
  if (await b.ev(`!!document.querySelector('.lib-master.collapsed')`)) { await b.tape(await b.pos(`document.querySelector('.lib-master .split-handle, .lib-master [class*=handle], .lib-master button')`, false)); await b.dormir(700); }
  const rr = await b.ev(`(()=>{const bar=document.querySelector('.lib-master-body > .lib-barre');if(!bar)return null;const s=document.querySelector('.lib-barre-recherche').getBoundingClientRect();const t=document.querySelector('.lib-barre-tri').getBoundingClientRect();const br=bar.getBoundingClientRect();const sec=document.querySelector('.lt-sec').getBoundingClientRect();return {h:br.height,pleine:s.width>=br.width-t.width-14,triADroite:Math.abs(t.right-br.right)<4,uneRangee:Math.abs(s.top-t.top)<4,auDessus:br.bottom<=sec.top,sw:document.scrollingElement.scrollWidth,iw:innerWidth}})()`);
  b.ok(rr && rr.h === 40 && rr.pleine && rr.triADroite && rr.uneRangee && rr.auDessus && rr.sw <= rr.iw, `${nom} (${W} px) : rangée de 40 px, recherche pleine largeur, Trier à droite, rien ne déborde`, JSON.stringify(rr));
  b.ok((await b.ev(SIGNATURE)).filter((x) => x.type === 'F').every((x) => x.date), `${nom} : arbre trié avec les dates`);
  if (nom !== 'tablette-paysage') await b.capture(`bt-${nom}`);
  await choisirTri(b, 'Ordre manuel', true);
  b.ok(!(await b.ev(SIGNATURE)).some((x) => x.date), `${nom} : retour à l’ordre manuel au doigt`);
  b.ok(b.erreurs.length === 0, `0 erreur console (${nom})`, b.erreurs.join(' | '));
  b.c.fermer();
}
