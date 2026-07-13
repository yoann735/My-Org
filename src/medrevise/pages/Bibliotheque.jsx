/* ============================================================
   MedRevise — Bibliothèque : Cours → Matière → Fiche (rien déplié
   par défaut). Badges, PDF source, réviser, recherche transversale,
   suppression de question.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop, matiereMeta, FicheDndProvider, DraggableFiche, DropSlot } from '../components/ui.jsx';
import { index } from '../lib/planning.js';
import { putBlob } from '../lib/storage.js';

export function Bibliotheque({ ctx }) {
  const { db } = ctx;
  const ix = useMemo(() => index(db), [db]);
  const [open, setOpen] = useState({});
  const [openFiche, setOpenFiche] = useState({});
  const [q, setQ] = useState('');
  const [renaming, setRenaming] = useState(null); // { type, id }
  const [draft, setDraft] = useState('');
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

  // B1/B2 : ouvre le lecteur PDF interne (mode édition, pour surligner) ; attache
  // un PDF pour une fiche qui n'en a pas encore (upload → Blob IndexedDB).
  const openPdf = (ficheId) => ctx.openPdfReader(ficheId, 'edit', 'library');
  const attachPdf = async (ficheId, file) => {
    if (!file) return;
    const pdfId = await putBlob(file);
    await ctx.setFichePdf(ficheId, pdfId);
    ctx.openPdfReader(ficheId, 'edit', 'library');
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
          <div className="sub">Tous tes cours, fiches et questions. Recherche transversale.</div>
        </div>
        <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
      </div>

      <div className="search" style={{ marginBottom: 16, maxWidth: 520 }}>
        <Icon name="search" size={16} className="ic" />
        <input placeholder="Rechercher une notion (ex : lactate, nerf radial…)" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button className="icon-btn sm" onClick={() => setQ('')}><Icon name="x" size={14} /></button>}
      </div>

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
                            return (
                              <div key={f.id}>
                                <DropSlot matiereId={mat.id} beforeId={f.id} />
                                <DraggableFiche id={f.id} disabled={isRen('fiche', f.id)} className="lib-fiche"
                                  style={{ border: '1px solid var(--border-2)', borderRadius: 12, padding: '11px 13px' }}>
                                  <div className="row spread">
                                    {isRen('fiche', f.id) ? (
                                      <div style={{ flex: 1, minWidth: 0 }}><RenameInput /></div>
                                    ) : (
                                      <div role="button" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', flex: 1, minWidth: 0 }}
                                        onClick={() => setOpenFiche((o) => ({ ...o, [f.id]: !fo }))}
                                        onDoubleClick={(e) => { e.stopPropagation(); startRename('fiche', f.id, f.titre); }} title="Clic = ouvrir · double-clic = renommer">
                                        <Icon name={fo ? 'chevD' : 'chevR'} size={14} style={{ color: 'var(--text-3)' }} />
                                        <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.titre}</span>
                                      </div>
                                    )}
                                    <div className="row" style={{ gap: 6 }}>
                                      {isSchema ? (
                                        <span className="pill" style={{ height: 22, fontSize: 10.5 }}><Icon name="image" size={11} /> SCHÉMA · {(f.coches || []).length} coche{(f.coches || []).length > 1 ? 's' : ''}</span>
                                      ) : (
                                        <>
                                          <span className="pill accent" style={{ height: 22, fontSize: 10.5 }}>{count(f.id, 'qcm')} QCM</span>
                                          <span className="pill amber" style={{ height: 22, fontSize: 10.5 }}>{count(f.id, 'flashcard')} flash</span>
                                          {isAnat && <span className="pill" style={{ height: 22, fontSize: 10.5 }}><Icon name="image" size={11} /> IMAGES</span>}
                                        </>
                                      )}
                                      {f.pdfId ? (
                                        <button className="cd-ic" title="Ouvrir le PDF (lecture / surlignage)" onClick={() => openPdf(f.id)}><Icon name="filePdf" size={14} /></button>
                                      ) : (
                                        <label className="cd-ic" title="Attacher un PDF" style={{ cursor: 'pointer' }} onClick={(e) => e.stopPropagation()}>
                                          <Icon name="upload" size={14} />
                                          <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => attachPdf(f.id, e.target.files[0])} />
                                        </label>
                                      )}
                                      <button className="cd-ic" title="Réviser" onClick={() => { ctx.setFocusFiche(f.id); ctx.startSession(db.questions.filter((x) => x.ficheId === f.id && x.type !== 'feynman'), f.titre); }}><Icon name="play" size={14} /></button>
                                    </div>
                                  </div>
                                  {fo && (
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
  );
}
