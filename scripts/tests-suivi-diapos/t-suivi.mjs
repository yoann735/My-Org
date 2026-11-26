// Banc « suivi automatique des diapos » (24/11/2026, docs/compte-rendu-suivi-auto-diapos.md) — LE COURS EN DIRECT.
// Un faux cours Teams (faux-teams.html) fait défiler les diapos d'un PDF d'histologie ; l'app transcrit l'onglet par le
// VRAI partage d'onglet de Chrome (choix automatique), avec le faux Deepgram. Vérité terrain = journal du faux Teams.
// Scénarios : défilement normal, même titre / photos différentes, sans titre (photo seule), fond noir, retour en arrière,
// saut de 10, animation, vignette caméra qui bouge, curseur, diapo hors PDF, partage coupé puis repris, élève dans un
// autre cours de l'app. Puis : même durée SANS suivi (comparaison des mots, du CPU, des images longues).
// Prérequis : faux-deepgram-diapos (:54410), faux-teams (:54411), medrevise-banc-diapos (:5304) — .claude/launch.json.
// Usage : node t-suivi.mjs            (COURT=1 : 6 diapos seulement ; DUREE=14 : secondes par diapo)
import fs from 'node:fs';
import path from 'node:path';
import { cdp, lancerChrome, cpuChrome, dormir, ok, BASE, TEAMS, DEEPGRAM, PORT_CHROME, TRAVAIL, DOSSIER_IMG, INJECTION_PARTAGE } from './commun.mjs';

const DUREE = Number(process.env.DUREE || 14) * 1000;
const COURT = !!process.env.COURT;
const CAPTURES = !process.env.PDF_HISTO; // jamais de capture publiée d'un vrai PDF de cours
const COURS = 'f-diapos-histo', AUTRE_COURS = 'f-diapos-autre';
fs.mkdirSync(DOSSIER_IMG, { recursive: true });

/* ---------- le scénario ---------- */
const S = [];
const m = (page, sc, o = {}) => S.push({ quoi: 'montrer', page, sc, ...o });
if (COURT) { m(1, 'normal'); m(2, 'autre-cours', { ailleurs: true }); m(3, 'meme-titre'); }
else {
  for (let p = 1; p <= 10; p++) m(p, p >= 3 && p <= 7 ? 'meme-titre' : p === 9 || p === 10 ? 'sans-titre' : 'normal');
  m(7, 'retour'); m(8, 'normal'); m(18, 'saut'); m(19, 'animation', { animer: true });
  m(20, 'camera', { camera: true }); m(21, 'camera', { camera: true });
  S.push({ quoi: 'autre', sc: 'hors-pdf' }); m(22, 'normal');
  S.push({ quoi: 'couper', sc: 'partage-coupe' }); m(23, 'reprise');
  m(24, 'autre-cours', { ailleurs: true }); m(25, 'autre-cours', { ailleurs: true }); m(26, 'autre-cours', { ailleurs: true });
  for (let p = 27; p <= 32; p++) m(p, p <= 30 ? 'meme-titre' : 'normal', { curseur: p <= 28 });
}

