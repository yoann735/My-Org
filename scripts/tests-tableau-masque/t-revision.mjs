// Révision d'une carte Tableau à masque choisi (31/10) — ordinateur C. Après t-editeur.mjs (la carte 4 × 5 existe dans le
// Cours 1). Vue agrandie (une case, une ligne, un nom, Tout révéler), séance du jour (SeanceFC), mode Apprentissage
// (session), import (format attendu + import réel), export (JSON de l'export puis ré-import ; sauvegarde JSONL),
// ancienne carte Tableau : rendu IDENTIQUE à celui de l'ancien code (698d539, avant ce chantier, rendu côte à côte), cartes témoins inchangées.
import { banc, COURS, TITRE, LIGNES, MASQUE, NB_CACHEES } from './commun.mjs';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
// l'ancien composant (698d539, avant ce chantier) est écrit DÈS LE DÉBUT : Vite a le temps de l'intégrer avant la comparaison (sinon le
// rechargement à chaud du fichier tout neuf remet son état à zéro au milieu des clics) ; retiré à la sortie quoi qu'il arrive
const RACINE = '../../src/medrevise/components/', ANCIEN = RACINE + '__ancienFlashcardTableau.jsx';
fs.writeFileSync(ANCIEN, execSync('git show 698d539:src/medrevise/components/FlashcardTableau.jsx', { encoding: 'utf8' }));
process.on('exit', () => { try { fs.unlinkSync(ANCIEN); } catch (e) { /* déjà retiré */ } });
const b = await banc(false);
const v = b.v;
const t0 = b.toucher;
b.toucher = async (js, att) => { await b.ev(`(() => { const e = ${js}; e && e.scrollIntoView && e.scrollIntoView({ block: 'center', inline: 'center' }); return 1; })()`); await b.dormir(100); return t0(js, att); };
const h0 = await b.temoins();
const id = await b.S(`return ((await S.getAll('questions')).find(q=>q.recto===${JSON.stringify(TITRE)})||{}).id`);
v(!!id, 'la carte 4 × 5 (t-editeur.mjs) est en base', id);
const plein = MASQUE.cellules.flatMap((l, r) => l.map((x, c) => (x ? `${r}:${c}` : null))).filter(Boolean);

// ---- vue agrandie ----
v(await b.ouvrirCours(COURS[0], { recharger: true }), 'cours ouvert'); await b.ongletFlashcards();
const liste = await b.rev(b.carteListe(id));
v(liste && liste.cachees.length === 0 && liste.noms.length === 0, 'liste du panneau : tableau entier lisible (rien de masqué hors révision)');
await b.survol(b.carteListe(id));
await b.toucher(`${b.carteListe(id)}.querySelector('[data-act="agrandir"]')`, 800);
await b.toucher(`document.querySelector('.va .sfc-carte')`, 700);
const VA = `document.querySelector('.va')`;
let s = await b.rev(VA);
v(s && JSON.stringify(s.cachees) === JSON.stringify(plein) && JSON.stringify(s.noms) === '["1"]', `vue agrandie : seules les ${NB_CACHEES} cases masquées sont cachées, et le nom « Origine »`, JSON.stringify(s && { c: s.cachees, n: s.noms }));
v(s.visibles.length === 20 - NB_CACHEES && s.visibles.includes('3:2=' + LIGNES[3][2]) && s.visibles.includes('0:0=Grand glutéal') && s.entetes[0] === 'Muscle' && /Colonne 2/.test(s.entetes[1]),
  'cases visibles affichées directement (dont la case 3:2 de la colonne masquée), noms visibles, nom masqué → « Colonne 2 »', s.visibles.slice(0, 3).join(' · '));
