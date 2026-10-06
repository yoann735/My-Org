/* ============================================================
   MedRevise — sidebar persistante de l'atelier "Voir le cours" (PdfReader,
   branche HTML) : liste TOUS les items de la fiche par type (onglets QCM /
   Flashcard / Exercice / Feynman), réponse visible, éditables sur place,
   + ajout intégré. RÉUTILISE STRICTEMENT :
   - ItemForm/PasteJsonForm (AddItemForm.jsx) pour l'ajout ET l'édition —
     mêmes formulaires que la modale "Ajouter un item" existante ;
   - toInternalItem (lib/adapter.js) pour fusionner un patch d'édition SANS
     toucher l'état SM-2 (interval/palier/nextReview/historique/missed) —
     c'est le même mécanisme "préserve les extras" déjà utilisé à l'import ;
   - ctx.saveQuestion / ctx.deleteQuestion (outbox durable, comme partout
     ailleurs dans l'app) ;
   - ConfirmModal (ui.jsx) pour la suppression.
   Jamais de nouvelle fiche créée : tout est rattaché à `ficheId`.

   PANNEAU COMMUN PDF + HTML (nuit du 30/09) : c'est désormais LE panneau de
   droite du lecteur, pour les fiches PDF comme pour les fiches HTML — mêmes
   onglets, même comportement. Trois options, toutes facultatives :
   - `ongletsEnPlus` : onglets propres au document ouvert (« Notions » : les
     passages surlignés), ajoutés APRÈS QCM / Flashcard / Exercice / Feynman ;
   - `ficheId` absent (document de notes, structure d'anatomie) : pas d'items
     possibles, seuls les onglets en plus s'affichent ;
   - `replie` / `onReplier` : repli piloté de l'extérieur (bouton de la barre).
   - `ongletDemande` ({ id, n }) : bascule vers l'onglet `id` à chaque nouveau `n`
     (bouton « Transcrire » de la barre → onglet Transcript) ;
   - un onglet en plus marqué `plein` gère lui-même son défilement (Transcript :
     auto-défilement collé en bas) — pas de conteneur défilant autour.
   ============================================================ */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Tex } from './Tex.jsx';
import { ConfirmModal, ContextMenu, SplitHandle } from './ui.jsx';
import { ItemForm, PasteJsonForm, TYPES } from './AddItemForm.jsx';
import { appendItemsToFiche, themeFlashcardsDeFiche } from '../lib/import.js';
import { ThemeFicheFlashcards } from './ThemeFiche.jsx';
import { toInternalItem } from '../lib/adapter.js';
import { OcclusionEditorModal, OcclusionView, estOcclusion } from './OcclusionImage.jsx';
import { ImageFlashcard, imageAuRecto, imageAuVerso } from './FlashcardImage.jsx';
import { CarteAjoutFlashcard } from './CarteAjoutFlashcard.jsx';
import { SeanceAujourdhui } from './SeanceAujourdhui.jsx';
import { ModeVisibleCtx } from './modeVisible.js';
import '../../styles/panneau-modes.css';

/* ============================================================
   PANNEAU EN 3 MODES (refonte du 05/10, docs/compte-rendu-panneau-lateral.md)
   Exercices (QCM, Flashcards, Exercices, Feynman) · Notions · Transcript.
   - sélecteur segmenté avec indicateur glissant ; glissement horizontal (doigt,
     stylet ou trackpad) pour passer au mode voisin ; transition animée ;
   - mode ET sous-onglet d'Exercices mémorisés PAR COURS (`cleMemo`) ;
   - `ongletsEnPlus` garde son interface : l'entrée `notions` devient le mode
     Notions, l'entrée `transcript` le mode Transcript (badge facultatif) ;
   - Exercices : UNE barre d'actions — « + Ajouter » qui suit le sous-onglet,
     et « ⋯ » pour le reste (coller du JSON, flashcard image, thème automatique).
   ============================================================ */
