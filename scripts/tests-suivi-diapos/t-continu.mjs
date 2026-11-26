// Banc « suivi des diapos CONTINU » (26/11/2026, docs/compte-rendu-suivi-diapos-continu-et-defilement.md).
// Un long faux cours Teams (un changement de diapo toutes les 1 à 3 min, tirage reproductible) pendant que l'élève est
// AILLEURS : MODE=ailleurs (autre cours de l'app), onglet (un autre onglet du navigateur devant), reduite (fenêtre
// réduite), alterne (les trois à tour de rôle), visible (référence : le cours à l'écran). Chrome NON headless, AUCUN
// drapeau anti-ralentissement (commun.mjs#lancerChrome). Vérité = journal du faux Teams ; preuve = journal horodaté des
// analyses (worker.js#noterJ) et `session.diapos[]`.
// Prérequis : faux-deepgram-diapos (:54410), faux-teams (:54411), medrevise-banc-diapos (:5304) — .claude/launch.json.
// Usage : MODE=onglet MINUTES=20 node t-continu.mjs     (PARTAGE=1 : coupe puis reprend le partage au milieu)
import fs from 'node:fs';
import path from 'node:path';
import { cdp, lancerChrome, cpuChrome, dormir, ok, BASE, TEAMS, DEEPGRAM, PORT_CHROME, TRAVAIL, ouvrirBanc } from './commun.mjs';

const MODE = process.env.MODE || 'onglet';
const MINUTES = Number(process.env.MINUTES || 20);
const MIN_S = Number(process.env.MIN_S || 60), MAX_S = Number(process.env.MAX_S || 180);
const PARTAGE = !!process.env.PARTAGE;
const SORTIE = process.env.SORTIE || path.join(TRAVAIL, `continu-${MODE}.json`);
const COURS = 'f-diapos-histo', AUTRE_COURS = 'f-diapos-autre';

/* tirage reproductible (graine = MODE) */
let graine = [...MODE].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
const alea = () => { graine = (graine * 1664525 + 1013904223) >>> 0; return graine / 2 ** 32; };

