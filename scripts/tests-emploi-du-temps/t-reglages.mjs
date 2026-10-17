// Réglages → Emploi du temps (couleur, matière reliée) repris partout ; « Ouvrir » (dernier cours
// ouvert de la matière) ; « Transcrire » pendant un cours Teams (feuille pré-remplie, Onglet Chrome).
// Aucune fiche, carte ni matière modifiée.
import { ouvrir, hp, forcerServeur } from './commun-edt.mjs';

const LUNDI_1400 = '2026-10-19T12:00:00Z'; // lundi 19/10 14:00 Bruxelles : Physiologie humaine (Teams) en cours
await hp('/__version?v=1'); await forcerServeur();
const b = await ouvrir({ date: LUNDI_1400 });
await b.reinit({ mode: 'ecole' }); await b.recharger(); await b.accueil(); await b.attendreEcole();
const empreinte = () => b.S(`const t=[];for(const st of ['fiches','questions','matieres','sources','dossiers']){const a=await S.getAll(st);t.push(st+':'+a.length+':'+JSON.stringify(a.map(x=>[x.id,x.updatedAt||x.updated_at||'',x.titre||x.nom||'',x.matiereId||'',x.dueDate||'',x.intervalDays||'']).sort()).length)}return t.join(' ')`);
const avantTout = await empreinte();
const choixSource = await b.ev(`localStorage.getItem('medrevise.transcription.source.choix')`);

// ---- avant : Physiologie humaine n'est reliée à rien → pas de bouton
let av = await b.avant();
b.ok(av && /^En cours · jusqu’à 15:45 · Physiologie humaine · M\. Dupont · Teams$/.test(av.txt) && av.boutons.length === 0, 'cours Teams en cours, matière non reliée : aucun bouton', av && av.txt + ' ' + av.boutons);
const couleurAvant = Object.fromEntries((await b.cartes()).map((x) => [x.t, x.c]));

// ---- Réglages
await b.allerA('Réglages'); await b.dormir(700);
await b.ev(`document.querySelector('.edt-carte-reglages').scrollIntoView({block:'start'});1`); await b.dormir(300);
const lignes = await b.ev(`[...document.querySelectorAll('.edt-reg-ligne')].map(l=>l.querySelector('.edt-reg-titre').textContent+' | '+l.querySelector('select').selectedOptions[0].textContent)`);
console.log('   ' + lignes.join('\n   '));
b.ok(lignes.length === 7, '7 cours détectés');
b.ok(lignes.includes('Anatomie descriptive et palpatoire | Auto : Anatomie palpatoire') && lignes.includes('Biochimie | Auto : Biochimie') && lignes.includes('Psychologie de la santé | Auto : Psychologie') && lignes.includes('Physiologie humaine | Auto : aucune'), 'correspondances automatiques (accents, casse, mots)');
// relier « Physiologie humaine » à « Physiologie test », et choisir une couleur pour « Anglais médical »
await b.selectionner(`document.querySelector('.edt-reg-ligne[data-cle="physiologie humaine"] select')`, 'mat-fj'); await b.dormir(500);
await b.clic(await b.pos(`document.querySelectorAll('.edt-reg-ligne[data-cle="anglais medical"] .edt-reg-teinte')[5]`), { att: 500 });
// et retirer la correspondance de « Biochimie »
await b.selectionner(`document.querySelector('.edt-reg-ligne[data-cle="biochimie"] select')`, '__aucune'); await b.dormir(500);
const reg = await b.S(`const r=await S.getEdtReglages();return JSON.stringify({p:r.cours['physiologie humaine'].matiereId,a:r.cours['anglais medical'].couleur,b:r.cours['biochimie'].matiereId})`);
b.ok(reg === '{"p":"mat-fj","a":5,"b":null}', 'réglages enregistrés (matière, couleur, aucune)', reg);
const hintBio = await b.ev(`document.querySelector('.edt-reg-ligne[data-cle="biochimie"] .hint').textContent`);
b.ok(/couleur automatique$/.test(hintBio), '« Biochimie » : plus de matière reliée, couleur automatique', hintBio);
const pal = await b.ev(`getComputedStyle(document.querySelectorAll('.edt-reg-ligne[data-cle="anglais medical"] .edt-reg-teinte')[5]).backgroundColor`);
await b.png('edt-reglages', '.edt-carte-reglages');

