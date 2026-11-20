// COPIER / COLLER / DUPLIQUER LES OBJETS (20/11) : ⌘C / ⌘V au pointeur (ou +16 px), autre page, autre document,
// ⌘D sur place (+16 px, copie sélectionnée), ⌘C / ⌘V en écrivant = texte. node t-copie.mjs ordi|tablette
// (tablette = iPad tactile AVEC clavier : les objets se touchent au doigt, les raccourcis viennent du clavier ;
//  pas de pointeur survolant une page → collage décalé de 16 px)
import { appareil, semer, pdfTest, dormir } from './commun.mjs';

const type = process.argv[2] || 'ordi';
const b = await appareil(type);
const T = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const c = '2026-11-20T08:00:00.000Z';
const o = (id, extra) => ({ id, ficheId: 'pr-dia', page: 1, createdAt: c, ...extra });
const OBJETS = [
  o('bx', { kind: 'libre', type: 'boite', fond: 'plein', gabarit: 'carte', couleur: 'bleu-franc', taille1000: 20, tailleTexte: 2, bord1000: 1.5, pad1000: [10, 8], largeurFixe: true, x: 0.06, y: 0.22, width: 0.22, height: 0.08, content: T('Boîte néphron') }),
  o('pi', { kind: 'libre', type: 'boite', postit: true, fond: 'plein', largeurFixe: true, couleur: 'jaune-franc', taille1000: 18, tailleTexte: 1.8, x: 0.32, y: 0.08, width: 0.1, height: 0.15, content: T('Post-it') }),
  o('fo', { kind: 'forme', type: 'forme', forme: 'rectangle', couleur: '#e5383b', epaisseur: 0.0025, ep1000: 3, x: 0.06, y: 0.45, width: 0.14, height: 0.12 }),
  o('fl', { kind: 'forme', type: 'forme', forme: 'fleche', couleur: '#2a9d8f', epaisseur: 0.0025, ep1000: 3, x: 0.26, y: 0.5, width: 0.16, height: 0.06 }),
  o('tx', { kind: 'texte', type: 'texte', couleur: 'noir', gabarit: 'carte', taille1000: 16, tailleTexte: 1.6, x: 0.06, y: 0.7, width: 0.2, height: 0.05, content: T('Texte libre') }),
];
await b.neuf();
await semer(b, [
  { id: 'pr-dia', matiereId: 'pr-mat', dossierId: null, titre: 'Diapo copie test', type: 'standard', pdf64: await pdfTest(3), pdfName: 'diapo.pdf', dateImport: '2026-11-20' },
  { id: 'pr-autre', matiereId: 'pr-mat', dossierId: null, titre: 'Autre cours test', type: 'standard', pdf64: await pdfTest(2, { titre: 'Autre' }), pdfName: 'autre.pdf', dateImport: '2026-11-20' },
], OBJETS, `await S.put('questions', { id: 'q-bx', type: 'flashcard', ficheId: 'pr-dia', recto: 'Néphron ?', verso: 'R', historique: [], nouvelle: true, intervalDays: 1, dueDate: '2026-11-21', j0Date: '2026-11-20', source: { boiteId: 'bx', ns: 'pr-dia', page: 1, sorte: 'boite' } });`);
await b.ouvrir();
const MOD = 4; // ⌘ (Meta) — l'iPad avec clavier envoie aussi Meta
const raccourci = async (k, cmd) => {
  const base = { key: k, code: 'Key' + k.toUpperCase(), windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers: MOD };
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, commands: cmd ? [cmd] : [] });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }); await dormir(700);
};
const annots = async (ns = null) => (await b.stocker('annotations')).filter((a) => (ns ? a.ficheId === ns : String(a.ficheId).startsWith('pr-')) && a.kind !== 'page');
const selId = () => b.ev(`(() => { const e = document.querySelector('.note-box.selectionnee[data-boite], .pdfr-forme.active[data-objet]'); return e ? (e.dataset.boite || e.dataset.objet) : null; })()`);
const visible = (id) => `document.querySelector('[data-boite="${id}"], .pdfr-forme[data-objet="${id}"]')`;
const sansId = ({ id, updatedAt, createdAt, x, y, page, ficheId, ...r }) => JSON.stringify(r); // eslint-disable-line no-unused-vars

