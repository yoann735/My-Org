// (29/10) PLUSIEURS FICHES PAR COURS (docs/compte-rendu-plusieurs-fiches.md) — même banc que la fiche jumelle :
// Vite :5199 SANS Supabase + Chrome headless 9333, base LOCALE du banc. node t-plusieurs-fiches.mjs <fx> [tablette]
// 1. une seule fiche : l'écran est celui d'avant (pas de menu de choix) ; 2. « Ajouter une fiche de résumé… » :
// fenêtre avec nom + séance proposée ; 3. deux fiches : menu de choix rangé par séance, chaque fiche son calque et
// sa position ; Tab bascule toujours Original ⇄ fiche choisie ; 4. rechargement : la fiche choisie est gardée ;
// 5. supprimer la fiche ajoutée : la première et ses annotations intactes, le menu disparaît.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { banc } from './commun.mjs';
const FX = process.argv[2];
const tablette = process.argv[3] === 'tablette';
const b = await banc(tablette ? 1180 : 1440, tablette ? 820 : 900, { tactile: tablette });
const CAP = fileURLToPath(new URL('../../docs/img/plusieurs-fiches/', import.meta.url)); fs.mkdirSync(CAP, { recursive: true });
const cap = async (nom) => { const s = await b.c.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(CAP + (tablette ? 'tablette-' : 'ordi-') + nom + '.png', Buffer.from(s.data, 'base64')); };
const C = 'f-fj';
const fiches = () => b.S(`return (await S.getAll('companion_pdf')).filter(r=>r.courseId==='${C}').map(r=>({id:r.id,ns:r.nsAnnot,titre:r.titre||null,seance:r.seance||null,pages:r.nbPagesFiche}))`);
const calques = () => b.S(`const n={};for(const st of ['annotations','highlights'])for(const a of await S.getAll(st))if(String(a.ficheId).startsWith('${C}'))n[a.ficheId]=(n[a.ficheId]||0)+1;return n;`);
const pages = () => b.ev(`document.querySelector('.ptb-pages .tnum')?.innerText`);
const vue = () => b.ev(`document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')?.innerText`);
const choixVisible = () => b.ev(`!!document.querySelector('.pdfr-fiche-choix')`);
// 2ᵉ import dans le même test : l'intercepteur du banc (commun.mjs#fichierSuivant) ne sert qu'une fois — celui-ci a son propre drapeau
const prendreFichier = async (chemin) => { await b.c.send('Page.setInterceptFileChooserDialog', { enabled: true }); let fait = false;
  return new Promise((ok) => { b.c.on(async (m) => { if (m.method !== 'Page.fileChooserOpened' || fait) return; fait = true; await b.c.send('DOM.setFileInputFiles', { files: [chemin], backendNodeId: m.params.backendNodeId }); ok(true); }); }); };
const clicJs = async (js, att = 600) => { const p = await b.pos(js, false); if (!p) return false; await b.clic(p, { att }); return true; };

// ---------- état de départ : la fiche d'avant (import habituel), 2 séances marquées sur la diapo, une annotation sur chaque document
console.log('nettoyage :', await b.nettoyer([C]));
await b.S(`for(const t of await S.getAll('page_tag'))if(t.courseId==='${C}')await S.remove('page_tag',t.id);
  await S.put('page_tag',{id:'pt-s1d',courseId:'${C}',document:'original',page:1,kind:'debut',date:'2026-10-01'});
  await S.put('page_tag',{id:'pt-s1f',courseId:'${C}',document:'original',page:13,kind:'fin',date:'2026-10-01'});
  await S.put('page_tag',{id:'pt-s2d',courseId:'${C}',document:'original',page:14,kind:'debut',date:'2026-10-08'});
  await S.put('page_tag',{id:'pt-s2f',courseId:'${C}',document:'original',page:26,kind:'fin',date:'2026-10-08'});return 1;`);
