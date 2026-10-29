// (29/10) LA TRANSCRIPTION MARQUE LE COURS (docs/compte-rendu-transcription-marque-cours.md) : vraie session (faux Deepgram,
// micro simulé) sur « Rein v3 ». Case « Marquer le début du cours sur la page 5 » cochée → tag Début p.5 lié à la session ;
// « Arrêter » sur la page 9 → tag Fin p.9 lié à la session ; la séance « p. 5–9 » apparaît. Case décochée → aucun tag.
// Banc : voir t-transcript.mjs (faux-deepgram :54400, Vite :5199 avec DEEPGRAM_*, Chrome à micro simulé). node t-transcription-marque.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { banc } from './commun.mjs';
const b = await banc(1440, 900);
// micro simulé : Chrome headless attend sinon une autorisation que personne ne donne
await b.c.send('Browser.grantPermissions', { origin: 'http://localhost:5199', permissions: ['audioCapture'] }).catch(() => {});
// Chrome 156 headless sur macOS : getUserMedia ne répond jamais, même avec un micro simulé (autorisation système en
// attente). On remplace donc LE MICRO SEULEMENT par une source audio synthétique (un son continu : le faux Deepgram en
// fait des phrases) ; moteur, faux Deepgram, lecteur et tags sont les vrais. Chrome lancé avec --autoplay-policy=no-user-gesture-required.
const MICRO_SYNTHETIQUE = `(() => { const md = navigator.mediaDevices; if (!md) return;
  md.enumerateDevices = async () => [{ deviceId: 'synth', kind: 'audioinput', label: 'Micro synthétique (test)', groupId: 'g' }];
  md.getUserMedia = async () => { const ac = new AudioContext({ sampleRate: 48000 }); await ac.resume(); const o = ac.createOscillator(); o.frequency.value = 220;
    const g = ac.createGain(); g.gain.value = 0.6; const d = ac.createMediaStreamDestination(); o.connect(g).connect(d); o.start(); return d.stream; }; })();`;
await b.c.send('Page.addScriptToEvaluateOnNewDocument', { source: MICRO_SYNTHETIQUE });
const CAP = fileURLToPath(new URL('../../docs/img/transcription-marque-cours/', import.meta.url)); fs.mkdirSync(CAP, { recursive: true });
const cap = async (nom) => { const s = await b.c.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(CAP + nom + '.png', Buffer.from(s.data, 'base64')); };
const C = 'f-v3-rein';
const tags = () => b.S(`return (await S.getAll('page_tag')).filter(t=>t.courseId==='${C}'&&!t.supprime).map(t=>({kind:t.kind,page:t.page,doc:t.document,sid:t.transcriptSessionId||null})).sort((a,b)=>a.page-b.page)`);
const etat = () => b.ev(`(()=>{const e=window.__transcription.lireEtat();return {phase:e.phase,sid:e.session&&e.session.id,derniere:e.derniereFinie,segs:e.session?e.session.segments.length:0}})()`);
await b.S(`for(const t of await S.getAll('page_tag'))if(t.courseId==='${C}')await S.remove('page_tag',t.id);for(const r of await S.getAll('transcript_session'))if(r.courseId==='${C}')await S.remove('transcript_session',r.id);
  for(const r of await S.getAll('reading_position'))if(String(r.id).startsWith('rp:${C}'))await S.remove('reading_position',r.id);localStorage.removeItem('medrevise.trx.finAuto.${C}');return 1`);
await b.biblio({ recharger: true });
await b.ouvrir('Rein v3'); await b.dormir(1500);
await b.ev(`window.__mrZoom && window.__mrZoom(1);1`); await b.dormir(800);

