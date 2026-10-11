// Finitions (11/10) — ORDINATEUR (A, 9335, 1440×900), vrais clics. Prérequis : lancer.sh, seed de
// tests-apprentissage-libre, seed-boites.mjs, seed-retires.mjs.
// 0. comptes de TOUS les stores + diagnostic AVANT ;
// 1. badge IA : dans la boîte, coin haut droit, aligné sur la poignée, jamais sur le texte, à 3 zooms ;
//    clic = bascule (deux sens), undo / redo ; export PDF annoté sans badge ;
// 2. barre des boîtes : apparition à la sélection, compacte, au-dessus ; disparaît seule (clic ailleurs,
//    autre outil, trait, mode focus, Échap) ; chaque icône agit ; pas de saut de page ; 120 ms ;
// 3. barre latérale : ordre, entrées retirées, icône éclair ; Réglages → Prompts et → Archives ;
//    anciennes adresses et liens internes redirigés ;
// 4. comptes APRÈS identiques ; aucune exception.
// Usage : node t-bureau.mjs <dossier-captures>
import { writeFileSync, mkdirSync } from 'node:fs';
import { appareil, ok, bilan } from '../tests-collage/outils.mjs';
import { ouvrirMedRevise, onglet, ouvrirFiche } from '../tests-apprentissage-libre/commun.mjs';

const captures = process.argv[2] || '/tmp/fin';
mkdirSync(captures, { recursive: true });
const A = await appareil(9335, { captures });
await A.send('Network.enable'); await A.send('Network.setCacheDisabled', { cacheDisabled: true });
await A.send('Page.reload', { ignoreCache: true }); await A.dormir(3000);
await ouvrirMedRevise(A);
// erreurs console (React) en plus des exceptions : réinstallé après chaque navigation
const espion = () => A.ev(`(() => { if (window.__espion) return 1; window.__espion = 1; window.__errs = []; const o = console.error; console.error = (...a) => { window.__errs.push(a.map(String).join(' ').replace(/\s+at .*/g, '').slice(0, 300)); o.apply(console, a); }; return 1; })()`);
const erreursConsole = []; const relever = async () => { const e = await A.ev(`window.__errs || []`); erreursConsole.push(...e); await A.ev(`(window.__errs = [], 1)`); };
await espion();
const url = (p) => `(performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('${p}')) || '${p}')`;
const comptes = () => A.ev(`(async () => {
  const st = await import(${url('/src/medrevise/lib/storage.js')});
  const D = await import(${url('/src/medrevise/lib/diagnosticExport.js')});
  const c = {}; for (const n of st.SYNCABLE_STORES) c[n] = (await st.getAll(n)).length;
  const d = await D.construireDiagnostic();
  return { stores: c, diagnostic: d.compteurs, journal: d.journal.entrees };
})()`);
const intercepter = () => A.ev(`(() => { window.__tel = window.__tel || []; if (window.__inter) return 1; window.__inter = 1; const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__tel.push({ nom: this.download, href: this.href }); return; } return o.call(this); }; return 1; })()`);
const boite = (txt) => `[...document.querySelectorAll('.note-box')].find((n) => new RegExp(${JSON.stringify(txt === 'flexion du coude' ? 'flexion du coude|biceps fléchit' : txt)}).test(n.innerText))`;
const barre = () => A.ev(`(() => { const b = document.querySelector('.nb-barre:not(.sortie)'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: Math.round(r.width), h: Math.round(r.height), boutons: [...b.querySelectorAll('button')].map((x) => ({ l: x.getAttribute('aria-label') || x.title, t: x.innerText.trim(), w: Math.round(x.getBoundingClientRect().width), tip: !!x.title })) }; })()`);
const selectionner = async (txt) => { await A.clic(await A.pos(`(${boite(txt)}).querySelector('.nb-bar')`)); await A.dormir(400); };
const partie = async () => { await A.dormir(250); return !(await A.ev(`!!document.querySelector('.nb-barre:not(.sortie)')`)); };
const zoom = async (t) => { await A.clic(await A.pos(`[...document.querySelectorAll('button')].find((b) => b.title === ${JSON.stringify(t)} && b.offsetParent)`)); await A.dormir(900); };

