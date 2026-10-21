// REPRENDRE UN TRANSCRIPT ARRÊTÉ : démarrer, arrêter, reprendre ×2 (depuis la liste, puis depuis la session affichée),
// même session (même id), horloge qui continue, horodatages croissants, marques « — reprise à HH:MM — », feuille
// pré-remplie (source, mots-clés), notes et pages, « Copier tout » avec / sans les marques, une session d'avant
// reprenable, refus si la session a été reprise sur un autre appareil. Base LOCALE, cours « Rein v3 ».
// Banc : faux Deepgram (scripts/faux-deepgram.mjs), Vite :5199 avec DEEPGRAM_* et VITE_SUPABASE_URL= vide, Chrome
// --use-fake-device-for-media-stream --use-file-for-fake-audio-capture.   Usage : node t-reprise.mjs
import { banc } from '../tests-pdfreader-v3/commun.mjs';
const b = await banc(1440, 900);
const COURS = 'f-v3-rein';
const ANCIENNE = { id: 'ts-h-ancienne', kind: 'session', courseId: COURS, startedAt: '2026-10-01T08:00:00.000Z', endedAt: '2026-10-01T08:01:00.000Z', source: 'micro', keyterms: ['néphron'],
  segments: [{ id: 'sg-h1', t0: 1, t1: 4, text: 'Ancienne session, première ligne.', status: 'final' }, { id: 'sg-h2', t0: 5, t1: 9, text: 'Deuxième ligne sans numéro de page.', status: 'final' }],
  notes: [], fontSize: 'm', durationS: 60, createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:01:00.000Z' };
await b.S(`for(const r of await S.getAll('transcript_session'))if(r.courseId===${JSON.stringify(COURS)})await S.remove('transcript_session',r.id);
  for(const r of await S.getAll('reading_position'))if(String(r.id).startsWith('rp:${COURS}'))await S.remove('reading_position',r.id);
  await S.put('transcript_session',${JSON.stringify(ANCIENNE)});return 1`);
await b.biblio({ recharger: true });
await b.ouvrir('Rein v3'); await b.dormir(1500);
await b.ev(`window.__mrZoom(1);1`); await b.dormir(800);
await b.allerPage(2);
const E = (js) => b.ev(`(()=>{const e=window.__transcription.lireEtat();return ${js}})()`);
const enBase = (id) => b.S(`return await S.getOne('transcript_session',${JSON.stringify(id)})`);
const clicTexte = async (sel, re) => b.clic(await b.pos(`[...document.querySelectorAll('${sel}')].filter(x=>${re}.test(x.innerText)).pop()`, true), { att: 900 });
const attendreBouton = async (re) => { for (let i = 0; i < 30 && !(await b.ev(`(()=>{const x=[...document.querySelectorAll('.trx-feuille button')].filter(x=>${re}.test(x.innerText)).pop();return !!x&&!x.disabled})()`)); i++) await b.dormir(300); };
const arreter = async () => { await b.clic(await b.pos(`document.querySelector('.trx-stop')`, false), { att: 3500 }); for (let i = 0; i < 20 && (await E(`e.phase`)) !== 'idle'; i++) await b.dormir(300); };
// copie : le presse-papiers du navigateur sans permission → on capte le texte
await b.ev(`navigator.clipboard.writeText=(t)=>{window.__copie=t;return Promise.resolve()};1`);

// ---------- 1. une session : démarrer, parler, une note, arrêter ----------
await b.clic(await b.pos(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Transcript'))`, false), { att: 700 });
await clicTexte('.trx-accueil button', '/Transcrire le cours/');
await attendreBouton('/Démarrer/');
await clicTexte('.trx-feuille button', '/Démarrer/');
b.ok((await E(`e.phase`)) === 'live', 'session démarrée');
await b.dormir(7000);
await clicTexte('.trx-barre.secondaire button', '/Note/'); await b.ecrire('Note avant la reprise'); await b.dormir(400);
await b.dormir(2000);
await arreter();
let id = await E(`e.derniereFinie`);
let s1 = await enBase(id);
const nFinal = (s) => s.segments.filter((x) => x.status === 'final').length;
b.ok(s1 && s1.endedAt && nFinal(s1) >= 2 && s1.keyterms.length > 0, 'session arrêtée et enregistrée (segments, mots-clés)', JSON.stringify({ segs: nFinal(s1), kt: s1 && s1.keyterms.length, d: s1 && s1.durationS }));

// ---------- 2. reprise n° 1, depuis la LISTE des sessions ----------
await b.clic(await b.pos(`[...document.querySelectorAll('.trx-barre .btn')].find(x=>/Sessions/.test(x.innerText))`, false), { att: 700 });
const bouton = await b.pos(`document.querySelector('.trx-session[data-session="${id}"] .trx-session-reprendre')`, true);
b.ok(!!bouton && (await b.ev(`[...document.querySelectorAll('.trx-session-reprendre')].every(x=>x.getAttribute('aria-label')==='Reprendre l’enregistrement')`)), 'chaque session terminée de la liste a « Reprendre l’enregistrement »');
await b.clic(bouton, { att: 1200 });
await attendreBouton('/Reprendre/');
const feuille = await b.ev(`(()=>{const f=document.querySelector('.trx-feuille');const m=f&&f.closest('.day-pop');return {titre:(m&&m.querySelector('.day-pop-head .serif')||{}).innerText||'',texte:f?f.innerText:''}})()`);
const ktVus = s1.keyterms.filter((k) => feuille.texte.includes(k));
b.ok(/Reprendre la transcription/.test(feuille.titre) && ktVus.length === s1.keyterms.length, 'la feuille Transcrire s’ouvre en reprise, avec les mots-clés de la session', JSON.stringify({ titre: feuille.titre, ktVus: ktVus.length, kt: s1.keyterms.length }));
await clicTexte('.trx-feuille button', '/^\\s*Reprendre\\s*$/');
const depart = await E(`({phase:e.phase,id:e.session&&e.session.id,secondes:e.secondes,source:e.session&&e.session.source})`);
b.ok(depart.phase === 'live' && depart.id === id && depart.secondes >= Math.floor(s1.durationS) && depart.source === s1.source, 'reprise : la MÊME session repart, l’horloge reprend là où elle s’était arrêtée, même source', JSON.stringify({ ...depart, avant: s1.durationS }));
await b.allerPage(3);
await b.dormir(7000);
await clicTexte('.trx-barre.secondaire button', '/Note/'); await b.ecrire('Note après la reprise'); await b.dormir(400);
await b.dormir(1500);
await arreter();
let s2 = await enBase(id);
const marques = (s) => s.segments.filter((x) => x.reprise);
const m1 = marques(s2)[0];
const apres = s2.segments.slice(s2.segments.indexOf(s2.segments.find((x) => x.reprise)) + 1).filter((x) => x.status === 'final');
const croissant = (s) => s.segments.every((x, i, a) => !i || x.t0 >= a[i - 1].t0 - 0.05);
b.ok(s2.id === id && s2.segments.slice(0, s1.segments.length).every((x, i) => x.id === s1.segments[i].id && x.text === s1.segments[i].text) && apres.length >= 2,
  'les nouveaux segments s’ajoutent à la suite (anciens intacts)', JSON.stringify({ avant: s1.segments.length, apres: apres.length }));
b.ok(m1 && Math.abs(m1.t0 - s1.durationS) < 0.6 && apres.every((x) => x.t0 >= m1.t0 - 0.05) && croissant(s2) && s2.durationS > s1.durationS && s2.endedAt,
  'horodatages continus : la marque à la fin de la 1re partie, la suite après, durée allongée', JSON.stringify({ marque: m1 && m1.t0, d1: s1.durationS, d2: s2.durationS, premier: apres[0] && apres[0].t0 }));
b.ok(/^reprise à \d\d:\d\d$/.test(m1.text) && apres.every((x) => x.page === 3) && s2.notes.length === 2 && s2.notes[1].t >= m1.t0, 'marque « reprise à HH:MM », pages des nouvelles lignes (p. 3), note ajoutée après la reprise', JSON.stringify({ texte: m1.text, pages: [...new Set(apres.map((x) => x.page))], notes: s2.notes.map((n) => n.t) }));

// ---------- 3. reprise n° 2, depuis la SESSION AFFICHÉE ----------
const btnLecture = await b.pos(`document.querySelector('.trx-entete-lecture [aria-label="Reprendre l’enregistrement"]')`, true);
b.ok(!!btnLecture, 'la session affichée a « Reprendre l’enregistrement »');
await b.clic(btnLecture, { att: 1200 });
await attendreBouton('/Reprendre/');
await clicTexte('.trx-feuille button', '/^\\s*Reprendre\\s*$/');
b.ok((await E(`e.phase`)) === 'live' && (await E(`e.session.id`)) === id, 'reprise n° 2 : toujours la même session');
await b.allerPage(4);
await b.dormir(6000);
await arreter();
const s3 = await enBase(id);
b.ok(marques(s3).length === 2 && croissant(s3) && s3.durationS > s2.durationS && s3.segments.filter((x) => x.status === 'final' && x.page === 4).length >= 1, 'reprises illimitées : 2 marques, horodatages toujours croissants', JSON.stringify({ marques: marques(s3).map((x) => x.t0), d: s3.durationS }));
await b.dormir(800);
const dom = await b.ev(`[...document.querySelectorAll('.trx-liste .trx-reprise-marque')].map(x=>x.innerText)`);
b.ok(dom.length === 2 && dom.every((t) => /^— reprise à \d\d:\d\d —$/.test(t)), 'dans la liste : les marques discrètes « — reprise à HH:MM — »', JSON.stringify(dom));
await b.ev(`document.querySelectorAll('.trx-liste .trx-reprise-marque')[1].scrollIntoView({block:'center'});1`); await b.dormir(600);
await b.capture('trx-reprise-marques', await b.ev(`(()=>{const m=document.querySelectorAll('.trx-liste .trx-reprise-marque')[1];const p=document.querySelector('.trx-panneau').getBoundingClientRect();const r=m.getBoundingClientRect();return {x:Math.round(p.x),y:Math.round(Math.max(0,r.y-150)),width:Math.round(p.width),height:300}})()`));
// ---------- 4. Copier tout : avec les marques ; option pour les retirer ----------
await clicTexte('.trx-groupe button', '/Copier tout/'); await b.dormir(300);
const avecM = await b.ev(`window.__copie||''`);
await b.clic(await b.pos(`document.querySelector('.trx-groupe .trx-chevron')`, false), { att: 500 });
await b.clic(await b.pos(`[...document.querySelectorAll('.ctx-menu button, [role="menu"] button, .menu-item, button')].find(x=>/sans les marques de reprise/.test(x.innerText))`, true), { att: 500 });
const sansM = await b.ev(`window.__copie||''`);
b.ok((avecM.match(/— reprise à \d\d:\d\d —/g) || []).length === 2 && !/reprise à/.test(sansM) && sansM.split('\n').length === avecM.split('\n').length - 2,
  '« Copier tout » inclut les 2 marques ; « sans les marques de reprise » les retire (et rien d’autre)', JSON.stringify({ avec: avecM.split('\n').length, sans: sansM.split('\n').length }));

// ---------- 5. une session d'AVANT (sans page, sans marque) se reprend aussi ----------
await b.clic(await b.pos(`[...document.querySelectorAll('.trx-barre .btn')].find(x=>/Sessions/.test(x.innerText))`, false), { att: 700 });
await b.clic(await b.pos(`document.querySelector('.trx-session[data-session="${ANCIENNE.id}"] .trx-session-reprendre')`, true), { att: 1200 });
await attendreBouton('/Reprendre/');
await clicTexte('.trx-feuille button', '/^\\s*Reprendre\\s*$/');
b.ok((await E(`e.session.id`)) === ANCIENNE.id && (await E(`e.secondes`)) >= 60, 'ancienne session : reprise, horloge à 1:00');
await b.dormir(5000);
await arreter();
const sa = await enBase(ANCIENNE.id);
b.ok(sa.segments[0].text === ANCIENNE.segments[0].text && sa.segments[1].text === ANCIENNE.segments[1].text && marques(sa).length === 1 && marques(sa)[0].t0 === 60 && nFinal(sa) > 2, 'ancienne session : ses lignes intactes, la suite après la marque à 1:00', JSON.stringify({ n: sa.segments.length, m: marques(sa).map((x) => x.t0) }));

// ---------- 6. reprise refusée : la session a été reprise sur un autre appareil entre-temps ----------
await b.clic(await b.pos(`[...document.querySelectorAll('.trx-barre .btn')].find(x=>/Sessions/.test(x.innerText))`, false), { att: 700 });
// l'autre appareil l'a reprise (endedAt nul, plus récente) — arrivée par la synchro dans la base locale
await b.S(`const r=await S.getOne('transcript_session',${JSON.stringify(id)});await S.put('transcript_session',{...r,endedAt:null,updatedAt:new Date(Date.now()+1000).toISOString()});return 1`);
await b.clic(await b.pos(`document.querySelector('.trx-session[data-session="${id}"] .trx-session-reprendre')`, true), { att: 1500 });
const refus = await b.ev(`({info:(document.querySelector('.trx-info')||{}).innerText||'',feuille:!!document.querySelector('.trx-feuille'),lecture:!!document.querySelector('.trx-titre-lecture')})`);
b.ok(/Déjà en cours sur un autre appareil/.test(refus.info) && !refus.feuille && refus.lecture && (await E(`e.phase`)) === 'idle', '« Déjà en cours sur un autre appareil » : pas de reprise, la session s’ouvre en lecture', JSON.stringify(refus));
await b.capture('trx-reprise-refus', await b.ev(`(()=>{const p=document.querySelector('.trx-panneau').getBoundingClientRect();return {x:Math.round(p.x),y:Math.round(p.y),width:Math.round(p.width),height:200}})()`));
// remise en état : la session redevient terminée (base locale du banc)
await b.S(`const r=await S.getOne('transcript_session',${JSON.stringify(id)});await S.put('transcript_session',{...r,endedAt:${JSON.stringify(s3.endedAt)}});return 1`);
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