const ouvrirFeuille = async () => {
  if (!(await b.ev(`!!document.querySelector('.trx-accueil')`))) { await b.ev(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>/^\\s*Trans/.test(x.innerText)).click();1`); await b.dormir(700); }
  await b.ev(`[...document.querySelectorAll('.trx-accueil button')].find(x=>/Transcrire le cours/.test(x.innerText)).click();1`); await b.dormir(1500);
  for (let i = 0; i < 20 && !(await b.ev(`(()=>{const x=[...document.querySelectorAll('.trx-feuille button')].filter(x=>/Démarrer/.test(x.innerText)).pop();return !!x&&!x.disabled})()`)); i++) await b.dormir(300);
};
// (Chrome headless sur macOS : créer un contexte audio y prend ~20 s — on attend la mise en direct jusqu'à 90 s)
const demarrer = async () => {
  await b.ev(`[...document.querySelectorAll('.trx-feuille button')].filter(x=>/Démarrer/.test(x.innerText)).pop().click();1`);
  for (let i = 0; i < 180 && (await etat()).phase !== 'live'; i++) await b.dormir(500);
};
const arreter = async () => {
  await b.ev(`document.querySelector('.trx-stop').click();1`); await b.dormir(500);
  for (let i = 0; i < 40 && (await etat()).phase !== 'idle'; i++) await b.dormir(250);
  await b.dormir(1200);
};

// ---------- 1. case cochée : début p.5, fin p.9
await b.allerPage(5); await b.dormir(800);
await ouvrirFeuille();
const caseD = await b.ev(`(()=>{const i=document.querySelector('[data-champ=marquer-debut]');return i?{coche:i.checked,texte:i.closest('.mr-case').innerText.replace(/\\s+/g,' ').trim()}:null})()`);
b.ok(caseD && caseD.coche && /page 5\b/.test(caseD.texte), 'feuille de démarrage : « Marquer le début du cours sur la page 5 », cochée', caseD && caseD.texte);
await cap('1-feuille-demarrage');
await demarrer();
const e1 = await etat();
b.ok(e1.phase === 'live', 'session en direct (faux Deepgram, micro simulé)', e1.phase);
await b.dormir(800);
let t = await tags();
b.ok(t.length === 1 && t[0].kind === 'debut' && t[0].page === 5 && t[0].doc === 'original' && t[0].sid === e1.sid, 'tag Début posé p.5, lié à la session', JSON.stringify(t));
b.ok(await b.ev(`!!document.querySelector('.pdfr-page[data-cle="5"].tag-debut')`), 'la page 5 porte le tag Début à l’écran');
b.ok(/Début du cours marqué page 5/.test(await b.ev(`document.querySelector('.fj-avis')?.innerText||''`)), 'avis « Début du cours marqué page 5 »');
await cap('2-debut-marque');
// le cours avance : quelques phrases, puis page 9
for (let i = 0; i < 30 && (await etat()).segs < 2; i++) await b.dormir(500);
await b.allerPage(9); await b.dormir(2500);
await arreter();
const e2 = await etat();
t = await tags();
b.ok(e2.phase === 'idle' && e2.derniere === e1.sid, 'session arrêtée et enregistrée', JSON.stringify(e2));
b.ok(t.length === 2 && t[1].kind === 'fin' && t[1].page === 9 && t[1].sid === e1.sid && t[0].sid === e1.sid, 'tag Fin posé p.9, lié à la même session', JSON.stringify(t));
b.ok(/Fin du cours marquée page 9/.test(await b.ev(`document.querySelector('.fj-avis')?.innerText||''`)), 'avis « Fin du cours marquée page 9 »');
await cap('3-fin-marquee');
// la séance existe : Fichier › Séances…
await b.clic(await b.pos(`document.querySelector('.mf-bouton')`, false), { att: 400 });
await b.clic(await b.pos(`[...document.querySelectorAll('.mf-item')].find(x=>x.innerText.startsWith('Séances'))`, false), { att: 900 });
const seances = await b.ev(`document.querySelector('.day-pop')?.innerText?.replace(/\\s+/g,' ')`);
b.ok(/p\. 5[–-]9/.test(seances || ''), 'Fichier › Séances : « p. 5–9 » avec son transcript', (seances || '').slice(0, 160));
await cap('4-seance');
await b.ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));(document.querySelector('.day-pop-head .icon-btn')||{click(){}}).click();1`); await b.dormir(400);
b.ok(!(await b.ev(`localStorage.getItem('medrevise.trx.finAuto.${C}')`)), 'rien ne reste en attente après l’arrêt');

// ---------- 2. case décochée : aucun tag
await b.allerPage(14); await b.dormir(800);
await ouvrirFeuille();
await b.ev(`(()=>{const i=document.querySelector('[data-champ=marquer-debut]');i&&i.checked&&i.click();return 1})()`); await b.dormir(200);
b.ok(!(await b.ev(`document.querySelector('[data-champ=marquer-debut]').checked`)), 'case décochée');
await demarrer();
for (let i = 0; i < 20 && (await etat()).segs < 1; i++) await b.dormir(500);
await b.allerPage(16); await b.dormir(1500);
await arreter();
t = await tags();
b.ok(t.length === 2, 'case décochée : aucun nouveau tag (ni début ni fin)', JSON.stringify(t));
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer(); process.exit(0);