const LIBELLES = { qcm: 'QCM', flashcard: 'Flashcards', exercice: 'Exercices', feynman: 'Feynman' };
const VIDES = {
  qcm: 'Aucun QCM pour ce cours.',
  flashcard: 'Aucune flashcard pour ce cours.',
  exercice: 'Aucun exercice pour ce cours.',
  feynman: 'Aucun Feynman pour ce cours.',
};
const lireLS = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage bloqué */ } };
const TYPES_IDS = ['qcm', 'flashcard', 'exercice', 'feynman'];

export function CourseItemsSidebar({ ctx, ficheId, ongletsEnPlus = [], ongletInitial = null, replie = null, onReplier = null, ongletDemande = null, cleMemo = null }) {
  const avecItems = !!ficheId;
  const extras = (ongletsEnPlus || []).filter(Boolean);
  const extraNotions = extras.find((o) => o.id === 'notions') || null;
  const extraTranscript = extras.find((o) => o.id === 'transcript') || null;
  const ficheItems = useMemo(() => (avecItems ? (ctx.db.questions || []).filter((q) => q.ficheId === ficheId) : []), [ctx.db, ficheId, avecItems]);
  const countByType = useMemo(() => {
    const c = { qcm: 0, flashcard: 0, exercice: 0, feynman: 0 };
    ficheItems.forEach((q) => { if (c[q.type] != null) c[q.type]++; });
    return c;
  }, [ficheItems]);

  const modes = [
    avecItems && { id: 'exercices', label: 'Exercices', n: ficheItems.length },
    extraNotions && { id: 'notions', label: 'Notions', n: extraNotions.n },
    extraTranscript && { id: 'transcript', label: 'Transcript', badge: extraTranscript.badge },
  ].filter(Boolean);
  const cle = cleMemo || ficheId || 'doc';
  const versMode = (id) => (TYPES_IDS.includes(id) ? 'exercices' : id);

  const [mode, setModeBrut] = useState(() => {
    const memo = lireLS('medrevise.panneau.mode.' + cle);
    if (memo && modes.some((m) => m.id === memo)) return memo;
    const init = ongletInitial && versMode(ongletInitial);
    if (init && modes.some((m) => m.id === init)) return init;
    return (modes[0] && modes[0].id) || 'exercices';
  });
  const [activeType, setActiveTypeBrut] = useState(() => {
    const memo = lireLS('medrevise.panneau.sous.' + cle);
    if (TYPES_IDS.includes(memo)) return memo;
    return TYPES_IDS.includes(ongletInitial) ? ongletInitial : 'qcm';
  });
  const setMode = (id) => {
    if (id === mode || !modes.some((m) => m.id === id)) return;
    setModeBrut(id); ecrireLS('medrevise.panneau.mode.' + cle, id);
  };
  const setActiveType = (t) => { setActiveTypeBrut(t); ecrireLS('medrevise.panneau.sous.' + cle, t); };
  // un mode disparu (document sans fiche…) → premier mode disponible
  const modeActif = modes.some((m) => m.id === mode) ? mode : (modes[0] && modes[0].id);

  const nDemande = ongletDemande ? ongletDemande.n : 0;
  useEffect(() => {
    if (!ongletDemande || !ongletDemande.id) return;
    if (TYPES_IDS.includes(ongletDemande.id)) setActiveType(ongletDemande.id);
    setMode(versMode(ongletDemande.id));
  }, [nDemande]); // eslint-disable-line react-hooks/exhaustive-deps

  // repli HORIZONTAL (poignée SplitHandle intégrée au bord gauche du panneau)
  const [collapsedLocal, setCollapsedLocal] = useState(false);
  const collapsed = replie == null ? collapsedLocal : replie;
  const setCollapsed = (fn) => { const v = typeof fn === 'function' ? fn(collapsed) : fn; if (onReplier) onReplier(v); else setCollapsedLocal(v); };

  /* ---- GLISSEMENT PHYSIQUE ENTRE MODES (v1.2, 06/10) ----
     Les modes sont TOUS montés, côte à côte dans une piste : le volet k est décalé de
     (k − p) × 100 % de la largeur, p étant la position (fractionnaire pendant le geste).
     Glisser à moitié montre donc la moitié du mode courant et la moitié du voisin, déjà
     rendu. Les transformations sont écrites DIRECTEMENT dans le DOM (aucun rendu React
     pendant le geste) et l'indicateur du sélecteur lit la même position (--i).
     Au relâchement : aimantation au mode le plus proche (ou au voisin si le geste est
     vif), 220 ms ease-out. Au repos, le volet affiché n'a AUCUNE transformation : une
     modale `position: fixed` rendue dans un mode (éditeur de masques, confirmations)
     reste pleine page — c'est pourquoi chaque volet porte sa propre translation plutôt
     qu'une piste de 300 % transformée en bloc (même rendu, même chemin GPU).
     Détection inchangée : trackpad (roue, deltaX dominant, écouteur non passif) et
     doigt/stylet (pointeurs) ; jamais pendant un défilement vertical, dans une zone qui
     défile horizontalement, ni quand du texte est sélectionné dans le panneau.
     Après un relâchement : bloqué ≥ 400 ms et tant que l'élan (inertie de macOS) continue. */
  const corpsRef = useRef(null);
  const segRef = useRef(null);
  const voletsRef = useRef([]);
  voletsRef.current.length = modes.length;
  const indexActif = Math.max(0, modes.findIndex((m) => m.id === modeActif));
  const indexRef = useRef(indexActif); indexRef.current = indexActif;
  const modesRef = useRef(modes); modesRef.current = modes;
  const pos = useRef(indexActif); // position affichée (index fractionnaire)
  const finAnim = useRef(null);
  const animEnCours = useRef(false);
  /* mode « au repos » : celui qui est interactif (les autres `inert`). Il ne change qu'à la
     FIN de l'aimantation : retirer `inert` d'un mode de 200 items coûte ~26 ms de style,
     on ne le paie pas pendant le mouvement. */
  const [indexRepos, setIndexRepos] = useState(indexActif);
  const geste = useRef({ actif: false, base: 0, offset: 0, minuteur: null, bloqueJusqua: 0, dernierVertical: 0, pointeur: null, traces: [] });
  const largeur = () => (corpsRef.current && corpsRef.current.clientWidth) || 360;
  const reduit = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* `quoi` : 'geste' (suit le doigt, sans transition) · 'anime' (aimantation 220 ms) ·
     'net' (placement immédiat). */
  const appliquer = (p, quoi) => {
    pos.current = p;
    clearTimeout(finAnim.current);
    const anime = quoi === 'anime' && !reduit();
    animEnCours.current = anime;
    voletsRef.current.forEach((el, k) => {
      if (!el) return;
      el.style.transition = anime ? 'transform .22s cubic-bezier(.22, .8, .3, 1)' : 'none';
      el.style.willChange = quoi === 'net' ? '' : 'transform';
      el.style.transform = quoi === 'net' && k === p ? 'none' : `translate3d(${(k - p) * 100}%, 0, 0)`;
    });
    const seg = segRef.current;
    if (seg) {
      seg.style.setProperty('--i', String(Math.max(0, Math.min(voletsRef.current.length - 1, p))));
      seg.classList.toggle('en-geste', quoi === 'geste');
      seg.classList.toggle('sans-anim', quoi === 'net');
    }
    // fin de l'aimantation : retour au repos (volet affiché sans transformation)
    if (anime) finAnim.current = setTimeout(() => { if (pos.current === p) appliquer(p, 'net'); }, 240);
    else if (quoi === 'anime') appliquer(p, 'net');
    if (quoi === 'net') setIndexRepos(p);
  };
  // placement à chaque changement de mode (clic, demande extérieure, montage) ;
  // après un glissement, `pos` vaut déjà la cible : rien à refaire
  useLayoutEffect(() => {
    if (collapsed) return;
    if (pos.current !== indexActif) appliquer(indexActif, 'anime');
    else if (!geste.current.actif && !animEnCours.current) appliquer(indexActif, 'net');
  }, [indexActif, modes.length, collapsed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { clearTimeout(finAnim.current); clearTimeout(geste.current.minuteur); }, []);

  // élastique aux extrémités (30 % du geste, 56 px max) ; jamais plus d'un mode d'écart
  const elastique = (off, base) => {
    const n = modesRef.current.length, w = largeur();
    if ((off > 0 && base <= 0) || (off < 0 && base >= n - 1)) return Math.sign(off) * Math.min(56, Math.abs(off) * 0.3);
    return Math.max(-w, Math.min(w, off));
  };
  const commencer = () => {
    const g = geste.current;
    g.actif = true; g.base = indexRef.current; g.offset = 0; g.traces = [];
  };
  const suivre = (off) => {
    const g = geste.current, now = performance.now();
    g.offset = off;
    g.traces.push({ t: now, off });
    while (g.traces.length > 2 && now - g.traces[0].t > 100) g.traces.shift();
    appliquer(g.base - elastique(off, g.base) / largeur(), 'geste');
  };
  const relacher = () => {
    const g = geste.current;
    if (!g.actif) return;
    g.actif = false;
    const w = largeur(), n = modesRef.current.length;
    const off = elastique(g.offset, g.base);
    // vitesse sur les ~100 dernières ms (px/ms) : un geste vif passe au voisin même court
    const tr = g.traces, a = tr[0], z = tr[tr.length - 1];
    const v = a && z && z.t > a.t ? (z.off - a.off) / (z.t - a.t) : 0;
    let cible = Math.round(g.base - off / w);
    if (Math.abs(v) > 0.45 && Math.abs(off) > 24 && Math.sign(v) === Math.sign(off)) cible = g.base + (off < 0 ? 1 : -1);
    cible = Math.max(0, Math.min(n - 1, Math.max(g.base - 1, Math.min(g.base + 1, cible))));
    g.bloqueJusqua = performance.now() + 400;
    appliquer(cible, 'anime');
    const m = modesRef.current[cible];
    if (cible !== indexRef.current && m) { setModeBrut(m.id); ecrireLS('medrevise.panneau.mode.' + cle, m.id); }
  };
  const defileHorizontalement = (el) => {
    const corps = corpsRef.current;
    for (let n = el; n && n !== corps; n = n.parentElement) {
      if (n.tagName === 'CANVAS') return true;
      if (n.scrollWidth > n.clientWidth + 1) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
    }
    return false;
  };
  const texteSelectionne = () => {
    const sel = window.getSelection && window.getSelection();
    return !!(sel && !sel.isCollapsed && corpsRef.current && corpsRef.current.contains(sel.anchorNode));
  };
  // la roue doit être « non passive » pour empêcher le geste « page précédente » de Chrome
  const roueRef = useRef(null);
  roueRef.current = (e) => {
    const g = geste.current, now = performance.now();
    const ax = Math.abs(e.deltaX), ay = Math.abs(e.deltaY);
    if (!g.actif) {
      if (ay > ax) { g.dernierVertical = now; return; } // défilement vertical : jamais
      if (ax <= ay * 1.5 || ax < 1) return;
      if (now - g.dernierVertical < 250) return; // encore dans l'élan d'un défilement vertical
      // inertie après un relâchement : bloqué au moins 400 ms, et TANT QUE le flux de
      // l'élan continue (événements à moins de 150 ms d'intervalle)
      if (now < g.bloqueJusqua) { g.bloqueJusqua = Math.max(g.bloqueJusqua, now + 150); e.preventDefault(); return; }
      if (defileHorizontalement(e.target) || texteSelectionne()) return;
      commencer();
    }
    e.preventDefault();
    suivre(g.offset - e.deltaX);
    clearTimeout(g.minuteur);
    g.minuteur = setTimeout(relacher, 140); // plus d'événement = doigts levés
  };
  useEffect(() => {
    const el = corpsRef.current;
    if (!el) return undefined;
    const h = (e) => roueRef.current(e);
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, [collapsed]);
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse') return; // à la souris, glisser sert à sélectionner du texte
    if (defileHorizontalement(e.target)) return;
    geste.current.pointeur = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null };
  };
  const onPointerMove = (e) => {
    const g = geste.current, p = g.pointeur;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (p.horizontal === null && Math.hypot(dx, dy) > 8) {
      p.horizontal = Math.abs(dx) > Math.abs(dy) * 1.5 && !texteSelectionne();
      if (p.horizontal) commencer();
    }
    if (p.horizontal && g.actif) suivre(dx);
  };
  const onPointerUp = (e) => {
    const p = geste.current.pointeur; geste.current.pointeur = null;
    if (!p || p.id !== e.pointerId) return;
    if (p.horizontal) relacher();
  };

  // ---- ajout (réutilise ItemForm/PasteJsonForm, même flux que AddItemModal) ----
  const [adding, setAdding] = useState(false);
  const [addSource, setAddSource] = useState('form');
  const [busyAdd, setBusyAdd] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [menuActions, setMenuActions] = useState(null);
  const [voirTheme, setVoirTheme] = useState(false);
  const submitAdd = async (raw) => {
    setBusyAdd(true);
    try {
      await appendItemsToFiche({ ficheId, items: [raw] });
      await ctx.reload();
      setAddedCount((n) => n + 1);
    } finally { setBusyAdd(false); }
  };
  const closeAdd = () => { setAdding(false); setAddedCount(0); setAddSource('form'); };

  // ---- édition inline ----
  const [editingId, setEditingId] = useState(null);
  const [busyEdit, setBusyEdit] = useState(false);
  const submitEdit = async (item, raw) => {
    setBusyEdit(true);
    try {
      const updated = toInternalItem({ ...item, ...raw });
      if (updated) await ctx.saveQuestion(updated);
      setEditingId(null);
    } finally { setBusyEdit(false); }
  };

  // ---- suppression ----
  const [confirmDel, setConfirmDel] = useState(null);
  const [occEdition, setOccEdition] = useState(null);
  const doDelete = async () => {
    if (!confirmDel) return;
    await ctx.deleteQuestion(confirmDel.id);
    setConfirmDel(null);
  };

  const items = useMemo(() => ficheItems.filter((q) => q.type === activeType), [ficheItems, activeType]);
  const choisirType = (t) => { setActiveType(t); setAdding(false); setEditingId(null); setVoirTheme(false); };
  const actions = [
    { label: 'Coller du JSON', icon: 'upload', onClick: () => { setAdding(true); setAddSource('json'); setAddedCount(0); } },
    activeType === 'flashcard' && { label: 'Thème automatique des flashcards', icon: 'tag', onClick: () => setVoirTheme((v) => !v) },
  ].filter(Boolean);

  /* mémoïsé (v1.2) : changer de mode ne re-rend plus la liste (200 items = 1 à 3 images
     perdues à chaque changement, juste au moment de l'aimantation) */
  const exercices = useMemo(() => (
    <div className="pis-scroll scroll pm-exos">
      <div className="pm-sous" role="tablist" aria-label="Type d’exercice">
        {TYPES.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={activeType === t.id}
            className={'pm-sous-btn' + (activeType === t.id ? ' actif' : '')} onClick={() => choisirType(t.id)}>
            {LIBELLES[t.id]} <span className={'tnum pm-n' + (countByType[t.id] ? '' : ' zero')}>{countByType[t.id]}</span>
          </button>
        ))}
      </div>
      {/* séance quotidienne des flashcards (toutes matières) : un en-tête, un bouton */}
      {activeType === 'flashcard' && ctx.startSeanceFC && <SeanceAujourdhui ctx={ctx} compact onDemarrer={ctx.startSeanceFC} />}
      <div className="pm-actions">
        {/* carte flashcard ouverte : elle a son propre « Terminer » — pas de doublon ici */}
        {!(adding && addSource === 'form' && activeType === 'flashcard') && <button type="button" className={'btn sm' + (adding && addSource === 'form' ? ' actif' : '')}
          onClick={() => { if (adding && addSource === 'form') closeAdd(); else { setAdding(true); setAddSource('form'); setAddedCount(0); setEditingId(null); } }}>
          <Icon name={adding && addSource === 'form' ? 'x' : 'plus'} size={13} /> {adding && addSource === 'form' ? 'Fermer' : 'Ajouter'}
        </button>}
        <span style={{ flex: 1 }} />
        <button type="button" className="icon-btn sm" title="Plus d’actions : coller du JSON, flashcard image, thème"
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenuActions({ x: Math.min(r.right - 250, window.innerWidth - 260), y: r.bottom + 6 }); }}>
          <Icon name="more" size={16} />
        </button>
      </div>
      {voirTheme && activeType === 'flashcard' && <ThemeFicheFlashcards ctx={ctx} ficheId={ficheId} />}
      {adding && addSource === 'form' && activeType === 'flashcard' && (
        <CarteAjoutFlashcard ctx={ctx} ficheId={ficheId} busy={busyAdd} onAjouter={submitAdd} onTerminer={closeAdd}
          themeDefaut={themeFlashcardsDeFiche((ctx.db.fiches || []).find((f) => f.id === ficheId))} />
      )}
      {adding && !(addSource === 'form' && activeType === 'flashcard') && (
        <div className="pis-add card" style={{ margin: '4px 0 12px' }}>
          <div className="card-body">
            {addSource === 'form' ? (
              <>
                {addedCount > 0 && (
                  <div className="err-mini ok" style={{ marginBottom: 12 }}>
                    <div className="em-ic"><Icon name="check" size={16} stroke={2.5} /></div>
                    <div className="em-body"><div className="em-title">{addedCount} item{addedCount > 1 ? 's' : ''} ajouté{addedCount > 1 ? 's' : ''} ✓</div></div>
                  </div>
                )}
                <ItemForm type={activeType} onSubmit={submitAdd} busy={busyAdd} onCancel={closeAdd} submitLabel="Ajouter"
                  themeDefaut={themeFlashcardsDeFiche((ctx.db.fiches || []).find((f) => f.id === ficheId))} />
              </>
            ) : (
              <>
                <div className="row spread" style={{ marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>Coller du JSON</span>
                  <button type="button" className="cd-ic" onClick={closeAdd} title="Fermer"><Icon name="x" size={12} /></button>
                </div>
                <PasteJsonForm ctx={ctx} ficheId={ficheId} done={addedCount} setDone={setAddedCount} />
              </>
            )}
          </div>
        </div>
      )}
      <div className="pis-list">
        {items.length === 0 && !adding && (
          <div className="pm-vide">
            <Icon name={(TYPES.find((t) => t.id === activeType) || {}).icon || 'cards'} size={22} />
            <div>{VIDES[activeType]}</div>
            <div className="hint">« Ajouter » pour en créer un, ou « ⋯ » pour coller le JSON d’un prompt.</div>
          </div>
        )}
        {items.map((item) => (
          editingId === item.id ? (
            <div key={item.id} className="pis-item card fadein">
              <div className="card-body">
                <ItemForm type={item.type} initial={item} submitLabel="Enregistrer" busy={busyEdit}
                  onCancel={() => setEditingId(null)} onSubmit={(raw) => submitEdit(item, raw)} />
              </div>
            </div>
          ) : (
            <ItemReadCard key={item.id} item={item}
              onEdit={() => { if (estOcclusion(item)) { setOccEdition(item); return; } setEditingId(item.id); setAdding(false); }}
              onDelete={() => setConfirmDel(item)} />
          )
        ))}
      </div>
    </div>
  ), [activeType, countByType, adding, addSource, busyAdd, addedCount, voirTheme, items, editingId, busyEdit, ctx, ficheId]); // eslint-disable-line react-hooks/exhaustive-deps

  const contenuMode = (m) => {
    if (m.id === 'exercices') return exercices;
    const x = m.id === 'notions' ? extraNotions : extraTranscript;
    if (!x) return null;
    return x.plein
      ? <div className="pis-extra-plein">{x.contenu}</div>
      : <div className="pis-scroll scroll pis-extra">{x.contenu}</div>;
  };

  return (
    <div className={'pis' + (collapsed ? ' collapsed' : '')}>
      <SplitHandle side="right" collapsed={collapsed} onClick={() => setCollapsed((v) => !v)} />
      {!collapsed && (
      <div className="pis-body">
        {modes.length > 1 && (
          <div className="pm-seg" ref={segRef} role="tablist" aria-label="Mode du panneau" style={{ '--n': modes.length }}>
            <span className="pm-seg-indic" aria-hidden="true" />
            {modes.map((m) => (
              <button key={m.id} type="button" role="tab" aria-selected={modeActif === m.id}
                className={'pm-seg-btn' + (modeActif === m.id ? ' actif' : '')} onClick={() => setMode(m.id)}>
                {m.label}
                {m.badge || (m.n ? <span className="tnum pm-n">{m.n}</span> : null)}
              </button>
            ))}
          </div>
        )}
        <div className="pm-corps" ref={corpsRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onPointerCancel={() => { if (geste.current.pointeur && geste.current.pointeur.horizontal) relacher(); geste.current.pointeur = null; }}>
          {/* piste : les modes TOUS montés côte à côte (translations posées par `appliquer`) ;
              hors écran = inertes, masqués aux lecteurs d'écran, hors tabulation */}
          <div className="pm-piste">
            {modes.map((m, k) => {
              const cache = k !== indexRepos;
              return (
                <div key={m.id} ref={(el) => { voletsRef.current[k] = el; }} className="pm-vue" data-mode={m.id}
                  role="tabpanel" aria-label={m.label} aria-hidden={cache || undefined} tabIndex={cache ? -1 : undefined}
                  {...(cache ? { inert: '' } : {})}>
                  <ModeVisibleCtx.Provider value={!cache}>{contenuMode(m)}</ModeVisibleCtx.Provider>
                </div>
              );
            })}
          </div>
        </div>

        {menuActions && <ContextMenu x={menuActions.x} y={menuActions.y} items={actions} onClose={() => setMenuActions(null)} />}

        {occEdition && (
          <OcclusionEditorModal ctx={ctx} ficheId={ficheId} initial={occEdition === true ? null : occEdition}
            onClose={() => setOccEdition(null)} />
        )}

        {confirmDel && (
          <ConfirmModal
            title="Supprimer cet item ?"
            body="Sera supprimé définitivement (sur tous tes appareils, dès la prochaine synchro). Cette action est irréversible."
            confirmLabel="Supprimer" danger
            onConfirm={doDelete} onCancel={() => setConfirmDel(null)}
          />
        )}
      </div>
      )}
    </div>
  );
}

