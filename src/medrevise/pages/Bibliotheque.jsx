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
import { useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop, matiereMeta, FicheDndProvider, DraggableFiche, DropSlot, DestPicker } from '../components/ui.jsx';
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
  // transcript → 'transcript'.
  const openDoc = (f, mode) => {
    const kind = docKind(f);
    if (kind === 'fiche') setSelected({ ficheId: f.id, kind: 'fiche', mode: mode || 'read' });
    else if (kind === 'schema') setSelected({ ficheId: f.id, kind: 'schema' });
    else if (kind === 'transcript') setSelected({ ficheId: f.id, kind: 'transcript' });
  };
  const attachPdf = async (ficheId, file) => {
    if (!file) return;
    const pdfId = await putBlob(file);
    await ctx.setFichePdf(ficheId, pdfId, file.name);
    setSelected({ ficheId, kind: 'fiche', mode: 'edit' });
  };
  const removeTranscript = async (ficheId) => {
    await deleteTranscript(ficheId);
    if (selected && selected.ficheId === ficheId) setSelected(null);
    await ctx.reload();
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

      <div className="row spread" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div className="search" style={{ maxWidth: 520, flex: '1 1 320px' }}>
          <Icon name="search" size={16} className="ic" />
          <input placeholder="Rechercher une notion (ex : lactate, nerf radial…)" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="icon-btn sm" onClick={() => setQ('')}><Icon name="x" size={14} /></button>}
        </div>
        <button className="btn ghost sm" onClick={() => setCreatingTranscript((v) => !v)}>
          <Icon name={creatingTranscript ? 'x' : 'plus'} size={13} /> {creatingTranscript ? 'Fermer' : 'Nouveau transcript'}
        </button>
      </div>

      <div className="lib-split">
        <div className="lib-master">
          {creatingTranscript && (
            <NewTranscript ctx={ctx} onDone={() => setCreatingTranscript(false)}
              onCreated={(fiche) => setSelected({ ficheId: fiche.id, kind: 'transcript' })} />
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
                      <div className="right"><span className="hint">{mats.length} matière{mats.length > 1 ? 's' : ''}</span></div>
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
                                return (
                                  <div key={f.id}>
                                    <DropSlot matiereId={mat.id} beforeId={f.id} />
                                    <DraggableFiche id={f.id} disabled={isRen('fiche', f.id)} className={'lib-fiche' + (isSel ? ' selected' : '')}
                                      style={{ border: '1px solid ' + (isSel ? 'var(--accent)' : 'var(--border-2)'), borderRadius: 12, padding: '11px 13px' }}>
                                      <div className="row spread">
                                        {isRen('fiche', f.id) ? (
                                          <div style={{ flex: 1, minWidth: 0 }}><RenameInput /></div>
                                        ) : (
                                          <div role="button" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', flex: 1, minWidth: 0 }}
                                            onClick={() => { if (kind) openDoc(f); else setOpenFiche((o) => ({ ...o, [f.id]: !fo })); }}
                                            onDoubleClick={(e) => { e.stopPropagation(); startRename('fiche', f.id, f.titre); }}
                                            title={kind ? 'Clic = ouvrir le document · double-clic = renommer' : 'Clic = ouvrir · double-clic = renommer'}>
                                            {kind
                                              ? <Icon name={DOC_META[kind].icon} size={14} style={{ color: isSel ? 'var(--accent)' : 'var(--text-3)' }} />
                                              : <Icon name={fo ? 'chevD' : 'chevR'} size={14} style={{ color: 'var(--text-3)' }} />}
                                            <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.titre}</span>
                                          </div>
                                        )}
                                        <div className="row" style={{ gap: 6 }}>
                                          {isTranscript ? (
                                            <span className="pill" style={{ height: 22, fontSize: 10.5 }}><Icon name="edit" size={11} /> TRANSCRIPT</span>
                                          ) : isSchema ? (
                                            <span className="pill" style={{ height: 22, fontSize: 10.5 }}><Icon name="image" size={11} /> SCHÉMA · {schemaViews(f) > 1 ? `${schemaViews(f)} vues · ` : ''}{schemaCoches(f)} coche{schemaCoches(f) > 1 ? 's' : ''}</span>
                                          ) : (
                                            <>
                                              <span className="pill accent" style={{ height: 22, fontSize: 10.5 }}>{count(f.id, 'qcm')} QCM</span>
                                              <span className="pill amber" style={{ height: 22, fontSize: 10.5 }}>{count(f.id, 'flashcard')} flash</span>
                                              {isAnat && <span className="pill" style={{ height: 22, fontSize: 10.5 }}><Icon name="image" size={11} /> IMAGES</span>}
                                            </>
                                          )}
                                          {isSchema && (
                                            <button className="cd-ic" title="Éditer le schéma" onClick={() => openDoc(f)}><Icon name="edit" size={14} /></button>
                                          )}
                                          {!isSchema && !isTranscript && (
                                            f.pdfId ? (
                                              <button className="cd-ic" title="Ouvrir le PDF (lecture / surlignage)" onClick={() => openDoc(f, 'edit')}><Icon name="filePdf" size={14} /></button>
                                            ) : (
                                              <label className="cd-ic" title="Attacher un PDF" style={{ cursor: 'pointer' }} onClick={(e) => e.stopPropagation()}>
                                                <Icon name="upload" size={14} />
                                                <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => attachPdf(f.id, e.target.files[0])} />
                                              </label>
                                            )
                                          )}
                                          {isTranscript && (
                                            <button className="cd-ic" title="Supprimer ce transcript" onClick={() => removeTranscript(f.id)} style={{ color: 'var(--accent-2)' }}><Icon name="trash" size={14} /></button>
                                          )}
                                          {!isTranscript && (
                                            <button className="cd-ic" title="Réviser" onClick={() => { if (isSchema) { ctx.startAnatQuiz(f, { mode: 'total' }); } else { ctx.setFocusFiche(f.id); ctx.startSession(db.questions.filter((x) => x.ficheId === f.id && x.type !== 'feynman'), f.titre); } }}><Icon name="play" size={14} /></button>
                                          )}
                                        </div>
                                      </div>
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
        </div>

        <div className="lib-detail">
          {!selected ? (
            <div className="lib-detail-empty">
              <Icon name="book" size={28} />
              <div style={{ fontWeight: 600, marginTop: 10 }}>Aucun document sélectionné</div>
              <div className="hint" style={{ marginTop: 6 }}>Clique une fiche avec PDF, schéma ou transcript pour l'ouvrir ici.</div>
            </div>
          ) : selected.kind === 'fiche' ? (
            <PdfReader key={selected.ficheId + ':' + (selected.mode || '')} ctx={ctx} ficheId={selected.ficheId} mode={selected.mode} embedded onClose={() => setSelected(null)} />
          ) : selected.kind === 'schema' ? (
            <SchemaEditorScreen key={selected.ficheId} ctx={ctx} ficheId={selected.ficheId} embedded onClose={() => setSelected(null)} />
          ) : selected.kind === 'transcript' ? (
            <TranscriptEditor key={selected.ficheId} ctx={ctx} ficheId={selected.ficheId} onClose={() => setSelected(null)} />
          ) : null}
        </div>
      </div>
    </div>
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
