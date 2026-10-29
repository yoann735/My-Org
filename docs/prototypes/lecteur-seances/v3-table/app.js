/* Version C — « La table de travail synchronisée ».
   Plus de bascule de documents : fiche, diapo et transcript sont trois volets liés. Le sommaire du cours (à gauche)
   range tout par séance ; Exos / Notions / Notes vivent dans un tiroir bas filtrable ; ⌘K ouvre la palette d'actions. */
(function () {
  const { COURS, SEANCES, TRANSCRIPTS, FICHES, FICHE_A_IMPORTER, ANNOTATIONS, seanceDePage, titreDiapo, pagesFiche } = window.MR;
  const { h, ic, diapo, pageFiche, toast, monter, seance } = window.Proto;

  const etat = {
    appareil: 'desktop', ecran: 'cours', mode: 'reviser', agrandi: null,
    fiches: FICHES.slice(), ficheId: 'f4', pageFiche: 1, diapoPage: 181, trans: { sid: 's4', t: 0 },
    sync: true, rail: true, ouvertes: { s4: true }, tiroir: null, portee: 'seance', outil: 'jaune',
    annots: JSON.parse(JSON.stringify(ANNOTATIONS)), tags: { 181: 'debut', 243: 'fin', 1: 'debut', 58: 'fin', 59: 'debut', 121: 'fin', 122: 'debut', 180: 'fin' },
    ongletSources: 'diapo', voletMobile: 'fiche', feuille: false, palette: false, importer: null, nouvelles: {},
    live: { actif: false, pause: false, n: 0, sec: 0 },
  };
  let appareil = null, minuterie = null;
  const fiche = (id) => etat.fiches.find((f) => f.id === id);
  const fichesDe = (sid) => etat.fiches.filter((f) => f.seances.includes(sid));
  const pagesCache = {};
  const pagesDe = (f) => (pagesCache[f.id] = pagesCache[f.id] || pagesFiche(f));
  const seanceCourante = () => {
    if (etat.mode === 'direct') return seance('s5');
    if (etat.ecran === 'travail' && etat.mode === 'reviser') { const f = fiche(etat.ficheId); const pg = f && pagesDe(f)[etat.pageFiche - 1]; return seance(pg ? pg.seance : f.seances[0]); }
    return seanceDePage(etat.diapoPage) || seance('s4');
  };
  const estMobile = () => etat.appareil === 'mobile';
  const estIpad = () => etat.appareil === 'ipad';

  /* ---------- sommaire (rail) ---------- */
  function rail() {
    const repl = !etat.rail ? ' replie' : '';
    const sc = seanceCourante();
    const ruban = SEANCES.map((s) => `<i style="flex:${s.fin - s.debut + 1};background:${s.couleur};opacity:${s.etat === 'faite' ? 1 : .45}"></i>`).join('');
    const seances = SEANCES.map((s) => {
      const fs = fichesDe(s.id);
      const ouvert = etat.ouvertes[s.id];
      const lignes = fs.map((f) => {
        const actif = etat.ecran === 'travail' && etat.mode === 'reviser' && etat.ficheId === f.id;
        const partage = f.seances.length > 1 ? `<span class="partage" title="Rattachée à ${f.seances.map((x) => 'S' + seance(x).n).join(' + ')}">partagée ${f.seances.map((x) => 'S' + seance(x).n).join('·')}</span>` : '';
        const neuf = etat.nouvelles[f.id] ? '<span class="nouveau">nouveau</span>' : '';
        const parties = actif ? `<div class="vc-r-parties">${f.plan.map((p, i) => {
          const n = pagesDe(f).findIndex((pg) => pg.titre === p) + 1;
          return `<button class="vc-r-p${n && n <= etat.pageFiche && (pagesDe(f).slice(n).findIndex((pg) => f.plan.includes(pg.titre)) + n + 1 > etat.pageFiche) ? ' vue' : ''}" data-act="partie" data-n="${n || 1}">${h(p)}</button>`;
        }).join('')}</div>` : '';
        return `<div class="vc-r-f${actif ? ' actif' : ''}" data-act="ouvrir-fiche" data-f="${f.id}">${ic('fiche', 14)}<span>${h(f.titre)}</span>${partage}${neuf}</div>${parties}`;
      }).join('');
      const vide = !fs.length ? `<div class="vc-r-vide">${s.etat === 'aujourdhui' ? 'Fiche à venir après le cours' : 'Aucune fiche'}</div>` : '';
      const depot = s.etat === 'aujourdhui' ? `<div class="vc-r-depot">Glisser la fiche PDF ici</div>` : '';
      return `<div class="vc-r-seance${etat.importer && etat.importer.survol === s.id ? ' cible' : ''}" style="--sc:${s.couleur}" data-depot="${s.id}">
        <div class="vc-r-s" data-act="basculer-s" data-s="${s.id}"><span class="n">${s.n}</span><span class="t">${h(s.titre)}<small>${s.jour} · p. ${s.debut}–${s.fin}</small></span>
          <span class="meta">${s.etat === 'aujourdhui' ? '<span class="badge-live" style="padding:2px 6px">auj.</span>' : fs.length + ' ' + ic('fiche', 12)}</span></div>
        ${ouvert ? `<div class="vc-r-fiches">${lignes}${vide}${depot}</div>` : ''}</div>`;
    }).join('');
    return `<aside class="vc-rail${repl}" style="--sc:${sc.couleur}">
      <div class="vc-r-cours${etat.ecran === 'cours' ? ' actif' : ''}" data-act="ecran" data-e="cours"><span class="ico">${ic('cartes')}</span><span><b>${h(COURS.titre)}</b><br><small style="color:var(--text-3)">${COURS.pages} pages · ${SEANCES.length} séances</small></span></div>
      <div class="vc-r-ruban">${ruban}</div>
      <h4 style="display:flex;justify-content:space-between;align-items:center">Séances <button class="vc-bt petit" data-act="ecran" data-e="seances" style="height:22px;font-size:11px">Vue d’ensemble</button></h4>
      ${seances}
      <h4 style="margin-top:18px">Diapo d’origine</h4>
      <div class="vc-r-f${etat.mode === 'diapo' && etat.ecran === 'travail' ? ' actif' : ''}" data-act="mode" data-m="diapo">${ic('diapo', 14)}<span>${h(COURS.fichier)}</span><span class="partage">${COURS.pages} p.</span></div>
    </aside>`;
  }

  /* ---------- en-tête ---------- */
  function tete() {
    const m = etat.mode;
    const mob = estMobile();
    const modes = etat.ecran === 'travail' ? `<div class="seg vc-modes">
        <button data-act="mode" data-m="reviser" class="${m === 'reviser' ? 'actif' : ''}">${ic('fiche', 14)}${mob ? '' : ' Réviser'}</button>
        <button data-act="mode" data-m="direct" class="${m === 'direct' ? 'actif' : ''}">${ic('micro', 14)}${mob ? '' : ' En direct'}</button>
        <button data-act="mode" data-m="diapo" class="${m === 'diapo' ? 'actif' : ''}">${ic('diapo', 14)}${mob ? '' : ' Diapo'}</button></div>` : '';
    const sync = etat.ecran === 'travail' && m === 'reviser' && !mob ? `<button class="vc-sync${etat.sync ? ' on' : ''}" data-act="sync" title="Faire suivre la diapo et le transcript quand la fiche défile"><span class="dot"></span>${estIpad() ? 'Liés' : etat.sync ? 'Volets liés' : 'Volets libres'}</button>` : '';
    const sc = seanceCourante();
    const sous = etat.ecran === 'cours' ? COURS.ue : etat.ecran === 'seances' ? 'Vue des séances' : m === 'direct' ? 'Séance 5 · en direct' : m === 'diapo' ? 'Diapo d’origine · ' + COURS.pages + ' p.' : 'Séance ' + sc.n + ' · ' + sc.titre;
    return `<header class="vc-tete">
      <button class="bt-ic${etat.rail ? ' on' : ''}" data-act="rail" title="Sommaire du cours">${ic('panneau')}</button>
      ${mob && etat.ecran !== 'cours' ? `<button class="bt-ic" data-act="ecran" data-e="cours" title="Accueil du cours">${ic('retour')}</button>` : ''}
      <div class="vc-titre"><b>${h(COURS.titre)}</b><small>${h(sous)}</small></div>
      ${mob ? '' : modes}
      <div class="vc-droite">${sync}
        ${mob ? modes : `<button class="vc-k" data-act="palette">${ic('recherche', 14)} Actions <kbd>⌘K</kbd></button>
        <button class="vc-bt" data-act="importer">${ic('import', 15)} Importer une fiche</button>`}
        ${mob ? `<button class="bt-ic" data-act="palette" title="Actions">${ic('plus3')}</button>` : ''}
      </div></header>`;
  }

  /* ---------- écran « Ouverture du cours » ---------- */
  function ecranCours() {
    const s5 = seance('s5'), s4 = seance('s4');
    const bandes = SEANCES.map((s) => `<button class="${s.etat === 'aujourdhui' ? 'auj' : ''}" style="flex:${s.fin - s.debut + 1};--sc:${s.couleur}" data-act="aller-seance" data-s="${s.id}">S${s.n}<small>${s.jour}</small></button>`).join('');
    const recentes = etat.fiches.slice().reverse().slice(0, 4).map((f) => { const s = seance(f.seances[0]); return `<button class="vc-lf" style="--sc:${s.couleur}" data-act="ouvrir-fiche" data-f="${f.id}"><span class="sc"></span><span><b>${h(f.titre)}</b><small>${f.seances.map((x) => 'Séance ' + seance(x).n).join(' + ')} · ${f.pages} p. · importée ${h(f.importe)}</small></span></button>`; }).join('');
    const live = etat.live.actif;
    return `<div class="vc-page">
      <div class="vc-hero"><div><div class="pastille-seance" style="--sc:var(--accent);color:var(--text-3)">${h(COURS.ue)}</div><h1>${h(COURS.titre)}</h1>
        <p>${COURS.pages} pages de diapo · ${SEANCES.length} séances · ${etat.fiches.length} fiches · ${COURS.flashcards} flashcards</p></div></div>
      <div class="vc-grand-ruban"><div class="bandes">${bandes}</div><div class="echelle"><span>p. 1</span><span>p. 58</span><span>p. 121</span><span>p. 180</span><span>p. 243</span><span>p. 300</span></div></div>
      <div class="vc-cartes">
        <div class="vc-carte live"><div class="sur"><span class="badge-live">${live ? 'EN DIRECT' : 'AUJOURD’HUI · 08:30'}</span></div>
          <h3>Séance 5 — ${h(s5.titre)}</h3><p>Diapo p. ${s5.debut}–${s5.fin}. Au démarrage : tag Début posé sur la page affichée, transcript relié aux pages.</p>
          <button class="vc-bt live" data-act="demarrer">${ic('micro', 15)} ${live ? 'Reprendre le direct' : 'Démarrer la séance en direct'}</button></div>
        <div class="vc-carte"><div class="sur">Reprendre</div><h3>${h(fiche('f4').titre)}</h3><p>Séance ${s4.n} · fiche p. 3 / 10 · liée à la diapo p. 197–200 et au transcript 21:40.</p>
          <button class="vc-bt prim" data-act="ouvrir-fiche" data-f="f4">${ic('fiche', 15)} Ouvrir la table</button></div>
        <div class="vc-carte"><div class="sur">Ce cours</div><div class="vc-stats"><div><b class="tnum">${COURS.flashcards}</b><span>flashcards · 12 à revoir</span></div><div><b class="tnum">${COURS.notions}</b><span>notions</span></div>
          <div><b class="tnum">9 h 56</b><span>de transcript</span></div><div><b class="tnum">${etat.fiches.length}</b><span>fiches</span></div></div></div>
      </div>
      <div class="vc-carte" style="margin-top:14px"><div class="sur" style="justify-content:space-between">Fiches récentes <button class="vc-bt petit" data-act="ecran" data-e="seances">Toutes les séances</button></div><div class="vc-liste-fiches">${recentes}</div></div>
    </div>`;
  }

  /* ---------- écran « Vue des séances » ---------- */
  function ecranSeances() {
    const cols = SEANCES.map((s) => {
      const tr = TRANSCRIPTS[s.id];
      const fs = fichesDe(s.id).map((f) => `<button class="fch${f.seances.length > 1 ? ' partagee' : ''}" data-act="ouvrir-fiche" data-f="${f.id}">${ic('fiche', 15)}<span><b>${h(f.titre)}</b><small>${f.pages} p.${f.seances.length > 1 ? ' · partagée ' + f.seances.map((x) => 'S' + seance(x).n).join('+') : ''}${etat.nouvelles[f.id] ? ' · <span style="color:var(--ok);font-weight:700">nouvelle</span>' : ''}</small></span></button>`).join('');
      const auj = s.etat === 'aujourdhui';
      return `<div class="vc-col${auj ? ' auj' : ''}" style="--sc:${s.couleur}" data-depot="${s.id}">
        <div class="entete"><b>Séance ${s.n}</b><small>${s.jour}</small></div><h3>${h(s.titre)}</h3>
        <button class="ligne" data-act="aller-diapo" data-p="${s.debut}">${ic('diapo', 14)} Diapo p. ${s.debut}–${s.fin} <span style="margin-left:auto;color:var(--text-3)">${s.fin - s.debut + 1} p.</span></button>
        <button class="ligne" data-act="aller-trans" data-s="${s.id}">${ic('micro', 14)} ${auj ? (etat.live.actif ? 'En direct · ' + etat.live.n + ' lignes' : etat.live.n ? 'Transcript · enregistré ce matin' : 'Pas encore enregistré') : 'Transcript · ' + s.duree} <span style="margin-left:auto;color:var(--text-3)">${auj ? '' : tr.lignes.length + ' l.'}</span></button>
        <div class="ligne" style="cursor:default">${ic('tag', 14)} ${auj ? (etat.tags[300] ? 'Début p. 244 · Fin p. 300' : etat.tags[244] ? 'Début p. 244 · fin à poser' : 'Tags posés au démarrage') : `Début p. ${s.debut} · Fin p. ${s.fin}`}</div>
        <div class="sur" style="font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3);margin-top:4px">Fiches</div>
        <div class="ff">${fs || `<div style="font-size:12px;color:var(--text-3)">Aucune fiche pour l’instant.</div>`}</div>
        ${auj ? `<button class="vc-bt live" data-act="demarrer" style="justify-content:center">${ic('micro', 15)} ${etat.live.actif ? 'Reprendre le direct' : 'Démarrer en direct'}</button>` : ''}
        <button class="ajout" data-act="importer" data-s="${s.id}">${ic('plus', 14)} Rattacher une fiche</button></div>`;
    }).join('');
    // pont visuel de la fiche partagée S1 + S2
    const pont = !estMobile() && !estIpad() ? `<div class="vc-pont" style="left:2%;width:37%">Synthèse filtration + anatomie · partagée S1 + S2</div>` : '';
    return `<div class="vc-page"><div class="vc-hero"><div><h1 style="font-size:24px">Séances du cours</h1><p>Chaque séance réunit sa plage de diapo, son transcript, ses tags et ses fiches. Une fiche peut appartenir à plusieurs séances.</p></div></div>
      <div class="vc-seances" style="margin-top:22px">${pont}${cols}</div></div>`;
  }

  /* ---------- volets ---------- */
  function lienCourant() {
    const f = fiche(etat.ficheId); const pg = pagesDe(f)[etat.pageFiche - 1];
    return { f, pg, s: seance(pg.seance) };
  }
  function voletFiche() {
    const { f, s } = lienCourant();
    const pages = pagesDe(f).map((pg) => pageFiche(f, pg, etat.annots[f.id] || [])).join('');
    const coul = ['jaune', 'vert', 'rose'].map((c) => `<button class="coul${etat.outil === c ? ' on' : ''}" data-act="outil" data-o="${c}" title="Surligner en ${c}" style="background:${{ jaune: '#f6dc5c', vert: '#7ad89a', rose: '#ff9fb2' }[c]}"></button>`).join('');
    const parties = f.seances.length > 1 ? ' · partagée ' + f.seances.map((x) => 'S' + seance(x).n).join(' + ') : '';
    return `<section class="vc-volet${etat.sync ? ' lie' : ''}" data-v="fiche" style="--sc:${s.couleur}">
      <div class="vc-v-tete"><span class="lbl"><span class="barre"></span>${ic('fiche', 14)} Fiche</span><span class="sous">${h(f.titre)}${parties} · p. <b class="tnum" data-n-fiche>${etat.pageFiche}</b>/${f.pages}</span>
        <span class="act"><span class="vc-outils">${coul}<button class="${etat.outil === 'note' ? 'on' : ''}" data-act="outil" data-o="note" title="Ajouter une note">${ic('notes', 14)}</button></span><span class="vc-sep"></span>
        <button data-act="agrandir" data-v="fiche" title="Agrandir">${ic('plein', 14)}</button></span></div>
      <div class="vc-v-corps vc-fiche-corps" data-defile="fiche">${pages}</div></section>`;
  }
  function corpsDiapo() {
    const p = etat.diapoPage; const s = seanceDePage(p);
    let de = p, a = p;
    if (etat.mode === 'reviser' && etat.ecran === 'travail') { const { pg } = lienCourant(); if (p >= pg.sources.de && p <= pg.sources.a) { de = pg.sources.de; a = pg.sources.a; } }
    const lo = Math.max(s.debut, Math.min(de - 1, p - 2)), hi = Math.min(s.fin, Math.max(a + 1, lo + 5));
    const vg = []; for (let i = lo; i <= hi; i++) vg.push(`<button class="vg${i === p ? ' on' : ''}${i < de || i > a ? ' hors' : ''}" data-act="aller-diapo" data-p="${i}">${diapo(i)}</button>`);
    const tag = etat.tags[p] ? `<span class="vc-tag ${etat.tags[p]}">${etat.tags[p] === 'debut' ? '▶ Début' : '■ Fin'} · Séance ${s.n}</span>` : '';
    const ruban = etat.mode === 'diapo' || etat.agrandi === 'diapo' ? `<div class="vc-ruban300" title="Les 300 pages, colorées par séance">${Array.from({ length: COURS.pages }, (_, i) => { const q = i + 1; const sq = seanceDePage(q); return `<button style="--sc:${sq.couleur}" class="${q === p ? 'on' : etat.tags[q] ? 'tag' : ''}" data-act="aller-diapo" data-p="${q}" title="p. ${q} · ${h(titreDiapo(q))}"></button>`; }).join('')}</div>` : '';
    return `<div class="vc-diapo-scene">${tag}${diapo(p)}</div>${etat.mode === 'direct' ? '' : `<div class="vc-vignettes">${vg.join('')}</div>`}${ruban}`;
  }
  function voletDiapo() {
    const p = etat.diapoPage; const s = seanceDePage(p);
    return `<section class="vc-volet${etat.sync && etat.mode === 'reviser' ? ' lie' : ''}" data-v="diapo" style="--sc:${s.couleur}">
      <div class="vc-v-tete"><span class="lbl"><span class="barre"></span>${ic('diapo', 14)} Diapo</span><span class="sous" data-sous-diapo>p. ${p} / ${COURS.pages} · Séance ${s.n} · ${h(titreDiapo(p))}</span>
        <span class="act"><span class="vc-diapo-nav"><button data-act="diapo-pas" data-d="-1" title="Page précédente">${ic('haut', 14)}</button><input data-act="diapo-num" value="${p}" aria-label="Aller à la page"><button data-act="diapo-pas" data-d="1" title="Page suivante">${ic('bas', 14)}</button></span>
        ${etat.mode === 'reviser' ? `<button data-act="agrandir" data-v="diapo" title="Agrandir">${ic('plein', 14)}</button>` : ''}</span></div>
      <div class="vc-v-corps vc-diapo-corps" data-corps="diapo">${corpsDiapo()}</div></section>`;
  }
  function lignesTrans() {
    if (etat.mode === 'direct') {
      const L = TRANSCRIPTS.s5.lignes.slice(0, etat.live.n);
      if (!L.length) return `<div class="vc-trans-vide">${ic('micro', 22)}<br>Le transcript s’écrit ici dès que le prof parle.</div>`;
      return L.map((l, i) => `<div class="lignetrans${i === L.length - 1 ? ' actuelle nouvelle' : ''}" data-act="ligne" data-p="${l.page}"><span class="h">${l.horo}</span><span><span class="qui">${l.qui}</span>${h(l.texte)}<span class="p">p. ${l.page}</span></span></div>`).join('');
    }
    const sid = etat.trans.sid; const L = TRANSCRIPTS[sid].lignes;
    if (!L.length) return `<div class="vc-trans-vide">Pas encore de transcript pour cette séance.</div>`;
    let de = -1, a = -1;
    if (etat.mode === 'reviser') { const { pg } = lienCourant(); if (pg.seance === sid) { de = pg.sources.de; a = pg.sources.a; } }
    return L.map((l) => `<div class="lignetrans${l.page >= de && l.page <= a ? ' lien' : ''}" data-act="ligne" data-p="${l.page}" data-t="${l.t}"><span class="h">${l.horo}</span><span><span class="qui">${l.qui}</span>${h(l.texte)}<span class="p">p. ${l.page}</span></span></div>`).join('');
  }
  function voletTrans() {
    const sid = etat.mode === 'direct' ? 's5' : etat.trans.sid; const s = seance(sid);
    return `<section class="vc-volet${etat.sync && etat.mode === 'reviser' ? ' lie' : ''}" data-v="trans" style="--sc:${s.couleur}">
      <div class="vc-v-tete"><span class="lbl"><span class="barre"></span>${ic('transcript', 14)} Transcript</span><span class="sous" data-sous-trans>Séance ${s.n} · ${s.jour}${s.etat === 'faite' ? ' · ' + s.duree : ''}</span>
        <span class="act">${etat.mode === 'reviser' ? `<button data-act="agrandir" data-v="trans" title="Agrandir">${ic('plein', 14)}</button>` : ''}</span></div>
      <div class="vc-v-corps vc-trans-corps" data-corps="trans">${lignesTrans()}</div></section>`;
  }
  function voletSources() { // iPad : un volet à onglets
    const s = etat.ongletSources === 'diapo' ? seanceDePage(etat.diapoPage) : seance(etat.trans.sid);
    const corps = etat.ongletSources === 'diapo' ? `<div class="vc-v-corps vc-diapo-corps" data-corps="diapo">${corpsDiapo()}</div>` : `<div class="vc-v-corps vc-trans-corps" data-corps="trans">${lignesTrans()}</div>`;
    const sous = etat.ongletSources === 'diapo' ? `p. ${etat.diapoPage} · S${s.n}` : `S${s.n} · ${s.jour}`;
    return `<section class="vc-volet${etat.sync ? ' lie' : ''}" data-v="sources" style="--sc:${s.couleur}">
      <div class="vc-v-tete"><span class="vc-onglets"><button class="${etat.ongletSources === 'diapo' ? 'actif' : ''}" data-act="onglet" data-o="diapo">Diapo</button><button class="${etat.ongletSources === 'trans' ? 'actif' : ''}" data-act="onglet" data-o="trans">Transcript</button></span>
        <span class="sous" ${etat.ongletSources === 'diapo' ? 'data-sous-diapo' : 'data-sous-trans'}>${sous}</span></div>${corps}</section>`;
  }
  function fil() {
    if (etat.mode !== 'reviser') return '';
    const { f, pg, s } = lienCourant();
    const l = pg.extrait[0];
    return `<div class="vc-fil${etat.sync ? '' : ' coupe'}" style="--sc:${s.couleur}" data-fil>
      <span class="maillon">${ic('fiche', 12)} ${h(f.titre.split(' — ')[0])} · p. ${pg.n}</span><span class="trait"></span>
      <span class="maillon">${ic('diapo', 12)} diapo p. ${pg.sources.de}–${pg.sources.a}</span><span class="trait"></span>
      <span class="maillon">${ic('micro', 12)} ${l ? 'transcript ' + l.horo : 'transcript'} · S${s.n}</span>
      <span class="aide">${etat.sync ? 'Fais défiler la fiche : diapo et transcript suivent.' : 'Volets libres : le lien est suspendu.'}</span></div>`;
  }
  function barreDirect() {
    const L = etat.live; const m = Math.floor(L.sec / 60), s = L.sec % 60;
    return `<div class="vc-direct-bar${L.pause ? ' pause' : ''}"><span class="badge-live">${L.pause ? 'EN PAUSE' : 'EN DIRECT'}</span><span class="chrono tnum" data-chrono>${m}:${String(s).padStart(2, '0')}</span>
      <span class="vc-vu"><i></i><i></i><i></i><i></i><i></i></span><span style="color:var(--text-2);font-size:12.5px">Séance 5 · ${h(seance('s5').titre)} · tag Début p. 244</span>
      <span style="margin-left:auto;display:flex;gap:8px"><button class="vc-bt petit" data-act="tag-fin">${ic('tag', 14)} Marquer la fin ici</button>
      <button class="vc-bt petit" data-act="pause">${ic(L.pause ? 'jouer' : 'pause', 14)} ${L.pause ? 'Reprendre' : 'Pause'}</button>
      <button class="vc-bt petit" data-act="arreter">${ic('stop', 14)} Arrêter</button></span></div>`;
  }

  function table() {
    const m = etat.mode;
    if (estMobile()) return tableMobile();
    if (m === 'direct') {
      if (!etat.live.actif) demarrerLive();
      return `${barreDirect()}<div class="vc-volets ${estIpad() ? 'deux-direct' : 'direct'}">${voletDiapo()}${voletTrans()}</div>`;
    }
    if (m === 'diapo') return `<div class="vc-volets diapo">${voletDiapo()}</div>`;
    if (estIpad()) return `${fil()}<div class="vc-volets ${etat.agrandi ? 'agrandi-fiche' : 'deux'}">${voletFiche()}${etat.agrandi ? '' : voletSources()}</div>`;
    const cl = etat.agrandi ? 'agrandi-' + etat.agrandi : 'reviser';
    const v = etat.agrandi === 'fiche' ? voletFiche() : etat.agrandi === 'diapo' ? voletDiapo() : etat.agrandi === 'trans' ? voletTrans() : voletFiche() + voletDiapo() + voletTrans();
    return `${fil()}<div class="vc-volets ${cl}">${v}</div>`;
  }
  function tableMobile() {
    const m = etat.mode;
    if (m === 'diapo') return `<div class="vc-volets un">${voletDiapo()}</div>`;
    const choix = m === 'direct' ? ['diapo', 'trans'] : ['fiche', 'diapo', 'trans'];
    if (!choix.includes(etat.voletMobile)) etat.voletMobile = choix[0];
    const lib = { fiche: ['fiche', 'Fiche'], diapo: ['diapo', 'Diapo'], trans: ['transcript', 'Transcript'] };
    const sc = seanceCourante();
    const seg = `<div class="vc-seg-mobile" style="--sc:${sc.couleur}">${choix.map((c) => `<button class="${etat.voletMobile === c ? 'actif' : ''}" data-act="volet-mobile" data-o="${c}">${ic(lib[c][0], 14)} ${lib[c][1]}${m === 'reviser' && etat.sync && c !== 'fiche' ? '<span class="lie"></span>' : ''}</button>`).join('')}</div>`;
    const v = etat.voletMobile === 'fiche' ? voletFiche() : etat.voletMobile === 'diapo' ? voletDiapo() : voletTrans();
    const bas = m === 'reviser' && etat.voletMobile === 'fiche' ? `<div class="vc-mobile-bas"><button data-act="feuille">${ic('lien', 15)} Sources</button><button data-act="tiroir" data-t="exos">${ic('cartes', 15)} Exos</button></div>` : '';
    let feuille = '';
    if (etat.feuille && m === 'reviser') {
      const { pg, s } = lienCourant(); const l = pg.extrait[0];
      feuille = `<div class="vc-feuille" style="--sc:${s.couleur}"><div class="poignee" data-act="feuille"></div>
        <div style="font-size:12px;color:var(--text-3);margin-bottom:8px">Fiche p. ${pg.n} · Séance ${s.n}</div>
        <div class="rang"><button style="border:0;padding:0;background:none" data-act="volet-mobile" data-o="diapo">${diapo(pg.sources.de)}</button><div><b>Diapo p. ${pg.sources.de}–${pg.sources.a}</b><br><small style="color:var(--text-3)">${h(titreDiapo(pg.sources.de))}</small></div></div>
        ${l ? `<div class="lignetrans lien" style="margin-top:10px;background:color-mix(in srgb,${s.couleur} 13%,transparent)" data-act="volet-mobile" data-o="trans"><span class="h">${l.horo}</span><span>${h(l.texte)}</span></div>` : ''}</div>`;
    }
    return `${m === 'direct' ? barreDirectMobile() : ''}${seg}<div class="vc-volets un">${v}</div>${bas}${feuille}`;
  }
  function barreDirectMobile() {
    const L = etat.live; const m = Math.floor(L.sec / 60), s = L.sec % 60;
    return `<div class="vc-direct-bar${L.pause ? ' pause' : ''}"><span class="badge-live">${L.pause ? 'PAUSE' : 'DIRECT'}</span><span class="chrono tnum" data-chrono>${m}:${String(s).padStart(2, '0')}</span><span class="vc-vu"><i></i><i></i><i></i><i></i><i></i></span>
      <span style="margin-left:auto;display:flex;gap:6px"><button class="vc-bt petit" data-act="pause">${ic(L.pause ? 'jouer' : 'pause', 14)}</button><button class="vc-bt petit" data-act="arreter">${ic('stop', 14)}</button></span></div>`;
  }

  /* ---------- tiroir bas (exos, notions, notes) ---------- */
  function tiroir() {
    const sc = seanceCourante();
    const t = etat.tiroir;
    const portee = etat.portee === 'seance' ? [sc.id] : SEANCES.map((s) => s.id);
    const fs = etat.fiches.filter((f) => f.seances.some((x) => portee.includes(x)));
    let corps = '';
    if (t === 'exos') {
      corps = fs.flatMap((f) => pagesDe(f).slice(0, 3).map((pg) => ({ f, pg }))).slice(0, 12).map(({ f, pg }) => { const s = seance(pg.seance); return `<div class="vc-carte-fc" style="--sc:${s.couleur}"><div class="q">${h(pg.titre)} : ${h(pg.puces[0].split(' ').slice(0, 5).join(' '))}… ?</div><div class="r">${h(pg.puces[0])}</div>
        <div class="orig"><span class="s">S${s.n}</span> · <button class="lien-src" data-act="ouvrir-fiche" data-f="${f.id}" data-n="${pg.n}">fiche p. ${pg.n}</button><button class="lien-src" data-act="aller-diapo" data-p="${pg.sources.de}">diapo p. ${pg.sources.de}</button></div></div>`; }).join('') || '<div style="color:var(--text-3)">Aucune flashcard pour cette séance.</div>';
    } else if (t === 'notions') {
      const items = [];
      for (const [fid, as] of Object.entries(etat.annots)) { const f = fiche(fid); if (!f || !f.seances.some((x) => portee.includes(x))) continue; for (const a of as) { const pg = pagesDe(f)[a.page - 1]; if (!pg) continue; items.push({ f, pg, a }); } }
      corps = items.map(({ f, pg, a }) => { const s = seance(pg.seance); return `<div class="vc-carte-fc" style="--sc:${s.couleur}"><div class="q">${a.type === 'note' ? '📝 ' + h(a.texte) : h(pg.puces[a.puce])}</div><div class="orig"><span class="s">S${s.n}</span> · ${h(f.titre)} · <button class="lien-src" data-act="ouvrir-fiche" data-f="${f.id}" data-n="${pg.n}">p. ${pg.n}</button></div></div>`; }).join('') || '<div style="color:var(--text-3)">Surligne une puce de fiche : elle apparaît ici.</div>';
    } else {
      corps = `<div class="vc-notes-ed" contenteditable="true"><b>Notes — ${etat.portee === 'seance' ? 'Séance ' + sc.n : 'tout le cours'}</b><br>• Revoir le schéma de l’autorégulation (fiche DFG p. 4).<br>• Question au prof : pourquoi la créatinine surestime-t-elle le DFG ?<br>• ${etat.portee === 'seance' ? 'Ces notes sont rangées sous la séance ; « Tout le cours » les réunit.' : 'Vue réunie de toutes les séances.'}</div>`;
    }
    const onglet = (k, n, l) => `<button class="${t === k ? 'actif' : ''}" data-act="tiroir" data-t="${k}">${ic(n, 14)} ${l}</button>`;
    return `<div class="vc-tiroir${t ? ' ouvert' : ''}" style="--sc:${sc.couleur}"><div class="poignee" data-act="tiroir" data-t=""></div>
      <div class="vc-tiroir-tete"><div class="seg">${onglet('exos', 'cartes', 'Exos')}${onglet('notions', 'notions', 'Notions')}${onglet('notes', 'notes', 'Notes')}</div>
        <div class="seg"><button class="${etat.portee === 'seance' ? 'actif' : ''}" data-act="portee" data-p="seance">Séance ${sc.n}</button><button class="${etat.portee === 'cours' ? 'actif' : ''}" data-act="portee" data-p="cours">Tout le cours</button></div>
        <button class="vc-bt petit" style="margin-left:auto" data-act="tiroir" data-t="">${ic('fermer', 14)} Fermer</button></div>
      <div class="vc-tiroir-corps">${corps}</div></div>`;
  }
  function boutonsTiroir() {
    if (etat.tiroir || estMobile() || etat.ecran !== 'travail') return '';
    return `<div class="vc-tiroir-ouvrir"><button data-act="tiroir" data-t="exos">${ic('cartes', 14)} Exos <span class="compte">${COURS.flashcards}</span></button><button data-act="tiroir" data-t="notions">${ic('notions', 14)} Notions <span class="compte">${COURS.notions}</span></button><button data-act="tiroir" data-t="notes">${ic('notes', 14)} Notes</button></div>`;
  }

  /* ---------- palette ⌘K ---------- */
  function palette() {
    if (!etat.palette) return '';
    const act = [
      ['Séance', [['demarrer', 'micro', 'Démarrer la séance 5 en direct', 'D'], ['ecran-seances', 'calendrier', 'Vue des séances', 'S'], ['importer', 'import', 'Importer une fiche…', 'I']]],
      ['Afficher', [['tiroir-exos', 'cartes', 'Exos de cette séance', 'E'], ['tiroir-notions', 'notions', 'Notions', 'N'], ['mode-diapo', 'diapo', 'Diapo d’origine plein cadre', ''], ['sync', 'lien', etat.sync ? 'Délier les volets' : 'Lier les volets', 'L']]],
      ['Fiches', etat.fiches.map((f) => ['fiche-' + f.id, 'fiche', f.titre + ' · S' + f.seances.map((x) => seance(x).n).join('+'), ''])],
    ];
    return `<div class="vc-voile" data-act="fermer-palette"><div class="vc-palette" data-stop><input placeholder="Aller à une fiche, une page (« p 212 »), une action…" data-palette-input>
      <div class="liste">${act.map(([g, l]) => `<div class="grp">${g}</div>${l.map(([id, i, t, k]) => `<button data-act="pal" data-id="${id}">${ic(i, 15)} ${h(t)}${k ? `<kbd>${k}</kbd>` : ''}</button>`).join('')}`).join('')}</div></div></div>`;
  }

  /* ---------- import d'une fiche ---------- */
  function modaleImport() {
    const I = etat.importer; if (!I) return '';
    const etapes = [['Lecture du PDF (8 pages)', 1], ['Comparaison avec la diapo : pages 244–300 reconnues', 2], ['Transcript du 29 oct. relié (11 passages cités)', 3], ['Séance proposée : Séance 5 — Équilibre acide-base', 4]];
    if (I.etape === 0) {
      return `<div class="vc-voile" data-act="annuler-import"><div class="vc-modale" data-stop><h2>Importer une fiche de résumé</h2><p>Glisse le PDF sur une séance du sommaire (à gauche), ou dépose-le ici. MedRevise retrouve ses pages de diapo et ses passages de transcript.</p>
        <div class="vc-pdf-glisse" draggable="true" data-glisse>${'<span class="doc"></span>'}<span><b>Fiche-S5-acide-base.pdf</b><br><small style="color:var(--text-3)">8 pages · 1,4 Mo · généré par Claude ce soir</small></span><span style="margin-left:auto;color:var(--text-3);font-size:12px">⇢ glisser sur une séance</span></div>
        <div class="vc-pied"><button class="vc-bt" data-act="annuler-import">Annuler</button><button class="vc-bt prim" data-act="analyser">Analyser ce fichier</button></div></div></div>`;
    }
    const fini = I.etape >= 5;
    return `<div class="vc-voile"><div class="vc-modale" data-stop><h2>Fiche-S5-acide-base.pdf</h2><p>${fini ? 'Vérifie le rattachement, puis range la fiche.' : 'Analyse en cours…'}</p>
      <div class="vc-etapes">${etapes.map(([t, n]) => `<div class="vc-etape${I.etape > n ? ' fait' : I.etape === n ? ' encours' : ''}"><span class="rond">${I.etape > n ? ic('check', 12) : ''}</span>${h(t)}</div>`).join('')}</div>
      ${fini ? `<div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3)">Rattacher à</div>
        <div class="vc-choix-s">${SEANCES.map((s) => `<button style="--sc:${s.couleur}" class="${I.seances.includes(s.id) ? 'on' : ''}" data-act="choix-s" data-s="${s.id}"><span class="d"></span>S${s.n} · ${h(s.titre.split(' ').slice(0, 3).join(' '))}</button>`).join('')}</div>
        <div class="vc-detecte"><span>${ic('diapo', 13)} Pages sources : diapo p. 244–300 (54 pages citées sur 57)</span><span>${ic('micro', 13)} Transcript : séance 5, 29 oct. · ${TRANSCRIPTS.s5.lignes.length} lignes citées</span><span>${ic('fiche', 13)} Titre : « ${h(FICHE_A_IMPORTER.titre)} » · ${FICHE_A_IMPORTER.pages} pages</span></div>
        <div class="vc-pied"><button class="vc-bt" data-act="annuler-import">Annuler</button><button class="vc-bt prim" data-act="ranger" ${I.seances.length ? '' : 'disabled'}>${ic('check', 15)} Ranger sous ${I.seances.map((x) => 'S' + seance(x).n).join(' + ') || '…'}</button></div>` : ''}</div></div>`;
  }

  /* ---------- rendu ---------- */
  function rendre() {
    appareil = appareil || document.querySelector('.appareil');
    const defile = appareil.querySelector('[data-defile="fiche"]');
    const hautFiche = defile ? defile.scrollTop : null;
    if (estMobile() && etat.rail === true && !etat._railMobileVu) { etat.rail = false; }
    etat._railMobileVu = estMobile();
    if (estIpad() && !etat._ipadVu) { etat.rail = false; }
    etat._ipadVu = estIpad();
    const principal = etat.ecran === 'cours' ? ecranCours() : etat.ecran === 'seances' ? ecranSeances() : `<div class="vc-table">${table()}</div>`;
    appareil.innerHTML = `<div class="vc">${tete()}<div class="vc-corps">${rail()}${etat.ecran === 'travail' ? principal : `<div class="vc-table">${principal}</div>`}${boutonsTiroir()}${tiroir()}</div>${palette()}${modaleImport()}</div>`;
    brancherDefilement(hautFiche);
    calerTranscript();
    brancherGlisser();
    const inp = appareil.querySelector('[data-palette-input]'); if (inp) inp.focus();
  }

  /* défilement de la fiche → met à jour diapo et transcript sans tout redessiner */
  function brancherDefilement(haut) {
    const c = appareil.querySelector('[data-defile="fiche"]'); if (!c) return;
    if (haut != null && etat._memeFiche) c.scrollTop = haut;
    else { const el = c.querySelector(`[data-pagefiche="${etat.pageFiche}"]`); if (el) c.scrollTop = el.offsetTop - 18; }
    marquerVisible(c);
    let raf = 0;
    c.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
      const n = pageVisible(c); if (n !== etat.pageFiche) { etat.pageFiche = n; if (etat.sync) suivreFiche(); majLien(); }
      marquerVisible(c);
    }); });
  }
  function pageVisible(c) {
    const repere = c.scrollTop + c.clientHeight * 0.33; let n = 1;
    c.querySelectorAll('[data-pagefiche]').forEach((el) => { if (el.offsetTop <= repere) n = +el.dataset.pagefiche; });
    return n;
  }
  function marquerVisible(c) {
    const { s } = lienCourant();
    c.querySelectorAll('[data-pagefiche]').forEach((el) => { el.classList.toggle('visible', +el.dataset.pagefiche === etat.pageFiche); el.style.setProperty('--sc', s.couleur); });
  }
  function suivreFiche() {
    const { pg } = lienCourant();
    etat.diapoPage = pg.sources.de; etat.trans = { sid: pg.seance, t: pg.extrait[0] ? pg.extrait[0].t : 0 };
  }
  /* met à jour les volets diapo / transcript / fil / sommaire sans perdre le défilement de la fiche */
  function majLien() {
    const d = appareil.querySelector('[data-corps="diapo"]'); if (d) d.innerHTML = corpsDiapo();
    const t = appareil.querySelector('[data-corps="trans"]'); if (t) { t.innerHTML = lignesTrans(); calerTranscript(); }
    const p = appareil.querySelector('[data-pagefiche]') && appareil.querySelector('[data-n-fiche]'); if (p) p.textContent = etat.pageFiche;
    const f = appareil.querySelector('[data-fil]'); if (f) f.outerHTML = fil();
    const sd = appareil.querySelector('[data-sous-diapo]'); if (sd) { const s = seanceDePage(etat.diapoPage); sd.textContent = estIpad() ? `p. ${etat.diapoPage} · S${s.n}` : `p. ${etat.diapoPage} / ${COURS.pages} · Séance ${s.n} · ${titreDiapo(etat.diapoPage)}`; }
    const st = appareil.querySelector('[data-sous-trans]'); if (st) { const s = seance(etat.trans.sid); st.textContent = estIpad() ? `S${s.n} · ${s.jour}` : `Séance ${s.n} · ${s.jour}${s.etat === 'faite' ? ' · ' + s.duree : ''}`; }
    const s = seanceDePage(etat.diapoPage);
    appareil.querySelectorAll('.vc-volet[data-v="diapo"], .vc-volet[data-v="trans"], .vc-volet[data-v="sources"], .vc-volet[data-v="fiche"]').forEach((v) => v.style.setProperty('--sc', v.dataset.v === 'trans' ? seance(etat.trans.sid).couleur : s.couleur));
    const r = appareil.querySelector('.vc-rail'); if (r) { const nr = document.createElement('div'); nr.innerHTML = rail(); r.replaceWith(nr.firstElementChild); }
    const inp = appareil.querySelector('[data-act="diapo-num"]'); if (inp) inp.value = etat.diapoPage;
  }
  function calerTranscript() {
    const c = appareil.querySelector('[data-corps="trans"]'); if (!c) return;
    const cible = etat.mode === 'direct' ? c.querySelector('.lignetrans:last-child') : c.querySelector('.lignetrans.lien') || c.querySelector(`[data-t="${etat.trans.t}"]`);
    if (cible) c.scrollTop = Math.max(0, cible.offsetTop - c.clientHeight * (etat.mode === 'direct' ? 0.75 : 0.2));
  }

  /* ---------- direct ---------- */
  function demarrerLive() {
    if (etat.live.actif) return;
    etat.live = { actif: true, pause: false, n: 0, sec: 0 };
    etat.tags[244] = 'debut'; etat.diapoPage = 244; etat.trans = { sid: 's5', t: 0 };
    setTimeout(() => toast(`${ic('tag', 14)} Tag <b>Début</b> posé sur la p. 244 · Séance 5 · transcript relié`), 300);
    clearInterval(minuterie);
    minuterie = setInterval(tic, 1500);
  }
  function tic() {
    const L = etat.live; if (!L.actif || L.pause) return;
    L.sec += 47;
    const lignes = TRANSCRIPTS.s5.lignes;
    if (L.n < lignes.length) { L.n++; const l = lignes[L.n - 1]; if (etat.mode === 'direct') etat.diapoPage = Math.max(etat.diapoPage, l.page); }
    if (etat.ecran === 'travail' && etat.mode === 'direct' && appareil) {
      const t = appareil.querySelector('[data-corps="trans"]'); if (t) { t.innerHTML = lignesTrans(); calerTranscript(); }
      const d = appareil.querySelector('[data-corps="diapo"]'); if (d) d.innerHTML = corpsDiapo();
      const sd = appareil.querySelector('[data-sous-diapo]'); if (sd) sd.textContent = `p. ${etat.diapoPage} / ${COURS.pages} · Séance 5 · ${titreDiapo(etat.diapoPage)}`;
      const ch = appareil.querySelector('[data-chrono]'); if (ch) ch.textContent = Math.floor(L.sec / 60) + ':' + String(L.sec % 60).padStart(2, '0');
      const inp = appareil.querySelector('[data-act="diapo-num"]'); if (inp) inp.value = etat.diapoPage;
    }
    if (L.n >= lignes.length) { L.n = lignes.length; }
  }

  /* ---------- glisser une fiche PDF sur une séance ---------- */
  function brancherGlisser() {
    const g = appareil.querySelector('[data-glisse]'); if (!g) return;
    g.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', 'fiche'); etat.rail = true; etat.ouvertes.s5 = true; setTimeout(() => { const v = appareil.querySelector('.vc-voile'); if (v) v.style.pointerEvents = 'none'; v && (v.style.background = 'transparent'); const m = appareil.querySelector('.vc-modale'); if (m) m.style.opacity = '.35'; }, 0); });
    g.addEventListener('dragend', () => { if (etat.importer && etat.importer.etape === 0) rendre(); });
    appareil.querySelectorAll('[data-depot]').forEach((z) => {
      z.addEventListener('dragover', (e) => { e.preventDefault(); z.classList.add('cible'); });
      z.addEventListener('dragleave', () => z.classList.remove('cible'));
      z.addEventListener('drop', (e) => { e.preventDefault(); analyser([z.dataset.depot]); });
    });
  }
  function analyser(seances) {
    etat.importer = { etape: 1, seances: seances || ['s5'] }; rendre();
    const pas = () => { if (!etat.importer) return; etat.importer.etape++; rendre(); if (etat.importer.etape < 5) setTimeout(pas, 520); };
    setTimeout(pas, 520);
  }
  function ranger() {
    const I = etat.importer; const f = { ...FICHE_A_IMPORTER, seances: I.seances.slice() };
    etat.fiches = etat.fiches.filter((x) => x.id !== f.id).concat(f); delete pagesCache[f.id];
    etat.nouvelles[f.id] = true; I.seances.forEach((s) => { etat.ouvertes[s] = true; });
    etat.importer = null; etat.rail = !estMobile() ? true : etat.rail;
    toast(`${ic('check', 14)} « ${h(f.titre)} » rangée sous ${I.seances.map((x) => 'Séance ' + seance(x).n).join(' + ')} · ${etat.fiches.length} fiches`);
  }

  /* ---------- actions ---------- */
  function ouvrirFiche(id, n = 1) {
    etat._memeFiche = false; etat.ecran = 'travail'; etat.mode = 'reviser'; etat.agrandi = null; etat.ficheId = id; etat.pageFiche = n;
    const f = fiche(id); f.seances.forEach((s) => { etat.ouvertes[s] = true; }); suivreFiche(); etat.voletMobile = 'fiche'; etat.feuille = false;
    if (estMobile() || estIpad()) etat.rail = false;
  }
  function act(a, el, e) {
    etat._memeFiche = true;
    switch (a) {
      case 'rail': etat.rail = !etat.rail; break;
      case 'ecran': etat.ecran = el.dataset.e; etat.tiroir = null; if (estMobile()) etat.rail = false; break;
      case 'mode': etat.ecran = 'travail'; etat.mode = el.dataset.m; etat.agrandi = null; if (etat.mode === 'diapo' && !seanceDePage(etat.diapoPage)) etat.diapoPage = 1; if (estMobile()) etat.rail = false; break;
      case 'basculer-s': etat.ouvertes[el.dataset.s] = !etat.ouvertes[el.dataset.s]; break;
      case 'ouvrir-fiche': ouvrirFiche(el.dataset.f, +(el.dataset.n || 1)); etat.tiroir = null; break;
      case 'partie': { const c = appareil.querySelector('[data-defile="fiche"]'); const p = c && c.querySelector(`[data-pagefiche="${el.dataset.n}"]`); if (p) { c.scrollTo({ top: p.offsetTop - 18, behavior: 'smooth' }); } return; }
      case 'sync': etat.sync = !etat.sync; if (etat.sync) suivreFiche(); toast(etat.sync ? `${ic('lien', 14)} Volets liés : diapo et transcript suivent la fiche` : 'Volets libres : navigue dans la diapo ou le transcript sans perdre ta page de fiche'); break;
      case 'agrandir': etat.agrandi = etat.agrandi === el.dataset.v ? null : el.dataset.v; break;
      case 'outil': etat.outil = el.dataset.o; break;
      case 'aller-diapo': etat.diapoPage = +el.dataset.p; if (etat.ecran !== 'travail') { etat.ecran = 'travail'; etat.mode = 'diapo'; } else if (etat.mode === 'reviser' && etat.sync && !estMobile()) { etat.sync = false; toast('Diapo déplacée à la main : volets déliés (le lien revient avec « Volets liés »)'); } if (estMobile() && etat.mode === 'reviser') etat.voletMobile = 'diapo'; if (estIpad()) etat.ongletSources = 'diapo'; etat.tiroir = null; break;
      case 'aller-trans': { const s = el.dataset.s; if (s === 's5') { etat.ecran = 'travail'; etat.mode = 'direct'; break; } const f = fichesDe(s)[0]; if (f) ouvrirFiche(f.id); etat.trans = { sid: s, t: 0 }; if (estMobile()) etat.voletMobile = 'trans'; if (estIpad()) etat.ongletSources = 'trans'; break; }
      case 'aller-seance': { const s = seance(el.dataset.s); if (s.etat === 'aujourdhui') { etat.ecran = 'travail'; etat.mode = 'direct'; } else { const f = fichesDe(s.id)[0]; if (f) ouvrirFiche(f.id); } break; }
      case 'diapo-pas': etat.diapoPage = Math.min(COURS.pages, Math.max(1, etat.diapoPage + +el.dataset.d)); if (etat.mode === 'reviser') etat.sync = false; majLien(); return;
      case 'ligne': if (etat.mode !== 'direct') { etat.diapoPage = +el.dataset.p; if (estIpad()) etat.ongletSources = 'diapo'; else if (estMobile()) etat.voletMobile = 'diapo'; else { majLien(); return; } } else { etat.diapoPage = +el.dataset.p; majLien(); return; } break;
      case 'onglet': etat.ongletSources = el.dataset.o; break;
      case 'volet-mobile': etat.voletMobile = el.dataset.o; etat.feuille = false; if (etat.mode === 'reviser' && etat.sync) suivreFiche(); break;
      case 'feuille': etat.feuille = !etat.feuille; break;
      case 'tiroir': etat.tiroir = el.dataset.t || null; break;
      case 'portee': etat.portee = el.dataset.p; break;
      case 'palette': etat.palette = true; break;
      case 'fermer-palette': if (e.target.closest('[data-stop]')) return; etat.palette = false; break;
      case 'pal': etat.palette = false; palAction(el.dataset.id); break;
      case 'importer': etat.importer = { etape: 0, seances: [el.dataset.s || 's5'] }; etat.palette = false; if (el.dataset.s && el.dataset.s !== 's5') { analyser([el.dataset.s]); return; } if (!estMobile()) { etat.rail = true; etat.ouvertes.s5 = true; } break;
      case 'annuler-import': if (e.target.closest('[data-stop]') && !el.matches('button')) return; etat.importer = null; break;
      case 'analyser': analyser(['s5']); return;
      case 'choix-s': { const I = etat.importer; const s = el.dataset.s; I.seances = I.seances.includes(s) ? I.seances.filter((x) => x !== s) : I.seances.concat(s); break; }
      case 'ranger': ranger(); break;
      case 'demarrer': etat.ecran = 'travail'; etat.mode = 'direct'; etat.agrandi = null; etat.voletMobile = 'trans'; if (estMobile()) etat.rail = false; break;
      case 'pause': etat.live.pause = !etat.live.pause; break;
      case 'arreter': etat.live.actif = false; clearInterval(minuterie); etat.tags[300] = 'fin'; etat.ecran = 'seances'; toast(`${ic('check', 14)} Séance 5 enregistrée : p. 244–300, ${etat.live.n} lignes. Importe sa fiche ce soir.`); break;
      case 'tag-fin': etat.tags[etat.diapoPage] = 'fin'; toast(`${ic('tag', 14)} Tag <b>Fin</b> posé sur la p. ${etat.diapoPage}`); majLien(); return;
      default: return;
    }
    rendre();
  }
  function palAction(id) {
    if (id === 'demarrer') act('demarrer', { dataset: {} }, {});
    else if (id === 'ecran-seances') etat.ecran = 'seances';
    else if (id === 'importer') etat.importer = { etape: 0, seances: ['s5'] };
    else if (id.startsWith('tiroir-')) { if (etat.ecran !== 'travail') ouvrirFiche(etat.ficheId); etat.tiroir = id.slice(7); }
    else if (id === 'mode-diapo') { etat.ecran = 'travail'; etat.mode = 'diapo'; }
    else if (id === 'sync') etat.sync = !etat.sync;
    else if (id.startsWith('fiche-')) ouvrirFiche(id.slice(6));
  }

  /* clic sur une puce de fiche = surligner (ou noter) */
  function annoter(li) {
    const pf = li.closest('[data-pagefiche]'); const fid = pf.dataset.fiche, page = +pf.dataset.pagefiche, puce = +li.dataset.puce;
    const L = (etat.annots[fid] = etat.annots[fid] || []);
    if (etat.outil === 'note') { L.push({ page, puce, type: 'note', texte: 'Note : à reformuler avec le schéma de la diapo p. ' + lienCourant().pg.sources.de + '.' }); toast(`${ic('notes', 14)} Note ajoutée — visible aussi dans Notions`); }
    else {
      const i = L.findIndex((a) => a.page === page && a.puce === puce && a.type === 'surligne');
      if (i >= 0 && L[i].couleur === etat.outil) L.splice(i, 1); else if (i >= 0) L[i].couleur = etat.outil; else L.push({ page, puce, type: 'surligne', couleur: etat.outil });
    }
    etat._memeFiche = true; rendre();
  }

  /* ---------- scénarios ---------- */
  const scenarios = [
    { id: 'ouvrir', libelle: '1 · Ouvrir le cours', aller: (e) => { Object.assign(e, { ecran: 'cours', tiroir: null, palette: false, importer: null, rail: e.appareil === 'desktop' }); } },
    { id: 'seances', libelle: '2 · Vue des séances', aller: (e) => { Object.assign(e, { ecran: 'seances', tiroir: null, palette: false, importer: null, rail: e.appareil === 'desktop' }); } },
    { id: 'direct', libelle: '3 · Séance 5 en direct', aller: (e) => { Object.assign(e, { ecran: 'travail', mode: 'direct', agrandi: null, tiroir: null, palette: false, importer: null, voletMobile: 'trans', rail: false }); } },
    { id: 'import', libelle: '4 · Importer la fiche S5', aller: (e) => { e.live.actif = false; clearInterval(minuterie); if (!e.live.n) e.live.n = TRANSCRIPTS.s5.lignes.length; e.tags[300] = 'fin'; Object.assign(e, { ecran: 'seances', tiroir: null, palette: false, importer: { etape: 0, seances: ['s5'] } }); if (e.appareil === 'desktop') { e.rail = true; e.ouvertes.s5 = true; } } },
    { id: 'lire', libelle: '5 · Lire une fiche', aller: (e) => { e.tiroir = null; e.palette = false; e.importer = null; e.sync = true; ouvrirFiche('f2a', 2); if (e.appareil === 'desktop') e.rail = true; } },
    { id: 'synchro', libelle: '6 · Fiche ↔ diapo ↔ transcript', aller: (e) => { e.tiroir = null; e.palette = false; e.importer = null; e.sync = true; ouvrirFiche('f2b', 1); if (e.appareil === 'desktop') e.rail = true; setTimeout(defilerDemo, 600); } },
    { id: 'tiroir', libelle: '7 · Tiroir (exos, notions, notes)', aller: (e) => { e.palette = false; e.importer = null; ouvrirFiche('f2a', 2); e.tiroir = 'exos'; e.portee = 'seance'; } },
    { id: 'palette', libelle: '⌘K', aller: (e) => { if (e.ecran !== 'travail') ouvrirFiche('f4'); e.palette = true; } },
  ];
  /* démo de la synchro : la fiche défile toute seule, page par page */
  function defilerDemo() {
    const c = appareil.querySelector('[data-defile="fiche"]'); if (!c) return;
    let n = 1; const f = fiche(etat.ficheId);
    const pas = () => { n++; if (n > f.pages) return; const p = c.querySelector(`[data-pagefiche="${n}"]`); if (p) c.scrollTo({ top: p.offsetTop - 18, behavior: 'smooth' }); setTimeout(pas, 1400); };
    setTimeout(pas, 900);
  }

  /* ---------- démarrage ---------- */
  appareil = monter({ titre: 'Version C — La table synchronisée', sousTitre: 'fiche, diapo et transcript liés côte à côte', scenarios, rendre, etat });
  appareil.addEventListener('click', (e) => {
    const li = e.target.closest('.vc-fiche-corps .page-fiche li');
    if (li) { annoter(li); return; }
    const src = e.target.closest('[data-aller-diapo], [data-aller-trans]');
    if (src) {
      if (src.dataset.allerDiapo) { etat.diapoPage = +src.dataset.allerDiapo; if (estMobile()) { etat.voletMobile = 'diapo'; rendre(); } else if (estIpad()) { etat.ongletSources = 'diapo'; etat._memeFiche = true; rendre(); } else majLien(); }
      else { const [sid, t] = src.dataset.allerTrans.split(':'); etat.trans = { sid, t: +t }; if (estMobile()) { etat.voletMobile = 'trans'; rendre(); } else if (estIpad()) { etat.ongletSources = 'trans'; etat._memeFiche = true; rendre(); } else majLien(); }
      return;
    }
    const el = e.target.closest('[data-act]'); if (!el || !appareil.contains(el)) return;
    if (el.dataset.act === 'diapo-num') return;
    act(el.dataset.act, el, e);
  });
  appareil.addEventListener('change', (e) => { if (e.target.matches('[data-act="diapo-num"]')) { const v = Math.min(COURS.pages, Math.max(1, parseInt(e.target.value, 10) || 1)); etat.diapoPage = v; if (etat.mode === 'reviser') etat.sync = false; majLien(); } });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); etat.palette = !etat.palette; rendre(); }
    else if (e.key === 'Escape') { if (etat.palette || etat.importer || etat.tiroir) { etat.palette = false; etat.importer = null; etat.tiroir = null; rendre(); } }
  });
})();
