/* ============================================================
   MedRevise — Bibliothèque (fusion Bibliothèque + Documents, C) : arbre
   Cours → Matière → Fiche à gauche (recherche transversale, renommage,
   drag & drop, révision), lecteur/éditeur du document sélectionné à droite
   (PDF / schéma d'anatomie / transcript). Sélectionner une fiche-document
   l'ouvre directement dans le panneau de droite, sans changer d'écran —
   PdfReader/SchemaEditorScreen/TranscriptEditor y sont rendus EMBARQUÉS
   (props embedded/onClose, voir ces fichiers). Layout master-detail
   responsive (`.lib-split`, voir etudes.css).
   ============================================================ */
import { useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop, matiereMeta, FicheDndProvider, DraggableFiche, DropSlot, DestPicker, etiquetteMeta, etiquetteMenuItems, ContextMenu, ConfirmModal, detectDocKind, BellButton, Modal } from '../components/ui.jsx';
import { index } from '../lib/planning.js';
import { putBlob } from '../lib/storage.js';
import { ficheImages, totalCoches } from '../lib/anatSchema.js';
import { docKind, DOC_META, createTranscript, deleteTranscript } from '../documents/lib/documents.js';
import { cleanTranscript, textToDoc } from '../documents/lib/transcript.js';
import { PdfReader } from '../pdf/PdfReader.jsx';
import { TranscriptEditor } from '../documents/TranscriptEditor.jsx';
import { SchemaEditorScreen } from '../documents/SchemaEditorScreen.jsx';

const schemaViews = (f) => ficheImages(f).length;
const schemaCoches = (f) => totalCoches(f);