/* ---- carte de lecture (réponse toujours visible) + Éditer/Supprimer ---- */
function ItemReadCard({ item, onEdit, onDelete }) {
  return (
    <div className="pis-item card">
      <div className="card-body">
        <div className="row spread" style={{ marginBottom: 8, alignItems: 'flex-start', gap: 8 }}>
          <span className="hint" style={{ fontWeight: 700, color: 'var(--text-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.theme || 'Sans thème'}</span>
          <div className="row" style={{ gap: 4, flex: '0 0 auto' }}>
            <button type="button" className="cd-ic" title="Éditer" onClick={onEdit}><Icon name="edit" size={12} /></button>
            <button type="button" className="cd-ic" title="Supprimer" onClick={onDelete}><Icon name="trash" size={12} /></button>
          </div>
        </div>
        {item.type === 'qcm' && <QcmReadBody item={item} />}
        {item.type === 'flashcard' && (estOcclusion(item) ? <OcclusionReadBody item={item} /> : <FlashcardReadBody item={item} />)}
        {item.type === 'feynman' && <FeynmanReadBody item={item} />}
        {item.type === 'exercice' && <ExerciceReadBody item={item} />}
      </div>
    </div>
  );
}

function QcmReadBody({ item }) {
  const correct = new Set(item.reponses_correctes || []);
  return (
    <>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13.5 }}><Tex>{item.enonce}</Tex></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {(item.options || []).map((o) => (
          <div key={o.id} className={'pis-opt' + (correct.has(o.id) ? ' ok' : '')}>
            {correct.has(o.id) ? <Icon name="check" size={12} stroke={3} /> : <span className="pis-opt-dot" />}
            <span><Tex>{o.texte}</Tex></span>
          </div>
        ))}
      </div>
      {item.explication && <div className="hint" style={{ marginTop: 8 }}><Tex>{item.explication}</Tex></div>}
    </>
  );
}

