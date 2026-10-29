/* Aides communes aux prototypes : barre du prototype (appareil, thème, scénarios), rendu des pages, icônes, toast.
   Chaque version appelle Proto.monter({ titre, scenarios, rendre }) ; `rendre(etat)` redessine la maquette. */
(function () {
  const { SEANCES, seanceDePage, titreDiapo } = window.MR;
  const $ = (s, r = document) => r.querySelector(s);
  const h = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const seance = (id) => SEANCES.find((s) => s.id === id);

  const ICONES = {
    retour: '<path d="M15 18l-6-6 6-6"/>', plus: '<path d="M12 5v14M5 12h14"/>', fichier: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    micro: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>', diapo: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    fiche: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7M9 7h3"/>', transcript: '<path d="M4 6h16M4 10h10M4 14h16M4 18h8"/>', tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    lien: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', surligne: '<path d="M9 11l6-6 4 4-6 6z"/><path d="M4 20h7l-2-5z"/>',
    crayon: '<path d="M4 20l4-1 11-11-3-3L5 16z"/>', texte: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>', recherche: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    panneau: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>', fermer: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12l5 5 9-10"/>',
    import: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>', cartes: '<rect x="4" y="6" width="13" height="14" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v11"/>', notions: '<path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z"/>',
    notes: '<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6"/>', plein: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', haut: '<path d="M6 15l6-6 6 6"/>', bas: '<path d="M6 9l6 6 6-6"/>',
    pause: '<path d="M8 5v14M16 5v14"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>', jouer: '<path d="M7 4l13 8-13 8z"/>', cote: '<rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/>',
    plus3: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>', calendrier: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    oeil: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', soleil: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  };
  const ic = (n, t = 16) => `<svg class="ic" viewBox="0 0 24 24" width="${t}" height="${t}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[n] || ''}</svg>`;

  /** une page de diapo (vignette ou pleine taille : le rendu s'adapte à la largeur) */
  function diapo(p, extra = '') {
    const s = seanceDePage(p);
    return `<div class="page-diapo" style="--sc:${s ? s.couleur : '#888'}" data-page="${p}" ${extra}><div class="bandeau"></div><div class="t">${h(titreDiapo(p))}</div>
      <div class="lignes"><i></i><i></i><i></i></div><div class="schema"></div><div class="num">${p}</div></div>`;
  }
  /** une page de fiche (avec annotations et liens vers ses sources) */
  function pageFiche(f, pg, annots = [], opts = {}) {
    const s = seance(pg.seance);
    const lis = pg.puces.map((t, i) => {
      const a = annots.find((x) => x.page === pg.n && x.puce === i);
      const cls = a && a.type === 'surligne' ? ' class="hl-' + a.couleur + '"' : '';
      return `<li data-puce="${i}"${cls}>${h(t)}</li>`;
    }).join('');
    const notes = annots.filter((x) => x.page === pg.n && x.type === 'note').map((x) => `<div class="note-marge" style="top:${60 + x.puce * 34}px">${h(x.texte)}</div>`).join('');
    const src = opts.sansSources ? '' : `<div class="page-sources"><span>Sources :</span>
      <button class="lien-src" data-aller-diapo="${pg.sources.de}">${ic('diapo', 12)} diapo p. ${pg.sources.de}–${pg.sources.a}</button>
      ${pg.extrait[0] ? `<button class="lien-src" data-aller-trans="${pg.seance}:${pg.extrait[0].t}">${ic('micro', 12)} transcript ${pg.extrait[0].horo}</button>` : ''}
      <span style="margin-left:auto;color:${s.couleur};font-weight:700">Séance ${s.n}</span></div>`;
    return `<div class="page-fiche" data-fiche="${f.id}" data-pagefiche="${pg.n}"><div class="sur">${h(f.titre)} · p. ${pg.n}/${f.pages}</div><h3>${h(pg.titre)}</h3><ul>${lis}</ul>${notes}${src}</div>`;
  }

  let toastT = null;
  function toast(msg, racine) {
    const r = racine || $('.appareil'); let t = r.querySelector(':scope > .toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; r.appendChild(t); }
    t.innerHTML = msg; t.classList.add('vu'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('vu'), 2600);
  }

  /** monte la barre du prototype et la scène. scenarios : [{ id, libelle, aller(etat) }] */
  function monter({ titre, sousTitre, scenarios = [], rendre, etat }) {
    // ?appareil=desktop (aperçus de la page d'accueil) l'emporte sur le dernier appareil choisi
    const app = new URLSearchParams(location.search).get('appareil') || (() => { try { return localStorage.getItem('proto.appareil') || 'desktop'; } catch (e) { return 'desktop'; } })();
    const theme = (() => { try { return localStorage.getItem('proto.theme') || 'dark'; } catch (e) { return 'dark'; } })();
    document.documentElement.dataset.theme = theme;
    document.body.innerHTML = `<div class="proto-barre"><a href="../index.html">← Les 3 versions</a><span class="titre">${h(titre)}<small>${h(sousTitre || '')}</small></span>
      <div class="seg" data-choix="appareil"><button data-v="desktop">Ordinateur</button><button data-v="ipad">iPad</button><button data-v="mobile">Téléphone</button></div>
      <div class="seg" data-choix="theme"><button data-v="dark">Sombre</button><button data-v="light">Clair</button></div>
      <div class="scenarios">${scenarios.map((s) => `<button class="puce-scen" data-scen="${s.id}">${h(s.libelle)}</button>`).join('')}</div></div>
      <div class="scene"><div class="appareil" data-appareil="${app}"></div></div>`;
    etat.appareil = app;
    const appareil = $('.appareil');
    const ajuster = () => { const w = { desktop: 1440, ipad: 1200, mobile: 410 }[etat.appareil]; const k = Math.min(1, (window.innerWidth - 32) / w); appareil.style.transform = k < 1 ? `scale(${k})` : ''; appareil.parentElement.style.height = (appareil.offsetHeight * k + 60) + 'px'; };
    const majSeg = () => { document.querySelectorAll('[data-choix] button').forEach((b) => { const c = b.parentElement.dataset.choix; b.classList.toggle('actif', (c === 'appareil' ? etat.appareil : document.documentElement.dataset.theme) === b.dataset.v); }); };
    document.querySelector('.proto-barre').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const c = b.parentElement.dataset.choix;
      if (c === 'appareil') { etat.appareil = b.dataset.v; appareil.dataset.appareil = b.dataset.v; try { localStorage.setItem('proto.appareil', b.dataset.v); } catch (x) { /* privé */ } rendre(); ajuster(); }
      else if (c === 'theme') { document.documentElement.dataset.theme = b.dataset.v; try { localStorage.setItem('proto.theme', b.dataset.v); } catch (x) { /* privé */ } }
      else if (b.dataset.scen) { const s = scenarios.find((x) => x.id === b.dataset.scen); s.aller(etat); rendre(); }
      majSeg();
    });
    window.addEventListener('resize', ajuster);
    majSeg(); rendre(); ajuster();
    return appareil;
  }

  window.Proto = { $, h, ic, diapo, pageFiche, toast, monter, seance };
})();