export function Bibliotheque({ ctx }) {
  const { db } = ctx;
  const ix = useMemo(() => index(db), [db]);
  const [open, setOpen] = useState({});
  const [openFiche, setOpenFiche] = useState({});
  const [q, setQ] = useState('');
  const [renaming, setRenaming] = useState(null); // { type, id }
  const [draft, setDraft] = useState('');
  // C — panneau de droite : quelle fiche-document est ouverte (jamais de
  // navigation d'écran — on reste sur 'library' tout du long).
  const [selected, setSelected] = useState(null); // { ficheId, kind: 'fiche'|'schema'|'transcript', mode? }
  const [creatingTranscript, setCreatingTranscript] = useState(false);
  const [etqMenu, setEtqMenu] = useState(null); // { x, y, ficheId } — menu compact de l'étiquette
  const [replacingHtmlId, setReplacingHtmlId] = useState(null); // ficheId — modale « Remplacer le fichier HTML »
  // refonte UX (repli HORIZONTAL, pas un démontage) : la liste reste TOUJOURS
  // montée, dans une colonne qui rétrécit en rail (voir .lib-master.collapsed,
  // etudes.css) — jamais empilée verticalement, jamais totalement invisible.
  // Repliée automatiquement à l'ouverture d'un cours (donne de la place au
  // lecteur) et sur petite fenêtre au montage ; un seul contrôle pour la
  // rouvrir (le chevron du rail) — plus de bouton « Liste des cours » séparé
  // (redondant avec « Retour », voir le point 3 de la demande).
  const [listCollapsed, setListCollapsed] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 960px)').matches);
  const [ficheMenu, setFicheMenu] = useState(null); // { x, y, ficheId } — menu « … » (actions secondaires)
  const [confirmArchive, setConfirmArchive] = useState(null); // fiche à archiver (confirmation)
  const attachInputRef = useRef(null);
  const [attachTarget, setAttachTarget] = useState(null); // ficheId ciblé par l'input fichier partagé du menu « … »

  const startRename = (type, id, current) => { setDraft(current); setRenaming({ type, id }); };
  const isRen = (type, id) => renaming && renaming.type === type && renaming.id === id;
  const commitRename = () => {
    if (renaming && draft.trim()) {
      if (renaming.type === 'source') ctx.renameSource(renaming.id, draft);
      else if (renaming.type === 'matiere') ctx.renameMatiere(renaming.id, draft);
      else ctx.renameFiche(renaming.id, draft);
    }
    setRenaming(null);
  };
  const RenameInput = () => (
    <input className="srcmgr-input" autoFocus value={draft} onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
      onBlur={commitRename} />
  );

  const qById = (fId) => db.questions.filter((x) => x.ficheId === fId);
  const count = (fId, t) => qById(fId).filter((x) => x.type === t).length;

  // ouvre le document d'une fiche dans le panneau de droite (jamais de navigation
  // d'écran) ; kind dérivé de docKind() — pdfId → 'fiche', anat_schema → 'schema',
  // transcript → 'transcript'. Replie la liste dans la foulée (le lecteur prend
  // toute la largeur) — le chevron du rail la rouvre en un clic.
  const openDoc = (f, mode, srcTab) => {
    const kind = docKind(f);
    if (kind === 'fiche') setSelected({ ficheId: f.id, kind: 'fiche', mode: mode || 'read', srcTab });
    else if (kind === 'schema') setSelected({ ficheId: f.id, kind: 'schema' });
    else if (kind === 'transcript') setSelected({ ficheId: f.id, kind: 'transcript' });
    if (kind) setListCollapsed(true);
  };
  const closeDoc = () => { setSelected(null); setListCollapsed(false); };
  // input UNIQUE (PDF ou HTML) pour rattacher un document — le type est détecté
  // à la volée, le stockage bascule sur fiche.pdfId ou fiche.htmlId en conséquence.
  const attachDoc = async (ficheId, file) => {
    const kind = detectDocKind(file);
    if (!kind) return;
    const blobId = await putBlob(file);
    if (kind === 'html') await ctx.setFicheHtml(ficheId, blobId, file.name);
    else await ctx.setFichePdf(ficheId, blobId, file.name);
    setSelected({ ficheId, kind: 'fiche', mode: 'edit', srcTab: kind });
    setListCollapsed(true);
  };
  // déclenché depuis le menu « … » (« Attacher un document ») : un seul input
  // fichier partagé pour toute la liste, ciblé via `attachTarget` — évite un
  // <input> par ligne (celui-ci reste caché en permanence, voir plus bas).
  const requestAttach = (ficheId) => { setAttachTarget(ficheId); attachInputRef.current?.click(); };
  const onAttachInputChange = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file && attachTarget) attachDoc(attachTarget, file);
    setAttachTarget(null);
  };
  const openEtqMenu = (e, ficheId) => {
    e.stopPropagation();
    setEtqMenu({ x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 170), ficheId });
  };
  const openFicheMenu = (e, ficheId) => {
    e.stopPropagation();
    setFicheMenu({ x: Math.min(e.clientX, window.innerWidth - 240), y: Math.min(e.clientY, window.innerHeight - 320), ficheId });
  };
  const removeTranscript = async (ficheId) => {
    await deleteTranscript(ficheId);
    if (selected && selected.ficheId === ficheId) setSelected(null);
    await ctx.reload();
  };
  const confirmArchiveFiche = async () => {
    if (!confirmArchive) return;
    await ctx.setFicheArchived(confirmArchive.id, true);
    if (selected && selected.ficheId === confirmArchive.id) closeDoc();
    setConfirmArchive(null);
  };

  // contenu du menu « … » d'une ligne de cours : TOUT ce qui n'est pas visible en
  // permanence (voir la refonte UX) — rien n'est supprimé, juste regroupé. `x,y`
  // = position du clic qui a ouvert ce menu (réutilisée si « Étiquette » l'ouvre
  // à son tour, au même endroit).
  const ficheMenuItems = (f, x, y) => {
    const isSchema = f.type === 'anat_schema';
    const isTranscript = f.type === 'transcript';
    const items = [{ label: 'Renommer', icon: 'edit', onClick: () => startRename('fiche', f.id, f.titre) }];
    if (!isSchema && !isTranscript) {
      items.push({ label: f.etiquette ? 'Changer l’étiquette' : 'Poser une étiquette', icon: 'tag', onClick: () => setEtqMenu({ x, y, ficheId: f.id }) });
      if (f.pdfId && f.htmlId) {
        items.push({ label: 'Ouvrir en PDF', icon: 'filePdf', onClick: () => openDoc(f, 'edit', 'pdf') });
        items.push({ label: 'Ouvrir en HTML', icon: 'fileHtml', onClick: () => openDoc(f, 'edit', 'html') });
      }
      if (f.htmlId) items.push({ label: 'Remplacer le fichier HTML', icon: 'refresh', onClick: () => setReplacingHtmlId(f.id) });
      if (!f.pdfId || !f.htmlId) items.push({ label: 'Attacher un document', icon: 'upload', onClick: () => requestAttach(f.id) });
      items.push({
        label: f.rappelsJ === false ? 'Reprendre les rappels J' : 'Mettre les rappels J en pause', icon: 'bell',
        onClick: () => ctx.setFicheRappelsJ(f.id, f.rappelsJ === false),
      });
    }
    items.push(isTranscript
      ? { label: 'Supprimer ce transcript', icon: 'trash', danger: true, onClick: () => removeTranscript(f.id) }
      : { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => setConfirmArchive(f) });
    return items;
  };

  // BUG5 : drag & drop des fiches via @dnd-kit (voir FicheDndProvider/ui.jsx).
  const onDropAt = ({ ficheId, matiereId, beforeFicheId }) => {
    if (beforeFicheId === ficheId) return;
    ctx.moveFicheTo(ficheId, matiereId, beforeFicheId);
  };
  const renderFicheOverlay = (ficheId) => {
    const f = db.fiches.find((x) => x.id === ficheId);
    if (!f) return null;
    return (
      <div className="dnd-overlay-card" style={{ border: '1px solid var(--border-2)', background: 'var(--card)', padding: '11px 13px', width: 280 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{f.titre}</span>
      </div>
    );
  };

  const search = q.trim().toLowerCase();
  const matches = search
    ? db.questions.filter((x) => (x.concept + ' ' + (x.question || '') + ' ' + (x.recto || '') + ' ' + (x.explication || '') + ' ' + (x.verso || '')).toLowerCase().includes(search))
      .map((x) => { const f = ix.fById[x.ficheId]; return { ...x, fiche: f, matiere: f && ix.mById[f.matiereId] }; })
    : null;

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div>
          <h1 className="serif">Bibliothèque</h1>
          <div className="sub">Tous tes cours, fiches et documents. Recherche transversale.</div>
        </div>
        <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
      </div>

      <div className="lib-toolbar row spread">
        <div className="search" style={{ maxWidth: 520, flex: '1 1 320px' }}>
          <Icon name="search" size={16} className="ic" />
          <input placeholder="Rechercher une notion (ex : lactate, nerf radial…)" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="icon-btn sm" onClick={() => setQ('')}><Icon name="x" size={14} /></button>}
        </div>
        <button className="btn ghost sm" onClick={() => setCreatingTranscript((v) => !v)}>
          <Icon name={creatingTranscript ? 'x' : 'plus'} size={13} /> {creatingTranscript ? 'Fermer' : 'Nouveau transcript'}
        </button>
      </div>

      {/* input fichier PARTAGÉ (menu « … » → Attacher un document) — un seul pour
         toute la liste, jamais affiché ; voir requestAttach/onAttachInputChange. */}
      <input ref={attachInputRef} type="file" accept="application/pdf,text/html,.pdf,.html" style={{ display: 'none' }} onChange={onAttachInputChange} />

      <div className="lib-split">
        <div className={'lib-master' + (listCollapsed ? ' collapsed' : '')}>
          {listCollapsed ? (
            <button type="button" className="lib-rail" onClick={() => setListCollapsed(false)} title="Afficher la liste des cours">
              <Icon name="chevR" size={16} />
              <span className="lib-rail-label">Cours</span>
            </button>
          ) : (
          <>
          <div className="row spread" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Cours</h3>
            <button type="button" className="icon-btn sm" onClick={() => setListCollapsed(true)} title="Replier la liste"><Icon name="chevL" size={14} /></button>
          </div>

          {creatingTranscript && (
            <NewTranscript ctx={ctx} onDone={() => setCreatingTranscript(false)}
              onCreated={(fiche) => { setSelected({ ficheId: fiche.id, kind: 'transcript' }); setListCollapsed(true); }} />
          )}

          {matches ? (
            <div className="card"><div className="card-body">
              <div className="hint" style={{ marginBottom: 10 }}>{matches.length} résultat{matches.length > 1 ? 's' : ''}</div>
              {matches.map((m) => {
                const mm = matiereMeta(m.matiere);
                return (
                  <div className="day-line" key={m.id}>
                    <div className="dl-ic" style={{ background: `color-mix(in srgb, ${mm.tint} 15%, transparent)`, color: mm.tint }}><Icon name={m.type === 'flashcard' ? 'cards' : m.type === 'feynman' ? 'lightbulb' : 'list'} size={16} /></div>
                    <div className="dl-main">
                      <div className="dl-title">{m.concept}</div>
                      <div className="dl-sub"><span>{mm.label} · {m.fiche && m.fiche.titre}</span></div>
                    </div>
                    <button className="cd-ic" title="Supprimer cette question" onClick={() => ctx.deleteQuestion(m.id)}><Icon name="trash" size={14} /></button>
                  </div>
                );
              })}
              {!matches.length && <div className="hint">Aucune question ne correspond.</div>}
            </div></div>
          ) : (
            <FicheDndProvider onDropAt={onDropAt} renderOverlay={renderFicheOverlay}>
            <div className="lib-tree" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {db.sources.filter((s) => !s.archive).map((src) => {
                const mats = db.matieres.filter((m) => m.sourceId === src.id && !m.archive);
                const openS = !!open[src.id];
                return (
                  <div className="card" key={src.id}>
                    <div className="card-head" style={{ cursor: 'pointer', color: 'var(--text)' }} onClick={() => setOpen((o) => ({ ...o, [src.id]: !openS }))}>
                      <Icon name={openS ? 'chevD' : 'chevR'} size={16} className="ic" />
                      <span className="tsrc-ic" style={{ background: `color-mix(in srgb, ${src.tint || '#7C6FE0'} 16%, transparent)`, color: src.tint || '#7C6FE0' }}><Icon name={src.icon || 'folder'} size={14} /></span>
                      {isRen('source', src.id)
                        ? <RenameInput />
                        : <h3 style={{ color: 'var(--text)' }} onDoubleClick={(e) => { e.stopPropagation(); startRename('source', src.id, src.nom); }} title="Double-clic pour renommer">{src.nom}</h3>}
                      <div className="right" style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                        <span className="hint">{mats.length} matière{mats.length > 1 ? 's' : ''}</span>
                        <BellButton on={src.rappelsJ !== false} onToggle={() => ctx.setSourceRappels(src.id, src.rappelsJ === false)} />
                      </div>
                    </div>
                    {openS && (
                      <div className="card-body" style={{ paddingTop: 0 }}>
                        {mats.map((mat) => {
                          const mm = matiereMeta(mat);
                          const fiches = db.fiches.filter((f) => f.matiereId === mat.id && !f.archive).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
                          return (
                            <div key={mat.id} style={{ marginTop: 14 }}>
                              {isRen('matiere', mat.id)
                                ? <div style={{ marginBottom: 8 }}><RenameInput /></div>
                                : <div className="cat-badge" style={{ background: `color-mix(in srgb, ${mm.tint} 14%, transparent)`, color: mm.tint, borderColor: `color-mix(in srgb, ${mm.tint} 30%, transparent)`, marginBottom: 8, cursor: 'pointer' }} onDoubleClick={() => startRename('matiere', mat.id, mm.label)} title="Double-clic pour renommer"><Icon name={mm.icon} size={12} /> {mm.label}</div>}
                              {fiches.map((f) => {
                                const fo = !!openFiche[f.id];
                                const isAnat = f.type === 'anatomie';
                                const isSchema = f.type === 'anat_schema';
                                const isTranscript = f.type === 'transcript';
                                const kind = docKind(f);
                                const isSel = !!(selected && selected.ficheId === f.id);
                                const paused = !isTranscript && f.rappelsJ === false;
                                const etq = etiquetteMeta(f.etiquette);
                                const metaLine = isTranscript ? 'Transcript'
                                  : isSchema ? `Schéma · ${schemaViews(f) > 1 ? schemaViews(f) + ' vues · ' : ''}${schemaCoches(f)} coche${schemaCoches(f) > 1 ? 's' : ''}`
                                    : `${count(f.id, 'qcm')} QCM · ${count(f.id, 'flashcard')} flash${isAnat ? ' · images' : ''}`;
                                return (
                                  <div key={f.id}>
                                    <DropSlot matiereId={mat.id} beforeId={f.id} />
                                    <DraggableFiche id={f.id} disabled={isRen('fiche', f.id)} className={'lib-fiche' + (isSel ? ' selected' : '')}>
                                      {isRen('fiche', f.id) ? (
                                        <RenameInput />
                                      ) : (
                                        <>
                                          <div role="button" className="lib-fiche-row" style={{ cursor: 'pointer' }}
                                            onClick={() => { if (kind) openDoc(f); else setOpenFiche((o) => ({ ...o, [f.id]: !fo })); }}
                                            onDoubleClick={(e) => { e.stopPropagation(); startRename('fiche', f.id, f.titre); }}
                                            title={kind ? 'Clic = ouvrir le document · double-clic = renommer' : 'Clic = ouvrir · double-clic = renommer'}>
                                            {kind
                                              ? <Icon name={DOC_META[kind].icon} size={14} style={{ color: isSel ? 'var(--accent)' : 'var(--text-3)', flex: '0 0 auto' }} />
                                              : <Icon name={fo ? 'chevD' : 'chevR'} size={14} style={{ color: 'var(--text-3)', flex: '0 0 auto' }} />}
                                            <span className="lib-fiche-title">{f.titre}</span>
                                            {etq && <span className="lib-fiche-etq" style={{ background: etq.color }} title={`Étiquette : ${etq.label}`} onClick={(e) => openEtqMenu(e, f.id)} />}
                                            {paused && <Icon name="bellOff" size={13} style={{ color: 'var(--text-3)', flex: '0 0 auto' }} title="Rappels J en pause" />}
                                            {!isTranscript && (
                                              <button type="button" className="cd-ic" title="Réviser" onClick={(e) => { e.stopPropagation(); if (isSchema) { ctx.startAnatQuiz(f, { mode: 'total' }); } else { ctx.setFocusFiche(f.id); ctx.startSession(db.questions.filter((x) => x.ficheId === f.id && x.type !== 'feynman'), f.titre); } }}>
                                                <Icon name="play" size={13} />
                                              </button>
                                            )}
                                            <button type="button" className="cd-ic" title="Autres actions" onClick={(e) => openFicheMenu(e, f.id)}><Icon name="more" size={15} stroke={2.6} /></button>
                                          </div>
                                          <div className="lib-fiche-meta">{metaLine}</div>
                                        </>
                                      )}
                                      {fo && !kind && (
                                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                          {qById(f.id).map((x) => (
                                            <div className="row spread" key={x.id} style={{ padding: '6px 0', borderTop: '1px solid var(--border-2)' }}>
                                              <span style={{ fontSize: 12.5, color: 'var(--text-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Icon name={x.type === 'flashcard' ? 'cards' : x.type === 'feynman' ? 'lightbulb' : 'list'} size={12} /> {x.concept}</span>
                                              <button className="cd-ic" title="Supprimer" onClick={() => ctx.deleteQuestion(x.id)}><Icon name="trash" size={13} /></button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </DraggableFiche>
                                  </div>
                                );
                              })}
                              <DropSlot matiereId={mat.id} beforeId={null} variant={fiches.length ? 'line' : 'zone'} />
                              {fiches.length === 0 && <div className="hint">Aucune fiche.</div>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </FicheDndProvider>
          )}
          </>
          )}
        </div>

        <div className="lib-detail">
          {!selected ? (
            <div className="lib-detail-empty">
              <Icon name="book" size={28} />
              <div style={{ fontWeight: 600, marginTop: 10 }}>Aucun document sélectionné</div>
              <div className="hint" style={{ marginTop: 6 }}>Clique une fiche avec PDF, schéma ou transcript pour l'ouvrir ici.</div>
            </div>
          ) : selected.kind === 'fiche' ? (
            <PdfReader key={selected.ficheId + ':' + (selected.mode || '') + ':' + (selected.srcTab || '')} ctx={ctx} ficheId={selected.ficheId} mode={selected.mode} initialSrcTab={selected.srcTab} embedded onClose={closeDoc} />
          ) : selected.kind === 'schema' ? (
            <SchemaEditorScreen key={selected.ficheId} ctx={ctx} ficheId={selected.ficheId} embedded onClose={closeDoc} />
          ) : selected.kind === 'transcript' ? (
            <TranscriptEditor key={selected.ficheId} ctx={ctx} ficheId={selected.ficheId} onClose={closeDoc} />
          ) : null}
        </div>
      </div>

      {etqMenu && (
        <ContextMenu x={etqMenu.x} y={etqMenu.y} onClose={() => setEtqMenu(null)}
          items={etiquetteMenuItems((db.fiches.find((x) => x.id === etqMenu.ficheId) || {}).etiquette, (v) => ctx.setFicheEtiquette(etqMenu.ficheId, v))} />
      )}

      {ficheMenu && (() => {
        const f = db.fiches.find((x) => x.id === ficheMenu.ficheId);
        return f ? <ContextMenu x={ficheMenu.x} y={ficheMenu.y} onClose={() => setFicheMenu(null)} items={ficheMenuItems(f, ficheMenu.x, ficheMenu.y)} /> : null;
      })()}

      {confirmArchive && (
        <ConfirmModal
          title="Supprimer ce cours ?"
          body={<>« {confirmArchive.titre} » sera déplacé dans la corbeille (Réglages), restaurable tant qu'elle n'est pas vidée. Les cartes et le planning associés partent avec.</>}
          confirmLabel="Supprimer" danger
          onConfirm={confirmArchiveFiche} onCancel={() => setConfirmArchive(null)}
        />
      )}

      {replacingHtmlId && (
        <ReplaceHtmlModal ctx={ctx} fiche={db.fiches.find((x) => x.id === replacingHtmlId)} onClose={() => setReplacingHtmlId(null)} />
      )}
    </div>
  );
}

/* remplace le fichier HTML d'une fiche EXISTANTE (fichier ou HTML collé) — ne
   touche que fiche.htmlId/htmlName (même champ que « Voir le cours »/setFicheHtml) ;
   cartes (QCM/flashcard/Feynman/exercice), plan J et carnet d'erreurs vivent dans
   d'autres stores (questions/highlights/annotations), jamais effleurés ici.
   L'avertissement + le bouton « Remplacer » explicite tiennent lieu de
   confirmation (pas de second dialogue, inutile pour un geste aussi direct). */
function ReplaceHtmlModal({ ctx, fiche, onClose }) {
  const [mode, setMode] = useState('file'); // file | paste
  const [file, setFile] = useState(null);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  if (!fiche) return null;
  const ready = mode === 'file' ? !!file : !!pasted.trim();

  const confirm = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const blob = mode === 'file' ? file : new Blob([pasted], { type: 'text/html' });
      const name = mode === 'file' ? file.name : (fiche.htmlName || 'fiche.html');
      const blobId = await putBlob(blob);
      await ctx.replaceFicheHtml(fiche.id, blobId, name);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Remplacer le fichier HTML" onClose={onClose}>
      <div className="hint" style={{ marginBottom: 12 }}>
        Remplace le document HTML actuel ({fiche.htmlName || 'fiche HTML'}) de « {fiche.titre} » par une
        nouvelle version. Les cartes (QCM, flashcards, Feynman, exercices), le planning des J et le carnet
        d'erreurs de cette fiche restent intacts — seul le cours affiché dans « Voir le cours » change.
      </div>
      <div className="seg" style={{ marginBottom: 12 }}>
        <button type="button" className={'seg-btn' + (mode === 'file' ? ' active' : '')} onClick={() => setMode('file')}><Icon name="upload" size={13} /> Fichier</button>
        <button type="button" className={'seg-btn' + (mode === 'paste' ? ' active' : '')} onClick={() => setMode('paste')}><Icon name="edit" size={13} /> Coller le HTML</button>
      </div>
      {mode === 'file' ? (
        <div className="imp-field">
          <label>Nouveau fichier HTML</label>
          <input type="file" accept="text/html,.html" onChange={(e) => setFile(e.target.files[0] || null)} />
          {file && <div className="hint" style={{ marginTop: 6 }}>{file.name}</div>}
        </div>
      ) : (
        <div className="imp-field">
          <label>Code HTML collé</label>
          <textarea className="imp-title" style={{ minHeight: 160, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12.5 }}
            placeholder="Colle ici tout le contenu HTML de la fiche mise à jour." value={pasted} onChange={(e) => setPasted(e.target.value)} />
        </div>
      )}
      <div className="imp-actions" style={{ marginTop: 14 }}>
        <button className="btn ghost" onClick={onClose}>Annuler</button>
        <button className="btn danger" disabled={!ready || busy} onClick={confirm}><Icon name="refresh" size={14} /> Remplacer (écrase l'ancien fichier)</button>
      </div>
    </Modal>
  );
}

/* création d'un transcript : destination + titre + collage + APERÇU nettoyage
   réversible (repris de l'ex-onglet Documents, absorbé ici). `onCreated` ouvre
   le transcript fraîchement créé dans le panneau de droite. */
function NewTranscript({ ctx, onDone, onCreated }) {
  const { db } = ctx;
  const sources = db.sources.filter((s) => !s.archive);
  const matieresFor = (sid) => db.matieres.filter((m) => m.sourceId === sid && !m.archive);
  const [srcId, setSrcId] = useState(() => (sources[0] || {}).id);
  const [matId, setMatId] = useState(() => (matieresFor((sources[0] || {}).id)[0] || {}).id || null);
  const [titre, setTitre] = useState('');
  const [raw, setRaw] = useState('');
  const [version, setVersion] = useState('clean'); // clean | raw
  const [step, setStep] = useState('edit'); // edit | preview
  const [busy, setBusy] = useState(false);

  const cleaned = useMemo(() => cleanTranscript(raw).cleaned, [raw]);
  const ready = !!matId && !!titre.trim() && !!raw.trim();

  const create = async () => {
    if (!ready || busy) return;
    setBusy(true);
    const chosen = version === 'clean' && cleaned ? cleaned : raw;
    const fiche = await createTranscript({ matiereId: matId, titre, originalText: raw, doc: textToDoc(chosen) });
    await ctx.reload();
    setBusy(false);
    onDone && onDone();
    onCreated && onCreated(fiche);
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-body">
        <div className="imp-dest-head"><Icon name="edit" size={15} /> Nouveau transcript</div>

        {step === 'edit' && (
          <div className="fadein">
            <DestPicker ctx={ctx} srcId={srcId} setSrcId={setSrcId} matId={matId} setMatId={setMatId} />
            <div className="imp-field">
              <label>Titre</label>
              <input className="imp-title" placeholder="ex : Cardio — cours 3 (transcript vidéo)" value={titre} onChange={(e) => setTitre(e.target.value)} />
            </div>
            <div className="imp-field">
              <label>Transcript brut (collé)</label>
              <textarea className="imp-title" style={{ minHeight: 150, resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
                placeholder="Colle ici le transcript du cours vidéo (avec horodatages, hésitations… ils seront nettoyés)." value={raw} onChange={(e) => setRaw(e.target.value)} />
            </div>
            <div className="imp-actions">
              <button className="btn ghost" onClick={onDone}>Annuler</button>
              <button className="btn primary" disabled={!ready} onClick={() => setStep('preview')}><Icon name="sparkle" size={15} /> Nettoyer & prévisualiser</button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="fadein">
            <div className="hint" style={{ marginBottom: 10 }}>Le nettoyage est réversible : le transcript brut est conservé (bouton « Rétablir le texte d'origine » dans l'éditeur).</div>
            <div className="seg" style={{ marginBottom: 12 }}>
              <button type="button" className={'seg-btn' + (version === 'clean' ? ' active' : '')} onClick={() => setVersion('clean')}><Icon name="sparkle" size={13} /> Version nettoyée</button>
              <button type="button" className={'seg-btn' + (version === 'raw' ? ' active' : '')} onClick={() => setVersion('raw')}><Icon name="edit" size={13} /> Texte brut</button>
            </div>
            <div className="row" style={{ gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div className="hint" style={{ fontWeight: 700, marginBottom: 4 }}>Avant</div>
                <pre className="rt-diff">{raw.slice(0, 4000) || '(vide)'}</pre>
              </div>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div className="hint" style={{ fontWeight: 700, marginBottom: 4 }}>Après (nettoyé)</div>
                <pre className="rt-diff">{cleaned.slice(0, 4000) || '(le nettoyage n\'a rien laissé — garde le texte brut)'}</pre>
              </div>
            </div>
            <div className="imp-actions" style={{ marginTop: 12 }}>
              <button className="btn ghost" onClick={() => setStep('edit')}>Retour</button>
              <button className="btn primary" disabled={busy} onClick={create}><Icon name="check" size={15} /> Créer le transcript ({version === 'clean' ? 'nettoyé' : 'brut'})</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