async function principal() {
  const chrome = await lancerChrome();
  const r = { mode: MODE, minutes: MINUTES };
  try {
    const { teams, nb, app, ouvrir, demarrerOnglet } = await ouvrirBanc();
    /* fenêtre (réduire / rétablir) et onglets */
    const fen = (await app.send('Browser.getWindowForTarget', { targetId: app.id })).result.windowId;
    const reduire = async (on) => { await app.send('Browser.setWindowBounds', { windowId: fen, bounds: { windowState: on ? 'minimized' : 'normal' } }); };
    let autreOnglet = null;
    const ailleurs = async (ou) => {
      if (ou === 'reduite') { await reduire(true); return; }
      await reduire(false);
      if (ou === 'teams') { await teams.send('Page.bringToFront'); return; } // l'onglet Teams devant (référence)
      if (ou === 'onglet') { if (!autreOnglet) autreOnglet = await cdp(PORT_CHROME, { url: 'data:text/html,<title>Autre onglet</title><p>Autre onglet</p>' }); await autreOnglet.send('Page.bringToFront'); return; }
      await app.send('Page.bringToFront');
      if (ou === 'ailleurs') await ouvrir('Autre cours (banc)');
      if (ou === 'visible') await ouvrir('Histologie générale (banc)');
    };

    ok(await ouvrir('Histologie générale (banc)'), 'cours ouvert dans le lecteur');
    const motsAvant = await demarrerOnglet();
    if (!ok(await app.attendre(`window.__transcription && window.__transcription.lireEtat().phase==='live'`, 20000), 'transcription en direct depuis l’onglet « Faux Teams »')) throw new Error('démarrage impossible : banc interrompu (à relancer)');
    await teams.ev('window.demarrerSon()');
    ok(await app.attendre(`window.__transcription.lireSuivi().statut==='suivi'`, 60000), 'suivi prêt (pages du PDF préparées)');
    await teams.ev('window.montrer(1); 1');
    await dormir(5000);
    r.niveauSon = await app.ev(`(async()=>{let m=0;for(let i=0;i<20;i++){m=Math.max(m,(window.__transcription.lireNiveau()||{}).niveau||0);await new Promise(r=>setTimeout(r,150))}return m})()`);
    console.log('  niveau du son capturé (max) :', r.niveauSon);

    const idPage = await app.ev('window.__idPageBanc = window.__idPageBanc || Math.random()'); // page jamais rechargée ?
    /* ---------- le long cours ---------- */
    const fin = Date.now() + MINUTES * 60000;
    const cpu0 = await cpuChrome(); const tCpu0 = Date.now();
    const rotation = ['ailleurs', 'onglet', 'reduite', 'visible'];
    let ou = MODE === 'alterne' ? 'ailleurs' : MODE; let iRot = 0;
    await ailleurs(ou);
    const vis = [];
    let page = 1; let prochainLieu = Date.now() + (120 + alea() * 120) * 1000; let coupe = false;
    const changements = [];
    while (Date.now() < fin - MIN_S * 1000) {
      const attente = (MIN_S + alea() * (MAX_S - MIN_S)) * 1000;
      const t1 = Date.now() + attente;
      while (Date.now() < t1) {
        await dormir(Math.min(5000, t1 - Date.now()));
        if (MODE === 'alterne' && Date.now() >= prochainLieu) { iRot = (iRot + 1) % rotation.length; ou = rotation[iRot]; await ailleurs(ou); prochainLieu = Date.now() + (120 + alea() * 120) * 1000; }
      }
      vis.push({ t: Date.now(), ou, etat: await app.ev('document.visibilityState') });
      // diapo suivante (le plus souvent la suivante, parfois un saut ou un retour)
      const x = alea(); const avant = page;
      page = x < 0.75 ? page + 1 : x < 0.9 ? page + 2 + Math.floor(alea() * 5) : Math.max(1, page - 1 - Math.floor(alea() * 3));
      if (page > nb) page = 1 + Math.floor(alea() * 4);
      if (page === avant) page = (page % nb) + 1;
      if (PARTAGE && !coupe && Date.now() > tCpu0 + (MINUTES * 60000) / 2) {
        coupe = true;
        const indic = () => app.ev(`(document.querySelector('.trx-suivi-ind')||{}).innerText||''`);
        const tonIndic = () => app.ev(`(document.querySelector('.trx-suivi-ind')||{}).className||''`);
        /* (a) le prof arrête de partager (galerie de Teams) : la diapo n'est plus reconnue, puis reprise */
        await teams.ev('window.couperPartage(); 1'); changements.push({ t: Date.now(), quoi: 'coupe', ou });
        await dormir(15000); r.indicationGalerie = { txt: await indic(), ton: await tonIndic() };
        /* (b) le partage ne fournit plus AUCUNE image pendant 25 s (copie de la piste coupée, relecture bloquée) */
        const tCoupe = Date.now();
        await app.ev('window.__transcription.couperImagesPourBanc(25000)');
        let orange = null;
        for (let k = 0; k < 30 && !orange; k++) { await dormir(500); const t = await indic(); if (/Vérification arrêtée/.test(t) && /alerte/.test(await tonIndic())) orange = { txt: t, apresS: (Date.now() - tCoupe) / 1000 }; }
        r.indicationArret = orange;
        let reprise = null;
        for (let k = 0; k < 90 && !reprise; k++) { await dormir(500); const t = await indic(); if (/vérifiée il y a/.test(t) || /^Diapo non reconnue/.test(t)) reprise = { txt: t, apresS: (Date.now() - tCoupe) / 1000 }; }
        r.reprise = reprise;
        console.log('  partage : galerie →', JSON.stringify(r.indicationGalerie), '· sans image →', JSON.stringify(orange), '· reprise →', JSON.stringify(reprise));
      }
      await teams.ev(`window.montrer(${page}); 1`);
      changements.push({ t: Date.now(), quoi: 'montrer', page, ou });
      console.log(`  ${new Date().toISOString().slice(11, 19)} diapo ${page} (élève : ${ou}, page ${vis[vis.length - 1].etat})`);
    }
    await dormir(Math.max(15000, fin - Date.now())); // au moins 15 s après le dernier changement
    const cpu1 = await cpuChrome(); const tCpu1 = Date.now();
    r.cpuCoeurs = (cpu1.total - cpu0.total) / ((tCpu1 - tCpu0) / 1000);
    r.cpuParType = Object.fromEntries(Object.keys(cpu1.parType).map((k) => [k, (cpu1.parType[k] - (cpu0.parType[k] || 0)) / ((tCpu1 - tCpu0) / 1000)]));

    /* ---------- retour sur le cours ---------- */
    const etatAvantRetour = await app.ev(`JSON.parse(JSON.stringify(window.__transcription.lireSuivi()))`);
    await reduire(false); await app.send('Page.bringToFront'); await dormir(1500);
    const indRetour = await app.ev(`(document.querySelector('.trx-suivi-ind')||{}).innerText||''`);
    r.pageRechargee = (await app.ev('window.__idPageBanc')) !== idPage;
    const journal = await app.ev('JSON.parse(JSON.stringify(window.__transcription.journalSuivi))');
    const etat = await app.ev(`JSON.parse(JSON.stringify(window.__transcription.lireEtat().session))`);
    await app.ev(`(document.querySelector('.trx-stop')||{click(){}}).click(),1`);
    await app.attendre(`window.__transcription.lireEtat().phase==='idle'`, 15000);
    const motsDg = (await (await fetch(DEEPGRAM + '/__mots?depuis=' + motsAvant)).json()).mots;
    const sess = await app.S(`return (await S.getAll('transcript_session')).filter(r=>r.kind==='session'&&r.courseId==='${COURS}').sort((a,b)=>b.startedAt.localeCompare(a.startedAt))[0]`) || etat;

    /* ---------- analyse ---------- */
    const diapos = (sess.diapos || []);
    const montres = changements.filter((c) => c.quoi === 'montrer');
    let detectes = 0; const delais = []; const rates = [];
    for (let i = 0; i < montres.length; i++) {
      const c = montres[i]; const suivant = i + 1 < montres.length ? montres[i + 1].t : Date.now();
      const d = diapos.find((x) => x.pageCle === c.page && Date.parse(x.le) + (x.delaiMs || 0) >= c.t - 500 && Date.parse(x.le) + (x.delaiMs || 0) < suivant + 500);
      if (d) { detectes++; delais.push((Date.parse(d.le) + d.delaiMs - c.t) / 1000); } else rates.push({ ...c, h: new Date(c.t).toISOString().slice(11, 19) });
    }
    // trous du journal : écart entre deux « pouls » (toutes les 5 s quand la boucle tourne) et retard de la dernière vérification
    const pouls = journal.filter((e) => e.quoi === 'pouls' && e.t >= tCpu0);
    let trou = 0, retardVerif = 0;
    for (let i = 1; i < pouls.length; i++) trou = Math.max(trou, pouls[i].t - pouls[i - 1].t);
    if (pouls.length) trou = Math.max(trou, pouls[0].t - tCpu0, tCpu1 - pouls[pouls.length - 1].t);
    else trou = tCpu1 - tCpu0;
    for (const p of pouls) if (p.tVerif) retardVerif = Math.max(retardVerif, p.t - p.tVerif);
    const lignes = sess.segments.filter((g) => g.status === 'final' || g.status === 'uncertain').sort((a, b) => a.t0 - b.t0);
    const motsTrx = lignes.map((g) => g.text).join(' ').split(/\s+/).filter(Boolean);
    Object.assign(r, {
      changements: montres.length, detectes, rates, delaiMoyen: delais.reduce((a, b) => a + b, 0) / Math.max(1, delais.length), delaiMax: Math.max(0, ...delais), delais,
      trouMaxS: trou / 1000, retardVerifMaxS: retardVerif / 1000, visibilite: vis, etatAvantRetour, indRetour,
      mots: { trx: motsTrx.length, dg: motsDg.length, identiques: motsTrx.join(' ') === motsDg.join(' ') },
      incidents: journal.filter((e) => !['pouls', 'analyse', 'changement-vu', 'ocr-demande', 'ocr-reponse'].includes(e.quoi)),
      erreurs: app.erreurs.filter((x) => !/GoTrueClient/.test(x)),
    });
    fs.writeFileSync(SORTIE, JSON.stringify({ ...r, journal, diapos: diapos.map(({ masque, ...x }) => x), verite: changements }, null, 1));
    ok(!r.pageRechargee, `${MODE} : la page de l’app n’a jamais été rechargée pendant le cours`);
    ok(detectes === montres.length, `${MODE} : ${detectes}/${montres.length} changements détectés`, rates.map((x) => `${x.h} p.${x.page}`).join(', '));
    ok(r.delaiMax <= 3.05, `${MODE} : délai moyen ${r.delaiMoyen.toFixed(2)} s, max ${r.delaiMax.toFixed(2)} s`);
    ok(trou <= 10000, `${MODE} : plus grand trou du journal ${(trou / 1000).toFixed(1)} s (pouls), vérification la plus en retard ${(retardVerif / 1000).toFixed(1)} s`);
    ok(r.mots.identiques, `${MODE} : aucun mot perdu (${motsTrx.length} = ${motsDg.length})`);
    ok(r.erreurs.length === 0, `${MODE} : console sans erreur`, r.erreurs.slice(0, 3).join(' | '));
    if (PARTAGE) {
      ok(r.indicationGalerie && /^Diapo non reconnue/.test(r.indicationGalerie.txt) && /alerte/.test(r.indicationGalerie.ton), `partage du prof arrêté (galerie) → orange « ${r.indicationGalerie && r.indicationGalerie.txt} »`);
      ok(r.indicationArret && r.indicationArret.apresS <= 12, `plus aucune image du partage → orange « ${r.indicationArret && r.indicationArret.txt} » après ${r.indicationArret && r.indicationArret.apresS.toFixed(1)} s`);
      ok(r.reprise && r.reprise.apresS <= 40, `reprise automatique : « ${r.reprise && r.reprise.txt} » ${r.reprise && r.reprise.apresS.toFixed(1)} s après la coupure (relecture débloquée à 25 s)`);
    }
    console.log(`  CPU de tout Chrome : ${r.cpuCoeurs.toFixed(3)} cœur — retour : « ${indRetour} » — journal → ${SORTIE}`);
    teams.ev('window.arreterSon(); 1').catch(() => {});
  } finally { chrome.arreter(); }
  const ko = ok.resultats.filter((x) => !x.ok).length;
  console.log(ko ? `${ko} échec(s)` : 'TOUT VERT');
  process.exit(ko ? 1 : 0);
}
principal().catch((e) => { console.error(e); process.exit(2); });
