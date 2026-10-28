// Échap n'annule plus la création / modification d'une flashcard (28/10). Rejouer tests-par-cours-elements/seed.mjs avant.
// Argument « tablette » : 820×1180 tactile (panneau en volet), sinon ordinateur 1440×900.
// Pour chaque sorte (Texte, Muscle, Tableau, Molécule) : saisie, Échap (×2) → formulaire là, saisie intacte, focus sorti du
// champ ; Échap ferme d'abord le menu « Amorce » / la liste de la molécule ; clics dehors (PDF, barre, autre carte) → rien
// n'est perdu ; seul « Annuler » ferme. Puis la MODIFICATION d'une carte Texte et de l'ancienne carte Muscle.
import { banc, COURS } from './commun.mjs';
const tab = process.argv[2] === 'tablette';
const b = await banc(false, 1440, 900); // (la Bibliothèque se replie sous 900 px : le cours s'ouvre en 1 440, puis tablette)
const v = b.v, P = tab ? 'tab-' : '';
const empreinte = (ids) => b.S(`const q=(await S.getAll('questions')).filter(x=>${JSON.stringify(ids)}.includes(x.id)).sort((a,c)=>a.id<c.id?-1:1);const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(q)));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,16)`);
const nbF1 = () => b.S(`return (await S.getAll('questions')).filter(q=>q.ficheId==='f1').length`);
v(await b.ouvrirCours(COURS[0], { recharger: true }), 'cours « Cours 1 — Rein » ouvert');
const tablette = async () => {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: false });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  // vrais taps au doigt
  b.toucher = async (js, att = 350) => {
    await b.ev(`(() => { const e = ${js}; e && e.scrollIntoView && e.scrollIntoView({ block: 'center' }); return 1; })()`); await b.dormir(150);
    const r = await b.rect(js); if (!r) throw new Error('introuvable : ' + js);
    await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.cx, y: r.cy }] }); await b.dormir(50);
    await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await b.dormir(att); return r;
  };
  await b.dormir(1200);
  if (!(await b.ev(`!!document.querySelector('.pm-seg-btn')`))) { await b.ev(`(()=>{const x=[...document.querySelectorAll('button')].find(e=>/Panneau/.test(e.title||e.getAttribute('aria-label')||e.textContent||''));x&&x.click();return 1})()`); await b.dormir(900); }
};
if (tab) await tablette();
await b.ongletFlashcards();
const n0 = await nbF1();
await b.toucher(`document.querySelector('.fcl-nouvelle')`, 800);
v(await b.form(), 'formulaire « Nouvelle carte » ouvert');

const DEHORS = async (quoi) => {
  // un vrai clic / tap hors du formulaire : la page du cours, puis l'en-tête du panneau
  const pdf = await b.rect(`document.querySelector('.pdfr-scroll')`);
  if (pdf) await b.toucher(`document.querySelector('.pdfr-scroll')`, 500);
  await b.toucher(`document.querySelector('.fcl-outils, .pm-actions')`, 400);
  return b.form();
};

// ---- Texte ----
const recto = `document.querySelector('.fc-carte [aria-label="Recto"]')`, verso = `document.querySelector('.fc-carte [aria-label="Verso"]')`;
await b.focusEcrire(recto, 'Quel est le rôle de la macula densa ?');
await b.focusEcrire(verso, 'Détecter le NaCl du tubule distal');
await b.echap();
let a = await b.actif();
v(await b.form() && !/TEXTAREA|INPUT/.test(a), 'Texte : Échap → le formulaire reste, le focus sort du champ', a);
await b.echap();
v(await b.form(), 'Texte : 2ᵉ Échap (hors champ) → rien ne se ferme');
v((await b.ev(`${recto}.value`)) === 'Quel est le rôle de la macula densa ?' && (await b.ev(`${verso}.value`)) === 'Détecter le NaCl du tubule distal', 'Texte : recto et verso intacts');
// menu Amorce ouvert : Échap ne ferme QUE le menu
await b.toucher(`document.querySelector('.fc-carte .mam-bouton')`, 500);
v(await b.ev(`document.querySelector('.fc-carte .mam-bouton').getAttribute('aria-expanded')`) === 'true', 'menu « Amorce » ouvert');
await b.capture(P + 'echap-amorce-ouvert');
await b.echap();
v((await b.ev(`document.querySelector('.fc-carte .mam-bouton').getAttribute('aria-expanded')`)) === 'false' && await b.form() && (await b.ev(`${recto}.value`)).includes('macula'), 'Échap ferme le menu « Amorce » seulement ; brouillon intact');
v(await DEHORS(), 'Texte : clics dehors (page du cours, barre du panneau) → le formulaire reste');
v((await b.ev(`${verso}.value`)) === 'Détecter le NaCl du tubule distal', 'Texte : verso intact après les clics dehors');