function FlashcardReadBody({ item }) {
  return (
    <>
      <div className="pis-face"><span className="pis-face-tag">Recto</span>{imageAuRecto(item) && <ImageFlashcard imageId={item.imageId} maxH={110} />}<Tex>{item.recto}</Tex></div>
      <div className="pis-face"><span className="pis-face-tag">Verso</span>{imageAuVerso(item) && <ImageFlashcard imageId={item.imageId} maxH={110} />}<Tex>{item.verso}</Tex></div>
      {item.a_retenir && <div className="hint" style={{ marginTop: 6 }}><strong>À retenir : </strong><Tex>{item.a_retenir}</Tex></div>}
    </>
  );
}

/* flashcard image : l'image en mode « réponse » (masques en contour + réponses),
   la question au-dessus. */
function OcclusionReadBody({ item }) {
  const occ = item.occlusion || {};
  const nb = (occ.coches || []).filter((c) => c.kind === 'zone').length;
  return (
    <>
      <div className="pis-face"><span className="pis-face-tag">Flashcard image · {nb} masque{nb > 1 ? 's' : ''}</span><Tex>{item.recto}</Tex></div>
      <OcclusionView occ={occ} revele maxH={200} />
      {!item.versoAuto && <div className="hint" style={{ marginTop: 6 }}><Tex>{item.verso}</Tex></div>}
    </>
  );
}

