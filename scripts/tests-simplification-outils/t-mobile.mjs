// MOBILE (téléphone, 390 px : shell mobile, sans lecteur ni tableau) : l'app s'ouvre sans erreur ; un dessin envoyé par
// le téléphone (lib/dessins.js#envoyerDessin, la fonction du téléphone) arrive dans le lecteur par Insérer › Dessins du
// téléphone — pastille sur Insérer, menu, « Poser ».   node t-mobile.mjs
import { banc, FICHE } from './commun.mjs';
const b = await banc();
await b.preparer();
// 1) TÉLÉPHONE
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await b.c.send('Page.reload', { ignoreCache: true }); await b.dormir(4500);
if (await b.ev(`document.body.innerText.includes('Choisis ton espace')`)) { await b.ev(`[...document.querySelectorAll('.hub-card')].find(x=>/^\\s*MedRevise/i.test(x.innerText))?.click();1`); await b.dormir(2000); }
const mob = await b.ev(`({largeur:innerWidth,lecteur:!!document.querySelector('.pdfr-v2'),tableau:!!document.querySelector('.tb2'),texte:document.body.innerText.slice(0,80).replace(/\\n/g,' · ')})`);
b.ok(mob.largeur === 390 && !mob.lecteur && !mob.tableau, 'téléphone : l’app mobile s’ouvre (pas de lecteur ni de tableau sur ce format, inchangé)', JSON.stringify(mob));
await b.capture('so-mobile-accueil');
const envoi = await b.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const D=await import(u.find(n=>n.includes('/medrevise/lib/dessins.js'))||'/src/medrevise/lib/dessins.js');
  const c=document.createElement('canvas');c.width=300;c.height=200;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,300,200);x.strokeStyle='#1f6feb';x.lineWidth=6;x.beginPath();x.moveTo(30,150);x.bezierCurveTo(90,20,180,180,270,50);x.stroke();
  const png=await new Promise(ok=>c.toBlob(ok,'image/png'));const r=await D.envoyerDessin(png,{ficheId:${JSON.stringify(FICHE)},titre:'Schéma du néphron',largeur:300,hauteur:200});return {id:r.dessin.id,statut:r.statut}})()`);
b.ok(envoi && envoi.id, 'téléphone : dessin envoyé vers la fiche (statut ' + (envoi && envoi.statut) + ')');
b.ok(!b.erreurs.length, 'téléphone : aucune erreur', b.erreurs.join(' | '));
// 2) ORDINATEUR : le dessin arrive dans Insérer
await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: false });
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await b.ouvrirCours();
const pastille = await b.ev(`(document.querySelector('[data-outil="inserer"] .ptb-pastille-n')||{}).innerText||null`);
b.ok(pastille === '1', 'lecteur : pastille « 1 » sur Insérer (nouveau dessin du téléphone)', String(pastille));
await b.outil6('inserer');
const dess = await b.pos(`document.querySelector('.ptb-inserer .ptb-dessins')`, false);
b.ok(!!dess, 'Insérer › « Dessins » (du téléphone) dans la sous-barre');
await b.capRect('so-sous-inserer-dessin', `document.querySelector('.pdfr-contexte')`, 4);
await b.clic(dess, { att: 700 });
const liste = await b.ev(`[...document.querySelectorAll('.md-menu .od-item, .md-menu [class*="carte"], .md-menu li')].length || document.querySelectorAll('.md-menu button').length`);
await b.clic(await b.pos(`[...document.querySelectorAll('.md-menu button')].find(e=>e.innerText.trim()==='Poser')`, false), { att: 1200 });
const images = (await b.enBase()).filter((a) => a.kind === 'image');
b.ok(images.length === 1, 'le dessin se pose sur la page depuis Insérer › Dessins', JSON.stringify({ liste, images: images.length }));
// nettoyage : le dessin de test retiré de la liste
await b.S(`for(const d of await S.getAll('dessins'))if(d.ficheId===${JSON.stringify(FICHE)})await S.remove('dessins',d.id);return 1`);
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