// 0. COMPTES AVANT
const avant = await comptes();
ok(avant.stores.notes === 1 && avant.stores.apprentissage === 1, '0. comptes AVANT (tous les stores synchronisés + diagnostic)', JSON.stringify(avant.stores));

// 1. BADGE
await ouvrirFiche(A, 'Myologie'); await A.dormir(1500);
const mesureBadges = () => A.ev(`[...document.querySelectorAll('.note-box')].map((n) => {
  const b = n.querySelector('.nb-version'); const g = n.querySelector('.nb-grip'); const corps = n.querySelector('.nb-body');
  if (!b) return { sans: true, txt: n.innerText.slice(0, 12) };
  const rb = b.getBoundingClientRect(), rn = n.getBoundingClientRect(), rg = g.getBoundingClientRect(), rc = corps.getBoundingClientRect();
  return { txt: n.innerText.slice(0, 12), dedans: rb.left >= rn.left && rb.right <= rn.right && rb.top >= rn.top && rb.bottom <= rn.bottom,
    margeDroite: Math.round(rn.right - rb.right), aligne: Math.abs((rb.top + rb.bottom) / 2 - (rg.top + rg.bottom) / 2) <= 3, texteDessous: rb.bottom <= rc.top + 1, h: Math.round(rb.height) };
})`);
const verifierBadges = (m) => m.filter((x) => !x.sans).length === 3 && m.filter((x) => x.sans).length === 1 && m.filter((x) => !x.sans).every((x) => x.dedans && x.aligne && x.texteDessous && x.margeDroite <= 14);
let m = await mesureBadges();
ok(verifierBadges(m) && m.filter((x) => !x.sans).every((x) => x.h >= 16 && x.h <= 19), '1a. 160 % : badge dans la boîte, coin haut droit, aligné sur la poignée, texte dessous, ~18 px ; rien sur la boîte sans version IA', JSON.stringify(m));
await zoom('Dézoomer'); await zoom('Dézoomer'); await zoom('Dézoomer');
m = await mesureBadges();
ok(verifierBadges(m), '1b. dézoomé (≈ 105 %) : même placement à toutes les tailles de boîte', JSON.stringify(m.map((x) => x.sans ? 'sans' : `${x.dedans}/${x.aligne}/${x.texteDessous}/${x.margeDroite}`)));
await zoom('Zoomer'); await zoom('Zoomer'); await zoom('Zoomer'); await zoom('Zoomer'); await zoom('Zoomer');
m = await mesureBadges();
ok(verifierBadges(m), '1c. zoomé (≈ 210 %) : même placement', JSON.stringify(m.map((x) => x.sans ? 'sans' : `${x.dedans}/${x.aligne}/${x.texteDessous}/${x.margeDroite}`)));
await zoom('Dézoomer'); await zoom('Dézoomer');
await A.ev(`document.querySelector('.pdfr-scroll').scrollTop = 0, 1`); await A.dormir(400);
const texteMoy = () => A.ev(`(() => { const n = [...document.querySelectorAll('.note-box')].find((x) => /biceps fléchit|flexion du coude/.test(x.innerText)); return n ? { badge: n.querySelector('.nb-version').innerText, texte: n.querySelector('.nb-body').innerText.trim().slice(0, 40), menu: !!document.querySelector('.ctx-menu, .mf-menu') } : null; })()`);
const badgeMoy = () => A.pos(`[...document.querySelectorAll('.note-box')].find((x) => /biceps fléchit|flexion du coude/.test(x.innerText)).querySelector('.nb-version')`);
const t0 = await texteMoy();
await A.clic(await badgeMoy()); await A.dormir(400);
const t1 = await texteMoy();
await A.clic(await badgeMoy()); await A.dormir(400);
const t2 = await texteMoy();
ok(t0.badge === 'IA' && t1.badge === 'orig.' && /biceps fléchit/.test(t1.texte) && t2.badge === 'IA' && /flexion du coude/.test(t2.texte) && !t1.menu && !(await A.ev(`!!document.querySelector('.nb-barre')`)),
  '1d. clic sur le badge : bascule immédiate « IA » → « orig. » → « IA », texte affiché qui suit, sans menu ni sélection', `${t0.badge}/${t1.badge}/${t2.badge} — ${t1.texte}`);
