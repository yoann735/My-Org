// (20/10) Sélecteur de couleur « façon Word » : grille du thème 10 × 6, récentes (8), pipette (EyeDropper ou
// prélèvement sur le canvas du PDF), autres couleurs (roue + hex), Aucune (fond), aperçu en direct, Échap annule,
// Entrée / clic ailleurs valide, Annuler couvert ; cellules ≥ 32 px au doigt. Cours « Rein v3 », base LOCALE.
// Usage : node t-couleurs.mjs [ordi|tablette]
import { banc } from './commun.mjs';
const appareil = process.argv[2] || 'ordi';
const tablette = appareil === 'tablette';
const b = await banc(1440, 900, { tactile: tablette });
await b.S(`for(const a of await S.getAll('annotations'))if(a.ficheId==='f-v3-rein')await S.remove('annotations',a.id);return 1`);
await b.biblio({ recharger: true });
await b.ouvrir('Rein v3'); await b.dormir(1500);
if (tablette) { await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 1, mobile: true }); await b.dormir(1800); }
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(500);
const panneau = () => b.ev(`(()=>{const p=document.querySelector('.scw-panneau');if(!p||getComputedStyle(p).visibility!=='visible')return null;const r=p.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,cellules:p.querySelectorAll('.scw-grille .scw-cellule').length,lignes:p.querySelectorAll('.scw-grille .scw-ligne').length,recentes:p.querySelectorAll('.scw-recentes .scw-cellule').length,taille:Math.round(p.querySelector('.scw-cellule').getBoundingClientRect().width),actions:[...p.querySelectorAll('.scw-action')].map(a=>a.innerText.trim())}})()`);
const cellule = (l, c) => b.pos(`document.querySelectorAll('.scw-panneau .scw-grille .scw-ligne')[${l}].querySelectorAll('.scw-cellule')[${c}]`, false);
const valeurCellule = (l, c) => b.ev(`document.querySelectorAll('.scw-panneau .scw-grille .scw-ligne')[${l}].querySelectorAll('.scw-cellule')[${c}].dataset.valeur`);

// --- 1. outil Surligneur : la rangée → « Plus de couleurs » → panneau
await b.outil('Surligneur');
await b.clic(await b.pos(`document.querySelector('.pdfr-contexte .sc-roue-btn')`, false), { att: 400 });
let P = await panneau();
b.ok(P && P.cellules === 60 && P.lignes === 6, 'panneau : grille « Couleurs du thème » 10 teintes × (1 + 5 variantes)', JSON.stringify(P && { c: P.cellules, l: P.lignes }));
b.ok(P && P.actions.join('|') === 'Pipette|Autres couleurs', 'actions : Pipette, Autres couleurs (pas « Aucune » hors fond)', P && P.actions.join('|'));
if (tablette) b.ok(P && P.taille >= 32, 'au doigt : cellules ≥ 32 px', String(P && P.taille));
else b.ok(P && P.taille >= 20, 'à la souris : cellules de 20 px', String(P && P.taille));
b.ok(P && P.x >= 0 && P.y >= 0 && P.x + P.w <= (tablette ? 1024 : 1440) && P.y + P.h <= (tablette ? 1366 : 900), 'panneau entièrement dans l’écran', JSON.stringify(P));
await b.capture(`couleurs-panneau-${appareil}`, { x: Math.max(0, Math.round(P.x) - 12), y: Math.max(0, Math.round(P.y) - 60), width: Math.round(P.w) + 24, height: Math.round(P.h) + 72 });
// clic sur une variante : l'outil la prend, le panneau se ferme, elle entre dans les récentes
const v23 = await valeurCellule(2, 3);
await b.clic(await cellule(2, 3), { att: 400 });
b.ok(!(await panneau()), 'clic sur une case : valide et referme');
const recentes = await b.ev(`JSON.parse(localStorage.getItem('medrevise.couleursPerso')||'[]')`);
b.ok(recentes[0] === v23, 'la variante choisie entre en tête des « Couleurs récentes »', `${v23} / ${recentes.slice(0, 3)}`);
b.ok(await b.ev(`!!document.querySelector('.pdfr-contexte .sc-pastille[title="Récente ${v23}"].actif')`), 'la rangée de l’outil montre la couleur choisie (récente, active)');