// ---- repris à l'Accueil
await b.accueil(); await b.attendreEcole();
const cc = await b.cartes();
const coul = (t) => cc.find((x) => x.t === t);
const physioTint = await b.S(`const m=(await S.getAll('matieres')).find(x=>x.id==='mat-fj');return m.couleur||null`);
const rgbDe = (el) => b.ev(`getComputedStyle(document.querySelector('.edt-cours[data-uid=${JSON.stringify(el.uid)}]')).borderLeftColor`);
b.ok(await rgbDe(coul('Anglais médical')) === pal, 'Accueil : couleur choisie pour « Anglais médical »', pal);
b.ok(coul('Physiologie humaine').c !== couleurAvant['Physiologie humaine'] || physioTint === couleurAvant['Physiologie humaine'], 'Accueil : « Physiologie humaine » prend la couleur de sa matière');
b.ok(coul('Biochimie').c === couleurAvant['Biochimie'], 'Accueil : « Biochimie » déliée garde sa couleur fixe (stable)');
av = await b.avant();
b.ok(av && av.boutons.join(',') === 'Ouvrir,Transcrire', 'cours Teams en cours relié : « Ouvrir » + « Transcrire »', av && av.boutons.join(','));
b.ok(await b.ev(`(()=>{const c=[...document.querySelectorAll('.edt-cours')].filter(e=>e.querySelector('.edt-transcrire'));return c.length===1&&c[0].querySelector('.edt-t').textContent==='Physiologie humaine'})()`), '« Transcrire » sur la seule carte du cours Teams en cours');
await b.recharger(); await b.accueil(); await b.attendreEcole();
const cc2 = await b.cartes();
b.ok(JSON.stringify(cc2.map((x) => x.c)) === JSON.stringify(cc.map((x) => x.c)), 'couleurs identiques après rechargement');
await b.png('edt-ecole-semaine', '.edt-carte');

// ---- Transcrire
await b.clic(await b.pos(`document.querySelector('.edt-avant .edt-transcrire')`, false), { att: 600 });
const okF = await b.attendre(`document.querySelector('.trx-feuille')`, 12000);
const feuille = await b.ev(`(()=>{const f=document.querySelector('.trx-feuille');if(!f)return null;const s=f.querySelector('select');return {source:s&&s.value,titre:(document.querySelector('.pdfr-titre, .pdfr-v2 h1, [class*=titre]')||{}).textContent||''}})()`);
b.ok(okF && feuille && feuille.source === 'onglet', 'Transcrire : cours ouvert, feuille de démarrage pré-remplie « Onglet Chrome »', JSON.stringify(feuille));
const ficheTrx = await b.ev(`(()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);return import(u.find(n=>n.includes('/lib/derniersCours.js'))).then(m=>JSON.stringify(JSON.parse(localStorage.getItem('medrevise.derniersCours.v1')||'{}')['mat-fj']||null))})()`);
b.ok(/"ficheId":"/.test(ficheTrx), 'la fiche ouverte est notée comme dernier cours de la matière', ficheTrx);
await b.capture('edt-transcrire');
b.ok(await b.ev(`localStorage.getItem('medrevise.transcription.source.choix')`) === choixSource, 'choix de source mémorisé inchangé (pré-remplissage seulement)');
await b.T.Escape(); await b.dormir(300);
await b.ev(`(()=>{const x=[...document.querySelectorAll('.trx-feuille button')].find(b=>/Annuler|Fermer/.test(b.innerText+b.title+(b.getAttribute('aria-label')||'')));x&&x.click();return 1})()`); await b.dormir(400);
b.ok(!(await b.ev(`!!document.querySelector('.trx-feuille')`)), 'feuille refermée sans démarrer');

// ---- Ouvrir = dernier cours ouvert de la matière
await b.ouvrir('Membre inférieur — repères'); // ouvert depuis la Bibliothèque
await b.accueil(); await b.attendreEcole();
await b.clic(await b.pos(`[...document.querySelectorAll('.edt-cours')].find(e=>e.querySelector('.edt-t').textContent.startsWith('Anatomie'))?.querySelector('.edt-actions button')`), { att: 400 });
await b.attendre(`document.querySelector('.pdfr-scroll')`, 10000);
const ouvert = await b.ev(`document.body.innerText.includes('Membre inférieur — repères')`);
const ecran = await b.ev(`JSON.parse(localStorage.getItem('medrevise.derniersCours.v1')||'{}')['mat-tb-ap']?.ficheId`);
const idMI = await b.S(`return (await S.getAll('fiches')).find(f=>f.titre==='Membre inférieur — repères'&&!f.archive).id`);
b.ok(ouvert && ecran === idMI, '« Ouvrir » (Anatomie) ouvre le dernier cours ouvert : « Membre inférieur — repères »', ecran);

// ---- rien d'autre n'a bougé
const apresTout = await empreinte();
b.ok(apresTout === avantTout, 'aucune fiche, carte, matière ni dossier modifié', apresTout === avantTout ? '' : avantTout + ' ≠ ' + apresTout);
b.ok(b.erreurs.length === 0, '0 erreur console', b.erreurs.join(' | '));
b.c.fermer();