await A.clic(await badgeMoy()); await A.dormir(300); // → orig.
await A.touche('z', { meta: true, code: 'KeyZ', vk: 90, commandes: ['undo'] }); await A.dormir(500);
const t3 = await texteMoy();
await A.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 4 | 8 }); await A.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 4 | 8 }); await A.dormir(500);
const t4 = await texteMoy();
ok(t3.badge === 'IA' && t4.badge === 'orig.', '1e. ⌘Z annule la bascule (retour « IA »), ⌘⇧Z la rétablit (« orig. »)', `${t3.badge} → ${t4.badge}`);
await A.clic(await badgeMoy()); await A.dormir(300); // retour IA
await A.capture('apres-badges-lecteur');
// export PDF annoté : aucun badge
await intercepter();
const n0 = await A.ev(`window.__tel.length`);
await A.clic(await A.pos(`document.querySelector('.mf-bouton')`)); await A.dormir(400);
await A.clic(await A.pos(`[...document.querySelectorAll('.mf-item')].find((b) => b.innerText.trim().startsWith('Exporter en PDF annoté'))`));
for (let i = 0; i < 100 && (await A.ev(`window.__tel.length`)) === n0; i++) await A.dormir(150);
const exp = await A.ev(`(async () => {
  const t = window.__tel[window.__tel.length - 1]; const buf = await (await fetch(t.href)).arrayBuffer();
  const P = await import(${url('/src/medrevise/pdf/pdfjsSetup.js')}); const doc = await P.openPdf(new Uint8Array(buf));
  const p = await doc.getPage(1); const tc = await p.getTextContent(); const mots = tc.items.map((i) => i.str);
  try { doc.loadingTask.destroy(); } catch (e) {}
  return { nom: t.nom, mots: mots.filter((s) => s.trim()), badge: mots.some((s) => /^\\s*(IA|orig\\.)\\s*$/.test(s)) };
})()`);
ok(/\.pdf$/.test(exp.nom) && !exp.badge && exp.mots.join(' ').includes('Biceps'), '1f. export PDF annoté : le texte des boîtes y est, aucun badge « IA » / « orig. »', `${exp.nom} — ${exp.mots.slice(0, 6).join(' | ')}`);

// 2. BARRE DES BOÎTES
const scroll0 = await A.ev(`document.querySelector('.pdfr-scroll').scrollTop`);
await selectionner('flexion du coude');
let b = await barre();
const rb = await A.ev(`(() => { const r = (${boite('flexion du coude')}).getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right }; })()`);
const anim = await A.ev(`getComputedStyle(document.querySelector('.nb-barre')).animationDuration`);
const scroll1 = await A.ev(`document.querySelector('.pdfr-scroll').scrollTop`);
await A.capture('apres-barre-boite-lecteur');
ok(b && b.h === 32 && b.boutons.length === 7 && b.boutons.every((x) => x.t === '' && x.w === 28 && x.tip) && b.y + b.h <= rb.top && rb.top - (b.y + b.h) <= 10,
  '2a. sélection → barre compacte juste au-dessus : 32 px de haut, 7 icônes de 28 px sans texte, infobulles', JSON.stringify(b && { w: b.w, h: b.h, ecart: Math.round(rb.top - b.y - b.h), icones: b.boutons.map((x) => x.l) }));
