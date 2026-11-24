// Banc « suivi automatique des diapos » (24/11/2026, docs/compte-rendu-suivi-auto-diapos.md) — RÉPARTITION APRÈS COUP.
// Le même faux cours Teams, transcrit dans un DOCUMENT VIERGE (créé dans l'app, sans PDF) : les changements de diapo sont
// gardés mais rien n'est reconnu. Puis « Remplacer par un PDF » (le PDF du prof), « Relier aux diapos automatiquement »
// (aperçu, Appliquer) → même précision qu'en direct ; enfin « Restaurer » depuis l'Historique remet l'état d'avant.
// Prérequis : comme t-suivi.mjs.   Usage : node t-repartition.mjs
import fs from 'node:fs';
import path from 'node:path';
import { cdp, lancerChrome, dormir, ok, BASE, TEAMS, PORT_CHROME, TRAVAIL, DOSSIER_IMG } from './commun.mjs';

const DUREE = Number(process.env.DUREE || 14) * 1000;
const CAPTURES = !process.env.PDF_HISTO;
const COURS = 'f-diapos-vierge';
const SUITE = [1, 2, 3, 4, 5, 6, 7, 9, 10, 17, 18, 19, 14, 24, 27, 28, 29, 30, 'autre', 31];

async function principal() {
  const chrome = await lancerChrome();
  try {
    const teams = await cdp(PORT_CHROME, { url: TEAMS + '/' });
    ok(await teams.attendre('window.pret === true', 60000), 'faux Teams prêt');
    const app = await cdp(PORT_CHROME, { url: 'about:blank' });
    await app.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const gdm = navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia;
      if (!gdm) return; navigator.mediaDevices.getDisplayMedia = function (c) { c = c || {}; if (c.audio) c.audio = Object.assign({}, typeof c.audio === 'object' ? c.audio : {}, { suppressLocalAudioPlayback: true }); return gdm.call(this, c); }; })();` });
    await app.send('Page.navigate', { url: BASE + '/medrevise' });
    await app.attendre(`document.readyState === 'complete'`, 30000);
    await app.ev(`(localStorage.setItem('app.current', '"medrevise"'), 1)`);
    await app.send('Page.reload'); await app.attendre(`document.readyState === 'complete'`, 30000); await dormir(3000);
    await app.S(`await S.put('sources',{id:'src-diapos',nom:'Banc diapos',couleur:'#2dd4bf'});await S.put('matieres',{id:'mat-diapos',nom:'Histologie (banc)',sourceId:'src-diapos'});
      await S.put('fiches',{id:'${COURS}',matiereId:'mat-diapos',dossierId:null,titre:'Cours vierge (banc)',type:'standard',docNotes:true,dateImport:'2026-11-24'});return 1`);
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
      return false;
    };
    ok(await ouvrir('Cours vierge (banc)'), 'document vierge ouvert (créé dans l’app, sans PDF)');
    await app.ev(`([...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Transcript'))||{click(){}}).click(),1`); await dormir(900);
    await app.ev(`([...document.querySelectorAll('.trx-accueil button')].find(x=>/Transcrire le cours/.test(x.innerText))||{click(){}}).click(),1`); await dormir(1500);
    await app.attendre(`!!document.querySelector('.trx-feuille select')`, 8000);
    await app.ev(`(()=>{const s=document.querySelector('.trx-feuille select');const o=[...s.options].find(o=>o.value==='onglet');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
    await dormir(600);
    await app.clic(`[...document.querySelectorAll('.trx-feuille button')].filter(x=>/Démarrer/.test(x.innerText)).pop()`, 500);
    ok(await app.attendre(`window.__transcription && window.__transcription.lireEtat().phase==='live'`, 20000), 'transcription de l’onglet en direct');
    await teams.ev('window.demarrerSon()');
    ok(await app.attendre(`window.__transcription.lireSuivi().statut==='sansPdf'`, 30000), 'sans PDF : « Pas de PDF : changements mémorisés »', await app.ev(`(document.querySelector('.trx-suivi-ind')||{}).innerText`));
    const etapes = [];
    for (const p of SUITE) {
      const t0 = Date.now();
      await teams.ev(p === 'autre' ? `window.montrer('autre'); 1` : `window.montrer(${p}); 1`);
      etapes.push({ page: p, t0 });
      await dormir(DUREE);
    }
    await app.clic(`document.querySelector('.trx-stop')`, 4000);
    ok(await app.attendre(`window.__transcription.lireEtat().phase==='idle'`, 15000), 'session arrêtée');
    const lire = () => app.S(`return (await S.getAll('transcript_session')).filter(r=>r.kind==='session'&&r.courseId==='${COURS}').sort((a,b)=>b.startedAt.localeCompare(a.startedAt))[0]`);
    const avant = await lire();
    ok((avant.diapos || []).length >= SUITE.length - 1 && avant.diapos.every((d) => !d.page), `${avant.diapos.length} changements gardés, aucun reconnu (pas de PDF)`);
    /* le prof publie son PDF : Fichier › « Remplacer par un PDF » (même fonction que le menu) */
    const pdf = fs.readFileSync(process.env.PDF_HISTO || path.join(TRAVAIL, 'histo-banc.pdf')).toString('base64');
    const r = await app.ev(`(async()=>{const {remplacerDocumentParPdf}=await import('/src/medrevise/lib/remplacerDocument.js');const S=await import('/src/medrevise/lib/storage.js');
      const s=atob(${JSON.stringify(pdf)});const a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);
      const f=new File([a],'histo.pdf',{type:'application/pdf'});const fiche=await S.getOne('fiches','${COURS}');
      const x=await remplacerDocumentParPdf({fiche,fichiers:[f]});return !!(await S.getOne('fiches','${COURS}')).pdfId})()`);
    ok(r, 'document vierge remplacé par le PDF du prof');
    await app.send('Page.reload'); await app.attendre(`document.readyState === 'complete'`, 30000); await dormir(3500);
    await ouvrir('Cours vierge (banc)');
    await app.ev(`([...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Transcript'))||{click(){}}).click(),1`); await dormir(900);
    await app.ev(`(document.querySelector('.trx-session[data-session="${avant.id}"]')||{click(){}}).click(),1`); await dormir(900);
    await app.ev(`(document.querySelector('.trx-pied .trx-chevron')||{click(){}}).click(),1`); await dormir(600);
    const entree = await app.ev(`!![...document.querySelectorAll('.ctx-menu-item')].find(x=>/Relier aux diapos automatiquement/.test(x.innerText))`);
    ok(entree, 'menu de la session : « Relier aux diapos automatiquement »');
    const t0 = Date.now();
    await app.ev(`([...document.querySelectorAll('.ctx-menu-item')].find(x=>/Relier aux diapos automatiquement/.test(x.innerText))||{click(){}}).click(),1`); await dormir(800);
    ok(await app.attendre(`!!document.querySelector('[data-resume]')`, 180000), 'aperçu prêt', `${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const resume = await app.ev(`document.querySelector('[data-resume]').innerText`);
    ok(/^\d+ passages? → \d+ diapos?, \d+ non reconnus?$/.test(resume), `aperçu : « ${resume} »`);
    if (CAPTURES) await app.capture(DOSSIER_IMG + '04-relier-apercu.png', await app.ev(`(()=>{const r=document.querySelector('.day-pop').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}})()`));
    const inchange = JSON.stringify((await lire()).segments) === JSON.stringify(avant.segments);
    ok(inchange, 'tant qu’on n’a pas cliqué « Appliquer », la session n’est pas modifiée');
    await app.ev(`([...document.querySelectorAll('.day-pop button')].find(x=>/Appliquer/.test(x.innerText))||{click(){}}).click(),1`); await dormir(2500);
    const apres = await lire();
    const backups = await app.S(`const l=await S.getAll('backups');return l.filter(b=>String(b.key).startsWith('pre-relier-diapos-${avant.id}')).length`);
    ok(backups === 1, 'putBackup de la session avant d’appliquer');
    const versions = await app.ev(`(async()=>{const H=await import('/src/medrevise/lib/historiqueDoc.js');const v=await H.listerVersions('${COURS}');return v.filter(x=>/Relier aux diapos/.test(x.raison)).map(x=>({id:x.id,raison:x.raison,trx:!!x.contenu.transcript}))})()`);
    ok(versions.length === 1 && versions[0].trx, 'version « Avant « Relier aux diapos automatiquement » » dans l’Historique, avec la session');
    // précision : chaque passage, chaque ligne
    const off = apres.diapos.map((d) => Date.parse(d.le) / 1000 - d.t).sort((a, b) => a - b)[Math.floor(apres.diapos.length / 2)];
    const vraieA = (ms) => { let v = null; for (const e of etapes) if (e.t0 <= ms && e.page !== 'autre') v = e.page; return v; };
    let pJ = 0;
    for (let i = 0; i < etapes.length; i++) {
      const e = etapes[i], fin = i + 1 < etapes.length ? etapes[i + 1].t0 : Date.now();
      // la diapo reconnue en vigueur au milieu du passage (après le changement, avant le suivant)
      const milieu = (e.t0 + fin) / 2;
      const avantMilieu = apres.diapos.filter((d) => Date.parse(d.le) <= milieu).sort((a, b) => Date.parse(a.le) - Date.parse(b.le));
      const dernier = avantMilieu[avantMilieu.length - 1];
      const enVigueur = [...avantMilieu].reverse().find((d) => d.page);
      if (e.page === 'autre' ? (dernier && !dernier.page && enVigueur && enVigueur.page === 30) : (enVigueur && enVigueur.page === e.page)) pJ++;
    }
    const lignes = apres.segments.filter((g) => g.status === 'final');
    const lJ = lignes.filter((g) => g.page === vraieA((off + g.t0) * 1000)).length;
    ok(pJ / etapes.length >= 0.95, `après coup : passages ${(100 * pJ / etapes.length).toFixed(1)} % (${pJ}/${etapes.length})`);
    ok(lJ / lignes.length >= 0.95, `après coup : lignes ${(100 * lJ / lignes.length).toFixed(1)} % (${lJ}/${lignes.length})`);
    ok(await app.ev(`!!document.querySelector('.trx-liste .trx-page')`), 'les lignes affichent leur « p. N »');
    if (CAPTURES) await app.capture(DOSSIER_IMG + '05-relie-lignes.png', await app.ev(`(()=>{const r=document.querySelector('.trx-panneau').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.min(520,Math.round(r.height))}})()`));
    /* Historique › « Restaurer » la version d'avant → l'état d'avant */
    await app.ev(`(async()=>{const H=await import('/src/medrevise/lib/historiqueDoc.js');const v=(await H.listerVersions('${COURS}')).find(x=>/Avant « Relier aux diapos/.test(x.raison));await H.restaurerVersion('${COURS}',v);return 1})()`);
    const restauree = await lire();
    ok(JSON.stringify(restauree.segments) === JSON.stringify(avant.segments) && JSON.stringify(restauree.diapos) === JSON.stringify(avant.diapos), '« Restaurer » depuis l’Historique remet la session d’avant (lignes et diapos identiques)');
    const fiche = await app.S(`return await S.getOne('fiches','${COURS}')`);
    ok(!!fiche.pdfId, 'le PDF reste rattaché (la version restaurée ne portait que la session)');
    fs.writeFileSync(path.join(TRAVAIL, 'mesures-repartition.json'), JSON.stringify({ resume, passages: pJ / etapes.length, lignes: lJ / lignes.length, nPassages: etapes.length, nLignes: lignes.length, dureeAnalyseS: null }, null, 1));
    ok(app.erreurs.filter((x) => !/GoTrueClient/.test(x)).length === 0, 'console : aucune erreur', app.erreurs.slice(0, 3).join(' | '));
    teams.ev('window.arreterSon(); 1').catch(() => {});
  } finally { chrome.arreter(); }
  const ko = ok.resultats.filter((r) => !r.ok).length;
  console.log(ko ? `${ko} échec(s)` : 'TOUT VERT');
  process.exit(ko ? 1 : 0);
}
principal().catch((e) => { console.error(e); process.exit(2); });