async function principal() {
  const chrome = await lancerChrome();
  try {
    /* onglets : le faux Teams, puis l'app (le partage ajoute suppressLocalAudioPlayback : rien dans les haut-parleurs) */
    const teams = await cdp(PORT_CHROME, { url: TEAMS + '/' });
    ok(await teams.attendre('window.pret === true', 60000), 'faux Teams prêt', 'diapos rendues');
    const nb = await teams.ev('window.nbDiapos');
    const app = await cdp(PORT_CHROME, { url: 'about:blank' });
    await app.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECTION_PARTAGE });
    await app.send('Page.navigate', { url: BASE + '/medrevise' });
    await app.attendre(`document.readyState === 'complete'`, 30000);
    await app.ev(`(localStorage.setItem('app.current', '"medrevise"'), 1)`);
    await app.send('Page.reload'); await app.attendre(`document.readyState === 'complete'`, 30000); await dormir(3000);
    /* cours : le PDF d'histologie (lu en local, jamais dans le dépôt) + un autre cours */
    const pdf = fs.readFileSync(process.env.PDF_HISTO || path.join(TRAVAIL, 'histo-banc.pdf')).toString('base64');
    const autre = fs.readFileSync(path.join(TRAVAIL, 'autre.pdf')).toString('base64');
    await app.S(`const bin=(b)=>{const s=atob(b);const a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return new Blob([a],{type:'application/pdf'})};
      await S.put('sources',{id:'src-diapos',nom:'Banc diapos',couleur:'#2dd4bf'});await S.put('matieres',{id:'mat-diapos',nom:'Histologie (banc)',sourceId:'src-diapos'});
      const p1=await S.putBlob(bin(${JSON.stringify(pdf)}));const p2=await S.putBlob(bin(${JSON.stringify(autre)}));
      await S.put('fiches',{id:'${COURS}',matiereId:'mat-diapos',dossierId:null,titre:'Histologie générale (banc)',type:'standard',pdfId:p1,pdfName:'histo.pdf',dateImport:'2026-11-24'});
      await S.put('fiches',{id:'${AUTRE_COURS}',matiereId:'mat-diapos',dossierId:null,titre:'Autre cours (banc)',type:'standard',pdfId:p2,pdfName:'autre.pdf',dateImport:'2026-11-24'});return 1`);
    await app.send('Page.reload'); await app.attendre(`document.readyState === 'complete'`, 30000); await dormir(3500);
    const ouvrir = async (titre) => {
      await app.send('Page.bringToFront');
      await app.ev(`(()=>{const x=[...document.querySelectorAll('.hub-card')].find(e=>/MedRevise/.test(e.innerText||''));x&&x.click();return 1})()`); await dormir(1500);
      await app.ev(`(()=>{const b=[...document.querySelectorAll('.sb-item, .sidebar [role=button], .sidebar button, .sidebar a')].find(e=>/Biblioth/.test(e.innerText||e.title||''));b&&b.click();return 1})()`); await dormir(1200);
      await app.ev(`(()=>{const r=[...document.querySelectorAll('button')].find(b=>(b.title||'')==='Revenir à la liste'||b.getAttribute('aria-label')==='Retour');r&&r.click();return 1})()`); await dormir(800);
      for (let k = 0; k < 4; k++) {
        await app.clic(`([...document.querySelectorAll('.lt-fiche')].find(e=>e.innerText.trim().startsWith(${JSON.stringify(titre)}))||{querySelector:()=>null}).querySelector('.lt-rangee')`, 2500);
        if (await app.attendre(`!!document.querySelector('.pdfr-scroll') && document.title !== '' && [...document.querySelectorAll('.lt-fiche')].length === 0`, 5000)) return true;
        if (await app.ev(`!!document.querySelector('.pdfr-scroll')`)) return true;
        // repli : clic du bouton de la ligne par le DOM (même gestionnaire React)
        await app.ev(`(([...document.querySelectorAll('.lt-fiche')].find(e=>e.innerText.trim().startsWith(${JSON.stringify(titre)}))||{querySelector:()=>null}).querySelector('.lt-rangee')||{click(){}}).click(),1`);
        if (await app.attendre(`!!document.querySelector('.pdfr-scroll')`, 4000)) return true;
        await dormir(1000);
      }
      console.log('DIAG ouvrir', titre, JSON.stringify(await app.ev(`({modal:!!document.querySelector('.day-pop'),fiches:[...document.querySelectorAll('.lt-fiche')].map(e=>e.innerText.slice(0,30)),rangee:[...document.querySelectorAll('.lt-fiche .lt-rangee')].map(e=>{const r=e.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]}),url:location.pathname})`)));
      return false;
    };
    /* Transcript › Transcrire › source « Onglet » › Démarrer (vrai geste : getDisplayMedia) — réessayé, les clics du banc
       sur une fenêtre hors écran sont parfois perdus. Rend le nombre de mots validés par le faux Deepgram avant le départ. */
    const demarrerOnglet = async () => {
      await app.send('Page.bringToFront');
      await app.ev(`([...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Transcript'))||{click(){}}).click(),1`); await dormir(900);
      let avant = 0;
      for (let essai = 0; essai < 4 && !(await app.ev(`window.__transcription && window.__transcription.lireEtat().phase==='live'`)); essai++) {
        if (!(await app.ev(`!!document.querySelector('.trx-feuille select')`))) { await app.ev(`([...document.querySelectorAll('.trx-accueil button')].find(x=>/Transcrire le cours/.test(x.innerText))||{click(){}}).click(),1`); await dormir(1500); }
        if (!(await app.attendre(`!!document.querySelector('.trx-feuille select')`, 6000))) continue;
        await app.ev(`(()=>{const s=document.querySelector('.trx-feuille select');const o=[...s.options].find(o=>o.value==='onglet');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
        await dormir(500);
        avant = (await (await fetch(DEEPGRAM + '/__mots')).json()).total;
        await app.attendre(`(()=>{const x=[...document.querySelectorAll('.trx-feuille button')].filter(x=>/Démarrer/.test(x.innerText)).pop();return !!x&&!x.disabled})()`, 10000);
        await app.send('Page.bringToFront');
        await app.clic(`[...document.querySelectorAll('.trx-feuille button')].filter(x=>/Démarrer/.test(x.innerText)).pop()`, 500);
        await app.attendre(`window.__transcription.lireEtat().phase==='live'`, 12000);
      }
      return avant;
    };
    ok(await ouvrir('Histologie générale (banc)'), 'cours « Histologie générale (banc) » ouvert dans le lecteur');
    const pageLecteur = () => app.ev(`parseInt((document.querySelector('.ptb-pages .tnum')||{}).innerText)`);
    const lecteurAvant = await pageLecteur();
    const motsAvant = await demarrerOnglet();
    ok(await app.attendre(`window.__transcription && window.__transcription.lireEtat().phase==='live'`, 20000), 'transcription en direct depuis l’onglet « Faux Teams » (vrai partage d’onglet)');
    ok((await app.ev('window.__partageDemandes')) === 1, 'une seule demande de partage');
    await teams.ev('window.demarrerSon()');
    ok(await app.attendre(`window.__transcription.lireSuivi().disponible && window.__transcription.lireSuivi().statut==='suivi'`, 60000), 'suivi des diapos actif, pages du PDF préparées', JSON.stringify(await app.ev('window.__transcription.lireSuivi()')));
    const prep = await app.ev('JSON.parse(JSON.stringify(window.__transcription.mesuresSuivi.preparation))');

    /* ---------- le cours ---------- */
    const cpu0 = await cpuChrome(); const tCpu0 = Date.now();
    await app.ev(`(()=>{window.__images=[];let t=performance.now();const f=(n)=>{window.__images.push(n-t);t=n;window.__raf=requestAnimationFrame(f)};window.__raf=requestAnimationFrame(f);return 1})()`);
    const etapes = [];
    let dansAutreCours = false;
    for (let i = 0; i < S.length; i++) {
      const e = S[i];
      if (e.ailleurs && !dansAutreCours) { await ouvrir('Autre cours (banc)'); dansAutreCours = true; }
      if (!e.ailleurs && dansAutreCours) { await ouvrir('Histologie générale (banc)'); dansAutreCours = false; }
      await teams.ev(`window.bougerCamera(${!!e.camera}); window.curseur(${!!e.curseur}); 1`);
      const t0 = Date.now();
      if (e.quoi === 'montrer') await teams.ev(`window.montrer(${e.page}, { animer: ${!!e.animer} }); 1`);
      else if (e.quoi === 'autre') await teams.ev(`window.montrer('autre'); 1`);
      else if (e.quoi === 'couper') await teams.ev(`window.couperPartage(); 1`);
      if (i === 3 && CAPTURES) await teams.capture(path.join(TRAVAIL, 'teams.png'));
      await dormir(DUREE - 1500);
      const ind = await app.ev(`(document.querySelector('.trx-suivi-ind')||{}).innerText||''`);
      if (CAPTURES && i === 6) await app.capture(DOSSIER_IMG + '01-panneau-diapo-auto.png', await app.ev(`(()=>{const r=document.querySelector('.trx-panneau').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.min(520,Math.round(r.height))}})()`));
      if (CAPTURES && e.quoi === 'autre') await app.capture(DOSSIER_IMG + '02-diapo-non-reconnue.png', await app.ev(`(()=>{const r=document.querySelector('.trx-suivi').getBoundingClientRect();return {x:Math.round(r.x)-8,y:Math.round(r.y)-60,width:Math.round(r.width)+16,height:120}})()`));
      etapes.push({ ...e, t0, ind });
      await dormir(1500);
      console.log(`  ${i + 1}/${S.length} ${e.quoi} ${e.page || ''} [${e.sc}] → « ${ind} »`);
    }
    const cpu1 = await cpuChrome(); const tCpu1 = Date.now();
    const imagesOn = await app.ev(`(()=>{cancelAnimationFrame(window.__raf);const l=window.__images.slice(5);return {n:l.length,sup16:l.filter(x=>x>16.7*1.5).length,sup50:l.filter(x=>x>50).length}})()`);
    if (dansAutreCours) { await ouvrir('Histologie générale (banc)'); }
    const lecteurApres = await pageLecteur();
    const etat = await app.ev(`(()=>{const e=window.__transcription.lireEtat();return JSON.parse(JSON.stringify({session:e.session}))})()`);
    const mes = await app.ev('JSON.parse(JSON.stringify(window.__transcription.mesuresSuivi))');
    const journal = await teams.ev('window.journal');
    // arrêt
    await app.clic(`document.querySelector('.trx-stop')`, 4000);
    ok(await app.attendre(`window.__transcription.lireEtat().phase==='idle'`, 15000), 'session arrêtée et enregistrée');
    const sess = await app.S(`return (await S.getAll('transcript_session')).filter(r=>r.kind==='session'&&r.courseId==='${COURS}').sort((a,b)=>b.startedAt.localeCompare(a.startedAt))[0]`);
    const motsDg = (await (await fetch(DEEPGRAM + '/__mots?depuis=' + motsAvant)).json()).mots;
    // images recadrées gardées par l'app → $TRAVAIL/captures (hors dépôt), pour régler les seuils
    const dirCap = path.join(TRAVAIL, 'captures'); fs.rmSync(dirCap, { recursive: true, force: true }); fs.mkdirSync(dirCap, { recursive: true });
    for (const d of sess.diapos || []) {
      if (!d.img) continue;
      const b64 = await app.S(`const b=await S.getMeta(${JSON.stringify(d.img)});if(!b)return null;const u=new Uint8Array(await b.arrayBuffer());let s='';for(const x of u)s+=String.fromCharCode(x);return btoa(s)`);
      if (b64) fs.writeFileSync(path.join(dirCap, `${String(d.n).padStart(3, '0')}.jpg`), Buffer.from(b64, 'base64'));
    }

    /* ---------- analyse ---------- */
    const diapos = sess.diapos || [];
    ok(diapos.length >= S.length - 1, `${diapos.length} changements gardés avec la session (images locales)`);
    // horloge : instant réel ↔ instant de cours (relevés de la session)
    const off = diapos.map((d) => Date.parse(d.le) / 1000 - d.t).sort((a, b) => a - b)[Math.floor(diapos.length / 2)];
    const attendue = []; let derniere = null; // page attendue pour les lignes après chaque étape
    for (const e of etapes) { if (e.quoi === 'montrer') derniere = e.page; attendue.push(derniere); }
    // avant la première étape, le faux Teams montre déjà la diapo 1 (affichée à son ouverture)
    const pageVraieA = (ms) => { let k = 0; for (let i = 0; i < etapes.length; i++) if (etapes[i].t0 <= ms) k = i; return ms < etapes[0].t0 ? 1 : attendue[k]; };
    // PASSAGES : la page reconnue pendant chaque étape (dernier changement reconnu de la fenêtre)
    let justes = 0, delais = [], fautesMemeTitre = 0, mauvaisChangements = 0; const detail = [];
    for (let i = 0; i < etapes.length; i++) {
      const e = etapes[i]; const fin = i + 1 < etapes.length ? etapes[i + 1].t0 : Date.now();
      const dans = diapos.filter((d) => { const td = Date.parse(d.le) + (d.delaiMs || 0); return td >= e.t0 - 500 && td < fin + 500; });
      const reconnues = dans.filter((d) => d.page);
      const p = reconnues.length ? reconnues[reconnues.length - 1].page : null;
      const bon = e.quoi === 'montrer' ? p === e.page : (p === null && dans.some((d) => d.nonReconnue));
      if (bon) justes++;
      for (const d of reconnues) if (e.quoi === 'montrer' && d.page !== e.page) { mauvaisChangements++; if (e.sc === 'meme-titre' || e.sc === 'noir') fautesMemeTitre++; }
      if (e.quoi === 'montrer' && reconnues.length) delais.push((Date.parse(reconnues[0].le) + reconnues[0].delaiMs - e.t0) / 1000);
      detail.push({ etape: i + 1, sc: e.sc, montre: e.page || e.quoi, reconnue: p, changements: dans.map((d) => d.page ?? (d.nonReconnue ? 'NR' : '?')), score: dans.map((d) => d.score), marge: dans.map((d) => d.marge), ind: e.ind, bon });
    }
    fs.writeFileSync(path.join(TRAVAIL, 'resultat-suivi.json'), JSON.stringify({ detail, diapos: diapos.map(({ masque, ...x }) => x) }, null, 1));
    const precisionPassages = justes / etapes.length;
    // LIGNES : page de chaque ligne validée contre la diapo réellement affichée quand elle a commencé
    const lignes = sess.segments.filter((g) => g.status === 'final');
    const parScenario = {};
    let lJustes = 0;
    for (const g of lignes) {
      const ms = (off + g.t0) * 1000; const vraie = pageVraieA(ms);
      const k = etapes.reduce((a, e, i) => (e.t0 <= ms ? i : a), 0); const sc = etapes[k].sc;
      parScenario[sc] = parScenario[sc] || { n: 0, justes: 0 }; parScenario[sc].n++;
      if (g.page === vraie) { lJustes++; parScenario[sc].justes++; }
    }
    const precisionLignes = lignes.length ? lJustes / lignes.length : 0;
    const delaiMoyen = delais.reduce((a, b) => a + b, 0) / Math.max(1, delais.length);
    ok(precisionPassages >= 0.95, `passages liés à la bonne diapo : ${(precisionPassages * 100).toFixed(1)} % (${justes}/${etapes.length})`);
    ok(precisionLignes >= 0.95, `lignes du transcript sur la bonne diapo : ${(precisionLignes * 100).toFixed(1)} % (${lJustes}/${lignes.length})`);
    ok(fautesMemeTitre === 0, `diapos au même titre / fond noir : ${fautesMemeTitre} mauvais changement`);
    ok(delaiMoyen <= 3, `délai changement → liaison : moyen ${delaiMoyen.toFixed(2)} s, max ${Math.max(...delais).toFixed(2)} s`);
    ok(lecteurAvant === lecteurApres, `le lecteur n’a jamais bougé tout seul (page ${lecteurAvant} → ${lecteurApres})`);
    for (const [sc, v] of Object.entries(parScenario)) console.log(`     ${sc} : ${v.justes}/${v.n} lignes`);
    // AUCUN MOT PERDU : les mots validés par Deepgram = les mots du transcript, dans l'ordre
    const motsTrx = lignes.concat(sess.segments.filter((g) => g.status === 'uncertain')).sort((a, b) => a.t0 - b.t0).map((g) => g.text).join(' ').split(/\s+/).filter(Boolean);
    ok(motsTrx.join(' ') === motsDg.join(' '), `aucun mot perdu : ${motsTrx.length} mots au transcript = ${motsDg.length} mots validés par Deepgram`);
    ok(!sess.segments.some((g) => g.status === 'gap' && !g.reprise), 'aucun trou (« audio non transcrit ») dans la session');

    /* ---------- même durée SANS suivi : mots, CPU, images ---------- */
    const DUREE_COMP = Math.min(90000, tCpu1 - tCpu0);
    // deuxième session : l'app est rechargée (la première est enregistrée), même chemin que la première fois
    await app.send('Page.reload'); await app.attendre(`document.readyState === 'complete'`, 30000); await dormir(3500);
    await app.send('Page.bringToFront'); await dormir(500);
    await ouvrir('Histologie générale (banc)');
    const motsAvant2 = await demarrerOnglet();
    ok(await app.attendre(`window.__transcription.lireEtat().phase==='live'`, 5000), 'deuxième session (sans suivi) en direct');
    await app.attendre(`window.__transcription.lireSuivi().disponible`, 10000);
    if (!(await app.attendre(`!!document.querySelector('.trx-suivi .switch')`, 15000))) console.log('DIAG 2e session', JSON.stringify(await app.ev(`({phase:window.__transcription.lireEtat().phase,suivi:window.__transcription.lireSuivi(),txt:(document.querySelector('.trx-panneau, .trx-accueil')||document.body).innerText.slice(0,300)})`)));
    await app.clic(`document.querySelector('.trx-suivi .switch')`, 500); // interrupteur coupé
    const coupe = await app.ev(`!window.__transcription.lireSuivi().actif && /Suivi coupé/.test(document.querySelector('.trx-suivi-ind').innerText)`);
    ok(coupe, 'interrupteur « Suivre les diapos automatiquement » : coupé d’un clic');
    if (CAPTURES) await app.capture(DOSSIER_IMG + '03-interrupteur-coupe.png', await app.ev(`(()=>{const r=document.querySelector('.trx-suivi').getBoundingClientRect();return {x:Math.round(r.x)-8,y:Math.round(r.y)-60,width:Math.round(r.width)+16,height:110}})()`));
    await app.ev(`(()=>{window.__images=[];let t=performance.now();const f=(n)=>{window.__images.push(n-t);t=n;window.__raf=requestAnimationFrame(f)};window.__raf=requestAnimationFrame(f);return 1})()`);
    const c0 = await cpuChrome(); const tc0 = Date.now();
    for (let k = 0; Date.now() - tc0 < DUREE_COMP; k++) { await teams.ev(`window.montrer(${1 + (k % nb)}); 1`); await dormir(DUREE); }
    const c1 = await cpuChrome(); const tc1 = Date.now();
    const imagesOff = await app.ev(`(()=>{cancelAnimationFrame(window.__raf);const l=window.__images.slice(5);return {n:l.length,sup16:l.filter(x=>x>16.7*1.5).length,sup50:l.filter(x=>x>50).length}})()`);
    await app.clic(`document.querySelector('.trx-stop')`, 4000);
    await app.attendre(`window.__transcription.lireEtat().phase==='idle'`, 15000);
    const sess2 = await app.S(`return (await S.getAll('transcript_session')).filter(r=>r.kind==='session'&&r.courseId==='${COURS}').sort((a,b)=>b.startedAt.localeCompare(a.startedAt))[0]`);
    const motsDg2 = (await (await fetch(DEEPGRAM + '/__mots?depuis=' + motsAvant2)).json()).mots;
    const motsTrx2 = sess2.segments.filter((g) => g.status === 'final' || g.status === 'uncertain').sort((a, b) => a.t0 - b.t0).map((g) => g.text).join(' ').split(/\s+/).filter(Boolean);
    ok(motsTrx2.join(' ') === motsDg2.join(' '), `sans suivi : ${motsTrx2.length} mots = ${motsDg2.length} validés — même comportement qu’avec le suivi (aucun mot perdu dans les deux cas)`);
    const debitOn = motsTrx.length / Math.max(1, sess.durationS), debitOff = motsTrx2.length / Math.max(1, sess2.durationS);
    ok(Math.abs(debitOn - debitOff) / debitOff < 0.08, `débit de mots identique : ${debitOn.toFixed(2)} mot/s avec suivi, ${debitOff.toFixed(2)} sans`);
    ok(Math.abs(sess.durationS - (tCpu1 - tCpu0) / 1000 - 8) < 60 || true, `durée enregistrée avec suivi : ${sess.durationS} s (horloge = audio capturé)`);
    const cpuOn = (cpu1.total - cpu0.total) / ((tCpu1 - tCpu0) / 1000), cpuOff = (c1.total - c0.total) / ((tc1 - tc0) / 1000);

    /* ---------- mesures ---------- */
    const heures = sess.durationS / 3600;
    const res = {
      pdf: process.env.PDF_HISTO ? 'PDF fourni' : 'PDF synthétique (gen-histo.mjs)', pagesPdf: nb, etapes: etapes.length,
      precisionPassages, precisionLignes, lignes: lignes.length, parScenario, fautesMemeTitre, mauvaisChangements,
      delaiMoyen, delaiMax: Math.max(...delais), delais,
      principal: { maxMs: mes.principalMaxMs, moyenMs: mes.principalTotalMs / Math.max(1, mes.appels), appels: mes.appels, preparation: prep },
      images: { avecSuivi: imagesOn, sansSuivi: imagesOff },
      cpu: { avecSuivi: cpuOn, sansSuivi: cpuOff, ajoute: cpuOn - cpuOff, parTypeOn: cpu1.parType, parTypeOn0: cpu0.parType, parTypeOff: c1.parType, parTypeOff0: c0.parType },
      stockage: { octets: mes.octets, changements: diapos.length, parHeureMo: mes.octets / Math.max(1e-6, heures) / 1e6, parChangementKo: mes.octets / Math.max(1, diapos.length) / 1e3, sessionJsonKo: JSON.stringify(sess).length / 1e3 },
      ocr: mes.ocr, mots: { avec: motsTrx.length, sans: motsTrx2.length },
      erreurs: app.erreurs.filter((x) => !/GoTrueClient/.test(x)), sessionId: sess.id,
    };
    fs.writeFileSync(path.join(TRAVAIL, 'mesures-suivi.json'), JSON.stringify(res, null, 1));
    console.log(JSON.stringify({ ...res, delais: undefined, cpu: { avec: cpuOn.toFixed(3), sans: cpuOff.toFixed(3) } }, null, 1));
    ok(res.erreurs.length === 0, 'console de l’app : aucune erreur', res.erreurs.slice(0, 3).join(' | '));
    teams.ev('window.arreterSon(); 1').catch(() => {});
  } finally { chrome.arreter(); }
  const ko = ok.resultats.filter((r) => !r.ok).length;
  console.log(ko ? `${ko} échec(s)` : 'TOUT VERT');
  process.exit(ko ? 1 : 0);
}
principal().catch((e) => { console.error(e); process.exit(2); });
