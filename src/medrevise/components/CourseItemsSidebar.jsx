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
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Tex } from './Tex.jsx';
import { ConfirmModal, ContextMenu, SplitHandle, ModalesHorsPanneauCtx } from './ui.jsx';
import { creerGlissement } from './glissementModes.js';
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

export function CourseItemsSidebar({ ctx, ficheId, ongletsEnPlus = [], ongletInitial = null, replie = null, onReplier = null, ongletDemande = null, cleMemo = null, contenuReplie = null, flashcardDemandee = null }) {
  const avecItems = !!ficheId;
  const extras = (ongletsEnPlus || []).filter(Boolean);
  const extraNotions = extras.find((o) => o.id === 'notions') || null;
  const extraTranscript = extras.find((o) => o.id === 'transcript') || null;
  // 07/10 : « Notes » — le document de notes du cours (documents/NotesEditor.jsx)
  const extraNotes = extras.find((o) => o.id === 'notes') || null;
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
    extraNotes && { id: 'notes', label: 'Notes' },
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
    allerMode(versMode(ongletDemande.id));
  }, [nDemande]); // eslint-disable-line react-hooks/exhaustive-deps

  // repli HORIZONTAL (poignée SplitHandle intégrée au bord gauche du panneau)
  const [collapsedLocal, setCollapsedLocal] = useState(false);
  const collapsed = replie == null ? collapsedLocal : replie;
  const setCollapsed = (fn) => { const v = typeof fn === 'function' ? fn(collapsed) : fn; if (onReplier) onReplier(v); else setCollapsedLocal(v); };

  /* ---- GLISSEMENT ENTRE MODES (v1.4, 07/10 — docs/compte-rendu-panneau-lateral.md) ----
     Les 3 modes sont montés en permanence dans une PISTE (chaque volet décalé de k × 100 %).
     Le geste vit hors de React (components/glissementModes.js) : il écrit le transform de
     la piste et de l'indicateur, une fois par image, et ne prévient React qu'à la fin de
     l'aimantation (`arrivee`) : un seul rendu — mode actif, `inert` retiré du mode arrivé,
     focus. Les modales des modes sortent par un portail (ModalesHorsPanneauCtx) : la piste
     transformée ne les enferme pas. */
  const corpsRef = useRef(null);
  const pisteRef = useRef(null);
  const indicRef = useRef(null);
  const glisseRef = useRef(null);
  const indexActif = Math.max(0, modes.findIndex((m) => m.id === modeActif));
  const modesRef = useRef(modes); modesRef.current = modes;
  const modeActifRef = useRef(modeActif); modeActifRef.current = modeActif;
  /* mode « au repos » : celui qui est interactif (les autres `inert`) — mis à jour à la
     FIN de l'aimantation, dans le même rendu que le mode actif */
  const [indexRepos, setIndexRepos] = useState(indexActif);
  const [arrivees, setArrivees] = useState(0); // une arrivée = un geste ou un clic terminé
  // focus à donner au mode d'arrivée (changement venu du panneau : geste ou segment)
  const focusApres = useRef(false);
  const reduit = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const arriveeRef = useRef(null);
  arriveeRef.current = (k) => {
    const m = modesRef.current[k];
    if (!m) return;
    if (m.id !== modeActifRef.current) { setModeBrut(m.id); ecrireLS('medrevise.panneau.mode.' + cle, m.id); }
    // le mode arrivé reçoit le focus après TOUT geste ou clic — même une rafale qui revient
    // au mode de départ (l'état React, lui, n'a pas bougé)
    focusApres.current = true;
    setIndexRepos(k); setArrivees((n) => n + 1);
  };
  useLayoutEffect(() => {
    if (collapsed || !corpsRef.current || !pisteRef.current) return undefined;
    const g = creerGlissement({
      corps: corpsRef.current, piste: pisteRef.current, indicateur: indicRef.current,
      nbModes: modesRef.current.length, index: indexActif, reduit,
      onArrivee: (k) => arriveeRef.current(k),
    });
    glisseRef.current = g;
    return () => { g.detacher(); glisseRef.current = null; };
  }, [collapsed]); // eslint-disable-line react-hooks/exhaustive-deps
  // changement de mode venu d'ailleurs (mémoire, modes qui changent) : placé sans animation
  useLayoutEffect(() => {
    const g = glisseRef.current;
    if (g && !g.enMouvement()) g.placer(indexActif, modes.length);
    setIndexRepos(indexActif);
  }, [indexActif, modes.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // aller à un mode, animé (segment cliqué, demande extérieure)
  const allerMode = (id) => {
    const k = modesRef.current.findIndex((m) => m.id === id);
    if (k < 0) return;
    const g = glisseRef.current;
    if (g) g.allerA(k); else setMode(id);
  };
  /* focus programmatique du mode arrivé (v1.3) : son conteneur défilant (le clavier —
     flèches, Page↓, espace — agit aussitôt dessus), sans défilement. Seulement si le focus
     est dans le panneau ou nulle part : jamais volé au lecteur ni à un champ ailleurs. */
  const panneauRef = useRef(null);
  useLayoutEffect(() => {
    if (!focusApres.current) return;
    focusApres.current = false;
    const el = pisteRef.current && pisteRef.current.children[indexRepos];
    if (!el) return;
    const ae = document.activeElement;
    if (ae && ae !== document.body && !(panneauRef.current && panneauRef.current.contains(ae))) return;
    const cible = el.querySelector('.pis-scroll, .trx-liste, .trx-accueil-defile') || el;
    if (!cible.hasAttribute('tabindex')) cible.setAttribute('tabindex', '-1');
    cible.setAttribute('data-focus-mode', '');
    try { cible.focus({ preventScroll: true }); } catch (e) { /* navigateur ancien */ }
  }, [indexRepos, arrivees]);
  /* clic sur un segment : même chemin qu'un glissement (animé, focus du mode arrivé). Pas de
     comparaison avec l'état React : pendant une rafale, il n'est mis à jour qu'à la fin de
     l'aimantation — c'est la position VISÉE par la piste qui compte (allerA gère « déjà là »). */
  const choisirMode = (id) => allerMode(id);

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
  const closeAdd = () => { setAdding(false); setAddedCount(0); setAddSource('form'); setRectoInitial(null); };
  /* FLASHCARD DEPUIS UNE SÉLECTION (07/10) : { texte, n } — le mode Exercices s'ouvre sur
     les flashcards, carte d'ajout ouverte, recto pré-rempli (on n'a plus qu'à écrire le verso) */
  const [rectoInitial, setRectoInitial] = useState(null); // { texte, n }
  const nFlash = flashcardDemandee ? flashcardDemandee.n : 0;
  useEffect(() => {
    if (!flashcardDemandee || !flashcardDemandee.texte || !avecItems) return;
    setActiveType('flashcard'); setEditingId(null); setVoirTheme(false);
    setAddSource('form'); setAdding(true); setAddedCount(0);
    setRectoInitial({ texte: flashcardDemandee.texte, n: flashcardDemandee.n });
    allerMode('exercices');
  }, [nFlash]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <CarteAjoutFlashcard key={rectoInitial ? 'r' + rectoInitial.n : 'carte'} ctx={ctx} ficheId={ficheId} busy={busyAdd} onAjouter={submitAdd} onTerminer={closeAdd}
          rectoInitial={rectoInitial ? rectoInitial.texte : null}
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
  ), [activeType, countByType, adding, addSource, busyAdd, addedCount, voirTheme, items, editingId, busyEdit, ctx, ficheId, rectoInitial]); // eslint-disable-line react-hooks/exhaustive-deps

  /* contenus des modes : des éléments STABLES (mêmes objets d'un rendu à l'autre tant que
     leur contenu ne change pas) — le volet mémoïsé (Volet) ne se re-rend alors jamais
     pour rien, ni au changement de mode, ni pendant un geste */
  const contenuNotions = useMemo(() => (extraNotions ? (extraNotions.plein
    ? <div className="pis-extra-plein">{extraNotions.contenu}</div>
    : <div className="pis-scroll scroll pis-extra">{extraNotions.contenu}</div>) : null), [extraNotions && extraNotions.contenu, extraNotions && extraNotions.plein]); // eslint-disable-line react-hooks/exhaustive-deps
  const contenuTranscript = useMemo(() => (extraTranscript ? (extraTranscript.plein
    ? <div className="pis-extra-plein">{extraTranscript.contenu}</div>
    : <div className="pis-scroll scroll pis-extra">{extraTranscript.contenu}</div>) : null), [extraTranscript && extraTranscript.contenu, extraTranscript && extraTranscript.plein]); // eslint-disable-line react-hooks/exhaustive-deps
  const contenuNotes = useMemo(() => (extraNotes ? <div className="pis-extra-plein">{extraNotes.contenu}</div> : null), [extraNotes && extraNotes.contenu]); // eslint-disable-line react-hooks/exhaustive-deps
  const contenuMode = (m) => (m.id === 'exercices' ? exercices : m.id === 'notions' ? contenuNotions : m.id === 'notes' ? contenuNotes : contenuTranscript);

  return (
    <ModalesHorsPanneauCtx.Provider value>
    <div className={'pis' + (collapsed ? ' collapsed' : '')} ref={panneauRef}>
      <SplitHandle side="right" collapsed={collapsed} onClick={() => setCollapsed((v) => !v)} />
      {/* tablette (07/10) : panneau replié = colonne fine (ouvrir, session en cours, lignes arrivées) */}
      {collapsed && contenuReplie && <div className="pis-replie">{contenuReplie}</div>}
      {!collapsed && (
      <div className="pis-body">
        {modes.length > 1 && (
          <div className="pm-seg" role="tablist" aria-label="Mode du panneau" style={{ '--n': modes.length }}>
            <span className="pm-seg-indic" ref={indicRef} aria-hidden="true" />
            {modes.map((m) => (
              <button key={m.id} type="button" role="tab" aria-selected={modeActif === m.id}
                className={'pm-seg-btn' + (modeActif === m.id ? ' actif' : '')} onClick={() => choisirMode(m.id)}>
                {m.label}
                {m.badge || (m.n ? <span className="tnum pm-n">{m.n}</span> : null)}
              </button>
            ))}
          </div>
        )}
        <div className="pm-corps" ref={corpsRef}>
          {/* piste : les modes TOUS montés côte à côte ; SEULE la piste est déplacée (transform
              écrit par glissementModes.js). Hors écran = inertes, masqués aux lecteurs d'écran */}
          <div className="pm-piste" ref={pisteRef}>
            {modes.map((m, k) => (
              <Volet key={m.id} id={m.id} label={m.label} k={k} cache={k !== indexRepos} contenu={contenuMode(m)} />
            ))}
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
    </ModalesHorsPanneauCtx.Provider>
  );
}

/* ---- un volet de la piste (v1.4) : mémoïsé — props stables (contenu mémoïsé, `cache`
   ne change qu'à la fin d'une aimantation). Sa translation (k × 100 %) est fixe ; c'est la
   piste qui bouge. Hors écran : inerte, masqué aux lecteurs d'écran, hors tabulation. ---- */
const Volet = memo(function Volet({ id, label, k, cache, contenu }) {
  return (
    <div className="pm-vue" data-mode={id} style={{ transform: `translate3d(${k * 100}%, 0, 0)` }}
      role="tabpanel" aria-label={label} aria-hidden={cache || undefined} tabIndex={cache ? -1 : undefined}
      {...(cache ? { inert: '' } : {})}>
      <ModeVisibleCtx.Provider value={!cache}>{contenu}</ModeVisibleCtx.Provider>
    </div>
  );
});

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
