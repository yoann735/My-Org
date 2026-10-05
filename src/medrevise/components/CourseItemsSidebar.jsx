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
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Tex } from './Tex.jsx';
import { ConfirmModal, ContextMenu, SplitHandle } from './ui.jsx';
import { ItemForm, PasteJsonForm, TYPES } from './AddItemForm.jsx';
import { appendItemsToFiche, themeFlashcardsDeFiche } from '../lib/import.js';
import { ThemeFicheFlashcards } from './ThemeFiche.jsx';
import { toInternalItem } from '../lib/adapter.js';
import { OcclusionEditorModal, OcclusionView, estOcclusion } from './OcclusionImage.jsx';
import { ImageFlashcard, imageAuRecto, imageAuVerso } from './FlashcardImage.jsx';
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
  const [sens, setSens] = useState(0); // -1 / +1 : direction de la transition
  const setMode = (id) => {
    if (id === mode || !modes.some((m) => m.id === id)) return;
    setSens(modes.findIndex((m) => m.id === id) > modes.findIndex((m) => m.id === mode) ? 1 : -1);
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

  /* ---- glissement horizontal entre modes : doigt/stylet (pointeur), trackpad (roue X) ---- */
  const voisin = (d) => { const i = modes.findIndex((m) => m.id === modeActif); const m = modes[i + d]; if (m) setMode(m.id); };
  const geste = useRef(null);
  const roue = useRef({ x: 0, t: 0, bloque: 0 });
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse') return; // à la souris, glisser sert à sélectionner du texte
    geste.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e) => {
    const g = geste.current; geste.current = null;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) voisin(dx < 0 ? 1 : -1);
  };
  const onWheel = (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const r = roue.current, now = Date.now();
    if (now < r.bloque) return;
    if (now - r.t > 250) r.x = 0;
    r.x += e.deltaX; r.t = now;
    if (Math.abs(r.x) > 120) { voisin(r.x > 0 ? 1 : -1); r.x = 0; r.bloque = now + 600; }
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
    activeType === 'flashcard' && { label: 'Flashcard image (masques)', icon: 'image', onClick: () => setOccEdition(true) },
    activeType === 'flashcard' && { label: 'Thème automatique des flashcards', icon: 'tag', onClick: () => setVoirTheme((v) => !v) },
  ].filter(Boolean);

  const exercices = (
    <div className="pis-scroll scroll pm-exos">
      <div className="pm-sous" role="tablist" aria-label="Type d’exercice">
        {TYPES.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={activeType === t.id}
            className={'pm-sous-btn' + (activeType === t.id ? ' actif' : '')} onClick={() => choisirType(t.id)}>
            {LIBELLES[t.id]} <span className={'tnum pm-n' + (countByType[t.id] ? '' : ' zero')}>{countByType[t.id]}</span>
          </button>
        ))}
      </div>
      <div className="pm-actions">
        <button type="button" className={'btn sm' + (adding && addSource === 'form' ? ' actif' : '')}
          onClick={() => { if (adding && addSource === 'form') closeAdd(); else { setAdding(true); setAddSource('form'); setAddedCount(0); setEditingId(null); } }}>
          <Icon name={adding && addSource === 'form' ? 'x' : 'plus'} size={13} /> {adding && addSource === 'form' ? 'Fermer' : 'Ajouter'}
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="icon-btn sm" title="Plus d’actions : coller du JSON, flashcard image, thème"
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenuActions({ x: Math.min(r.right - 250, window.innerWidth - 260), y: r.bottom + 6 }); }}>
          <Icon name="more" size={16} />
        </button>
      </div>
      {voirTheme && activeType === 'flashcard' && <ThemeFicheFlashcards ctx={ctx} ficheId={ficheId} />}
      {adding && (
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
  );

  const indexMode = Math.max(0, modes.findIndex((m) => m.id === modeActif));
  const extraActif = modeActif === 'notions' ? extraNotions : modeActif === 'transcript' ? extraTranscript : null;

  return (
    <div className={'pis' + (collapsed ? ' collapsed' : '')}>
      <SplitHandle side="right" collapsed={collapsed} onClick={() => setCollapsed((v) => !v)} />
      {!collapsed && (
      <div className="pis-body">
        {modes.length > 1 && (
          <div className="pm-seg" role="tablist" aria-label="Mode du panneau" style={{ '--n': modes.length, '--i': indexMode }}>
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
        <div className="pm-corps" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { geste.current = null; }} onWheel={onWheel}>
          <div key={modeActif} className={'pm-vue' + (sens > 0 ? ' depuis-droite' : sens < 0 ? ' depuis-gauche' : '')}>
            {modeActif === 'exercices' ? exercices : extraActif ? (
              extraActif.plein
                ? <div className="pis-extra-plein">{extraActif.contenu}</div>
                : <div className="pis-scroll scroll pis-extra">{extraActif.contenu}</div>
            ) : null}
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