// ---- Muscle ----
await b.sorte('muscle');
await b.focusEcrire(`document.querySelector('.fc-carte [hidden] ~ div:not([hidden]) #mu-topographie, .fc-carte div:not([hidden]) > .aif-champs #mu-topographie, #mu-topographie')`, 'Loge antérieure du bras');
await b.focusEcrire(`[...document.querySelectorAll('.fc-carte .mu-form input, .fc-carte input.imp-title')].find(i=>/Grand glutéal/.test(i.placeholder)&&i.offsetParent)`, 'Brachial');
await b.echap(); await b.echap();
a = await b.actif();
v(await b.form() && !/TEXTAREA|INPUT/.test(a) && (await b.ev(`document.querySelector('#mu-topographie').value`)) === 'Loge antérieure du bras', 'Muscle : Échap ×2 → formulaire là, Topographie intacte, focus sorti', a);
v(await DEHORS(), 'Muscle : clics dehors → le formulaire reste');

// ---- Tableau ----
await b.sorte('tableau');
await b.focusEcrire(`document.querySelector('.fc-carte [data-champ="titre"]')`, 'Segments du néphron');
await b.focusEcrire(`document.querySelector('.fc-carte [data-cellule="0:0"]')`, 'Tubule proximal');
await b.echap(); await b.echap();
v(await b.form() && (await b.ev(`document.querySelector('.fc-carte [data-cellule="0:0"]').value`)) === 'Tubule proximal' && (await b.ev(`document.querySelector('.fc-carte [data-champ="titre"]').value`)) === 'Segments du néphron', 'Tableau : Échap ×2 → titre et cellule intacts');
v(await DEHORS(), 'Tableau : clics dehors → le formulaire reste');

// ---- Molécule (liste de suggestions ouverte : Échap la ferme d'abord) ----
await b.sorte('molecule');
await b.attendre(`!!document.querySelector('#mol-nom')`, 15000); await b.dormir(800);
await b.focusEcrire(`document.querySelector('#mol-nom')`, 'Alan');
const listeOuverte = await b.ev(`!!document.querySelector('.mol-sugg, .mol-liste, [role=listbox]')`);
await b.echap();
a = await b.actif();
v(await b.form() && (await b.ev(`document.querySelector('#mol-nom').value`)) === 'Alan', `Molécule : 1er Échap → ${listeOuverte ? 'la liste se ferme' : 'rien ne se ferme'}, nom intact`, a);
await b.echap(); await b.echap();
v(await b.form() && (await b.ev(`document.querySelector('#mol-nom').value`)) === 'Alan', 'Molécule : Échap répétés → formulaire là, nom intact');
v(await DEHORS(), 'Molécule : clics dehors → le formulaire reste');

