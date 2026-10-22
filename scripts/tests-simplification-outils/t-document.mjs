// §2 DOCUMENT créé dans l'app : plus de barre de format permanente ; la mise en forme du texte du flux apparaît dans une
// mini barre du même style AU-DESSUS DE LA SÉLECTION (et dans un tableau du document).   node t-document.mjs [tablette]
import { banc } from './commun.mjs';
const tablette = process.argv[2] === 'tablette';
const b = await banc();
const TITRE = 'Doc outils (test)';
const P = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
const cell = (t, h = false) => ({ type: h ? 'tableHeader' : 'tableCell', content: [P(t)] });
const flux = { type: 'doc', content: [P('Le sarcomère est l’unité contractile du muscle strié squelettique.'), P('Actine et myosine glissent les unes sur les autres.'),
  { type: 'table', content: [{ type: 'tableRow', content: [cell('Protéine', true), cell('Rôle', true)] }, { type: 'tableRow', content: [cell('Actine'), cell('Filament fin')] }] }, P('Fin.')] };
const id = await b.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const im=(p)=>import(u.find(n=>n.includes(p))||('/src/medrevise/'+p));
  const S=await im('lib/storage.js');const D=await im('documents/lib/documents.js');const N=await im('documents/lib/notesDoc.js');
  for(const f of await S.getAll('fiches')) if(f.titre===${JSON.stringify(TITRE)}){ for(const r of await S.getAll('reading_position')) if(String(r.id).startsWith('rp:'+f.id)) await S.remove('reading_position',r.id); await S.remove('notes_doc',f.id); await S.remove('fiches',f.id); }
  await S.put('sources',{id:'src-so',nom:'Source outils',couleur:'#7c5cff'});await S.put('matieres',{id:'mat-so',nom:'Outils test',sourceId:'src-so'});
  const f=await D.createDocumentNotes({matiereId:'mat-so',titre:${JSON.stringify(TITRE)}});
  await N.majNotesDoc(f.id,{flux:${JSON.stringify(flux)},fluxMaj:Date.now(),fluxAppareil:'banc'});return f.id})()`);
await b.ev(`localStorage.setItem('medrevise.disposition.${id}','pdf');1`);
await b.biblio({ recharger: true });
await b.ouvrir(TITRE); await b.dormir(2500);
if (tablette) { await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true }); await b.dormir(1500); }
await b.ev(`window.__mrZoom(1);1`); await b.dormir(1200);
b.ok(!(await b.ev(`!!document.querySelector('.pdfr-edit-toolbar, .pdfr-rangee-texte')`)), 'document : plus de barre de format permanente');
// cliquer dans le texte : pas de barre (curseur seul) ; sélectionner un mot : la mini barre au-dessus
const mot = await b.ev(`(()=>{const p=[...document.querySelectorAll('.pt-flux-cadre .ProseMirror p')].find(e=>/sarcomère/.test(e.textContent));const r=document.createRange();const t=p.firstChild;const i=t.textContent.indexOf('sarcomère');r.setStart(t,i);r.setEnd(t,i+9);const q=r.getBoundingClientRect();return [q.left+2,q.top+q.height/2,q.right-2]})()`);
await b.clic([mot[0], mot[1]], { att: 500 });
b.ok(!(await b.ev(`!!document.querySelector('.barre-texte-doc')`)), 'un clic (curseur, pas de sélection) : pas de mini barre');
await b.glisser([mot[0], mot[1]], [mot[2], mot[1]], 10); await b.dormir(700);
const barre = await b.ev(`(()=>{const e=document.querySelector('.barre-texte-doc');if(!e)return null;const r=e.getBoundingClientRect();return {haut:Math.round(r.bottom),opts:[...e.children].map(c=>c.classList.contains('mb-sep')?'|':c.classList.contains('mb-plus')?'…':c.getAttribute('data-mb')||c.getAttribute('data-option')||(c.querySelector('[data-option]')||{}).getAttribute?.('data-option'))}})()`);
b.ok(barre && barre.haut <= mot[1] && ['gras', 'italique', 'souligne', 'h1', 'h2', 'puces', 'numeros', 'align', 'couleur-texte', '…', 'notion', 'flashcard'].every((k) => barre.opts.includes(k)), 'sélection : mini barre AU-DESSUS (G · I · U · H1 · H2 · listes · alignement · couleur · … · Notion · Flashcard)', JSON.stringify(barre));
{ const r = await b.rect(`document.querySelector('.barre-texte-doc')`); await b.capture('so-mini-texte-document' + (tablette ? '-tablette' : ''), { x: Math.round(r.x - 10), y: Math.round(r.y - 10), width: Math.round(r.w + 20), height: Math.round(mot[1] - r.y + 30) }); }
await b.clic(await b.pos(`document.querySelector('.barre-texte-doc [data-option="gras"]')`, false), { att: 500 });
b.ok(await b.ev(`!![...document.querySelectorAll('.pt-flux-cadre .ProseMirror strong')].find(e=>e.textContent==='sarcomère')`), 'G : le mot sélectionné passe en gras');
await b.clic(await b.pos(`document.querySelector('.barre-texte-doc [data-option="h1"]')`, false), { att: 500 });
b.ok(await b.ev(`!![...document.querySelectorAll('.pt-flux-cadre .ProseMirror h1')].find(e=>/sarcomère/.test(e.textContent))`), 'H1 : le paragraphe devient un titre');
await b.clic(await b.pos(`document.querySelector('.barre-texte-doc [data-option="plus"]')`, false), { att: 400 });
const plus = await b.ev(`[...document.querySelectorAll('.barre-texte-doc .mb-plus-pop [data-option]')].map(e=>e.getAttribute('data-option'))`);
b.ok(['barre', 'h3', 'taille-doc', 'police', 'fond-texte', 'cases', 'citation', 'tableau', 'separateur', 'lien'].every((k) => plus.includes(k)), '« … » : barré, H3, taille, police, fond, cases, citation, tableau, séparateur, lien', JSON.stringify(plus));
await b.T.Escape(); await b.dormir(200);
// le curseur dans un tableau du document : la barre propose + ligne / + colonne
const c = await b.pos(`[...document.querySelectorAll('.pt-flux-cadre td p')].find(e=>/Actine/.test(e.textContent))`, false);
await b.clic(c, { att: 700 });
const tb = await b.ev(`(()=>{const e=document.querySelector('.barre-texte-doc');return e?[...e.querySelectorAll('[data-option], [data-mb]')].map(x=>x.getAttribute('data-mb')||x.getAttribute('data-option')).filter((v,i,a)=>a.indexOf(v)===i):null})()`);
b.ok(tb && tb.includes('t-ligne') && tb.includes('t-colonne') && !tb.includes('notion'), 'curseur dans un tableau du document : la mini barre propose + ligne / + colonne', JSON.stringify(tb));
await b.clic(await b.pos(`document.querySelector('.barre-texte-doc [data-option="t-ligne"]')`, false), { att: 600 });
b.ok((await b.ev(`document.querySelectorAll('.pt-flux-cadre table tr').length`)) === 3, '+ ligne ajoute une ligne au tableau du document');
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