ok(anim === '0.12s' && scroll0 === scroll1, '2b. apparition animée 120 ms, sans saut de la page', `${anim}, défilement ${scroll0} → ${scroll1}`);
ok(!b.boutons.some((x) => /original|version/i.test(x.l)), '2c. « Voir l’original » n’est plus dans la barre');
// clic ailleurs sur la page
await A.clic(await A.ev(`(() => { const r = document.querySelector('.pdfr-page').getBoundingClientRect(); return [r.left + r.width * 0.85, r.top + r.height * 0.85]; })()`));
ok(await partie(), '2d. clic ailleurs sur la page → la barre disparaît seule');
await selectionner('flexion du coude');
await A.clic(await A.pos(`[...document.querySelectorAll('button')].find((x) => x.offsetParent && ((x.getAttribute('aria-label') || '') === 'Surligneur' || (x.title || '').startsWith('Surligneur —')))`));
ok(await partie(), '2e. changer d’outil (Surligneur) → la barre disparaît seule');
await A.clic(await A.pos(`[...document.querySelectorAll('button')].find((x) => x.offsetParent && ((x.getAttribute('aria-label') || '') === 'Sélection' || (x.title || '').startsWith('Sélection —')))`)); await A.dormir(300);
await selectionner('flexion du coude');
await A.clic(await A.pos(`[...document.querySelectorAll('button')].find((x) => x.offsetParent && ((x.getAttribute('aria-label') || '') === 'Sélection' || (x.title || '').startsWith('Sélection —')))`));
ok(await partie(), '2f. re-cliquer « Sélection » → la barre disparaît aussi');
// trait : outil Crayon, on sélectionne la boîte, puis on dessine
await A.clic(await A.pos(`[...document.querySelectorAll('button')].find((x) => x.offsetParent && ((x.getAttribute('aria-label') || '') === 'Crayon' || (x.title || '').startsWith('Crayon —')))`)); await A.dormir(300);
await selectionner('flexion du coude');
const sel3 = !!(await barre());
const pp = await A.ev(`(() => { const r = document.querySelector('.pdfr-page').getBoundingClientRect(); return [r.left + r.width * 0.2, r.top + r.height * 0.8]; })()`);
await A.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pp[0], y: pp[1], button: 'left', clickCount: 1 });
for (let k = 1; k <= 6; k++) await A.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pp[0] + k * 15, y: pp[1] + k * 4, button: 'left', buttons: 1 });
await A.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pp[0] + 90, y: pp[1] + 24, button: 'left', clickCount: 1 });
ok(sel3 && await partie(), '2g. commencer un trait → la barre disparaît seule', `sélectionnée avec le crayon : ${sel3}`);
// le trait de test est retiré s'il a été enregistré
if (await A.ev(`(async () => (await (${A.st}).getAll('annotations')).some((a) => a.ficheId === 'fMyo' && a.kind === 'trait'))()`)) { await A.touche('z', { meta: true, code: 'KeyZ', vk: 90, commandes: ['undo'] }); await A.dormir(300); }
await A.clic(await A.pos(`[...document.querySelectorAll('button')].find((x) => x.offsetParent && ((x.getAttribute('aria-label') || '') === 'Sélection' || (x.title || '').startsWith('Sélection —')))`)); await A.dormir(300);
// mode focus
await selectionner('flexion du coude');
await A.ev(`document.querySelector('.sb-focus').click(), 1`);
const focusOk = await partie();
const nav = await A.ev(`[...document.querySelectorAll('.sb-nav .sb-item')].map((e) => e.title)`);
await A.ev(`document.querySelector('.sb-focus').click(), 1`); await A.dormir(800);
ok(focusOk && JSON.stringify(nav) === '["Bibliothèque"]', '2h. passer en mode focus → la barre disparaît ; le focus ne garde que la Bibliothèque', JSON.stringify(nav));
await ouvrirFiche(A, 'Myologie'); await A.dormir(1200);
await A.ev(`document.querySelector('.pdfr-scroll').scrollTop = 0, 1`); await A.dormir(300);
await selectionner('flexion du coude');
await A.touche('Escape', { code: 'Escape', vk: 27 });
ok(await partie(), '2i. Échap → la barre disparaît (toujours possible, plus obligatoire)');
// les icônes
const etatB = (id) => A.ev(`(async () => { const a = await (${A.st}).getOne('annotations', '${id}'); return { ancre: !!a.ancre, fleche: !!a.fleche, couleur: a.couleur, fond: a.fond, reduite: !!a.reduite, existe: true }; })()`).catch(() => ({ existe: false }));
const icone = (l) => A.pos(`document.querySelector('.nb-barre button[aria-label="${l}"]')`);
await selectionner('flexion du coude');
await A.clic(await icone('Épingle')); await A.dormir(300);
const vise = await A.ev(`(document.querySelector('.nb-barre.vise') || {}).innerText || ''`);
await A.clic(await A.ev(`(() => { const r = document.querySelector('.pdfr-page').getBoundingClientRect(); return [r.left + r.width * 0.5, r.top + r.height * 0.05]; })()`)); await A.dormir(500);
let e1 = await etatB('anMoyenne');
ok(/Clique l’endroit/.test(vise) && e1.ancre, '2j. Épingle : visée (« Clique l’endroit à épingler… »), puis clic → épinglée', vise);
await selectionner('flexion du coude');
let ib = await barre();
await A.clic(await icone('Flèche')); await A.dormir(400);
e1 = await etatB('anMoyenne');
ok(ib.boutons.find((x) => x.l === 'Épingle') && e1.fleche && await A.ev(`!!document.querySelector('.nb-barre button[aria-label="Épingle"].actif') && !!document.querySelector('.nb-barre button[aria-label="Flèche"].actif')`), '2k. Flèche : tracée vers l’épingle ; l’état actif se lit sur l’icône (pas de texte)');
await A.clic(await icone('Relier')); await A.dormir(300);
const vise2 = await A.ev(`(document.querySelector('.nb-barre.vise') || {}).innerText || ''`);
await A.touche('Escape', { code: 'Escape', vk: 27 }); await A.dormir(300);
ok(/surlignage/.test(vise2), '2l. Relier : visée d’un surlignage ou d’une forme (Échap annule)', vise2);
await selectionner('flexion du coude');
await A.clic(await A.pos(`document.querySelector('.nb-barre .sc-bouton')`)); await A.dormir(400);
await A.capture('apres-barre-couleur');
await A.clic(await A.pos(`[...document.querySelectorAll('.sc-pop button, .sc-pop [role=button]')].find((x) => /sauge/i.test((x.title || '') + (x.getAttribute('aria-label') || '')))`)); await A.dormir(400);
e1 = await etatB('anMoyenne');
ok(e1.couleur === 'sauge', '2m. Couleur : la pastille ouvre la palette, « Vert sauge » appliqué', e1.couleur);
await selectionner('flexion du coude');
const f0 = (await etatB('anMoyenne')).fond;
await A.clic(await icone('Fond')); await A.dormir(300);
const f1 = (await etatB('anMoyenne')).fond;
await A.clic(await icone('Fond')); await A.dormir(300);
const f2 = (await etatB('anMoyenne')).fond;
ok(f0 === 'teinte' && f1 === 'plein' && f2 === 'transparent', '2n. Fond : teinté → plein → transparent', `${f0} → ${f1} → ${f2}`);
await A.clic(await icone('Réduire')); await A.dormir(400);
e1 = await etatB('anMoyenne');
const pastille = await A.ev(`!!document.querySelector('.note-box.reduite, .nb-reduite, [class*="reduite"]')`);
ok(e1.reduite && await partie() && await A.ev(`document.querySelectorAll('.note-box').length === 3 && !!document.querySelector('.pdfr-page')`), '2o. Réduire : la boîte devient pastille (la barre se retire avec la sélection)', `pastille ${pastille}`);
await A.touche('z', { meta: true, code: 'KeyZ', vk: 90, commandes: ['undo'] }); await A.dormir(500);
ok(!(await etatB('anMoyenne')).reduite, '2p. ⌘Z redéploie la boîte');
await selectionner('Triceps');
await A.clic(await icone('Supprimer')); await A.dormir(500);
const supp = await A.ev(`(async () => !(await (${A.st}).getOne('annotations', 'anSimple')))()`);
await A.touche('z', { meta: true, code: 'KeyZ', vk: 90, commandes: ['undo'] }); await A.dormir(600);
const rendu = await A.ev(`(async () => !!(await (${A.st}).getOne('annotations', 'anSimple')))()`);
ok(supp && rendu, '2q. Supprimer : la boîte part ; ⌘Z la rend');