// ---- retour sur chaque sorte : rien n'a été perdu ----
await b.sorte('standard');
v((await b.ev(`${recto}.value`)).includes('macula'), 'retour sur Texte : recto toujours là');
await b.sorte('muscle');
v((await b.ev(`document.querySelector('#mu-topographie').value`)) === 'Loge antérieure du bras', 'retour sur Muscle : Topographie toujours là');
await b.sorte('tableau');
v((await b.ev(`document.querySelector('.fc-carte [data-champ="titre"]').value`)) === 'Segments du néphron', 'retour sur Tableau : titre toujours là');
await b.capture(P + 'echap-brouillon-intact', await b.ev(`(()=>{const r=document.querySelector('.fc-carte').getBoundingClientRect();return {x:r.x-6,y:Math.max(0,r.y-6),width:r.width+12,height:Math.min(innerHeight-Math.max(0,r.y-6),r.height+12)}})()`));
v((await nbF1()) === n0, 'aucune carte créée par Échap ni par les clics');
// seul « Annuler » ferme
await b.toucher(`[...document.querySelectorAll('.fc-carte div:not([hidden]) > .aif-champs .imp-actions button, .fc-carte .imp-actions button')].find(x=>/Annuler/.test(x.textContent)&&x.offsetParent)`, 600);
v(!(await b.form()), '« Annuler » ferme le formulaire');

// ---- MODIFICATION : carte Texte existante ----
const id = 'c1-rev1';
const h0 = await empreinte([id]);
await b.survol(b.carteListe(id));
await b.toucher(`${b.carteListe(id)}.querySelector('[data-act="modifier"]')`, 800);
v(await b.ev(`!!document.querySelector('.fc-carte.edition')`), 'modification de « Cours 1 · c1-rev1 » ouverte');
await b.focusEcrire(`document.querySelector('.fc-carte.edition [aria-label="Verso"]')`, ' (modifié)');
await b.echap(); await b.echap();
v(await b.ev(`!!document.querySelector('.fc-carte.edition')`) && /\(modifié\)$/.test(await b.ev(`document.querySelector('.fc-carte.edition [aria-label="Verso"]').value`)), 'modification : Échap ×2 → formulaire là, saisie en cours intacte');
v(await DEHORS() && await b.ev(`!!document.querySelector('.fc-carte.edition')`), 'modification : clics dehors → le formulaire reste');
await b.toucher(`[...document.querySelectorAll('.fc-carte.edition .imp-actions button')].find(x=>/Annuler/.test(x.textContent)&&x.offsetParent)`, 600);
v(!(await b.ev(`!!document.querySelector('.fc-carte.edition')`)) && (await empreinte([id])) === h0, '« Annuler » ferme ; carte en base inchangée');

// ---- MODIFICATION : l'ancienne carte Muscle (cours témoin) ----
const hm = await empreinte(['temoin-muscle']);
if (tab) await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await b.ouvrirCours('Cours témoin'); if (tab) await tablette(); await b.ongletFlashcards();
await b.survol(b.carteListe('temoin-muscle'));
await b.toucher(`${b.carteListe('temoin-muscle')}.querySelector('[data-act="modifier"]')`, 800);
const lignes = await b.ev(`[...document.querySelectorAll('.fc-carte.edition .mu-saisie-ligne')].map(l=>[l.querySelector('label').textContent,l.querySelector('textarea').value])`);
v(lignes.length === 6 && lignes[5][0] === 'Topographie' && lignes[5][1] === '' && lignes[4][1] === 'Nerf musculo-cutané', 'ancienne carte Muscle en modification : 6 lignes, Topographie vide, les 5 autres intactes', JSON.stringify(lignes.map((l) => l[0] + '=' + (l[1] || '∅'))));
await b.focusEcrire(`document.querySelector('.fc-carte.edition #mu-action')`, ', supination');
await b.echap(); await b.echap();
v(await b.ev(`!!document.querySelector('.fc-carte.edition')`) && (await b.ev(`document.querySelector('.fc-carte.edition #mu-action').value`)).includes(', supination'), 'Muscle en modification : Échap ×2 → saisie intacte');
await b.capture(P + 'echap-muscle-edition', await b.ev(`(()=>{const r=document.querySelector('.fc-carte.edition').getBoundingClientRect();return {x:r.x-6,y:Math.max(0,r.y-6),width:r.width+12,height:Math.min(innerHeight-Math.max(0,r.y-6),r.height+12)}})()`));
await b.toucher(`[...document.querySelectorAll('.fc-carte.edition .imp-actions button')].find(x=>/Annuler/.test(x.textContent)&&x.offsetParent)`, 600);
v((await empreinte(['temoin-muscle'])) === hm, 'ancienne carte Muscle : rien écrit en base (Annuler)');
b.fin();
