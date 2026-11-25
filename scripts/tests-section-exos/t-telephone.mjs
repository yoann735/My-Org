// 5) Téléphone (shell téléphone, tactile 390×844) : accès depuis l'accueil, grille (2 colonnes égales), liste, filtre,
//    créer / modifier / supprimer une notion au doigt, ouvrir une notion et ses fichiers (les lecteurs : t-lecteurs.mjs tel).
import { appareil, gestes, fixtures, dormir } from './commun.mjs';
const f = await fixtures();
const b = await appareil('tel');
const g = gestes(b);
await b.ouvrirApp(); await b.attendreSynchro();
b.ok(await b.ev(`!!document.querySelector('.mrm-app') && !document.querySelector('.sidebar')`), 'shell téléphone');
b.ok(await b.ev(`!!document.querySelector('[data-entree="exos"]')`), 'accueil : carte « Exos »');
await b.ev(`(document.querySelector('[data-entree="exos"]').scrollIntoView({ block: 'center' }), 1)`); await dormir(300);
await b.capture('tel-accueil');
b.ok(await g.allerExos(), 'toucher « Exos » : la page s’ouvre');
await b.attendre(`document.querySelectorAll('.exo-carte').length >= 2`, 20000);
await b.attendre(`document.querySelectorAll('.exo-carte .exo-apercu.image img').length === document.querySelectorAll('.exo-carte').length`, 20000);
const cols = await b.ev(`(() => { const c = [...document.querySelectorAll('.exo-carte')].slice(0, 2).map((x) => x.getBoundingClientRect()); return { l: c.map((r) => Math.round(r.width)), memeLigne: Math.round(c[0].top) === Math.round(c[1].top), debord: document.documentElement.scrollWidth > innerWidth || document.querySelector('.exo-ecran').scrollWidth > innerWidth }; })()`);
b.ok(cols.l[0] === cols.l[1] && cols.memeLigne && !cols.debord, 'grille : 2 colonnes de même largeur, pas de débordement', JSON.stringify(cols));
await b.capture('tel-grille');
await b.clic(`document.querySelector('.exo-actions [aria-label="Liste"]')`);
b.ok(await b.ev(`document.querySelectorAll('.exo-ligne').length >= 2`), 'liste');
await b.capture('tel-liste');
await b.clic(`document.querySelector('.exo-actions [aria-label="Grille"]')`);
await b.clic(`document.querySelector('.exo-filtre')`);
await b.clic(`[...document.querySelectorAll('.ctx-menu-item')].find((x) => /Physiologie rénale/.test(x.innerText))`);
const filtrees = await g.cartes();
await b.clic(`document.querySelector('.exo-filtre')`);
await b.clic(`[...document.querySelectorAll('.ctx-menu-item')].find((x) => /Tous/.test(x.innerText))`);
b.ok(filtrees.length >= 1 && filtrees.length < (await g.cartes()).length, 'filtre par cours', filtrees.join(' · '));

// créer au doigt
await b.N(`for (const n of await N.lireNotions()) if (/^Notion téléphone/.test(n.nom)) await S.remove('exo_notion', n.id); return 1`); await dormir(400);
b.ok(await g.nouvelle(), 'feuille « Nouvelle notion »');
await g.remplir({ nom: 'Notion téléphone', cours: 'Physiologie rénale', exos: [f('QCM-acido-basique.html')] });
await b.capture('tel-feuille');
b.ok(await g.valider(), 'créer au doigt');
b.ok(await b.attendre(`document.querySelector('.exo-titre-notion') && document.querySelector('.exo-titre-notion').innerText === 'Notion téléphone'`, 5000), 'vue de la notion');
await b.capture('tel-notion');
// ouvrir l'exo HTML et répondre
await g.ouvrirTuile('QCM');
b.ok(await b.attendre(`!!document.querySelector('.exo-html-frame')`, 6000), 'exo HTML ouvert plein écran');
await dormir(1000);
const sid = await b.contexteIframe();
const fr = await b.rect(`document.querySelector('.exo-html-frame')`);
const r = await b.ev(`(() => { const q = document.querySelector('#r1b').getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; })()`, sid);
await b.point(fr.x + r.x, fr.y + r.y, 400);
b.ok((await b.ev(`document.querySelector('#r1b').className`, sid)) === 'ok', 'au doigt : la bonne réponse se colore');
await b.capture('tel-lecteur-html');
await b.clic(`document.querySelector('.exo-html-barre .icon-btn')`, 500);
// modifier : renommer
await g.modifier();
await g.remplir({ nom: 'Notion téléphone (modifiée)' });
await g.valider();
b.ok((await g.notions()).some((n) => n.nom === 'Notion téléphone (modifiée)'), 'modifier au doigt (renommer)');
// supprimer
await b.clic(`document.querySelector('.exo-tete-actions .icon-btn')`, 400);
await b.clic(`[...document.querySelectorAll('.ctx-menu-item')].find((x) => /Supprimer/.test(x.innerText))`, 500);
const txt = await b.ev(`(document.querySelector('.day-pop') || {}).innerText || ''`);
b.ok(/Supprimer « Notion téléphone \(modifiée\) » et son fichier \?/.test(txt), 'supprimer : confirmation', txt.replace(/\s+/g, ' ').slice(0, 90));
await b.clic(`[...document.querySelectorAll('.day-pop button')].find((x) => /^Supprimer$/.test(x.innerText.trim()))`, 800);
b.ok(await b.attendre(`!!document.querySelector('.exo-grille') && ![...document.querySelectorAll('.lv-carte-titre')].some((e) => /Notion téléphone/.test(e.innerText))`, 5000), 'notion supprimée, retour à la grille');
// retour à l'accueil
await b.clic(`document.querySelector('.exo-topbar .icon-btn[aria-label="Retour à l’accueil"]')`, 600);
b.ok(await b.attendre(`!!document.querySelector('[data-entree="exos"]')`, 4000), 'retour à l’accueil du téléphone');
await b.synchro();
process.exitCode = b.fin();
b.fermerWs();