v(s.lignesBtn === 4 && new RegExp('Tout révéler\\s*\\(' + (NB_CACHEES + 1) + '\\)').test(s.tout), `« Ligne » sur les 4 lignes qui ont une case masquée, « Tout révéler (${NB_CACHEES + 1}) »`, `${s.lignesBtn} · ${s.tout}`);
await b.capture('tm-agrandie-masques');
await b.toucher(`${VA}.querySelector('td.cachee[data-cellule="0:2"] .tb-masque')`, 400);
s = await b.rev(VA);
v(s.cachees.length === NB_CACHEES - 1 && s.visibles.includes('0:2=' + LIGNES[0][2]) && (await b.ev(`${VA}.querySelector('.sfc-carte').dataset.cote`)) === 'verso', 'un toucher révèle UNE case ; la carte reste au verso');
await b.toucher(`${VA}.querySelector('tr[data-ligne="1"] .tb-ligne-btn')`, 400);
s = await b.rev(VA);
v(s.cachees.length === NB_CACHEES - 6 && !s.cachees.some((k) => k.startsWith('1:')), '« Ligne » : révèle les 5 cases de la ligne 2', s.cachees.join(' '));
await b.toucher(`${VA}.querySelector('th.cachee .tb-masque-nom')`, 400);
s = await b.rev(VA);
v(s.noms.length === 0 && s.entetes[1] === 'Origine', 'le nom de colonne masqué se révèle au toucher');
await b.capture('tm-agrandie-partiel');
await b.toucher(`${VA}.querySelector('.tb-tout-btn')`, 400);
s = await b.rev(VA);
v(s.cachees.length === 0 && !s.tout && s.lignesBtn === 0, '« Tout révéler » : tout est visible');
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await b.dormir(300);

// ---- ancienne carte Tableau : comportement d'avant (toutes les cases cachées, noms visibles) ----
v(await b.ouvrirCours('Cours témoin', { recharger: true }), 'cours témoin ouvert'); await b.ongletFlashcards();
await b.survol(b.carteListe('temoin-tableau'));
await b.toucher(`${b.carteListe('temoin-tableau')}.querySelector('[data-act="agrandir"]')`, 800);
await b.toucher(`document.querySelector('.va .sfc-carte')`, 700);
s = await b.rev(VA);
v(s && s.cachees.length === 4 && s.noms.length === 0 && s.entetes.join('|') === 'Segment|Rôle' && s.lignesBtn === 2 && /\(4\)/.test(s.tout), 'ancienne carte Tableau : toutes les cases cachées, noms visibles, « Ligne » × 2, « Tout révéler (4) »', JSON.stringify(s));
await b.capture('tm-ancienne');
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await b.dormir(300);
// rendu de l'ancien code (HEAD) et du nouveau, côte à côte, sur la carte d'avant : HTML identique, avant et après révélations
try {
  const cmp = await b.ev(`(async () => {
    const R = await import('/node_modules/.vite/deps/react.js'); const D = await import('/node_modules/.vite/deps/react-dom_client.js');
    const A = await import('/src/medrevise/components/__ancienFlashcardTableau.jsx'); const N = await import('/src/medrevise/components/FlashcardTableau.jsx');
    const item = (await (await import('/src/medrevise/lib/storage.js')).getOne('questions', 'temoin-tableau'));
    const monter = (M, compact, masquable) => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:-5000px;top:0;width:600px'; document.body.appendChild(d);
      const cr = D.createRoot || D.default.createRoot; const ce = R.createElement || R.default.createElement;
      cr(d).render(ce(M.TableauRevision, { item, masquable, compact })); return d; };
    const res = [];
    const h = (d) => d.innerHTML.replace(/ data-nom="\\d+"/g, ''); // (seul ajout : le repère de test data-nom des noms de colonnes)
    for (const [compact, masquable] of [[false, true], [true, false], [false, false]]) {
      const a = monter(A, compact, masquable), n = monter(N, compact, masquable);
      await new Promise((ok) => setTimeout(ok, 300));
      res.push(h(a) === h(n));
      if (masquable) { // même suite de révélations : une case, une ligne, tout
        for (const sel of ['td.cachee .tb-masque', '.tb-ligne-btn', '.tb-tout-btn']) { a.querySelector(sel)?.click(); n.querySelector(sel)?.click(); await new Promise((ok) => setTimeout(ok, 400)); res.push(h(a) === h(n)); }
      }
      a.remove(); n.remove();
    }
    return res;
  })()`);
  v(Array.isArray(cmp) && cmp.length === 6 && cmp.every(Boolean), 'ancienne carte : HTML du nouveau rendu = HTML de l’ancien code (révision, après case / ligne / tout, compact, aperçu)', JSON.stringify(cmp));
} finally { fs.unlinkSync(ANCIEN); await b.dormir(800); b.erreurs.splice(0, b.erreurs.length, ...b.erreurs.filter((e) => !/__ancienFlashcardTableau/.test(e))); }