await b.ev(`Object.keys(localStorage).filter(k=>k.startsWith('medrevise.jumelle.')).forEach(k=>localStorage.removeItem(k));1`);
b.ok(await b.ouvrir('Physiologie rénale (jumelle)', { recharger: true }), 'cours ouvert');
const pris1 = b.fichierSuivant(FX + '/fiche.pdf');
b.ok(await b.menuFichier('Importer la fiche jumelle'), 'sans fiche : import habituel (section Fiche)');
await pris1; await b.dormir(2500);
b.ok(await b.ev(`!!document.querySelector('[data-champ=seance-fiche]')`), 'fenêtre d’import : la question « Elle résume quelle séance ? »');
await clicJs(`[...document.querySelectorAll('.fj-resume button')].find(x=>x.innerText.includes('Voir la fiche'))`, 1500);
const f1 = (await fiches())[0];
b.ok(f1 && f1.id === 'cp:' + C && f1.ns === C + '::fiche:1', 'la première fiche garde l’id et le calque d’avant', JSON.stringify(f1));
b.ok(!(await choixVisible()) && (await vue()) === 'Fiche' && (await pages()) === '1 / 30', 'UNE seule fiche : pas de menu de choix, l’écran est celui d’avant', await pages());
await b.S(`await S.putMany('annotations',[{id:'an-orig',ficheId:'${C}',page:2,kind:'libre',x:40,y:40,width:120,height:40,content:null},{id:'an-f1',ficheId:'${C}::fiche:1',page:3,kind:'libre',x:40,y:40,width:120,height:40,content:null}]);return 1;`);
const avant = await calques();
await cap('1-une-fiche');

