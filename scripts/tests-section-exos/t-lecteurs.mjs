// 2) Lecteurs (ordinateur, iPad ou téléphone : node t-lecteurs.mjs ordi|ipad|tel) — après t-creation.mjs.
//    PDF : la fiche s'ouvre dans le PdfReader existant ; une boîte écrite est retrouvée après fermeture / réouverture.
//    HTML : QCM interactif (boutons, champ, correction JS, localStorage en mémoire, alert en bandeau) ;
//    HTML piégé : IndexedDB, cookies, parent, redirection, fenêtres → bloqués, l'app n'est pas affectée.
import { appareil, gestes, dormir } from './commun.mjs';
const type = process.argv[2] || 'ordi';
const b = await appareil(type);
const g = gestes(b);
await b.ouvrirApp(); await b.attendreSynchro();
const prefixe = type;
b.ok(await g.allerExos(), 'page Exos');
await b.attendre(`document.querySelectorAll('.exo-carte, .exo-ligne').length >= 3`, 20000);
const n1 = (await g.notions()).find((n) => n.nom === 'Équilibre acido-basique');
const ns = 'exo:' + n1.fiche.id;
const marque = 'Annotation ' + prefixe + ' ' + Date.now().toString(36);

/* ---------- PDF ---------- */
// banc rejoué : les boîtes d'un passage précédent de CET appareil sont retirées (données du banc seulement)
await b.S(`for (const a of await S.getAll('annotations')) if (a.ficheId === ${JSON.stringify(ns)} && JSON.stringify(a.content || '').includes(${JSON.stringify('Annotation ' + prefixe + ' ')})) await S.remove('annotations', a.id); return 1`);
b.ok(await g.ouvrirNotion('Équilibre acido-basique'), 'ouvrir la notion');
await g.ouvrirTuile('Fiche');
b.ok(await b.attendre(`!!document.querySelector('[data-lecteur="pdf"] .pdfr-page[data-cle="1"] canvas')`, 25000), 'fiche PDF : ouverte dans le PdfReader (pages rendues)');
await dormir(1500);
const outils = await b.ev(`[...document.querySelectorAll('[data-outil]')].map((x) => x.dataset.outil)`);
b.ok(['surligneur', 'ecrire', 'dessin'].every((o) => outils.includes(o)), 'mêmes outils que pour un cours (surligneur, texte, dessin…)', outils.join(' · '));
await b.capture(prefixe + '-lecteur-pdf');
// une boîte de texte écrite au clavier (outil Texte → Boîte), comme sur un cours
const avant = await b.S(`return (await S.getAll('annotations')).filter((a) => a.ficheId === ${JSON.stringify(ns)}).length`);
const outil = async (grp, sous) => {
  if ((await b.ev(`(document.querySelector('[data-outil="${grp}"]')||{}).getAttribute?.('aria-pressed')`)) !== 'true') await b.clic(`document.querySelector('[data-outil="${grp}"]')`, 300);
  if (sous && (await b.ev(`(document.querySelector('[data-sous-outil="${sous}"]')||{}).getAttribute?.('aria-pressed')`)) !== 'true') await b.clic(`document.querySelector('[data-sous-outil="${sous}"]')`, 300);
};
await outil('ecrire', 'boite');
const p = await b.rect(`document.querySelector('.pdfr-page[data-cle="1"]')`);
const k = { ordi: 0, ipad: 1, tel: 2, ordiB: 3 }[type] || 0;
const x = p.x + p.w * 0.5, y = Math.min(p.y + p.h * (0.2 + 0.08 * k), b.H * 0.6);
for (const t of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', buttons: t === 'mousePressed' ? 1 : 0, clickCount: 1, pointerType: b.tactile ? 'pen' : 'mouse' });
await b.attendre(`!!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.note-box .ProseMirror'))`, 4000);
await b.ecrire(marque); await dormir(1800);
await b.touche('Escape', 'Escape', 27); await b.touche('Escape', 'Escape', 27);
const ecrites = await b.S(`return (await S.getAll('annotations')).filter((a) => a.ficheId === ${JSON.stringify(ns)} && JSON.stringify(a.content||'').includes(${JSON.stringify(marque)})).length`);
b.ok(ecrites === 1, 'annoter la fiche : boîte enregistrée en continu (espace « exo:<fichier> »)', `${avant} → ${avant + ecrites}`);
// le menu Fichier : Historique disponible
await b.clic(`document.querySelector('.mf-bouton')`, 400);
const hist = await b.ev(`(() => { const e = document.querySelector('[data-entree="historique"]'); return e ? e.getAttribute('aria-disabled') !== 'true' : null; })()`);
b.ok(hist === true, 'menu Fichier : « Historique… » disponible');
await b.touche('Escape', 'Escape', 27);
b.ok(await b.ev(`!!document.querySelector('.note-box')`) && (type === 'tel' || await b.ev(`[...document.querySelectorAll('.pis, .pm-modes, [role="tablist"]')].some((e) => /Exercices|Exos/.test(e.innerText))`)),
  'notion rattachée à un cours : le panneau propose les cartes du cours (Exercices) — boîte → flashcard possible');
// fermer, rouvrir
await b.clic(`[...document.querySelectorAll('button')].find((x) => x.title === 'Revenir à la liste' || x.getAttribute('aria-label') === 'Retour')`, 900);
b.ok(await b.attendre(`!!document.querySelector('.exo-tuiles')`, 6000), 'fermer le lecteur : retour à la notion');
await g.ouvrirTuile('Fiche');
b.ok(await b.attendre(`[...document.querySelectorAll('.note-box')].some((n) => n.innerText.includes(${JSON.stringify(marque)}))`, 20000), 'rouvrir : l’annotation est là');
await b.capture(prefixe + '-lecteur-pdf-annote');
await b.clic(`[...document.querySelectorAll('button')].find((x) => x.title === 'Revenir à la liste' || x.getAttribute('aria-label') === 'Retour')`, 900);
await b.attendre(`!!document.querySelector('.exo-tuiles')`, 6000);
const versions = await b.ev(`(async () => { const H = await __imp('/src/medrevise/lib/historiqueDoc.js'); return (await H.listerVersions(${JSON.stringify(ns)})).length; })()`);
b.ok(versions >= 1, 'Historique : versions du document gardées (ouverture / fermeture)', String(versions));

/* ---------- HTML : QCM ---------- */
const compteExo = () => b.S(`return (await S.getAll('annotations')).filter((a) => String(a.ficheId).startsWith('exo:')).length + (await S.getAll('highlights')).filter((a) => String(a.ficheId).startsWith('exo:')).length`);
const avantHtml = await compteExo();
await g.ouvrirTuile('QCM');
b.ok(await b.attendre(`!!document.querySelector('.exo-html iframe.exo-html-frame')`, 8000), 'HTML : lecteur intégré plein écran (barre : retour + nom du fichier)');
const attrs = await b.ev(`(() => { const f = document.querySelector('.exo-html-frame'); return { sandbox: f.getAttribute('sandbox'), titre: document.querySelector('.exo-html-titre').innerText }; })()`);
b.ok(attrs.sandbox === 'allow-scripts allow-forms', 'iframe isolée : sandbox="allow-scripts allow-forms" (sans allow-same-origin)', JSON.stringify(attrs));
await dormir(1200);
let ctxId = null; for (let k = 0; k < 20 && !ctxId; k++) { ctxId = await b.contexteIframe(); if (!ctxId) await dormir(250); }
const dansIframe = (js) => b.ev(js, ctxId);
b.ok(!!ctxId && (await dansIframe(`document.title`)) === 'QCM — Équilibre acido-basique', 'le QCM est chargé');
// clics réels (souris ou doigt) sur les boutons de réponse, à travers l'iframe
const fr = await b.rect(`document.querySelector('.exo-html-frame')`);
const rIn = async (sel) => { const r = await dansIframe(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; })()`); return [fr.x + r.x, fr.y + r.y]; };
let [cx, cy] = await rIn('#r1b'); await b.point(cx, cy, 300);
[cx, cy] = await rIn('#r1a'); await b.point(cx, cy, 300);
const etat1 = await dansIframe(`({ b: document.querySelector('#r1b').className, a: document.querySelector('#r1a').className, score: document.querySelector('#score').textContent, ls: localStorage.getItem('score'), ss: sessionStorage.getItem('vu') })`);
b.ok(etat1.b === 'ok' && etat1.a === 'ko' && etat1.score === '1' && etat1.ls === '1' && etat1.ss === '1', 'boutons + correction JS + localStorage / sessionStorage (en mémoire) : fonctionnent', JSON.stringify(etat1));
[cx, cy] = await rIn('#champ'); await b.point(cx, cy, 300);
await b.ecrire('24'); await dormir(200);
[cx, cy] = await rIn('#corriger'); await b.point(cx, cy, 500);
const etat2 = await dansIframe(`({ champ: document.querySelector('#champ').value, res: document.querySelector('#resultat').textContent, alerte: (document.querySelector('[data-mr-alerte]') || {}).textContent || null })`);
b.ok(etat2.champ === '24' && /Correct/.test(etat2.res) && etat2.alerte === 'Correction affichée', 'champ de saisie, bouton « Corriger », alert() affichée en bandeau dans l’exercice', JSON.stringify(etat2));
await b.capture(prefixe + '-lecteur-html');
b.ok((await compteExo()) === avantHtml && !(await b.ev(`!!document.querySelector('.exo-html [data-outil]')`)), 'HTML : rien n’est enregistré, aucun outil (nombre d’annotations inchangé)');
await b.clic(`document.querySelector('.exo-html-barre .icon-btn')`, 500);
b.ok(await b.attendre(`!!document.querySelector('.exo-tuiles')`, 4000), 'retour du lecteur HTML vers la notion');
// rouvrir : le stockage en mémoire est perdu à la fermeture
await g.ouvrirTuile('QCM'); await dormir(1200);
ctxId = null; for (let k = 0; k < 20 && !ctxId; k++) { ctxId = await b.contexteIframe(); if (!ctxId) await dormir(250); }
b.ok((await b.ev(`document.querySelector('#score').textContent`, ctxId)) === '0', 'stockage du fichier en mémoire : perdu à la fermeture (score revenu à 0)');
await b.clic(`document.querySelector('.exo-html-barre .icon-btn')`, 500);
await g.retourGrille();

/* ---------- HTML piégé ---------- */
await b.ev(`(document.cookie = 'mr_secret_banc=ne-doit-pas-fuiter; path=/', 1)`);
const avantApp = await b.S(`return JSON.stringify({ fiches: (await S.getAll('fiches')).length, notions: (await S.getAll('exo_notion')).length, href: location.href, app: localStorage.getItem('app.current') })`);
await g.ouvrirNotion('Calculs de doses');
await g.ouvrirTuile('piege'); await dormir(2500);
ctxId = null; for (let k = 0; k < 20 && !ctxId; k++) { ctxId = await b.contexteIframe(); if (!ctxId) await dormir(250); }
const rapport = JSON.parse(await b.ev(`document.querySelector('#rapport').textContent || '{}'`, ctxId));
console.log(JSON.stringify(rapport, null, 1));
const bloque = (v) => /^BLOQU/.test(v || '');
b.ok(bloque(rapport.cookie) && bloque(rapport.parentDocument) && bloque(rapport.parentLocalStorage) && bloque(rapport.topLocation) && bloque(rapport.indexedDB)
  && bloque(rapport.cleSupabaseDeLApp) && bloque(rapport.cookieParent) && bloque(rapport.redirectionTop) && /BLOQU/.test(rapport.popup || '') && /null$/.test(rapport.origine || ''),
  'HTML piégé : cookies, document / localStorage / cookies du parent, IndexedDB, redirection de l’app, fenêtres → BLOQUÉS (origine opaque « null »)');
const apresApp = await b.S(`return JSON.stringify({ fiches: (await S.getAll('fiches')).length, notions: (await S.getAll('exo_notion')).length, href: location.href, app: localStorage.getItem('app.current') })`);
b.ok(apresApp === avantApp && await b.ev(`!!document.querySelector('.exo-html')`), 'l’app n’est pas affectée : même adresse, mêmes données, lecteur toujours ouvert', apresApp);
await b.capture(prefixe + '-html-piege');
await b.clic(`document.querySelector('.exo-html-barre .icon-btn')`, 500);
await g.retourGrille();
await b.ev(`(document.cookie = 'mr_secret_banc=; Max-Age=0; path=/', 1)`);
await b.synchro(); await dormir(2000);
process.exitCode = b.fin();
b.fermerWs();