// ---- séance du jour (SeanceFC) : la carte en Nouvelle aujourd'hui (seule la carte de test est touchée) ----
await b.S(`const q=await S.getOne('questions',${JSON.stringify(id)});const t=(await import('/src/medrevise/lib/sm2.js')).todayISO();await S.put('questions',{...q,nouvelle:true,dueDate:t,j0Date:t});await S.setMeta('seanceFC',null);return 1`);
await b.lanceur();
await b.parCours(false);
await b.cocher('revisions', false); await b.cocher('retard', false); await b.cocher('nouvelles', true); await b.maximum('nouvelles', 'tout');
await b.dormir(300);
await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1500);
const se = await b.seance();
const k = se.cartes.indexOf(id);
v(k >= 0, `séance du jour : la carte Tableau est dedans (${k + 1} / ${se.cartes.length})`);
for (let i = 0; i < k; i++) { await b.toucher(`document.querySelector('.sfc-carte')`, 450); await b.toucher(`document.querySelector('[data-nouvelle="garder"]')`, 800); }
v(await b.ev(`document.querySelector('.sfc-carte').dataset.carte`) === id, 'carte Tableau affichée');
await b.toucher(`document.querySelector('.sfc-carte')`, 700);
const SFC = `document.querySelector('.sfc')`;
s = await b.rev(SFC);
v(s && s.cachees.length === NB_CACHEES && s.noms.length === 1 && s.visibles.length === 20 - NB_CACHEES, `séance : ${NB_CACHEES} cases cachées + 1 nom, 9 cases visibles d’emblée`, JSON.stringify(s && { c: s.cachees.length, n: s.noms, v: s.visibles.length }));
await b.capture('tm-seance');
await b.toucher(`${SFC}.querySelector('td.cachee .tb-masque')`, 400);
await b.toucher(`${SFC}.querySelector('.tb-ligne-btn')`, 400);
s = await b.rev(SFC);
v(s.cachees.length < NB_CACHEES - 1 && (await b.ev(`!!document.querySelector('.sfc-carte')`)), 'séance : case puis ligne révélées, la carte reste au verso', s.cachees.length);
await b.toucher(`${SFC}.querySelector('.tb-tout-btn')`, 400);
v((await b.rev(SFC)).cachees.length === 0, 'séance : « Tout révéler »');
await b.ev(`(()=>{const x=document.querySelector('.sfc-quitter');x&&x.click();return 1})()`); await b.dormir(800);

// ---- mode Apprentissage : session ----
await b.ev(`localStorage.removeItem('medrevise.apprentissage.filtres');1`);
await b.apprentissage();
await b.taper(`document.querySelector('.alib2-recherche input')`, 'masque choisi');
await b.toucher(`document.querySelector('.alib-lancer')`, 900);
await b.toucher(`document.querySelector('.alib-session .sfc-carte')`, 700);
const AS = `document.querySelector('.alib-session')`;
s = await b.rev(AS);
v(s && s.cachees.length === NB_CACHEES && s.noms.length === 1, `session Apprentissage : ${NB_CACHEES} cases cachées + 1 nom`, JSON.stringify(s && { c: s.cachees.length, n: s.noms }));
await b.toucher(`${AS}.querySelector('td.cachee .tb-masque')`, 400);
v((await b.rev(AS)).cachees.length === NB_CACHEES - 1, 'session : une case révélée');
await b.capture('tm-apprentissage');
await b.toucher(`${AS}.querySelector('.tb-tout-btn')`, 400);
v((await b.rev(AS)).cachees.length === 0, 'session : « Tout révéler »');
await b.toucher(`document.querySelector('.sfc-quitter')`, 800);
await b.taper(`document.querySelector('.alib2-recherche input')`, '');

