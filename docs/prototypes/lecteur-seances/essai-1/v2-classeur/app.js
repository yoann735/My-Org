/* Version B — « Le classeur ». Le lecteur actuel reste reconnaissable ; la bascule Original/Fiche devient une barre
   d'onglets de documents (diapo + fiches, colorées par séance), un ruban des séances situe chaque page dans le cours,
   et le transcript du panneau est rangé par séance. État en mémoire, rendu complet à chaque changement. */
(function () {
  const { COURS, SEANCES, TRANSCRIPTS, FICHES, FICHE_A_IMPORTER, ANNOTATIONS, seanceDePage, titreDiapo, pagesFiche } = window.MR;
  const { $, h, ic, diapo, pageFiche, toast, seance } = window.Proto;
  const S = (id) => seance(id);

  const etat = {
    appareil: 'desktop', doc: 'diapo', page: 63, pageFiche: { f2a: 2 }, panneau: 'trans', panneauOuvert: true,
    fiches: FICHES.slice(), annots: JSON.parse(JSON.stringify(ANNOTATIONS)), menu: false, fen: null, cote: false,
    live: false, liveN: 0, liveT0: 0, transOuvert: { s2: true }, transCible: null, filtreCartes: 'tout', nouveau: null,
    importEtape: 0, importChoix: ['s5'], mobile: 'seances', feuilleM: null, feuilleOnglet: 'diapo', survolRuban: null,
    tags: { s1: 1, s2: 59, s3: 122, s4: 181 },
  };
  let minuteur = null;
  const fiche = (id) => etat.fiches.find((f) => f.id === id);
  const pagesF = {}; const pagesDe = (f) => (pagesF[f.id] = pagesF[f.id] || pagesFiche(f));
  const pfCourante = (f) => pagesDe(f)[(etat.pageFiche[f.id] || 1) - 1];
  const sc = (f) => S(f.seances[0]).couleur;
  const etiq = (f) => {
    if (f.seances.length > 1) return `<span class="etiq-s multi" style="--sc:${S(f.seances[0]).couleur};--sc2:${S(f.seances[1]).couleur}">${f.seances.map((x) => 'S' + S(x).n).join('+')}</span>`;
    const s = S(f.seances[0]); return `<span class="etiq-s" style="--sc:${s.couleur}">S${s.n}</span>`;
  };
  const seanceCourante = () => (etat.doc === 'diapo' ? seanceDePage(etat.page) : S(pfCourante(fiche(etat.doc)).seance));

  /* ---------- direct ---------- */
  const lignesLive = () => { const l = TRANSCRIPTS.s5.lignes; return Array.from({ length: etat.liveN }, (_, i) => ({ ...l[i % l.length], t: 12 + i * 95, horo: window.MR.mmss(12 + i * 95), page: Math.min(300, 244 + Math.floor(i * 1.6)) })); };
  function demarrerLive() {
    arreterLive(); etat.live = true; etat.liveN = 3; etat.doc = 'diapo'; etat.page = 244; etat.tags.s5 = 244; etat.panneau = 'trans'; etat.panneauOuvert = true; etat.transOuvert = { s5: true };
    minuteur = setInterval(() => { etat.liveN++; const l = lignesLive(); etat.page = l[l.length - 1].page; rendre(); }, 1500);
  }
  function arreterLive() { clearInterval(minuteur); minuteur = null; }

  /* ---------- en-tête, menu, outils ---------- */
  const enteteHTML = () => `<div class="entete">
      <button class="btn ghost" data-act="retour">${ic('retour')} </button>
      <div><h1>${h(COURS.titre)}</h1><div class="meta">${h(COURS.ue)} · ${COURS.pages} p. · ${SEANCES.length} séances · ${etat.fiches.length} fiches</div></div>
      <div class="fichier"><button class="btn" data-act="menu">${ic('fichier', 14)} Fichier</button>${etat.menu ? menuHTML() : ''}</div>
      <div class="droite">
        ${etat.live ? `<span class="badge-live">EN DIRECT · S5</span>` : `<button class="btn live" data-act="live">${ic('micro', 14)} Démarrer la séance 5</button>`}
        <button class="btn" data-act="gestion">${ic('calendrier', 14)} Documents & séances</button>
      </div></div>`;
  const menuHTML = () => {
    const d = etat.doc === 'diapo' ? 'Diapo originale' : fiche(etat.doc).titre;
    return `<div class="menu" data-stop>
      <div class="sec">Cours</div>
      <button data-act="gestion">${ic('calendrier', 14)} Documents & séances…</button>
      <button data-act="import">${ic('import', 14)} Importer une fiche…</button>
      <button data-act="toast" data-msg="Renommer le cours">${ic('crayon', 14)} Renommer<kbd>F2</kbd></button>
      <button data-act="toast" data-msg="Export du cours complet (JSON + fichiers)">${ic('import', 14)} Exporter tout le cours…</button>
      <hr><div class="sec">Document affiché · <b>${h(d)}</b></div>
      <button data-act="toast" data-msg="Export du document annoté">${ic('import', 14)} Exporter annoté…<kbd>⌘P</kbd></button>
      <button data-act="toast" data-msg="Export spécial IA (pages + transcript de la séance)">${ic('notions', 14)} Export pour Claude (pages + transcript)…<kbd>⌘⇧E</kbd></button>
      <button data-act="toast" data-msg="Reconnaissance de texte">${ic('recherche', 14)} Reconnaissance de texte…</button>
      <button data-act="toast" data-msg="Remplacer le fichier (annotations replacées)">${ic('fichier', 14)} Remplacer ce fichier…</button>
      <hr><button class="rouge" data-act="toast" data-msg="Mis à la corbeille (récupérable 30 jours)">${ic('fermer', 14)} Retirer ce document du cours…</button></div>`;
  };
  const outilsHTML = () => {
    const f = etat.doc !== 'diapo' && fiche(etat.doc);
    const num = f ? `${etat.pageFiche[f.id] || 1} / ${f.pages}` : `${etat.page} / ${COURS.pages}`;
    return `<div class="outils">
      <div class="grp"><button data-act="prec">${ic('haut')}</button><span class="val tnum">${num}</span><button data-act="suiv">${ic('bas')}</button></div>
      <div class="grp"><button>−</button><span class="val tnum">${etat.appareil === 'ipad' ? '92 %' : '120 %'}</span><button>+</button></div>
      <div class="grp"><button class="on" title="Sélection">${ic('jouer', 14)}</button><button title="Surligneur">${ic('surligne')}</button><button title="Dessin">${ic('crayon')}</button><button title="Texte">${ic('texte')}</button></div>
      ${f ? `<button class="btn ${etat.cote ? 'prim' : ''}" data-act="cote">${ic('cote', 14)} Côte à côte</button>` : ''}
      <div class="rech">${ic('recherche', 14)} <span>Rechercher dans le cours</span></div>
      ${etat.appareil === 'ipad' ? `<button class="btn" data-act="panneau">${ic('panneau', 14)}</button>` : ''}
    </div>`;
  };

  /* ---------- onglets de documents ---------- */
  const ongletsHTML = () => {
    let html = `<button class="onglet ${etat.doc === 'diapo' ? 'actif' : ''}" data-act="doc" data-doc="diapo" style="--sc:var(--text-2)">${ic('diapo', 14)}<span class="nom">Diapo</span><span class="tnum" style="color:var(--text-3)">${COURS.pages} p.</span></button><span class="sep"></span>`;
    for (const s of SEANCES) {
      const fs = etat.fiches.filter((f) => f.seances.length === 1 && f.seances[0] === s.id);
      for (const f of fs) html += `<button class="onglet ${etat.doc === f.id ? 'actif' : ''} ${etat.nouveau === f.id ? 'nouveau' : ''}" data-act="doc" data-doc="${f.id}" style="--sc:${s.couleur}" title="${h(f.titre)}">${etiq(f)}<span class="nom">${h(f.titre)}</span></button>`;
    }
    for (const f of etat.fiches.filter((x) => x.seances.length > 1)) html += `<button class="onglet ${etat.doc === f.id ? 'actif' : ''}" data-act="doc" data-doc="${f.id}" style="--sc:${sc(f)}" title="${h(f.titre)}">${etiq(f)}<span class="nom">${h(f.titre)}</span></button>`;
    return `<div class="onglets">${html}<button class="onglet plus" data-act="import" title="Importer une fiche">${ic('plus', 14)} Fiche</button></div>`;
  };

  /* ---------- ruban des séances ---------- */
  const rubanHTML = () => {
    const pos = (p) => ((p - 1) / (COURS.pages - 1)) * 100;
    const f = etat.doc !== 'diapo' && fiche(etat.doc);
    const bandes = SEANCES.map((s) => {
      const nf = etat.fiches.filter((x) => x.seances.includes(s.id)).length;
      return `<div class="bande ${s.etat === 'aujourdhui' ? 'live' : ''}" style="--sc:${s.couleur};flex:${s.fin - s.debut + 1}" data-s="${s.id}">S${s.n}<span class="fi">${'<i></i>'.repeat(nf)}</span></div>`;
    }).join('');
    let extra = '';
    if (f) { const pg = pfCourante(f); extra = `<div class="zone-src" style="left:${pos(pg.sources.de)}%;width:${Math.max(1.2, pos(pg.sources.a) - pos(pg.sources.de))}%"></div>`; }
    else extra = `<div class="curseur" style="left:calc(${pos(etat.page)}% - 1px)"></div>`;
    extra += Object.entries(etat.tags).map(([sid, p]) => `<span class="repere-tag" style="left:${pos(p)}%;--sc:${S(sid).couleur}" title="Début de la séance ${S(sid).n} · p. ${p}"></span>`).join('');
    if (etat.survolRuban) { const s = S(etat.survolRuban); extra += `<div class="bulle-r" style="left:${pos((s.debut + s.fin) / 2)}%"><b>Séance ${s.n}</b> · ${s.jour} · p. ${s.debut}–${s.fin}<br><span style="color:var(--text-3)">${h(s.titre)}</span></div>`; }
    const s = seanceCourante();
    const info = f ? `Sources de la p. ${etat.pageFiche[f.id] || 1} : diapo p. ${pfCourante(f).sources.de}–${pfCourante(f).sources.a}` : `p. ${etat.page} · ${s ? `<b style="color:${s.couleur}">Séance ${s.n}</b> · ${h(titreDiapo(etat.page))}` : ''}`;
    return `<div class="ruban"><span class="lbl">${COURS.pages} pages · 5 séances</span><div class="piste" data-act="ruban">${bandes}${extra}</div><span class="info">${info}</span></div>`;
  };

  /* ---------- zone document ---------- */
  const pageDiapoHTML = (p, grand = true) => {
    const s = seanceDePage(p);
    const tag = Object.entries(etat.tags).find(([, v]) => v === p);
    const pastille = tag ? `<span class="pastille-tag" style="--sc:${S(tag[0]).couleur}">${ic('jouer', 11)} Début · S${S(tag[0]).n} · ${S(tag[0]).jour}${tag[0] === 's5' && etat.live ? ' · ' + ic('micro', 11) + ' en cours' : ''}</span>` : '';
    const nl = (s && s.etat === 'faite') ? TRANSCRIPTS[s.id].lignes.filter((l) => l.page === p).length : (etat.live ? lignesLive().filter((l) => l.page === p).length : 0);
    const badge = nl ? `<button class="badge-trans" data-act="trans-page" data-p="${p}">${ic('micro', 11)} ${nl} ligne${nl > 1 ? 's' : ''}</button>` : '';
    return `<div class="feuille" data-feuille="${p}">${grand ? `<div class="gouttiere"><button class="tagb" data-act="toast" data-msg="Marquer début / fin de séance sur cette page">${ic('tag', 13)}</button></div>` : ''}${pastille}${badge}${diapo(p)}</div>`;
  };
  const docHTML = () => {
    if (etat.doc === 'diapo') {
      return `<div class="doc" data-doc-scroll>${pageDiapoHTML(etat.page)}${etat.page < COURS.pages ? pageDiapoHTML(etat.page + 1) : ''}
        <div class="pager">${ic('haut')} Défiler · ruban au-dessus pour sauter d'une séance à l'autre</div></div>`;
    }
    const f = fiche(etat.doc); const pg = pfCourante(f); const s = S(pg.seance);
    const barre = `<div class="barre-fiche">${etiq(f)} <b style="color:var(--text)">${h(f.titre)}</b> · ${f.pages} p. · importée ${h(f.importe)}
      <div class="droite"><button class="btn" data-act="aller-diapo" data-p="${pg.sources.de}">${ic('diapo', 13)} Diapo p. ${pg.sources.de}</button><button class="btn" data-act="aller-trans" data-s="${pg.seance}" data-t="${pg.extrait[0] ? pg.extrait[0].t : 0}">${ic('micro', 13)} Transcript S${s.n}</button></div></div>`;
    const nav = `<div class="pager"><button class="btn" data-act="prec">${ic('haut', 13)} Page précédente</button><span class="tnum">${pg.n} / ${f.pages}</span><button class="btn" data-act="suiv">Page suivante ${ic('bas', 13)}</button></div>`;
    if (etat.cote) {
      const vign = []; for (let p = pg.sources.de; p <= pg.sources.a; p++) vign.push(`<div data-act="vign" data-p="${p}">${diapo(p).replace('class="page-diapo"', `class="page-diapo ${p === (etat.coteP || pg.sources.de) ? 'on' : ''}"`)}</div>`);
      const pc = etat.coteP && etat.coteP >= pg.sources.de && etat.coteP <= pg.sources.a ? etat.coteP : pg.sources.de;
      return `<div class="doc" data-doc-scroll>${barre}<div class="cote"><div><div class="col-t">${ic('fiche', 13)} Fiche · p. ${pg.n}</div>${pageFiche(f, pg, etat.annots[f.id] || [])}</div>
        <div><div class="col-t">${ic('diapo', 13)} Diapo source · p. ${pc} <span style="margin-left:auto;text-transform:none;letter-spacing:0;font-weight:600;color:${s.couleur}">Séance ${s.n}</span></div>${diapo(pc)}<div class="vignettes">${vign.join('')}</div></div></div>${nav}</div>`;
    }
    return `<div class="doc" data-doc-scroll>${barre}<div class="feuille">${pageFiche(f, pg, etat.annots[f.id] || [])}</div>${nav}</div>`;
  };

  /* ---------- panneau latéral ---------- */
  const modesHTML = () => `<div class="modes">${[['exos', 'Exos', COURS.flashcards], ['trans', 'Transcript', ''], ['notes', 'Notes', ''], ['notions', 'Notions', '']].map(([k, l, n]) =>
    `<button class="${etat.panneau === k ? 'on' : ''}" data-act="mode" data-m="${k}">${l}${n ? ` <span style="color:var(--text-3);font-weight:500">${n}</span>` : ''}${k === 'trans' && etat.live ? '<span class="pt"></span>' : ''}</button>`).join('')}</div>`;
  const transHTML = () => {
    let html = '';
    if (etat.live) {
      const l = lignesLive();
      html += `<div class="direct"><div class="haut"><span class="badge-live">EN DIRECT</span><b style="font-size:13px">Séance 5 · ${h(S('s5').titre)}</b><span class="vu"><i style="animation-delay:.1s"></i><i style="animation-delay:.3s"></i><i></i><i style="animation-delay:.5s"></i></span></div>
        <div style="display:flex;gap:10px;font-size:12px;color:var(--text-2);margin-bottom:6px"><span class="chrono">${window.MR.mmss(etat.liveN * 95)}</span><span>Début posé sur p. 244 · suit la page affichée (p. ${etat.page})</span></div>
        <div class="flux" data-flux>${l.map((x, i) => `<div class="lignetrans ${i === l.length - 1 ? 'nouvelle actuelle' : ''}" data-act="ligne" data-p="${x.page}"><span class="h">${x.horo}</span><span>${h(x.texte)}<span class="p">p. ${x.page}</span></span></div>`).join('')}</div>
        <div class="act"><button class="btn">${ic('pause', 13)} Pause</button><button class="btn" data-act="toast" data-msg="Début de séance déplacé sur la p. ${etat.page}">${ic('tag', 13)} Marquer début ici</button><button class="btn">+ Note</button><button class="btn live" data-act="stop">${ic('stop', 13)} Terminer la séance</button></div></div>`;
    }
    for (const s of SEANCES.slice().reverse()) {
      if (s.etat !== 'faite') { if (!etat.live) html += `<div class="groupe-s"><button data-act="live">${'<span class="pastille-seance" style="--sc:' + s.couleur + '"></span>'}<span class="t">S${s.n} · aujourd'hui</span><span class="m">${ic('micro', 12)} Démarrer</span></button></div>`; continue; }
      const T = TRANSCRIPTS[s.id]; const ouvert = !!etat.transOuvert[s.id];
      html += `<div class="groupe-s"><button data-act="groupe" data-s="${s.id}"><span class="pastille-seance" style="--sc:${s.couleur}"></span><span class="t">S${s.n} · ${h(s.titre)}</span><span class="m">${s.jour} · ${s.duree}</span></button>
        ${ouvert ? `<div class="lignes">${T.lignes.map((x) => `<div class="lignetrans ${etat.transCible && etat.transCible.s === s.id && Math.abs(etat.transCible.t - x.t) < 1 ? 'actuelle' : ''} ${etat.doc === 'diapo' && x.page === etat.page ? 'actuelle' : ''}" data-act="ligne" data-p="${x.page}" data-t="${x.t}"><span class="h">${x.horo}</span><span>${h(x.texte)}<span class="p">p. ${x.page}</span></span></div>`).join('')}</div>` : ''}</div>`;
    }
    return html;
  };
  const exosHTML = () => {
    const s = seanceCourante();
    const cartes = [['Valeur normale du DFG ?', '≈ 120 mL/min (180 L/j)', 's2', 'f2a p. 3'], ['Formule de la clairance ?', 'C = U × V / P', 's2', 'f2b p. 1'], ['Que mesure la clairance du PAH ?', 'Le débit plasmatique rénal', 's2', 'diapo p. 79'], ['Cible du furosémide ?', 'NKCC2, branche ascendante large', 's3', 'f3a p. 6'], ['Artères segmentaires : particularité ?', 'Terminales, sans anastomoses', 's1', 'f1 p. 3'], ['Action de l’ADH ?', 'Récepteur V2 → aquaporine 2', 's4', 'f4 p. 4']];
    const filt = etat.filtreCartes === 'tout' ? cartes : cartes.filter((c) => c[2] === etat.filtreCartes);
    return `<div class="chips"><button class="chip ${etat.filtreCartes === 'tout' ? 'on' : ''}" data-act="filtre" data-f="tout">Tout le cours · ${COURS.flashcards}</button>${SEANCES.map((x) => `<button class="chip ${etat.filtreCartes === x.id ? 'on' : ''}" data-act="filtre" data-f="${x.id}" style="${etat.filtreCartes === x.id ? '' : 'color:' + x.couleur}">S${x.n}</button>`).join('')}</div>
      <div style="font-size:12px;color:var(--text-3);margin:0 2px 8px">${s ? `Suggestion : séance ${s.n} affichée →` : ''} <button class="chip" data-act="filtre" data-f="${s ? s.id : 'tout'}">filtrer sur S${s ? s.n : ''}</button></div>
      ${filt.map((c) => `<div class="carte"><div class="q">${h(c[0])}</div><div class="r">${h(c[1])}</div><div class="o"><span class="etiq-s" style="--sc:${S(c[2]).couleur}">S${S(c[2]).n}</span> depuis ${h(c[3])}</div></div>`).join('')}
      <button class="btn" style="width:100%;justify-content:center;margin-top:4px">${ic('plus', 13)} Nouvelle carte</button>`;
  };
  const notionsHTML = () => {
    const items = [];
    for (const [fid, as] of Object.entries(etat.annots)) { const f = fiche(fid); if (!f) continue; for (const a of as) { const pg = pagesDe(f)[a.page - 1]; items.push({ f, a, t: a.type === 'note' ? a.texte : pg.puces[a.puce] }); } }
    return `<div class="h-sec">Surlignages et notes · ${items.length}</div>${items.map(({ f, a, t }) => `<div class="notion" data-act="doc" data-doc="${f.id}" data-pf="${a.page}"><span class="c" style="background:${a.type === 'note' ? '#f3d55b' : a.couleur === 'vert' ? '#59c97c' : '#f3d55b'}"></span><div><div>${h(t)}</div><div style="font-size:11.5px;color:var(--text-3);margin-top:2px">${etiq(f)} ${h(f.titre)} · p. ${a.page}</div></div></div>`).join('')}`;
  };
  const notesHTML = () => `<div class="h-sec">Notes de la séance ${(seanceCourante() || S('s2')).n}</div><div class="notes-ed" contenteditable="true"><h4>À revoir</h4>• Refaire l’exercice de clairance (diapo p. 101)<br>• Demander au prof : pourquoi la créatinine surestime le DFG ?<br><br><span style="color:var(--text-3)">Une page de notes par séance, plus une page « cours entier ».</span></div>`;
  const panneauHTML = () => {
    const contenu = { trans: transHTML, exos: exosHTML, notes: notesHTML, notions: notionsHTML }[etat.panneau]();
    if (etat.appareil === 'ipad' && !etat.panneauOuvert) return `<aside class="panneau"><button class="btn ghost" style="margin:8px auto" data-act="panneau">${ic('haut', 14)} Ouvrir le panneau ${etat.live ? '<span class="badge-live">DIRECT</span>' : ''}</button></aside>`;
    return `<aside class="panneau">${etat.appareil === 'ipad' ? '<div class="poignee" data-act="panneau"></div>' : ''}<div>${modesHTML()}</div><div class="pcorps" data-pcorps>${contenu}</div></aside>`;
  };

  /* ---------- fenêtres : documents & séances, import ---------- */
  const gestionHTML = () => `<div class="voile" data-act="fermer-fen"><div class="fen" data-stop>
    <div class="ft">${ic('calendrier')}<h2>Documents & séances</h2><span style="color:var(--text-3);font-size:12.5px">remplace « Fichiers du cours » et « Séances »</span><button class="btn ghost x" data-act="fermer-fen">${ic('fermer')}</button></div>
    <div class="fc"><div class="ligne-doc" style="--sc:var(--text-2)"><div class="ico">${ic('diapo')}</div><div><div class="t">Diapo complète · ${h(COURS.fichier)}</div><div class="m">${COURS.pages} pages · importée le 1 oct. · 41 Mo · document de référence de toutes les séances</div></div><div style="display:flex;gap:6px"><button class="btn" data-act="toast" data-msg="Remplacer la diapo (annotations replacées)">Remplacer</button><button class="btn" data-act="toast" data-msg="Téléchargement du PDF">Exporter</button></div></div>
    ${SEANCES.map((s) => { const fs = etat.fiches.filter((f) => f.seances.includes(s.id)); const T = TRANSCRIPTS[s.id];
      return `<div class="seance-l" style="--sc:${s.couleur}"><div class="l1"><span class="pastille-seance" style="--sc:${s.couleur}">S${s.n}</span><span class="t">${h(s.titre)}</span><span class="d">${s.jour} · ${s.heure} · p. ${s.debut}–${s.fin}</span>
        <div class="a"><button class="btn" data-act="aller-diapo" data-p="${s.debut}">${ic('diapo', 13)} p. ${s.debut}</button>${s.etat === 'faite' ? `<button class="btn" data-act="aller-trans" data-s="${s.id}" data-t="0">${ic('micro', 13)} ${s.duree}</button>` : `<button class="btn live" data-act="live">${ic('micro', 13)} Démarrer</button>`}</div></div>
        <div class="l2">${fs.map((f) => `<button class="tagdoc" data-act="doc" data-doc="${f.id}">${ic('fiche', 13)} ${h(f.titre)} <span style="color:var(--text-3)">${f.pages} p.</span>${f.seances.length > 1 ? ' ' + etiq(f) : ''}</button>`).join('')}
        ${fs.length ? '' : '<span style="color:var(--text-3);font-size:12px">Pas encore de fiche</span>'}<button class="tagdoc" style="color:var(--accent)" data-act="import" data-s="${s.id}">${ic('plus', 13)} Rattacher une fiche</button>
        <span style="margin-left:auto;font-size:11.5px;color:var(--text-3)">${s.etat === 'faite' ? T.lignes.length + ' lignes de transcript · tags Début/Fin posés' : 'aujourd’hui · ' + s.heure}</span></div></div>`; }).join('')}</div></div></div>`;
  const importHTML = () => {
    const f = FICHE_A_IMPORTER;
    let c = '';
    if (etat.importEtape === 0) c = `<div class="depot">${ic('import', 30)}<div class="gros">Dépose la fiche PDF rendue par Claude</div>ou <button class="btn prim" data-act="deposer">Simuler le dépôt de « Equilibre-acide-base-fiche.pdf »</button></div>`;
    else if (etat.importEtape === 1) c = `<div class="analyse"><b>Analyse de « Equilibre-acide-base-fiche.pdf »…</b><div class="barre-prog"><i></i></div><span style="color:var(--text-3);font-size:12.5px">lecture des 8 pages · comparaison avec la diapo · recherche de la séance</span></div>`;
    else {
      const pg = pagesDe(f)[0];
      c = `<div class="propo"><div class="apercu">${pageFiche(f, pg, [], { sansSources: true })}</div><div>
        <label style="font-size:12px;color:var(--text-3);font-weight:600">Titre</label><input class="champ" value="${h(f.titre)}">
        <div style="font-size:12px;color:var(--text-3);font-weight:600;margin-top:12px">Rattacher à la séance</div>
        <div class="choix-s">${SEANCES.map((s) => `<label class="${etat.importChoix.includes(s.id) ? 'on' : ''}"><input type="checkbox" data-act="choix" data-s="${s.id}" ${etat.importChoix.includes(s.id) ? 'checked' : ''}><span class="pastille-seance" style="--sc:${s.couleur}">S${s.n}</span> ${h(s.titre)} <span style="color:var(--text-3)">${s.jour}</span>${s.id === 's5' ? '<span class="pourquoi">✓ proposé : date du jour + 7 pages reconnues</span>' : ''}</label>`).join('')}</div>
        <div class="detecte"><span>Pages de diapo couvertes : <b>244–300</b> (7 pages sur 8 reconnues, 1 page ajoutée par Claude)</span><span>Transcript de la séance : <b>${etat.live ? 'en cours' : 'S5 · 11 lignes'}</b>, les liens « sources » seront calculés</span></div></div></div>`;
    }
    return `<div class="voile" data-act="fermer-fen"><div class="fen" data-stop><div class="ft">${ic('import')}<h2>Importer une fiche</h2><button class="btn ghost x" data-act="fermer-fen">${ic('fermer')}</button></div><div class="fc">${c}</div>
      ${etat.importEtape === 2 ? `<div class="fp"><button class="btn" data-act="fermer-fen">Annuler</button><button class="btn prim" data-act="rattacher">${ic('lien', 14)} Rattacher à ${etat.importChoix.map((x) => 'S' + S(x).n).join(' + ') || '…'}</button></div>` : ''}</div></div>`;
  };

  /* ---------- téléphone ---------- */
  const mobileHTML = () => {
    const bas = `<nav class="bas">${[['seances', 'calendrier', 'Séances'], ['fiche', 'fiche', 'Fiche'], ['live', 'micro', 'Direct'], ['cartes', 'cartes', 'Cartes']].map(([k, i, l]) => `<button class="${etat.mobile === k ? 'on' : ''}" data-act="m-ecran" data-e="${k}">${ic(i, 20)}${l}</button>`).join('')}</nav>`;
    let haut, corps, extra = '';
    if (etat.mobile === 'seances') {
      haut = `<div class="haut"><div><h1>${h(COURS.titre)}</h1><div class="s">${COURS.pages} p. · 5 séances · ${etat.fiches.length} fiches</div></div><button class="bt" data-act="import">${ic('plus')}</button></div>`;
      corps = `<div class="mini-ruban">${SEANCES.map((s) => `<i style="--sc:${s.couleur};flex:${s.fin - s.debut}" class="on"></i>`).join('')}</div>` + SEANCES.slice().reverse().map((s) => { const fs = etat.fiches.filter((f) => f.seances.includes(s.id));
        return `<div class="carte-s" style="--sc:${s.couleur}"><div class="t">S${s.n} · ${h(s.titre)}</div><div class="d">${s.jour} · p. ${s.debut}–${s.fin}${s.etat === 'faite' ? ' · ' + s.duree + ' de transcript' : ' · aujourd’hui'}</div>
          <div class="f">${fs.map((f) => `<button data-act="m-fiche" data-doc="${f.id}">${ic('fiche', 13)} ${h(f.titre.length > 26 ? f.titre.slice(0, 25) + '…' : f.titre)}</button>`).join('')}${s.etat !== 'faite' ? `<button data-act="m-ecran" data-e="live" style="color:var(--live)">${ic('micro', 13)} Suivre en direct</button>` : ''}</div></div>`; }).join('');
    } else if (etat.mobile === 'fiche') {
      const f = fiche(etat.doc !== 'diapo' ? etat.doc : 'f2a'); const pg = pfCourante(f);
      haut = `<div class="haut"><button class="bt" style="margin:0" data-act="m-ecran" data-e="seances">${ic('retour')}</button><div style="min-width:0"><h1 style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${h(f.titre)}</h1><div class="s">${etiq(f)} p. ${pg.n} / ${f.pages}</div></div><button class="bt">${ic('surligne')}</button></div>`;
      corps = `${pageFiche(f, pg, etat.annots[f.id] || [])}<div class="pgnav"><button data-act="prec">‹ Préc.</button><span>p. ${pg.n} / ${f.pages}</span><button data-act="suiv">Suiv. ›</button></div>`;
      extra = `<button class="src-bt" data-act="m-sources">${ic('lien', 15)} Sources · diapo p. ${pg.sources.de} · ${pg.extrait[0] ? pg.extrait[0].horo : ''}</button>`;
      if (etat.feuilleM) {
        const s = S(pg.seance); const T = TRANSCRIPTS[pg.seance];
        const lignes = T.lignes.filter((l) => l.page >= pg.sources.de - 1 && l.page <= pg.sources.a + 1);
        const c = etat.feuilleOnglet === 'diapo'
          ? `<div style="display:grid;gap:10px">${[pg.sources.de, pg.sources.de + 1].filter((p) => p <= pg.sources.a).map((p) => diapo(p)).join('')}</div>`
          : (lignes.length ? lignes : T.lignes.slice(0, 4)).map((x) => `<div class="lignetrans"><span class="h">${x.horo}</span><span>${h(x.texte)}<span class="p">p. ${x.page}</span></span></div>`).join('');
        extra += `<div class="feuille-m"><div class="poignee"></div><div class="tete"><span class="pastille-seance" style="--sc:${s.couleur}">S${s.n}</span><b>Sources de la p. ${pg.n}</b><button class="x" data-act="m-sources">${ic('fermer')}</button></div>
          <div class="onglets-m" style="padding-top:0"><button class="${etat.feuilleOnglet === 'diapo' ? 'on' : ''}" data-act="m-fong" data-o="diapo">${ic('diapo', 13)} Diapo p. ${pg.sources.de}–${pg.sources.a}</button><button class="${etat.feuilleOnglet === 'trans' ? 'on' : ''}" data-act="m-fong" data-o="trans">${ic('micro', 13)} Transcript</button></div>
          <div class="contenu">${c}</div></div>`;
      }
    } else if (etat.mobile === 'live') {
      const l = etat.live ? lignesLive() : [];
      haut = `<div class="haut"><div><h1>Séance 5</h1><div class="s">${h(S('s5').titre)}</div></div>${etat.live ? '<span class="badge-live" style="margin-left:auto">DIRECT</span>' : ''}</div>`;
      corps = etat.live ? `<div class="live-m"><div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-2);margin-bottom:8px"><span>Le lecteur de l’ordinateur suit la p. <b style="color:var(--text)">${etat.page}</b></span><span class="tnum">${window.MR.mmss(etat.liveN * 95)}</span></div>
        <div class="flux" data-flux>${l.map((x, i) => `<div class="lignetrans ${i === l.length - 1 ? 'nouvelle actuelle' : ''}"><span class="h">${x.horo}</span><span>${h(x.texte)}<span class="p">p. ${x.page}</span></span></div>`).join('')}</div></div>
        <div style="display:flex;gap:8px;margin-top:10px"><button class="btn">+ Note</button><button class="btn" data-act="stop" style="color:var(--live)">${ic('stop', 13)} Terminer</button></div>`
        : `<div class="depot">${ic('micro', 28)}<div style="font-weight:700;color:var(--text);margin:8px 0">Séance 5 · aujourd’hui 08:30</div><button class="btn prim" data-act="live">Démarrer la transcription</button><div style="font-size:12px;margin-top:10px">Le téléphone sert de micro et de télécommande ; le diapo reste sur l’ordinateur.</div></div>`;
    } else {
      haut = `<div class="haut"><div><h1>Cartes</h1><div class="s">${COURS.flashcards} cartes · par séance</div></div></div>`;
      corps = `<div class="onglets-m" style="padding:0 0 10px">${SEANCES.map((s) => `<button style="--sc:${s.couleur}" class="${s.id === 's2' ? 'on' : ''}">S${s.n}</button>`).join('')}</div><div class="carte-s" style="--sc:${S('s2').couleur}"><div class="t">Valeur normale du DFG ?</div><div class="d">depuis la fiche « DFG et ses déterminants » p. 3</div></div><div class="carte-s" style="--sc:${S('s2').couleur}"><div class="t">Formule de la clairance ?</div><div class="d">depuis la fiche « Clairances » p. 1</div></div>`;
    }
    let fen = '';
    if (etat.fen === 'import') {
      const f = FICHE_A_IMPORTER;
      const c = etat.importEtape === 0 ? `<div class="depot">${ic('import', 26)}<div style="font-weight:700;color:var(--text);margin:8px 0">Choisir la fiche PDF</div><button class="btn prim" data-act="deposer">Simuler « Equilibre-acide-base-fiche.pdf »</button></div>`
        : etat.importEtape === 1 ? `<b>Analyse…</b><div class="barre-prog" style="margin-top:10px"><i></i></div>`
          : `<input class="champ" value="${h(f.titre)}" style="width:100%;margin-bottom:10px;border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:9px;padding:9px"><div class="choix-s">${SEANCES.map((s) => `<label class="${etat.importChoix.includes(s.id) ? 'on' : ''}"><input type="checkbox" data-act="choix" data-s="${s.id}" ${etat.importChoix.includes(s.id) ? 'checked' : ''}>S${s.n} · ${h(s.titre)}${s.id === 's5' ? '<span class="pourquoi">proposé</span>' : ''}</label>`).join('')}</div><div class="detecte">Pages 244–300 reconnues · transcript S5</div>`;
      fen = `<div class="fen-m"><div class="tete"><button class="btn" data-act="fermer-fen">${ic('fermer', 14)}</button><b>Importer une fiche</b></div><div class="contenu">${c}</div>${etat.importEtape === 2 ? `<div class="pied"><button class="btn prim" data-act="rattacher">${ic('lien', 14)} Rattacher à ${etat.importChoix.map((x) => 'S' + S(x).n).join(' + ')}</button></div>` : '<div></div>'}</div>`;
    }
    return `<div class="vBm">${haut}<div class="defil" data-flux-parent>${corps}</div>${bas}${extra}${fen}</div>`;
  };

  /* ---------- rendu ---------- */
  function rendre() {
    const app = $('.appareil'); if (!app) return;
    const fluxBas = true;
    if (etat.appareil === 'mobile') { app.innerHTML = mobileHTML(); }
    else {
      const sansP = etat.appareil === 'ipad' && !etat.panneauOuvert;
      app.innerHTML = `<div class="vB"><nav class="rail"><span class="logo">MR</span><i>${ic('calendrier')}</i><i>${ic('cartes')}</i><i class="on">${ic('fiche')}</i><i>${ic('notions')}</i></nav>
        <div class="lec">${enteteHTML()}${outilsHTML()}${ongletsHTML()}${rubanHTML()}<div class="corps ${sansP ? 'sans-panneau' : ''}">${docHTML()}${panneauHTML()}</div></div>
        ${etat.fen === 'gestion' ? gestionHTML() : ''}${etat.fen === 'import' ? importHTML() : ''}</div>`;
    }
    if (fluxBas) app.querySelectorAll('[data-flux]').forEach((x) => { x.scrollTop = x.scrollHeight; });
    const cible = app.querySelector('.groupe-s .lignetrans.actuelle'); if (cible && !etat.live) cible.scrollIntoView({ block: 'center' });
    const onglet = app.querySelector('.onglet.actif'); if (onglet) onglet.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  /* ---------- actions ---------- */
  const sansLive = () => { if (etat.live) { /* le direct continue en fond : il n'est arrêté que par « Terminer » */ } };
  function agir(b, e) {
    const a = b.dataset.act; const app = $('.appareil');
    switch (a) {
      case 'menu': etat.menu = !etat.menu; break;
      case 'gestion': etat.menu = false; etat.fen = 'gestion'; break;
      case 'import': etat.menu = false; etat.fen = 'import'; etat.importEtape = 0; etat.importChoix = [b.dataset.s || 's5']; break;
      case 'fermer-fen': if (e.target !== b && !b.classList.contains('x') && b.classList.contains('voile')) { if (e.target.closest('[data-stop]')) return; } etat.fen = null; break;
      case 'deposer': etat.importEtape = 1; rendre(); setTimeout(() => { etat.importEtape = 2; rendre(); }, 1100); return;
      case 'choix': { const s = b.dataset.s; etat.importChoix = etat.importChoix.includes(s) ? etat.importChoix.filter((x) => x !== s) : etat.importChoix.concat(s); break; }
      case 'rattacher': {
        if (!etat.importChoix.length) { toast('Choisis au moins une séance'); return; }
        if (!fiche('f5')) etat.fiches.push({ ...FICHE_A_IMPORTER, seances: etat.importChoix.slice() });
        etat.fen = null; etat.doc = 'f5'; etat.pageFiche.f5 = 1; etat.nouveau = 'f5'; etat.cote = false; delete pagesF.f5; etat.mobile = 'fiche';
        rendre(); toast(`${ic('check', 14)} Fiche rattachée à ${etat.importChoix.map((x) => 'S' + S(x).n).join(' + ')} · ${etat.fiches.length} fiches dans le cours`); return;
      }
      case 'doc': etat.menu = false; etat.fen = null; etat.doc = b.dataset.doc; if (b.dataset.pf) etat.pageFiche[b.dataset.doc] = +b.dataset.pf; etat.coteP = null; if (etat.doc === 'diapo') etat.cote = false; break;
      case 'prec': case 'suiv': {
        const d = a === 'prec' ? -1 : 1;
        if (etat.doc === 'diapo' && etat.appareil !== 'mobile') etat.page = Math.max(1, Math.min(COURS.pages, etat.page + d));
        else { const f = fiche(etat.doc !== 'diapo' ? etat.doc : 'f2a'); etat.doc = f.id; etat.pageFiche[f.id] = Math.max(1, Math.min(f.pages, (etat.pageFiche[f.id] || 1) + d)); etat.coteP = null; }
        break;
      }
      case 'cote': etat.cote = !etat.cote; etat.coteP = null; break;
      case 'vign': etat.coteP = +b.dataset.p; break;
      case 'aller-diapo': etat.fen = null; etat.doc = 'diapo'; etat.page = +b.dataset.p; etat.cote = false; toast(`Diapo p. ${etat.page} · onglet « Diapo »`); break;
      case 'aller-trans': etat.fen = null; etat.panneau = 'trans'; etat.panneauOuvert = true; etat.transOuvert = { [b.dataset.s]: true }; etat.transCible = { s: b.dataset.s, t: +b.dataset.t }; break;
      case 'trans-page': { const s = seanceDePage(+b.dataset.p); etat.panneau = 'trans'; etat.panneauOuvert = true; if (s) { etat.transOuvert = { [s.id]: true }; const l = (s.etat === 'faite' ? TRANSCRIPTS[s.id].lignes : []).find((x) => x.page === +b.dataset.p); etat.transCible = l ? { s: s.id, t: l.t } : null; } break; }
      case 'ligne': if (etat.appareil === 'mobile') return; etat.doc = 'diapo'; etat.page = +b.dataset.p; etat.cote = false; etat.transCible = b.dataset.t ? { s: seanceDePage(+b.dataset.p).id, t: +b.dataset.t } : null; break;
      case 'groupe': etat.transOuvert[b.dataset.s] = !etat.transOuvert[b.dataset.s]; break;
      case 'mode': etat.panneau = b.dataset.m; etat.panneauOuvert = true; break;
      case 'panneau': etat.panneauOuvert = !etat.panneauOuvert; break;
      case 'filtre': etat.filtreCartes = b.dataset.f; break;
      case 'live': etat.fen = null; demarrerLive(); if (etat.appareil === 'mobile') etat.mobile = 'live'; break;
      case 'stop': arreterLive(); etat.live = false; etat.tags.s5 = 244; rendre(); toast(`Séance 5 terminée · ${etat.liveN} lignes · pages 244–${etat.page} · <b>Importer la fiche</b> quand Claude l’aura rendue`); return;
      case 'ruban': {

        const r = b.getBoundingClientRect(); const k = (e.clientX - r.left) / r.width;
        etat.doc = 'diapo'; etat.cote = false; etat.page = Math.max(1, Math.min(COURS.pages, Math.round(1 + k * (COURS.pages - 1)))); break;
      }
      case 'retour': toast('Retour à la Bibliothèque'); return;
      case 'toast': etat.menu = false; toast(b.dataset.msg); rendre(); return;
      case 'm-ecran': etat.mobile = b.dataset.e; etat.feuilleM = null; if (b.dataset.e === 'fiche' && etat.doc === 'diapo') etat.doc = 'f2a'; break;
      case 'm-fiche': etat.mobile = 'fiche'; etat.doc = b.dataset.doc; etat.feuilleM = null; break;
      case 'm-sources': etat.feuilleM = !etat.feuilleM; break;
      case 'm-fong': etat.feuilleOnglet = b.dataset.o; break;
      default: return;
    }
    sansLive(); rendre();
  }

  function brancher() {
    const app = $('.appareil');
    app.addEventListener('click', (e) => {
      // puce de fiche : surligner / retirer (sauf clic sur un lien de source)
      const li = e.target.closest('.page-fiche li');
      if (li && !e.target.closest('[data-act]')) {
        const pf = li.closest('.page-fiche'); const fid = pf.dataset.fiche; const n = +pf.dataset.pagefiche; const i = +li.dataset.puce;
        const L = (etat.annots[fid] = etat.annots[fid] || []); const k = L.findIndex((x) => x.page === n && x.puce === i && x.type === 'surligne');
        if (k >= 0) { L.splice(k, 1); toast('Surlignage retiré'); } else { L.push({ page: n, puce: i, type: 'surligne', couleur: 'jaune' }); toast(`${ic('surligne', 14)} Surligné · ajouté aux Notions de la séance`); }
        rendre(); return;
      }
      const src = e.target.closest('[data-aller-diapo],[data-aller-trans]');
      if (src) {
        if (etat.appareil === 'mobile') { etat.feuilleM = true; etat.feuilleOnglet = src.dataset.allerDiapo ? 'diapo' : 'trans'; rendre(); return; }
        if (src.dataset.allerDiapo) { if (etat.cote) { etat.coteP = +src.dataset.allerDiapo; rendre(); return; } etat.doc = 'diapo'; etat.page = +src.dataset.allerDiapo; toast(`Diapo p. ${etat.page}`); }
        else { const [s, t] = src.dataset.allerTrans.split(':'); etat.panneau = 'trans'; etat.panneauOuvert = true; etat.transOuvert = { [s]: true }; etat.transCible = { s, t: +t }; }
        rendre(); return;
      }
      const b = e.target.closest('[data-act]');
      if (!b) { if (etat.menu && !e.target.closest('[data-stop]')) { etat.menu = false; rendre(); } return; }
      if (b.dataset.act === 'fermer-fen' && b.classList.contains('voile') && e.target.closest('[data-stop]')) return;
      if (b.tagName === 'INPUT') e.preventDefault();
      agir(b, e);
    });
    app.addEventListener('mousemove', (e) => {
      const bd = e.target.closest('.bande'); const s = bd ? bd.dataset.s : null;
      if (s !== etat.survolRuban) { etat.survolRuban = s; const r = app.querySelector('.ruban'); if (r) { r.outerHTML = rubanHTML(); } }
    });
    app.addEventListener('mouseleave', () => { if (etat.survolRuban) { etat.survolRuban = null; const r = app.querySelector('.ruban'); if (r) r.outerHTML = rubanHTML(); } });
  }

  /* ---------- scénarios ---------- */
  const reinit = () => { arreterLive(); Object.assign(etat, { live: false, fen: null, menu: false, cote: false, nouveau: null, transCible: null, feuilleM: null }); };
  const scenarios = [
    { id: 'ouvrir', libelle: 'Ouvrir le cours', aller: () => { reinit(); etat.doc = 'diapo'; etat.page = 59; etat.panneau = 'trans'; etat.transOuvert = { s2: true }; etat.mobile = 'seances'; } },
    { id: 'seances', libelle: 'Vue des séances', aller: () => { reinit(); etat.fen = 'gestion'; etat.mobile = 'seances'; } },
    { id: 'live', libelle: 'Séance 5 en direct', aller: () => { reinit(); demarrerLive(); etat.mobile = 'live'; } },
    { id: 'import', libelle: 'Importer la fiche S5', aller: () => { reinit(); etat.fiches = etat.fiches.filter((f) => f.id !== 'f5'); etat.fen = 'import'; etat.importEtape = 0; etat.importChoix = ['s5']; } },
    { id: 'lire', libelle: 'Lire une fiche', aller: () => { reinit(); etat.doc = 'f2a'; etat.pageFiche.f2a = 2; etat.panneau = 'notions'; etat.mobile = 'fiche'; } },
    { id: 'passage', libelle: 'Fiche ↔ diapo ↔ transcript', aller: () => { reinit(); etat.doc = 'f2a'; etat.pageFiche.f2a = 4; etat.cote = true; etat.panneau = 'trans'; etat.panneauOuvert = true; const pg = pfCourante(fiche('f2a')); etat.transOuvert = { s2: true }; etat.transCible = { s: 's2', t: pg.extrait[0] ? pg.extrait[0].t : 0 }; etat.mobile = 'fiche'; etat.feuilleM = true; etat.feuilleOnglet = 'diapo'; } },
    { id: 'panneau', libelle: 'Panneau latéral', aller: () => { reinit(); etat.doc = 'f2b'; etat.pageFiche.f2b = 1; etat.panneau = 'exos'; etat.filtreCartes = 's2'; etat.panneauOuvert = true; etat.mobile = 'cartes'; } },
  ];

  window.Proto.monter({ titre: 'Version B — Le classeur', sousTitre: 'onglets de documents + ruban des séances', scenarios, rendre, etat });
  brancher();
  scenarios[0].aller(etat); rendre();
})();