b.ok(await b.ouvrirCours('Diapo copie test'), 'diapo ouverte');
b.ok(await b.attendre(`!!document.querySelector('[data-boite="bx"]')`, 20000), 'objets affichés');
await dormir(1500);
const formes = await b.ev(`[...document.querySelectorAll('.pdfr-forme[data-objet]')].map((e) => e.dataset.objet).join(',')`);
b.ok(/fo/.test(formes || '') && /fl/.test(formes || ''), 'forme et flèche affichées', formes);
// ⌘D envoyé comme événement clavier de la page : son `defaultPrevented` dit si le raccourci du navigateur est bloqué
const cmdD = async () => { const p = await b.ev(`(() => { const ev = new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', metaKey: true, bubbles: true, cancelable: true }); (document.activeElement || document.body).dispatchEvent(ev); return ev.defaultPrevented; })()`); await dormir(800); return p; };

/* ⌘D sans rien de sélectionné : le raccourci du navigateur n'est pas bloqué, rien n'est créé */
await b.clicFixe(`[...document.querySelectorAll('[data-outil="main"]')].find((e) => e.offsetParent)`, 300);
await b.touche('Escape', { code: 'Escape', vk: 27 });
let n0 = (await annots()).length;
const pd0 = await cmdD();
b.ok((await annots()).length === n0 && pd0 === false, '⌘D sans objet sélectionné : rien de créé, raccourci du navigateur laissé');

/* chaque type d'objet : ⌘C, ⌘V (page 2 au pointeur à l'ordinateur ; décalé de 16 px au doigt), ⌘D */
const pointSurPage = async (cle, fx, fy) => {
  await b.ev(`(() => { document.querySelector('.pdfr-page[data-cle="${cle}"]').scrollIntoView({ block: 'center' }); return 1; })()`); await dormir(700);
  const p = await b.ev(`(() => { const r = document.querySelector('.pdfr-page[data-cle="${cle}"]').getBoundingClientRect(); return { x: r.x + r.width * ${fx}, y: r.y + r.height * ${fy} }; })()`);
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await dormir(200);
};
for (const src of [OBJETS[1], OBJETS[0], ...OBJETS.slice(2)]) {
  await b.ev(`(() => { document.querySelector('.pdfr-page[data-cle="1"]').scrollIntoView({ block: 'start' }); return 1; })()`); await dormir(600);
  await b.clicFixe(visible(src.id), 700);
  const sel = await selId();
  b.ok(sel === src.id, `${src.id} : sélectionné au ${b.tactile ? 'doigt' : 'clic'}`, String(sel));
  await raccourci('c', 'copy');
  const avant = await annots();
  if (!b.tactile) await pointSurPage(2, 0.5, 0.4);
  else await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }); // (sans effet : le doigt ne survole pas)
  await raccourci('v', 'paste');
  const apres = await annots();
  const neuf = apres.filter((a) => !avant.some((x) => x.id === a.id));
  b.ok(neuf.length === 1, `${src.id} : ⌘V crée exactement une copie`, String(neuf.length));
  const cp = neuf[0] || {};
  b.ok(cp.id && cp.id !== src.id && sansId(cp) === sansId(src), `${src.id} : nouvel id, même contenu, même style`);
  if (!b.tactile) b.ok(cp.page === 2 && Math.abs(cp.x - 0.5) < 0.002 && Math.abs(cp.y - 0.4) < 0.002, `${src.id} : collé sur la page 2, au pointeur`, `${cp.page} ${cp.x},${cp.y}`);
  else b.ok(cp.page === 1 && Math.abs(cp.x - (src.x + 0.016)) < 0.001 && Math.abs(cp.y - (src.y + 0.016 * 960 / 540)) < 0.001, `${src.id} : sans pointeur sur la page → décalé de 16 px`, `${cp.page} ${cp.x},${cp.y}`);
  // ⌘D sur la copie : une autre copie, +16 px, sélectionnée
  await dormir(400);
  const av2 = await annots();
  const pd = await cmdD();
  const d = (await annots()).filter((a) => !av2.some((x) => x.id === a.id))[0] || {};
  b.ok(d.id && Math.abs(d.x - (cp.x + 0.016)) < 0.001 && Math.abs(d.y - (cp.y + 0.016 * 960 / 540)) < 0.001 && d.page === cp.page, `${src.id} : ⌘D duplique sur place, décalé de 16 px`, `${d.x},${d.y}`);
  b.ok((await selId()) === d.id, `${src.id} : la copie dupliquée est sélectionnée`);
  b.ok(pd === true, `${src.id} : ⌘D du navigateur bloqué (objet sélectionné)`);
  if (src.id === 'bx') await b.capture('copie-boite-collee');
}
// pas lié aux flashcards de l'original
const cartes = (await b.stocker('questions')).filter((q) => q.source && q.source.boiteId);
b.ok(cartes.length === 1 && cartes[0].source.boiteId === 'bx', 'les copies ne sont liées à aucune flashcard (seule l’originale l’est)');
b.ok(await b.ev(`document.querySelectorAll('[data-boite="bx"] .nb-carte, [data-boite="bx"][data-en-carte], .note-box.en-carte').length`) <= 1, 'pastille « en carte » : seulement sur l’originale');