// ---- import : format attendu, puis import réel de l'exemple ----
await b.ouvrirCours(COURS[2], { recharger: true }); await b.ongletFlashcards();
await b.toucher(`document.querySelector('[data-act="importer-fc"]')`, 700);
await b.toucher(`document.querySelector('[data-act="format"]')`, 500);
const fmt = await b.ev(`document.querySelector('[data-exemple]').textContent`);
v(/"masque": \{/.test(fmt) && /"noms": \[/.test(fmt) && /true = masquée en révision/.test(fmt), '« Voir le format attendu » : exemple d’un tableau à masque choisi (masque.cellules, masque.noms)');
await b.capture('tm-format', await b.ev(`(()=>{const e=document.querySelector('[data-exemple]');const i=e.textContent.indexOf('tableau (masque choisi)');e.scrollTop=Math.max(0,e.scrollHeight*i/e.textContent.length-20);const p=document.querySelector('[data-import-flashcards]').getBoundingClientRect();return {x:p.x,y:Math.max(0,p.y),width:p.width,height:Math.min(900-p.y,p.height)}})()`));
await b.toucher(`[...document.querySelectorAll('[data-import-flashcards] button')].find(x=>/Essayer cet exemple/.test(x.textContent))`, 4000);
const compte = await b.ev(`(document.querySelector('[data-compte]')||{}).textContent`);
v(/Tableau\s*2/.test(compte || ''), `analyse de l’exemple sans erreur (${compte})`);
await b.toucher(`[...document.querySelectorAll('[data-import-flashcards] button')].find(x=>/^\\s*Importer/.test(x.textContent)&&!x.disabled)`, 2500);
const imp = await b.S(`const q=(await S.getAll('questions')).filter(x=>x.ficheId==='f3'&&x.tableau);return q.map(x=>({r:x.recto,m:x.tableau.masque||null}))`);
const avecM = imp.find((x) => /innervation/.test(x.r)), sansM = imp.find((x) => /insertions/.test(x.r));
v(avecM && JSON.stringify(avecM.m) === JSON.stringify({ cellules: [[false, true], [false, true]], noms: [false, false] }) && sansM && sansM.m === null, 'import réel : le tableau à masque garde son masque, l’autre n’en a pas (défaut)', JSON.stringify(imp));
// ---- export : JSON de l'export → ré-import ; sauvegarde JSONL ----
const exp = await b.S(`const X = await import('/src/medrevise/lib/exportFlashcards.js'); const I = await import('/src/medrevise/lib/importFlashcards.js'); const E = await import('/src/medrevise/sauvegarde/export.js');
  const q = await S.getOne('questions', ${JSON.stringify(id)});
  const it = X.carteVersItem(q);
  const a = await I.analyserImport({ texte: JSON.stringify({ items: [it] }) });
  const r = E.construireExport({ records: [{ store: 'questions', record_id: q.id, updated_at: q.updatedAt, deleted: false, data: q }], jour: '2026-10-31' });
  const lu = E.lireJsonl(r.fichiers.find((f) => f.chemin === 'data/records.jsonl').contenu)[0].data;
  return { exporte: it.tableau.masque, reimporte: a.ok && a.cartes[0] ? a.cartes[0].carte.tableau.masque : a, jsonl: E.jsonCanonique(lu.tableau) === E.jsonCanonique(q.tableau) };`);
v(JSON.stringify(exp.exporte) === JSON.stringify(MASQUE) && JSON.stringify(exp.reimporte) === JSON.stringify(MASQUE) && exp.jsonl, 'export JSON → ré-import : masque identique ; sauvegarde JSONL : tableau identique', JSON.stringify({ ...exp, exporte: !!exp.exporte }));
v((await b.temoins()) === h0, `cartes témoins identiques (${h0})`);
b.fin();