// 3. BARRE LATÉRALE
const items = await A.ev(`(() => { const s = document.querySelector('.sidebar'); return { nav: [...s.querySelectorAll('.sb-nav .sb-item')].map((e) => e.title), pied: [...s.querySelectorAll('.sb-foot .sb-item, .sb-foot .sb-toggle, .sb-foot [aria-haspopup]')].map((e) => (e.querySelector('.sb-label') || e).innerText.trim()), eclair: !!s.querySelector('.sb-nav .sb-item[title="Apprentissage"] path[d^="M13 2"]') }; })()`);
ok(JSON.stringify(items.nav) === '["Accueil","Réviser","Apprentissage","Bibliothèque","Carnet d\'erreurs"]' && items.eclair, '3a. barre latérale : Accueil · Réviser · Apprentissage (icône éclair) · Bibliothèque · Carnet d’erreurs', JSON.stringify(items.nav));
ok(!items.pied.some((t) => /Prompts|Prise de notes|exos/.test(t)) && JSON.stringify(items.pied.filter((t) => t)) === '["Mode focus","Réglages","Changer d\'app","Réduire","Mon espace"]', '3b. sous le séparateur : Mode focus · Réglages · Changer d’app · Réduire · Mon espace (plus de Prompts)', JSON.stringify(items.pied));
await onglet(A, 'Réglages'); await A.dormir(1200);
const prompts = await A.ev(`(() => { const c = document.getElementById('reglages-prompts').closest('.card'); return { groupes: [...c.querySelectorAll('.cpm-pop-title')].map((g) => g.innerText), lignes: c.querySelectorAll('.cpm-row').length, modifier4: [...c.querySelectorAll('button')].filter((b) => /Modifier les 4/.test(b.innerText)).length }; })()`);
await A.clic(await A.pos(`document.getElementById('reglages-prompts').closest('.card').querySelector('.cpm-copy')`)); await A.dormir(400);
const copie = await A.ev(`navigator.clipboard.readText().then((t) => t.length)`).catch(() => -1);
await A.clic(await A.pos(`document.getElementById('reglages-prompts').closest('.card').querySelector('.cd-ic[title="Voir en entier"]')`)); await A.dormir(500);
const modale = await A.ev(`(document.querySelector('.day-pop') || {}).innerText?.slice(0, 60) || ''`);
await A.ev(`(document.getElementById('reglages-prompts').scrollIntoView({ block: 'start' }), 1)`);
await A.touche('Escape', { code: 'Escape', vk: 27 }); await A.dormir(400);
await A.ev(`document.getElementById('reglages-prompts').closest('.card').scrollIntoView({ block: 'center' }), 1`); await A.dormir(300);
await A.capture('apres-reglages-prompts');
ok(prompts.groupes.length === 3 && prompts.lignes === 9 && prompts.modifier4 === 2 && copie > 500 && modale.length > 0, '3c. Réglages → Prompts : 3 groupes, 9 prompts, « Modifier les 4 » ×2 ; copier et « Voir en entier » marchent', `${JSON.stringify(prompts)} · copié ${copie} car. · ${modale.replace(/\n/g, ' ').slice(0, 40)}`);
await A.ev(`document.getElementById('reglages-archives').scrollIntoView({ block: 'center' }), 1`); await A.dormir(300);
const arch = await A.ev(`[...document.querySelectorAll('.arch-doc')].map((d) => d.innerText.replace(/\\s+/g, ' ').slice(0, 90))`);
await A.clic(await A.pos(`[...document.querySelectorAll('.arch-doc button')].find((b) => b.innerText.trim() === 'Lire')`)); await A.dormir(300);
const lecture = await A.ev(`(document.querySelector('.arch-lecture') || {}).innerText || ''`);
await intercepter();
const n1 = await A.ev(`window.__tel.length`);
await A.clic(await A.pos(`[...document.querySelectorAll('.arch-doc button')].find((b) => /\\.md/.test(b.innerText))`)); await A.dormir(500);
const md = await A.ev(`(async () => { const t = window.__tel[window.__tel.length - 1]; return t ? { nom: t.nom, texte: await (await fetch(t.href)).text() } : null; })()`);
const nArchives = await A.ev(`document.querySelector('#reglages-archives').closest('.card').innerText`);
await A.ev(`document.querySelector('.arch-doc').scrollIntoView({ block: 'center' }), 1`); await A.dormir(300);
await A.capture('apres-reglages-archives');
ok(arch.length === 1 && /plexus brachial/.test(arch[0]) && /C5 à T1/.test(lecture) && /Tronc supérieur/.test(lecture) && md && /\.md$/.test(md.nom) && /# Notes — plexus brachial/.test(md.texte) && (await A.ev(`window.__tel.length`)) === n1 + 1 && /1 autre document/.test(nArchives),
  '3d. Réglages → Archives : le document de Prise de notes non rangé, lisible (surlignage + boîte), export .md ; le document rangé reste dans la Bibliothèque', `${arch[0]} · ${md && md.nom}`);
