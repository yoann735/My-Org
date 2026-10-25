// §1 + §5 dans un DOCUMENT créé dans l'app (même boîte, même tableau) : image collée dans une boîte, menu Tableau.
//   node t-document.mjs [tablette]
import { banc, outilsTableau, imagesTest } from './commun.mjs';
import fs from 'node:fs';
const tablette = process.argv[2] === 'tablette';
const b = await banc();
const IM = await imagesTest(b);
const TITRE = 'Doc boîtes (test)';
const P = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
const flux = { type: 'doc', content: [P('Le sarcomère est l’unité contractile du muscle strié squelettique.'), P('Actine et myosine glissent les unes sur les autres.')] };
const id = await b.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const im=(p)=>import(u.find(n=>n.includes(p))||('/src/medrevise/'+p));
  const S=await im('lib/storage.js');const D=await im('documents/lib/documents.js');const N=await im('documents/lib/notesDoc.js');
  for(const f of await S.getAll('fiches')) if(f.titre===${JSON.stringify(TITRE)}){ for(const a of await S.getAll('annotations')) if(a.ficheId===f.id) await S.remove('annotations',a.id); for(const r of await S.getAll('reading_position')) if(String(r.id).startsWith('rp:'+f.id)) await S.remove('reading_position',r.id); await S.remove('notes_doc',f.id); await S.remove('fiches',f.id); }
  await S.put('sources',{id:'src-so',nom:'Source outils',couleur:'#7c5cff'});await S.put('matieres',{id:'mat-so',nom:'Outils test',sourceId:'src-so'});
  const f=await D.createDocumentNotes({matiereId:'mat-so',titre:${JSON.stringify(TITRE)}});
  await N.majNotesDoc(f.id,{flux:${JSON.stringify(flux)},fluxMaj:Date.now(),fluxAppareil:'banc'});return f.id})()`);
// la page d'un document a pour clé son id (pages calculées) : ouvrir une première fois pour la lire
await b.ev(`localStorage.setItem('medrevise.disposition.${id}','pdf');1`);
await b.biblio({ recharger: true });
await b.ouvrir(TITRE); await b.dormir(2500);
const cle = await b.ev(`document.querySelector('.pdfr-page[data-cle]').dataset.cle`);
const base = { ficheId: id, page: cle, kind: 'libre', type: 'boite', fond: 'plein', gabarit: 'carte', taille1000: 16, bord1000: 1.5, pad1000: [10, 8], couleur: 'jaune-franc', createdAt: '2026-10-25T08:00:00.000Z' };
const doc = (t) => ({ type: 'doc', content: [P(t)] });
await b.S(`for(const a of ${JSON.stringify([
  { ...base, id: 'dbi-1', x: 0.1, y: 0.3, width: 0.05, height: 0.03, content: doc('Sarcomère') },
  { ...base, id: 'dbt-1', x: 0.1, y: 0.55, width: 0.6, height: 0.05, largeurFixe: true, couleur: 'bleu-franc', grille: { v: 1, cols: [0.5, 0.5], entete: true, lignes: [['Protéine', 'Rôle'], ['Actine', 'Filament fin'], ['Myosine', 'Filament épais']] }, content: doc('Protéine | Rôle') },
])})await S.put('annotations',a);return 1`);
await b.ev(`localStorage.setItem('medrevise.disposition.${id}','pdf');1`);
await b.biblio({ recharger: true });
await b.ouvrir(TITRE); await b.dormir(2500);
if (tablette) { await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true }); await b.dormir(1500); }
await b.ev(`window.__mrZoom(1);1`); await b.dormir(1200);
const A = async (x) => b.S(`return await S.getOne('annotations',${JSON.stringify(x)})`);
b.ok(await b.ev(`!!document.querySelector('.note-box[data-boite="dbi-1"]') && !!document.querySelector('.note-box[data-boite="dbt-1"] .btab')`), 'document : la boîte et la boîte-tableau sont affichées (même composant que le lecteur)');
// image collée dans la boîte sélectionnée
await b.c.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: 'http://localhost:5199' });
await b.clic(await b.pos(`document.querySelector('.note-box[data-boite="dbi-1"]')`, false), { att: 500 });
await b.ev(`(async()=>{const bl=await (await fetch('data:image/png;base64,${fs.readFileSync(IM.photo).toString('base64')}')).blob();await navigator.clipboard.write([new ClipboardItem({'image/png':bl})]);return 1})()`);
await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', modifiers: 4, windowsVirtualKeyCode: 86, commands: ['paste'] });
await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', modifiers: 4, windowsVirtualKeyCode: 86 });
await b.dormir(1500);
const a1 = await A('dbi-1');
const flux1 = await b.S(`const N=await import(performance.getEntriesByType('resource').map(e=>e.name).find(n=>n.includes('documents/lib/notesDoc.js'))||'/src/medrevise/documents/lib/notesDoc.js');const n=await S.getOne('notes_doc',${JSON.stringify(id)});return JSON.stringify(n&&n.flux||{}).includes('"image"')`);
b.ok(a1.image && Math.abs(a1.image.ratio - 0.5) < 0.01 && !flux1 && (await b.ev(`!!document.querySelector('.note-box[data-boite="dbi-1"] .nb-image img')`)), 'document : ⌘V sur une boîte sélectionnée → l’image va dans la boîte (pas dans le texte du document)', JSON.stringify({ image: a1.image, dansLeFlux: flux1 }));
// menu Tableau dans le document
await b.T.Escape(); await b.dormir(300);
const T = outilsTableau(b, '.note-box[data-boite="dbt-1"]');
await b.clic(await b.pos(`document.querySelector('.note-box[data-boite="dbt-1"]')`, false), { att: 500 });
await T.clicCell(1, 1);
await T.menu('ins-dessous');
await T.menu('b-toutes');
const g = (await A('dbt-1')).grille;
b.ok(g.lignes.length === 4 && g.lignes[2].every((c) => !c) && g.bordures && g.bordures.mode === 'toutes', 'document : menu Tableau (insérer en dessous, bordures)', JSON.stringify({ n: g.lignes.length, b: g.bordures }));
const d = await T.debord();
b.ok(d.bas <= 0 && d.droite <= 0, 'document : rien ne dépasse de la boîte-tableau', JSON.stringify(d));
await T.fermerMenu(); await b.T.Escape(); await b.dormir(300); await b.T.Escape();
await b.capture('bt-document');
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