// --- 2. une boîte : aperçu en direct, Échap annule, clic valide, Annuler
await b.outil('Boîte');
const page = await b.rect(`document.querySelector('.pdfr-page[data-cle="1"]')`);
await b.clic([page.x + page.w * 0.5, page.y + page.h * 0.5], { att: 700 });
await b.ecrire('Boîte couleur'); await b.dormir(300);
const boite = await b.S(`const l=(await S.getAll('annotations')).filter(a=>a.ficheId==='f-v3-rein'&&a.type==='boite');return l[0]&&{id:l[0].id,couleur:l[0].couleur}`);
const bord = () => b.ev(`getComputedStyle(document.querySelector('.note-box.active')||document.querySelector('.note-box')).borderTopColor`);
const bord0 = await bord();
await b.clic(await b.pos(`document.querySelector('.nb-barre [aria-label="Couleur de la boîte"]')`, false), { att: 400 });
P = await panneau();
b.ok(!!P, 'barre de la boîte : le MÊME panneau');
const c45 = await cellule(4, 5);
await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c45[0], y: c45[1] }); await b.dormir(250);
const bordApercu = await bord();
b.ok(bordApercu !== bord0, 'survol d’une case : aperçu EN DIRECT sur la boîte', `${bord0} → ${bordApercu}`);
await b.T.Escape(); await b.dormir(300);
b.ok(!(await panneau()) && (await bord()) === bord0, 'Échap : panneau fermé, l’ancienne couleur revient');
b.ok((await b.S(`return (await S.getOne('annotations',${JSON.stringify(boite.id)})).couleur`)) === boite.couleur, '… et rien n’est écrit');
await b.clic(await b.pos(`document.querySelector('.nb-barre [aria-label="Couleur de la boîte"]')`, false), { att: 400 });
const v45 = await valeurCellule(4, 5);
await b.clic(await cellule(4, 5), { att: 500 });
b.ok((await b.S(`return (await S.getOne('annotations',${JSON.stringify(boite.id)})).couleur`)) === v45, 'clic : la boîte prend la couleur (une écriture)', v45);
await b.T.Escape(); await b.dormir(200);
await b.touche('z', { meta: true }); await b.dormir(500);
b.ok((await b.S(`return (await S.getOne('annotations',${JSON.stringify(boite.id)})).couleur`)) === boite.couleur, 'Annuler : la couleur d’avant revient (une seule entrée)', boite.couleur);

// --- 3. clavier : flèches = aperçu, Entrée valide ; clic ailleurs valide la case choisie au clavier
const activer = async () => { const r = await b.rect(`document.querySelector('.note-box')`); await b.clic([r.x + 8, r.y + 5], { att: 400 }); };
await b.outil('Sélection'); await activer();
await b.clic(await b.pos(`document.querySelector('.nb-barre [aria-label="Couleur de la boîte"]')`, false), { att: 400 });
// la boîte est « ambre » (case 0,2) : → → ↓ mène à la case (1,4)
await b.touche('ArrowRight', { vk: 39 }); await b.touche('ArrowRight', { vk: 39 }); await b.touche('ArrowDown', { vk: 40 });
const v12 = await valeurCellule(1, 4);
b.ok(await b.ev(`!!document.querySelector('.scw-cellule.choisie[data-valeur="${v12}"]')`), 'flèches : la case choisie est mise en évidence', v12);
await b.T.Enter(); await b.dormir(500);
b.ok((await b.S(`return (await S.getOne('annotations',${JSON.stringify(boite.id)})).couleur`)) === v12, 'Entrée : valide la case choisie au clavier', v12);
await activer();
await b.clic(await b.pos(`document.querySelector('.nb-barre [aria-label="Couleur de la boîte"]')`, false), { att: 400 });
await b.touche('ArrowRight', { vk: 39 }); await b.dormir(100); // depuis la couleur actuelle (1,4) → (1,5)
const v01 = await valeurCellule(1, 5);
await b.clic([page.x + page.w * 0.15, page.y + page.h * 0.9], { att: 500 });
b.ok((await b.S(`return (await S.getOne('annotations',${JSON.stringify(boite.id)})).couleur`)) === v01, 'clic ailleurs : valide la case choisie au clavier', v01);

