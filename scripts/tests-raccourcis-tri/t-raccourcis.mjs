// ⌘1 … ⌘9 dans le lecteur PDF et l'éditeur de document : outils dans l'ordre de la barre,
// chiffres en maintenant ⌘ (fondu 150 ms), preventDefault seulement quand le lecteur a le focus,
// jamais dans un champ de saisie, infobulles « Surligneur · ⌘2 ». Ordinateur puis tablette.
import { ouvrir, clavier, sonde, dernierePression, outilActif } from './commun.mjs';

const ORDRE = ['Sélection', 'Surligneur', 'Boîte', 'Texte', 'Forme', '?', 'Crayon', 'Gomme'];
async function scenario(b, nom, { doc = false, tablette = false } = {}) {
  const k = clavier(b);
  await sonde(b);
  const sel = tablette ? '.pdfr-barre .tab-outil' : '.pdfr-barre .ptb-outil';
  // infobulles
  const titres = await b.ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(x=>x.title)`);
  const attendus = ORDRE.map((o, i) => `${o} · ⌘${i + 1}`);
  b.ok(attendus.every((a, i) => titres[i] && titres[i].startsWith(a)), `${nom} : infobulles « Surligneur · ⌘2 »…`, titres.slice(0, 3).map((t) => t.split(' — ')[0]).join(' | '));
  b.ok(titres.some((t) => /^Image · ⌘9/.test(t)) || (await b.ev(`[...document.querySelectorAll('.pdfr-barre button')].some(x=>/· ⌘9 : image/.test(x.title))`)), `${nom} : Image · ⌘9`);
  // le lecteur a le focus : clic sur la page
  const page = await b.dans(`document.querySelector('.pdfr-scroll')`, 0.5, 0.45);
  await b.clic(page, { att: 300 });
  // chiffres en maintenant ⌘
  await k.metaBas(); await b.dormir(60);
  const pendant = await b.ev(`(()=>{const n=document.querySelector('.pdfr-barre .ptb-num');return {cls:document.querySelector('.pdfr-barre').classList.contains('raccourcis-visibles'),op:getComputedStyle(n).opacity,tr:getComputedStyle(n).transitionDuration,nb:document.querySelectorAll('.pdfr-barre .ptb-num').length}})()`);
  await b.dormir(250);
  const opPlein = await b.ev(`getComputedStyle(document.querySelector('.pdfr-barre .ptb-num')).opacity`);
  const chiffres = await b.ev(`[...document.querySelectorAll('.pdfr-barre .ptb-num')].map(n=>n.textContent).join('')`);
  const sous = await b.ev(`(()=>{const n=document.querySelector('.pdfr-barre .ptb-num').getBoundingClientRect();const ic=document.querySelector(${JSON.stringify(sel)}+' svg').getBoundingClientRect();return n.top>=ic.bottom-1&&Math.abs((n.left+n.width/2)-(ic.left+ic.width/2))<3})()`);
  await b.capture(`rt-${nom}-chiffres`);
  b.ok(pendant.cls && pendant.tr === '0.15s' && opPlein === '1' && chiffres === '123456789' && sous, `${nom} : ⌘ maintenu → chiffres 1–9 sous les icônes (fondu 150 ms)`, JSON.stringify({ ...pendant, opPlein, chiffres, sous }));
  await k.metaHaut(); await b.dormir(250);
  b.ok(await b.ev(`getComputedStyle(document.querySelector('.pdfr-barre .ptb-num')).opacity`) === '0', `${nom} : ⌘ relâché → chiffres masqués`);
  // ⌘1 … ⌘8 : chaque outil, dans l'ordre de la barre (en partant de la fin pour éviter tout « déjà actif »)
  const vus = [];
  for (const n of [2, 3, 4, 5, 6, 7, 8, 1]) {
    await k.cmd(n);
    const a = await outilActif(b); const p = await dernierePression(b);
    vus.push(`⌘${n}→${a}${p && p.prevented ? '' : ' (non intercepté !)'}`);
    if (a !== ORDRE[n - 1] || !p || !p.prevented) { b.ok(false, `${nom} : ⌘${n}`, vus.join(' ')); break; }
    if (n !== 1) { await k.cmd(1); } // retour à la Sélection (sortie propre des outils de pose)
  }
  b.ok(vus.length === 8 && !vus.some((v) => /non/.test(v)), `${nom} : ⌘1–⌘8 activent les outils dans l'ordre, interceptés (pas de changement d'onglet)`, vus.join(' '));
  // ⌘9 = Image : ouvre le choix du fichier
  await b.c.send('Page.setInterceptFileChooserDialog', { enabled: true });
  let choix = 0; b.c.on((m) => { if (m.method === 'Page.fileChooserOpened') choix++; });
  await k.cmd(9); await b.dormir(400);
  b.ok(choix === 1 && (await dernierePression(b)).prevented, `${nom} : ⌘9 → Image (choix du fichier ouvert)`);
  await b.c.send('Page.setInterceptFileChooserDialog', { enabled: false });
  // ⌘3 deux fois : reste « Boîte » (sélectionne, ne bascule pas)
  await k.cmd(3); await k.cmd(3);
  b.ok(await outilActif(b) === 'Boîte', `${nom} : ⌘3 répété reste sur Boîte`);
  await k.cmd(1);
  return k;
}

// ---------------- ordinateur, cours PDF ----------------
let b = await ouvrir({ ecran: 'aucun' });
b.ok(await b.ouvrir('Membre supérieur — repères'), 'cours PDF ouvert');
await b.attendre(`document.querySelector('.pdfr-barre .ptb-outil')`);
let k = await scenario(b, 'pdf');
// boîte de texte : ⌘1 n'active rien et n'est pas intercepté
await k.cmd(3);
const pt = await b.dans(`document.querySelector('.pdfr-scroll')`, 0.4, 0.35);
await b.clic(pt, { att: 700 });
const dansBoite = await b.ev(`(()=>{const a=document.activeElement;return a&&(a.isContentEditable||a.tagName==='TEXTAREA')?a.tagName+'.'+a.className:null})()`);
await b.ecrire('note');
const avant = await outilActif(b);
await k.cmd(1);
const p1 = await dernierePression(b);
b.ok(!!dansBoite && (await outilActif(b)) === avant && p1 && !p1.prevented, '⌘1 dans une boîte de texte : rien n’est activé, pas d’interception', `${dansBoite} · outil ${await outilActif(b)} · prevented ${p1 && p1.prevented}`);
await b.T.Escape(); await b.T.Escape(); await b.dormir(300);
// annule la boîte de test (journal ⌘Z), base locale du banc
await b.ev(`document.activeElement&&document.activeElement.blur&&document.activeElement.blur();1`);
await b.c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 4 }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 4 }); await b.dormir(500);
// champ de recherche du lecteur
await b.c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70, modifiers: 4 }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70, modifiers: 4 }); await b.dormir(300);
const enRecherche = await b.ev(`document.activeElement.tagName`);
await k.cmd(2);
let p = await dernierePression(b);
b.ok(enRecherche === 'INPUT' && (await outilActif(b)) === 'Sélection' && !p.prevented, '⌘2 dans la recherche du lecteur : rien, pas d’interception');
// ⌘ maintenu dans un champ : pas de chiffres
await k.metaBas(); await b.dormir(250);
b.ok(!(await b.ev(`document.querySelector('.pdfr-barre').classList.contains('raccourcis-visibles')`)), '⌘ maintenu dans un champ : pas de chiffres');
await k.metaHaut();
await b.T.Escape(); await b.ev(`document.activeElement.blur();1`);
// focus hors du lecteur (barre de navigation de l'app) : pas d'interception
await b.ev(`(()=>{const e=document.querySelector('.sb-item');e.setAttribute('tabindex','0');e.focus();return document.activeElement===e})()`);
await k.cmd(2);
p = await dernierePression(b);
b.ok((await outilActif(b)) === 'Sélection' && !p.prevented, 'focus hors du lecteur : ⌘2 laissé au navigateur');
await b.ev(`document.activeElement.blur();1`);
// Ctrl+2 sur Mac : laissé tel quel (Ctrl+1–9 = Windows/Linux)
await b.c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: '2', code: 'Digit2', windowsVirtualKeyCode: 50, modifiers: 2 }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: '2', code: 'Digit2', windowsVirtualKeyCode: 50, modifiers: 2 }); await b.dormir(200);
b.ok((await outilActif(b)) === 'Sélection', 'Mac : Ctrl+2 n’active rien (⌘ seulement)');
b.ok(b.erreurs.length === 0, '0 erreur console (pdf)', b.erreurs.join(' | '));
b.c.fermer();

// ---------------- ordinateur, éditeur de document ----------------
b = await ouvrir({ ecran: 'aucun' });
b.ok(await b.ouvrir('Myologie (document)'), 'document ouvert');
await b.attendre(`document.querySelector('.pdfr-barre .ptb-outil') && document.querySelector('.pt-flux-cadre .ProseMirror')`, 10000);
k = await scenario(b, 'document', { doc: true });
// dans le TEXTE du document (c'est le document, pas un champ) : ⌘2 marche
const txt = await b.dans(`document.querySelector('.pt-flux-cadre .ProseMirror p')`, 0.3, 0.5);
await b.clic(txt, { att: 300 });
await b.ev(`(()=>{const pm=document.querySelector('.pt-flux-cadre .ProseMirror');if(!document.activeElement.closest('.pt-flux-cadre'))pm.focus();return 1})()`); await b.dormir(200);
const dansTexte = await b.ev(`!!document.activeElement.closest('.pt-flux-cadre')`);
await k.cmd(2); p = await dernierePression(b);
b.ok(dansTexte && (await outilActif(b)) === 'Surligneur' && p.prevented, 'document : ⌘2 depuis le texte du document → Surligneur', JSON.stringify({ dansTexte, outil: await outilActif(b), p }));
await k.cmd(1);
b.ok(b.erreurs.length === 0, '0 erreur console (document)', b.erreurs.join(' | '));
b.c.fermer();

// ---------------- tablette (paysage, clavier) ----------------
b = await ouvrir({ ecran: 'aucun', W: 1180, H: 820, tactile: true });
b.ok(await b.ouvrir('Membre supérieur — repères'), 'tablette : cours ouvert');
await b.attendre(`document.querySelector('.pdfr-barre .tab-outil')`, 8000);
if (await b.ev(`!!document.querySelector('.pdfr-barre .tab-outil')`)) await scenario(b, 'tablette', { tablette: true });
else b.ok(false, 'tablette : barre tablette absente');
b.ok(b.erreurs.length === 0, '0 erreur console (tablette)', b.erreurs.join(' | '));
b.c.fermer();