// liens internes et anciennes adresses
await A.ev(`(async () => { const s = [...document.querySelectorAll('.sb-item')].find((b) => b.title === 'Accueil'); s.click(); return 1; })()`);
for (const [adresse, attendu] of [['/medrevise/notes', /Réglages → Archives/], ['/medrevise#apprentissage', /Apprentissage \(exos\)/], ['/medrevise/prompts', /Réglages → Prompts/]]) {
  await A.send('Page.navigate', { url: 'http://localhost:5199' + adresse }); await A.dormir(3500);
  await A.attendre(`!!document.querySelector('[data-app="medrevise"]')`, 20000);
  await relever().catch(() => {}); await espion();
  const r = await A.ev(`({ avis: (document.querySelector('.avis-retire') || {}).innerText || '', adresse: location.pathname + location.hash, accueil: !!document.querySelector('.sb-item.active[title="Accueil"]') })`);
  if (adresse === '/medrevise/notes') await A.capture('apres-ancienne-adresse');
  ok(attendu.test(r.avis) && r.adresse === '/medrevise' && r.accueil, `3e. ancienne adresse ${adresse} → Accueil + message discret, adresse remise à /medrevise`, `${r.avis} · ${r.adresse}`);
}
// 4. COMPTES APRÈS (après rechargement, synchro)
await A.ev(`(window.dispatchEvent(new Event('online')), true)`); await A.dormir(4500);
const apres = await comptes();
ok(JSON.stringify(apres.stores) === JSON.stringify(avant.stores) && JSON.stringify(apres.diagnostic) === JSON.stringify(avant.diagnostic) && apres.journal === avant.journal, '4a. comptes APRÈS identiques (tous les stores, diagnostic, journal) : aucune donnée perdue', JSON.stringify(apres.stores));
const cloud = await (await fetch('http://localhost:54399/__etat')).json();
const parStore = (n) => cloud.rows.filter((r) => r.store === n && !r.deleted).length;
ok(parStore('notes') === 1 && parStore('apprentissage') === 1, '4b. les données des fonctions retirées restent synchronisées (faux cloud : notes 1, apprentissage 1)');
writeFileSync(`${captures}/comptes.json`, JSON.stringify({ avant, apres }, null, 2));
await relever();
ok(A.erreurs.length === 0 && erreursConsole.length === 0, 'aucune exception JavaScript ni erreur console (React)', [...A.erreurs, ...erreursConsole].join(' || ').slice(0, 2500));
A.fermer();
process.exit(bilan() ? 1 : 0);