// --- 4. pipette SANS EyeDropper : prélèvement sur le canvas du PDF (bandeau bleu de la diapo)
await b.ev(`window.__eyeDropperOrig = window.EyeDropper; window.EyeDropper = undefined; 1`);
await activer();
await b.clic(await b.pos(`document.querySelector('.nb-barre [aria-label="Couleur de la boîte"]')`, false), { att: 400 });
await b.clic(await b.pos(`[...document.querySelectorAll('.scw-action')].find(a=>a.innerText.includes('Pipette'))`, false), { att: 300 });
b.ok(await b.ev(`!!document.querySelector('.scw-pipette')`), 'pipette (sans EyeDropper) : mode prélèvement sur la page');
const cible = [page.x + page.w * 0.8, page.y + page.h * 0.04];
await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cible[0], y: cible[1] }); await b.dormir(250);
const loupe = await b.ev(`(document.querySelector('.scw-loupe')||{}).innerText||''`);
const attendu = await b.ev(`(()=>{const c=document.querySelector('.pdfr-page[data-cle="1"] canvas');const r=c.getBoundingClientRect();const d=c.getContext('2d').getImageData(Math.floor((${cible[0]}-r.left)/r.width*c.width),Math.floor((${cible[1]}-r.top)/r.height*c.height),1,1).data;return '#'+[d[0],d[1],d[2]].map(x=>x.toString(16).padStart(2,'0')).join('')})()`);
b.ok(loupe.trim() === attendu, 'pipette : la loupe montre la couleur du PDF sous le pointeur (aperçu)', `${loupe.trim()} / pixel ${attendu}`);
await b.capture(`couleurs-pipette-${appareil}`, { x: Math.round(cible[0]) - 160, y: Math.max(0, Math.round(cible[1]) - 60), width: 320, height: 140 });
await b.clic(cible, { att: 500 });
b.ok((await b.S(`return (await S.getOne('annotations',${JSON.stringify(boite.id)})).couleur`)) === attendu, 'clic : la boîte prend la couleur prélevée', attendu);
// --- 5. pipette AVEC EyeDropper (API simulée : le navigateur rend #123456)
await b.ev(`window.EyeDropper = class { open() { return Promise.resolve({ sRGBHex: '#123456' }); } }; 1`);
await activer();
await b.clic(await b.pos(`document.querySelector('.nb-barre [aria-label="Couleur de la boîte"]')`, false), { att: 400 });
await b.clic(await b.pos(`[...document.querySelectorAll('.scw-action')].find(a=>a.innerText.includes('Pipette'))`, false), { att: 500 });
b.ok((await b.S(`return (await S.getOne('annotations',${JSON.stringify(boite.id)})).couleur`)) === '#123456', 'pipette avec l’API EyeDropper : sa couleur est prise', '#123456');
await b.ev(`window.EyeDropper = window.__eyeDropperOrig; 1`);
// --- 6. autres couleurs : la roue + champ hex
await activer();
await b.clic(await b.pos(`document.querySelector('.nb-barre [aria-label="Couleur de la boîte"]')`, false), { att: 400 });
await b.clic(await b.pos(`[...document.querySelectorAll('.scw-action')].find(a=>a.innerText.includes('Autres'))`, false), { att: 400 });
b.ok(await b.ev(`!!document.querySelector('.sc-perso-panneau .sc-carre') && !!document.querySelector('.sc-perso-panneau .sc-teinte')`), 'Autres couleurs : roue (teinte) + carré saturation / luminosité + hex');
await b.capture(`couleurs-roue-${appareil}`, await b.ev(`(()=>{const r=document.querySelector('.sc-perso-panneau').getBoundingClientRect();return {x:Math.round(r.x)-8,y:Math.round(r.y)-8,width:Math.round(r.width)+16,height:Math.round(r.height)+16}})()`));
await b.ev(`(()=>{const t=document.querySelector('.sc-perso-panneau .sc-hex');t.focus();t.select();return 1})()`);
await b.remplir(`document.querySelector('.sc-perso-panneau .sc-hex')`, '00aa55'); await b.dormir(150);
await b.T.Enter(); await b.dormir(500);
b.ok((await b.S(`return (await S.getOne('annotations',${JSON.stringify(boite.id)})).couleur`)) === '#00aa55', 'roue : #00aa55 saisi puis Entrée → appliqué', '#00aa55');
const rec = await b.ev(`JSON.parse(localStorage.getItem('medrevise.couleursPerso')||'[]')`);
b.ok(rec[0] === '#00aa55' && rec.includes('#123456'), 'récentes : roue et pipette s’y ajoutent', rec.slice(0, 4).join(' '));
await activer();
await b.clic(await b.pos(`document.querySelector('.nb-barre [aria-label="Couleur de la boîte"]')`, false), { att: 400 });
P = await panneau();
b.ok(P && P.recentes === Math.min(8, rec.length), 'panneau : « Couleurs récentes » (8 au plus)', `${P && P.recentes} / ${rec.length}`);
await b.T.Escape(); await b.dormir(200);
// --- 7. « Aucune » pour le fond du texte (rangée de mise en forme de la boîte)
await b.ev(`(()=>{const pm=document.querySelector('.note-box.active .ProseMirror');pm.focus();const s=getSelection();s.selectAllChildren(pm);return 1})()`); await b.dormir(200);
await b.clic(await b.pos(`document.querySelector('.pdfr-contexte [aria-label="Surligneur de fond du texte sélectionné"]')`, false), { att: 400 });
P = await panneau();
b.ok(P && P.actions.includes('Aucune'), 'fond du texte : action « Aucune » présente', P && P.actions.join('|'));
await b.clic(await cellule(1, 2), { att: 400 });
const avecFond = await b.ev(`document.querySelector('.note-box.active .ProseMirror').innerHTML.includes('background-color')`);
await b.ev(`(()=>{const pm=document.querySelector('.note-box.active .ProseMirror');pm.focus();getSelection().selectAllChildren(pm);return 1})()`); await b.dormir(150);
await b.clic(await b.pos(`document.querySelector('.pdfr-contexte [aria-label="Surligneur de fond du texte sélectionné"]')`, false), { att: 400 });
await b.clic(await b.pos(`[...document.querySelectorAll('.scw-action')].find(a=>a.innerText.includes('Aucune'))`, false), { att: 400 });
const sansFond = await b.ev(`!document.querySelector('.note-box.active .ProseMirror').innerHTML.includes('background-color')`);
b.ok(avecFond && sansFond, '« Aucune » retire le fond du texte', `avec ${avecFond}, sans ${sansFond}`);
await b.T.Escape(); await b.dormir(200); await b.outil('Sélection');
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
process.exit(0);