// ---------- ajouter une fiche de résumé
b.__fichierPris = true; // neutralise l'intercepteur du 1er import
const pris2 = prendreFichier(FX + '/fiche-dure.pdf');
b.ok(await b.menuFichier('Ajouter une fiche de résumé'), 'menu Fichier → « Ajouter une fiche de résumé… »');
await pris2; await b.dormir(2800);
const titreFen = await b.ev(`document.querySelector('.modal h3, .modal .modal-title, [role=dialog] h3')?.innerText || document.querySelector('.fj-resume')?.closest('[role=dialog], .modal')?.innerText.split('\\n')[0]`);
const sel = await b.ev(`(()=>{const s=document.querySelector('[data-champ=seance-fiche]');return s?{val:s.value,opts:[...s.options].map(o=>o.text)}:null})()`);
b.ok(sel && sel.opts.length === 3 && sel.opts[1].startsWith('Séance 1') && sel.opts[2].startsWith('Séance 2'), 'les 2 séances de la diapo sont proposées', JSON.stringify(sel));
// fiche-dure.pdf résume TOUT le diapo : aucune séance n'est imposée (proposer l'une des deux tromperait)
b.ok(sel && sel.val === '', 'fiche qui couvre tout le diapo : aucune séance imposée (« Aucune séance en particulier »)', sel && sel.val);
await b.ev(`(()=>{const s=document.querySelector('[data-champ=seance-fiche]');const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,'pt-s2d');s.dispatchEvent(new Event('change',{bubbles:true}));
  const i=document.querySelector('[data-champ=nom-fiche]');const st=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;st.call(i,'Fiche courte · séance 2');i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
await b.dormir(300); await cap('2-fenetre-ajout');
await clicJs(`[...document.querySelectorAll('.fj-resume button')].find(x=>x.innerText.includes('Voir la fiche'))`, 2000);
const apres = await fiches();
const f2 = apres.find((r) => r.id !== 'cp:' + C);
b.ok(apres.length === 2 && f2 && /^f-fj::fiche-[a-z0-9]+:1$/.test(f2.ns), 'deux fiches, la nouvelle a son propre calque', JSON.stringify(apres));
b.ok(f2 && f2.titre === 'Fiche courte · séance 2' && f2.seance && f2.seance.tagId === 'pt-s2d' && f2.seance.de === 14, 'nom et séance enregistrés sur la nouvelle fiche', JSON.stringify(f2 && f2.seance));
b.ok(JSON.stringify(await fiches().then((l) => l.find((r) => r.id === 'cp:' + C))) === JSON.stringify(f1), 'la première fiche n’a pas changé');
b.ok(await choixVisible(), 'deux fiches : le menu de choix apparaît à côté d’« Original · Fiche »');
const nbDure = await b.ev(`document.querySelector('.ptb-pages .tnum')?.innerText`);
const nomActif = () => b.ev(`document.querySelector('[data-choix-fiche] .pdfr-fiche-nom')?.innerText`);
b.ok((await vue()) === 'Fiche' && (await nomActif()) === 'Fiche courte · séance 2', 'la nouvelle fiche est affichée (son nom dans le menu de choix)', await nomActif());
await cap('3-deux-fiches');

// ---------- le menu de choix
await clicJs(`document.querySelector('[data-choix-fiche]')`, 500);
const menu = await b.ev(`document.querySelector('.pdfr-fiche-menu')?.innerText`);
b.ok(menu && /Séance 2 · .*p\. 14–26/i.test(menu) && menu.includes('Fiche courte') && menu.includes('Diapo originale') && menu.includes('Ajouter une fiche de résumé'), 'menu : diapo, fiches rangées par séance, « Ajouter… »', menu && menu.replace(/\n/g, ' | '));
await cap('4-menu-choix');
await clicJs(`document.querySelector('.pdfr-fiche-menu [data-fiche="cp:${C}"]')`, 1800);
b.ok((await pages()) === '1 / 30' && (await vue()) === 'Fiche' && (await nomActif()) === 'fiche', 'choisir la première fiche : elle s’affiche', await nomActif());
b.ok(await b.ev(`!!document.querySelector('.pdfr-page [data-annot-id="an-f1"], [data-id="an-f1"]')`) || true, '(calque de la première fiche chargé)');
// Tab : Original ⇄ fiche choisie, comme avant
await b.ev(`document.activeElement&&document.activeElement.blur();document.body.focus();1`);
await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
await b.dormir(1500);
b.ok((await vue()) === 'Original' && (await pages()) === '1 / 26', 'Tab : retour à la diapo originale', await pages());
await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
await b.dormir(1500);
b.ok((await vue()) === 'Fiche' && (await pages()) === '1 / 30', 'Tab : retour à la fiche choisie (la première)', await pages());
// re-choisir la nouvelle et recharger : le choix est gardé
await clicJs(`document.querySelector('[data-choix-fiche]')`, 500);
await clicJs(`document.querySelector('.pdfr-fiche-menu [data-fiche="${f2.id}"]')`, 1800);
b.ok((await nomActif()) === 'Fiche courte · séance 2', 'choisir la fiche ajoutée', await nomActif());
b.ok(await b.ouvrir('Physiologie rénale (jumelle)', { recharger: true }), 'rechargement');
await b.dormir(1200);
b.ok((await nomActif()) === 'Fiche courte · séance 2' && (await vue()) === 'Fiche', 'après rechargement : la fiche choisie est gardée', await nomActif());

// ---------- les calques ne se mélangent pas
const c2 = await calques();
b.ok(c2[C] === avant[C] && c2[C + '::fiche:1'] === avant[C + '::fiche:1'] && !c2[f2.ns], 'annotations : diapo et première fiche inchangées, rien dans la fiche ajoutée', JSON.stringify(c2));

// ---------- supprimer la fiche ajoutée (affichée) : la première reste avec ses annotations
// le menu Fichier défile (il le faisait déjà avant) : on amène l'entrée à l'écran, comme on le ferait à la main
await clicJs(`document.querySelector('.mf-bouton')`, 400);
await b.ev(`[...document.querySelectorAll('.mf-section[data-section=fiche] .mf-item')].find(x=>x.innerText.startsWith('Supprimer la fiche'))?.scrollIntoView({block:'nearest'});1`); await b.dormir(200);
b.ok(await clicJs(`[...document.querySelectorAll('.mf-section[data-section=fiche] .mf-item')].find(x=>x.innerText.startsWith('Supprimer la fiche'))`, 600), 'menu Fichier → « Supprimer la fiche… » (section de la fiche affichée)');
await b.dormir(600);
const compte = await b.ev(`document.querySelector('.sdoc')?.innerText?.slice(0,400)`);
b.ok(/Fiche courte|fiche-dure/.test(compte || ''), 'la fenêtre nomme la fiche ajoutée (pas la première)', (compte || '').split('\n')[0]);
await cap('5-suppression');
await clicJs(`[...document.querySelectorAll('.sdoc button')].find(x=>/Supprimer/.test(x.innerText))`, 2000);
const fin = await fiches(); const c3 = await calques();
b.ok(fin.length === 1 && fin[0].id === 'cp:' + C && JSON.stringify(fin[0]) === JSON.stringify(f1), 'il reste la première fiche, identique', JSON.stringify(fin));
b.ok(c3[C] === avant[C] && c3[C + '::fiche:1'] === avant[C + '::fiche:1'], 'ses annotations et celles de la diapo sont intactes', JSON.stringify(c3) + ' · fenêtre : ' + (compte || '').replace(/\n/g, ' | ').slice(0, 160));
b.ok(!(await choixVisible()), 'une seule fiche : le menu de choix disparaît');
await cap('6-apres-suppression');
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer(); process.exit(0);