/* ⌘Z annule le dernier collage */
const nAvantZ = (await annots()).length;
await raccourci('z');
b.ok((await annots()).length === nAvantZ - 1, '⌘Z annule la dernière duplication');

/* pointeur hors de la page (ordinateur) : collage décalé de 16 px depuis l'original */
if (!b.tactile) {
  await b.ev(`(() => { document.querySelector('.pdfr-page[data-cle="1"]').scrollIntoView({ block: 'start' }); return 1; })()`); await dormir(600);
  await b.clicFixe(visible('bx'), 600); await raccourci('c', 'copy');
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20, y: 450 }); await dormir(200);
  const av = await annots(); await raccourci('v', 'paste');
  const cp = (await annots()).filter((a) => !av.some((x) => x.id === a.id))[0] || {};
  b.ok(cp.page === 1 && Math.abs(cp.x - 0.076) < 0.001 && Math.abs(cp.y - (0.22 + 0.016 * 960 / 540)) < 0.001, 'pointeur hors de la page : collé à côté de l’original, décalé de 16 px', `${cp.page} ${cp.x},${cp.y}`);
}

/* ⌘C / ⌘V EN ÉCRIVANT dans une boîte : le texte, pas l'objet */
await b.ev(`(() => { document.querySelector('.pdfr-page[data-cle="1"]').scrollIntoView({ block: 'start' }); return 1; })()`); await dormir(600);
await b.ev(`(() => { document.querySelector('[data-boite="bx"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return 1; })()`);
b.ok(await b.attendre(`!!document.querySelector('[data-boite="bx"] .ProseMirror')`, 4000), 'boîte en écriture (double-clic)');
await b.touche('a', { code: 'KeyA', vk: 65, mod: MOD });
const nEcr = (await annots()).length;
await raccourci('c', 'copy');
await b.touche('ArrowRight', { code: 'ArrowRight', vk: 39 });
await raccourci('v', 'paste');
await raccourci('d');
await dormir(800);
const texteBoite = await b.ev(`document.querySelector('[data-boite="bx"] .ProseMirror').innerText`);
b.ok((await annots()).length === nEcr, 'en écriture : ⌘C / ⌘V / ⌘D ne créent aucun objet');
b.ok((texteBoite.match(/Boîte néphron/g) || []).length === 2, 'en écriture : ⌘C / ⌘V copie-colle le TEXTE', JSON.stringify(texteBoite));
await b.capture('copie-texte-en-ecriture');
await b.touche('Escape', { code: 'Escape', vk: 27 }); await dormir(500); await b.touche('Escape', { code: 'Escape', vk: 27 }); await dormir(1200);

/* AUTRE DOCUMENT : copier ici, coller dans « Autre cours test » */
await b.clicFixe(visible('pi'), 600); await raccourci('c', 'copy');
b.ok(await b.ouvrirCours('Autre cours test') && await b.attendre(`!!document.querySelector('.pdfr-page[data-cle="1"] canvas')`, 20000), 'autre document ouvert');
await dormir(1500);
if (!b.tactile) await pointSurPage(1, 0.6, 0.3);
const avA = await annots('pr-autre');
await raccourci('v', 'paste');
const cpA = (await annots('pr-autre')).filter((a) => !avA.some((x) => x.id === a.id));
b.ok(cpA.length === 1 && cpA[0].ficheId === 'pr-autre' && sansId(cpA[0]) === sansId(OBJETS[1]), 'collé dans un autre document (même contenu, même style)', JSON.stringify(cpA.map((a) => [a.ficheId, a.page, a.x, a.y])));
b.ok(await b.attendre(`!!document.querySelector('[data-boite="${cpA[0] && cpA[0].id}"]')`, 4000), 'la copie s’affiche dans l’autre document');
await b.capture('copie-autre-document');
/* écriture continue + synchro : la copie est en base locale tout de suite et part au cloud */
await dormir(3500);
const cloud = await (await fetch('http://localhost:54399/rest/v1/medrevise_records?select=record_id,store', { headers: { apikey: 'faux' } }).catch(() => null))?.json?.().catch(() => null);
if (Array.isArray(cloud)) b.ok(cloud.some((r) => r.record_id === (cpA[0] && cpA[0].id)), 'synchro : la copie est envoyée au cloud (faux Supabase)', String(cloud.length));
const echecs = b.fin();
b.fermerWs(); process.exit(echecs ? 1 : 0);
