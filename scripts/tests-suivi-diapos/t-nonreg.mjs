// Banc « suivi automatique des diapos » (24/11/2026) — NON-RÉGRESSION de la transcription.
// Micro (périphérique factice : jamais le vrai micro, aucun son joué), session reprise depuis l'onglet, lecteur PDF.
// Prérequis : comme t-suivi.mjs (cours « Histologie générale (banc) » semé par ce script).  Usage : node t-nonreg.mjs
import fs from 'node:fs';
import path from 'node:path';
import { cdp, lancerChrome, dormir, ok, BASE, TEAMS, PORT_CHROME, TRAVAIL, INJECTION_PARTAGE } from './commun.mjs';

const COURS = 'f-diapos-histo';
async function principal() {
  let chrome = await lancerChrome({ autoriser: true });
  try {
    let teams = await cdp(PORT_CHROME, { url: TEAMS + '/' });
    await teams.attendre('window.pret === true', 60000);
    let app = await cdp(PORT_CHROME, { url: 'about:blank' });
    await app.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECTION_PARTAGE });
    await app.send('Page.navigate', { url: BASE + '/medrevise' });
    await app.attendre(`document.readyState === 'complete'`, 30000);
    await app.ev(`(localStorage.setItem('app.current', '"medrevise"'), 1)`);
    const pdf = fs.readFileSync(process.env.PDF_HISTO || path.join(TRAVAIL, 'histo-banc.pdf')).toString('base64');
    await app.S(`const s=atob(${JSON.stringify(pdf)});const a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);
      await S.put('sources',{id:'src-diapos',nom:'Banc diapos',couleur:'#2dd4bf'});await S.put('matieres',{id:'mat-diapos',nom:'Histologie (banc)',sourceId:'src-diapos'});
      const p=await S.putBlob(new Blob([a],{type:'application/pdf'}));await S.put('fiches',{id:'${COURS}',matiereId:'mat-diapos',dossierId:null,titre:'Histologie générale (banc)',type:'standard',pdfId:p,pdfName:'histo.pdf',dateImport:'2026-11-24'});return 1`);
    await app.send('Page.reload'); await app.attendre(`document.readyState === 'complete'`, 30000); await dormir(3500);
    await app.send('Page.bringToFront');
    await app.ev(`(()=>{const x=[...document.querySelectorAll('.hub-card')].find(e=>/MedRevise/.test(e.innerText||''));x&&x.click();return 1})()`); await dormir(1500);
    await app.ev(`(()=>{const b=[...document.querySelectorAll('.sb-item, .sidebar [role=button], .sidebar button, .sidebar a')].find(e=>/Biblioth/.test(e.innerText||e.title||''));b&&b.click();return 1})()`); await dormir(1200);
    await app.ev(`(([...document.querySelectorAll('.lt-fiche')].find(e=>e.innerText.trim().startsWith('Histologie générale (banc)'))||{querySelector:()=>null}).querySelector('.lt-rangee')||{click(){}}).click(),1`);
    ok(await app.attendre(`!!document.querySelector('.pdfr-scroll')`, 15000), 'lecteur PDF : cours ouvert');
    // lecteur : défilement de 3 écrans → le numéro de page suit
    await app.attendre(`parseInt((document.querySelector('.ptb-pages .tnum')||{}).innerText) >= 1`, 15000); await dormir(800);
    const p0 = await app.ev(`parseInt((document.querySelector('.ptb-pages .tnum')||{}).innerText)`);
    for (let k = 0; k < 3; k++) { await app.ev(`(()=>{const s=document.querySelector('.pdfr-scroll');s.scrollTop+=s.clientHeight*1.2;s.dispatchEvent(new Event('scroll'));return 1})()`); await dormir(500); }
    await dormir(800);
    const p1 = await app.ev(`parseInt((document.querySelector('.ptb-pages .tnum')||{}).innerText)`);
    ok(p1 > p0, `lecteur PDF : défilement, numéro de page à jour (${p0} → ${p1})`);
    const demarrer = async (source) => {
      await app.ev(`([...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Transcript'))||{click(){}}).click(),1`); await dormir(900);
      for (let essai = 0; essai < 4 && !(await app.ev(`window.__transcription && window.__transcription.lireEtat().phase==='live'`)); essai++) {
        if (!(await app.ev(`!!document.querySelector('.trx-feuille select')`))) { await app.ev(`([...document.querySelectorAll('.trx-accueil button')].find(x=>/Transcrire le cours/.test(x.innerText))||{click(){}}).click(),1`); await dormir(1500); }
        if (!(await app.attendre(`!!document.querySelector('.trx-feuille select')`, 6000))) continue;
        if (source === 'onglet') await app.ev(`(()=>{const s=document.querySelector('.trx-feuille select');const o=[...s.options].find(o=>o.value==='onglet');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
        await dormir(800);
        await app.attendre(`(()=>{const x=[...document.querySelectorAll('.trx-feuille button')].filter(x=>/Démarrer|Reprendre/.test(x.innerText)).pop();return !!x&&!x.disabled})()`, 10000);
        await app.send('Page.bringToFront');
        await app.clic(`[...document.querySelectorAll('.trx-feuille button')].filter(x=>/Démarrer|Reprendre/.test(x.innerText)).pop()`, 500);
        await app.attendre(`window.__transcription.lireEtat().phase==='live'`, 12000);
      }
      const vivant = await app.ev(`window.__transcription.lireEtat().phase==='live'`);
      if (!vivant) console.log('DIAG', JSON.stringify(await app.ev(`({e:window.__transcription.lireEtat().erreur,phase:window.__transcription.lireEtat().phase,feuille:(document.querySelector('.trx-feuille')||{}).innerText?.slice(0,400)})`)));
      return vivant;
    };
    /* 1. micro (factice) : la transcription marche comme avant, pas de suivi de diapo (aucune vidéo) */
    ok(await demarrer('micro'), 'micro : transcription en direct');
    await dormir(12000);
    const m = await app.ev(`(()=>{const e=window.__transcription.lireEtat();return {lignes:e.session.segments.filter(s=>s.status==='final').length,pages:e.session.segments.filter(s=>s.status==='final').map(s=>s.page),suivi:window.__transcription.lireSuivi().disponible,ligne:!!document.querySelector('.trx-suivi')}})()`);
    ok(m.lignes >= 2, `micro : ${m.lignes} lignes validées`);
    ok(!m.suivi && !m.ligne, 'micro : pas de suivi des diapos ni d’interrupteur (aucune image)');
    ok(m.pages.every((p) => p === p1), `micro : lignes sur la page affichée par le lecteur (${p1}), comme avant`);
    ok(await app.ev(`!!document.querySelector('.trx-credits, .crd, [class*=credit]')`), 'crédits Deepgram affichés');
    await app.clic(`document.querySelector('.trx-stop')`, 3500);
    ok(await app.attendre(`window.__transcription.lireEtat().phase==='idle'`, 15000), 'micro : session arrêtée');
    const sid = await app.S(`return (await S.getAll('transcript_session')).filter(r=>r.kind==='session'&&r.courseId==='${COURS}').sort((a,b)=>b.startedAt.localeCompare(a.startedAt))[0].id`);
    /* 2. reprise de la session terminée, depuis l'onglet : la suite s'ajoute, le suivi démarre. Chrome relancé SANS
       l'acceptation automatique (elle remplacerait le partage de l'onglet par un faux écran), même profil. */
    chrome.arreter(); await dormir(1500);
    chrome = await lancerChrome({ garder: true });
    teams = await cdp(PORT_CHROME, { url: TEAMS + '/' }); await teams.attendre('window.pret === true', 60000);
    app = await cdp(PORT_CHROME, { url: 'about:blank' });
    await app.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECTION_PARTAGE });
    await app.send('Page.navigate', { url: BASE + '/medrevise' }); await app.attendre(`document.readyState === 'complete'`, 30000); await dormir(3500);
    await app.send('Page.bringToFront');
    await app.ev(`(()=>{const x=[...document.querySelectorAll('.hub-card')].find(e=>/MedRevise/.test(e.innerText||''));x&&x.click();return 1})()`); await dormir(1500);
    await app.ev(`(()=>{const b=[...document.querySelectorAll('.sb-item, .sidebar [role=button], .sidebar button, .sidebar a')].find(e=>/Biblioth/.test(e.innerText||e.title||''));b&&b.click();return 1})()`); await dormir(1200);
    await app.ev(`(([...document.querySelectorAll('.lt-fiche')].find(e=>e.innerText.trim().startsWith('Histologie générale (banc)'))||{querySelector:()=>null}).querySelector('.lt-rangee')||{click(){}}).click(),1`);
    await app.attendre(`!!document.querySelector('.pdfr-scroll')`, 15000);
    await app.ev(`([...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Transcript'))||{click(){}}).click(),1`); await dormir(1200);
    await app.ev(`(document.querySelector('.trx-session[data-session="${sid}"] .trx-session-reprendre')||{click(){}}).click(),1`); await dormir(2000);
    if (await app.ev(`!!document.querySelector('.trx-feuille select')`)) {
      await app.ev(`(()=>{const s=document.querySelector('.trx-feuille select');const o=[...s.options].find(o=>o.value==='onglet');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
      await dormir(800); await app.send('Page.bringToFront');
      await app.clic(`[...document.querySelectorAll('.trx-feuille button')].filter(x=>/Reprendre/.test(x.innerText)).pop()`, 500);
    }
    ok(await app.attendre(`window.__transcription.lireEtat().phase==='live' && window.__transcription.lireEtat().session.id==='${sid}'`, 15000), 'reprise : même session, depuis l’onglet');
    await teams.ev('window.demarrerSon(); window.montrer(6); 1');
    ok(await app.attendre(`window.__transcription.lireSuivi().page===6`, 30000), 'reprise : le suivi reconnaît la diapo 6', JSON.stringify(await app.ev('window.__transcription.lireSuivi()')));
    await dormir(9000);
    await app.clic(`document.querySelector('.trx-stop')`, 3500);
    await app.attendre(`window.__transcription.lireEtat().phase==='idle'`, 15000);
    const s = await app.S(`return await S.getOne('transcript_session','${sid}')`);
    const reprise = s.segments.findIndex((g) => g.reprise);
    const apres = s.segments.slice(reprise + 1).filter((g) => g.status === 'final');
    ok(reprise > 0 && apres.length >= 2 && apres.every((g) => g.page === 6), `reprise : marque « reprise à … », ${apres.length} lignes ajoutées sur la diapo 6`);
    ok(s.segments.slice(0, reprise).filter((g) => g.status === 'final').every((g) => g.page === p1), 'reprise : les lignes d’avant ne bougent pas');
    ok(app.erreurs.filter((x) => !/GoTrueClient/.test(x)).length === 0, 'console : aucune erreur', app.erreurs.slice(0, 2).join(' | '));
    teams.ev('window.arreterSon(); 1').catch(() => {});
  } finally { chrome.arreter(); }
  const ko = ok.resultats.filter((r) => !r.ok).length;
  console.log(ko ? `${ko} échec(s)` : 'TOUT VERT');
  process.exit(ko ? 1 : 0);
}
principal().catch((e) => { console.error(e); process.exit(2); });