function FeynmanReadBody({ item }) {
  return (
    <>
      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13.5 }}><Tex>{item.consigne}</Tex></div>
      <div className="hint"><Tex>{item.reponse_modele}</Tex></div>
      {(item.points_cles_attendus || []).length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          {item.points_cles_attendus.map((p, i) => <li key={i} className="hint"><Tex>{p}</Tex></li>)}
        </ul>
      )}
    </>
  );
}

function ExerciceReadBody({ item }) {
  const numeric = item.sous_type === 'numerique';
  const r = item.reponse || {};
  return (
    <>
      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13.5 }}><Tex>{item.enonce}</Tex></div>
      {numeric
        ? <div className="hint">Réponse : <strong className="tnum">{r.valeur_min} – {r.valeur_max}</strong> {r.unite || ''}</div>
        : (
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {(item.grille_autoevaluation || []).map((g, i) => (
              <li key={i} className="hint"><Tex>{g.critere}</Tex>{g.essentiel && <span className="pill accent" style={{ marginLeft: 6, height: 18, fontSize: 10 }}>essentiel</span>}</li>
            ))}
          </ul>
        )}
      {item.correction && item.correction.conclusion && <div className="hint" style={{ marginTop: 8 }}><Tex>{item.correction.conclusion}</Tex></div>}
    </>
  );
}
