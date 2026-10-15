// Boîtes (fond plein par défaut) + sélecteur de couleur sur une boîte : hex tapé, collé, curseurs,
// aperçu en direct, Entrée / Échap / clic ailleurs, récentes, annuler / rétablir.
import { banc, rgb } from './commun.mjs';
const b = await banc();
console.log('nettoyage :', await b.nettoyer(['f-fj']), 'annotations de test retirées');
// deux boîtes « d'avant » : une sans `fond` (rendu d'origine), une transparente (défaut du 09/10)
await b.S(`const doc=(t)=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:t}]}]});
await S.put('annotations',{...S.newNoteBox({ficheId:'f-fj',page:1,x:0.05,y:0.62,width:0.2,height:0.05,couleur:'vert'}),content:doc('Ancienne sans fond'),fond:undefined});
await S.put('annotations',{...S.newNoteBox({ficheId:'f-fj',page:1,x:0.3,y:0.62,width:0.2,height:0.05,couleur:'ardoise',fond:'transparent'}),content:doc('Ancienne transparente')});return 1`);
await b.ev(`localStorage.removeItem('medrevise.fondBoite');localStorage.removeItem('medrevise.couleursPerso');1`);
b.ok(await b.ouvrir('Physiologie rénale (jumelle)', { recharger: true }), 'cours ouvert');
const etat = () => b.S(`return JSON.stringify((await S.getAll('annotations')).filter(a=>a.ficheId==='f-fj'&&a.kind==='libre').map(a=>({id:a.id,c:a.couleur,f:a.fond,t:(a.content&&JSON.stringify(a.content).match(/"text":"([^"]*)"/)||[])[1]})))`);
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await b.dormir(600);
const avant = JSON.parse(await etat());
const rendusAvant = await b.ev(`JSON.stringify([...document.querySelectorAll('.note-box')].filter(n=>n.innerText.includes('Ancienne')).map(n=>n.innerText+' '+getComputedStyle(n).backgroundColor+' '+getComputedStyle(n).borderColor))`);
const pg = await b.rect(`[...document.querySelectorAll('.pdfr-textlayer span')][0].closest('.pdfr-page')`);
// 1) nouvelle boîte = fond plein
await b.clic(await b.bouton('Boîte'));
await b.clic([pg.x + pg.w * 0.55, pg.y + pg.h * 0.45], { att: 800 });
await b.ecrire('Boîte A pleine');
await b.T.Escape(); await b.T.Escape(); await b.dormir(400);
let boites = JSON.parse(await etat());
const A = boites.find((x) => !avant.some((y) => y.id === x.id));
b.ok(A && A.f === 'plein', 'nouvelle boîte créée en fond « plein »', JSON.stringify(A));
const styleA = await b.ev(`(()=>{const e=[...document.querySelectorAll('.note-box')].find(n=>n.innerText.includes('Boîte A'));const s=getComputedStyle(e);return s.backgroundColor+' | texte '+s.color})()`);
b.ok(styleA.startsWith('rgba(245, 165, 36, 0.92)') && styleA.includes('22, 22, 42'), 'fond ambre plein, texte SOMBRE sur couleur claire', styleA);
await b.capt('boite-A-pleine');
// 2) sélectionner A, ouvrir sa couleur → Personnalisée
const selA = `[...document.querySelectorAll('.note-box')].find(n=>n.innerText.includes('Boîte A'))`;
await b.clic(await b.pos(selA, false), { att: 700 });
await b.clic(await b.pos(`document.querySelector('.nb-actions .sc-bouton')`, false), { att: 400 });
b.ok(await b.ev(`!!document.querySelector('.sc-pop')`), 'barre de la boîte : panneau des couleurs ouvert');
b.ok(await b.ev(`[...document.querySelectorAll('.sc-pop .sc-pastille')].length>=6 && !!document.querySelector('.sc-pop .sc-roue-btn.avec-libelle')`), '6 couleurs de base + « Personnalisée »');
await b.clic(await b.pos(`document.querySelector('.sc-pop .sc-roue-btn')`, false), { att: 500 });
const fen = await b.rect(`document.querySelector('.sc-fenetre')`);
b.ok(fen && fen.y >= 0 && fen.b <= 900 && fen.r <= 1440, 'panneau entièrement dans l’écran', JSON.stringify(fen));
b.ok(await b.ev(`document.activeElement && document.activeElement.classList.contains('sc-hex')`), 'le champ hex a le focus (souris)');
await b.capt('perso-panneau');
// hex TAPÉ, sans #
await b.touche('a', { meta: true });
await b.ecrire('1e88e5');
await b.dormir(200);
b.ok((await b.fond(selA)).includes(rgb('#1e88e5')), 'aperçu EN DIRECT sur la boîte pendant la frappe', await b.fond(selA));
b.ok(JSON.parse(await etat()).find((x) => x.id === A.id).c === 'ambre', 'rien n’est écrit pendant l’aperçu');
b.ok(!(await b.ev(`${selA}.innerText`)).includes('1e88e5'), 'la frappe ne va PAS dans le texte de la boîte (bug d’avant)');
const styleBleu = await b.ev(`getComputedStyle(${selA}).color`);
b.ok(styleBleu.includes('255, 255, 255'), 'couleur foncée : texte CLAIR (contraste auto)', styleBleu);
await b.T.Enter(); await b.dormir(400);
b.ok(!(await b.ev(`!!document.querySelector('.sc-fenetre')`)), 'Entrée : panneau fermé');
b.ok(JSON.parse(await etat()).find((x) => x.id === A.id).c === '#1e88e5', 'Entrée : couleur validée et enregistrée (#1e88e5)');
b.ok(await b.ev(`(JSON.parse(localStorage.getItem('medrevise.couleursPerso')||'[]'))[0]==='#1e88e5'`), 'ajoutée aux Récentes');
// 3) annuler / rétablir
await b.clic(await b.pos(`document.querySelector('.pdfr-page canvas')`, false), { att: 300 }); // désélectionner
await b.touche('z', { meta: true }); await b.dormir(500);
b.ok(JSON.parse(await etat()).find((x) => x.id === A.id).c === 'ambre', '⌘Z : une seule entrée d’annuler → ambre');
await b.touche('z', { meta: true, shift: true }); await b.dormir(500);
b.ok(JSON.parse(await etat()).find((x) => x.id === A.id).c === '#1e88e5', '⌘⇧Z : rétabli → #1e88e5');
// 4) COLLER un hex puis Échap = annuler
await b.clic(await b.pos(selA, false), { att: 700 });
await b.clic(await b.pos(`document.querySelector('.nb-actions .sc-bouton')`, false), { att: 400 });
await b.clic(await b.pos(`document.querySelector('.sc-pop .sc-roue-btn')`, false), { att: 500 });
await b.c.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: 'http://localhost:5199' });
await b.ev(`navigator.clipboard.writeText('color: #E53935;')`);
await b.touche('a', { meta: true });
await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', modifiers: 4, windowsVirtualKeyCode: 86, commands: ['paste'] });
await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', modifiers: 4, windowsVirtualKeyCode: 86 });
await b.dormir(300);
b.ok((await b.ev(`document.querySelector('.sc-hex').value`)) === 'e53935', 'hex COLLÉ (« color: #E53935; » → e53935)', await b.ev(`document.querySelector('.sc-hex').value`));
b.ok((await b.fond(selA)).includes(rgb('#e53935')), 'aperçu rouge sur la boîte');
// saisie invalide : signalée, rien d'appliqué
await b.touche('a', { meta: true }); await b.ecrire('12x');
b.ok(await b.ev(`document.querySelector('.sc-hex-champ').classList.contains('invalide')`), 'saisie invalide « 12x » signalée en direct');
await b.T.Escape(); await b.dormir(400);
b.ok(!(await b.ev(`!!document.querySelector('.sc-fenetre')`)), 'Échap : panneau fermé');
b.ok((await b.fond(selA)).includes(rgb('#1e88e5')), 'Échap : l’ancienne couleur revient à l’écran', await b.fond(selA));
b.ok(JSON.parse(await etat()).find((x) => x.id === A.id).c === '#1e88e5', 'Échap : rien d’écrit');
// 5) CURSEURS : teinte + carré, puis clic ailleurs = valider
if (!(await b.ev(`!!document.querySelector('.sc-pop')`))) await b.clic(await b.pos(`document.querySelector('.nb-actions .sc-bouton')`, false), { att: 400 });
await b.clic(await b.pos(`document.querySelector('.sc-pop .sc-roue-btn')`, false), { att: 500 });
const t0 = await b.ev(`document.querySelector('.sc-teinte').getAttribute('aria-valuenow')`);
await b.glisser(await b.dans(`document.querySelector('.sc-teinte')`, 0.6, 0.5), await b.dans(`document.querySelector('.sc-teinte')`, 0.85, 0.5));
const t1 = await b.ev(`document.querySelector('.sc-teinte').getAttribute('aria-valuenow')`);
b.ok(Math.abs(t1 - 306) < 6, 'curseur de TEINTE glissé', `${t0}° → ${t1}°`);
await b.glisser(await b.dans(`document.querySelector('.sc-carre')`, 0.5, 0.5), await b.dans(`document.querySelector('.sc-carre')`, 0.9, 0.2));
const hexCurseurs = await b.ev(`'#'+document.querySelector('.sc-hex').value`);
b.ok(await b.ev(`document.querySelector('.sc-carre').getAttribute('aria-valuetext')`) === 'saturation 90 %, luminosité 80 %', 'carré SATURATION/LUMINOSITÉ glissé', await b.ev(`document.querySelector('.sc-carre').getAttribute('aria-valuetext')`) + ' → ' + hexCurseurs);
b.ok((await b.fond(selA)).includes(rgb(hexCurseurs)), 'aperçu en direct suit les curseurs', await b.fond(selA));
await b.capt('perso-curseurs');
await b.clic([pg.x + 30, pg.y + pg.h * 0.9], { att: 500 }); // clic ailleurs sur la page
b.ok(JSON.parse(await etat()).find((x) => x.id === A.id).c === hexCurseurs, 'clic ailleurs : couleur des curseurs validée', hexCurseurs);
// 6) changer le fond en teinté → la suivante est teintée ; A et les anciennes inchangées
await b.clic(await b.pos(selA, false), { att: 700 });
await b.clic(await b.pos(`document.querySelector('.nb-actions .nb-fond')`, false), { att: 400 }); // plein → transparent
await b.clic(await b.pos(`document.querySelector('.nb-actions .nb-fond')`, false), { att: 400 }); // transparent → teinté
b.ok(JSON.parse(await etat()).find((x) => x.id === A.id).f === 'teinte', 'boîte A passée en « teinté »');
await b.T.Escape(); await b.dormir(300);
await b.clic(await b.bouton('Boîte'));
await b.clic([pg.x + pg.w * 0.2, pg.y + 560], { att: 800 });
await b.ecrire('Boîte B suivante');
await b.T.Escape(); await b.T.Escape(); await b.dormir(400);
boites = JSON.parse(await etat());
const B = boites.find((x) => x.t && x.t.includes('Boîte B'));
b.ok(B && B.f === 'teinte', 'la boîte SUIVANTE naît « teinté » (dernier choix mémorisé)', JSON.stringify(B));
b.ok(await b.ev(`localStorage.getItem('medrevise.fondBoite')`) === 'teinte', 'défaut mémorisé sur l’appareil (localStorage)');
const anciennes = avant.map((x) => JSON.stringify(x));
b.ok(avant.length === 2 && avant.every((x) => JSON.stringify(boites.find((y) => y.id === x.id)) === JSON.stringify(x)), `les ${avant.length} boîtes d’avant sont inchangées en base`, avant.map((x) => x.f || '(sans fond)').join(', '));
const rendusApres = await b.ev(`JSON.stringify([...document.querySelectorAll('.note-box')].filter(n=>n.innerText.includes('Ancienne')).map(n=>n.innerText+' '+getComputedStyle(n).backgroundColor+' '+getComputedStyle(n).borderColor))`);
b.ok(rendusAvant === rendusApres && JSON.parse(rendusAvant).length === 2, 'et leur rendu à l’écran aussi', rendusAvant);
await b.capt('boites-A-B');
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
