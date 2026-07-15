/* ============================================================
   MedRevise — onglet « Documents » : liste unifiée des 3 modes
   (Fiche PDF · Schéma d'anatomie · Transcript) + création de transcript
   (coller → nettoyage réversible proposé → éditeur). Remplace l'ancien
   sélecteur PDF. Ouvre chaque document dans le bon mode.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop, matiereMeta, DestPicker } from '../components/ui.jsx';
import { listDocuments, docKind, DOC_META, createTranscript, deleteTranscript } from './lib/documents.js';
import { cleanTranscript, textToDoc } from './lib/transcript.js';

export function DocumentsHome({ ctx }) {
  const { db } = ctx;
  const [open, setOpen] = useState({});
  const [creating, setCreating] = useState(false);

  const docs = useMemo(() => listDocuments(db), [db]);
  const srcById = useMemo(() => Object.fromEntries(db.sources.map((s) => [s.id, s])), [db.sources]);
  const matById = useMemo(() => Object.fromEntries(db.matieres.map((m) => [m.id, m])), [db.matieres]);

  // regroupe par cours → matière
  const bySource = useMemo(() => {
    const map = {};
    docs.forEach((f) => {
      const m = matById[f.matiereId]; const s = m && srcById[m.sourceId];
      if (!s || s.archive || (m && m.archive)) return;
      (map[s.id] || (map[s.id] = { source: s, mats: {} }));
      (map[s.id].mats[m.id] || (map[s.id].mats[m.id] = { matiere: m, docs: [] })).docs.push(f);
    });
    return map;
  }, [docs, matById, srcById]);

  const openDoc = (f) => {
    const kind = docKind(f);
    if (kind === 'fiche') ctx.openPdfReader(f.id, 'read', 'documents');
    else if (kind === 'transcript') ctx.openTranscript(f.id);
    else if (kind === 'schema') ctx.openSchemaEditor(f.id, 'documents');
  };

  const removeTranscript = async (f) => {
    await deleteTranscript(f.id);
    await ctx.reload();
  };

  const sources = Object.values(bySource);

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div>
          <h1 className="serif">Documents</h1>
          <div className="sub">Fiches PDF, schémas d'anatomie et transcripts — au même endroit.</div>
        </div>
        <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
      </div>

      <div className="row spread" style={{ marginBottom: 14 }}>
        <span className="hint">{docs.length} document{docs.length > 1 ? 's' : ''}</span>
        <button className="btn primary sm" onClick={() => setCreating((v) => !v)}>
          <Icon name={creating ? 'x' : 'plus'} size={14} /> {creating ? 'Fermer' : 'Nouveau transcript'}
        </button>
      </div>

      {creating && <NewTranscript ctx={ctx} onDone={() => setCreating(false)} />}

      {sources.length === 0 && !creating && (
        <div className="card"><div className="card-body" style={{ textAlign: 'center', padding: '28px 20px' }}>
          <Icon name="book" size={28} />
          <div style={{ fontWeight: 600, marginTop: 10 }}>Aucun document</div>
          <div className="hint" style={{ marginTop: 6 }}>Importe un PDF (Accueil › Importer), colle une image d'anatomie, ou colle un transcript ci-dessus.</div>
        </div></div>
      )}

      <div className="lib-tree" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sources.map(({ source, mats }) => {
          const matList = Object.values(mats);
          const openS = !!open[source.id];
          return (
            <div className="card" key={source.id}>
              <div className="card-head" style={{ cursor: 'pointer', color: 'var(--text)' }} onClick={() => setOpen((o) => ({ ...o, [source.id]: !openS }))}>
                <Icon name={openS ? 'chevD' : 'chevR'} size={16} className="ic" />
                <span className="tsrc-ic" style={{ background: `color-mix(in srgb, ${source.tint || '#7C6FE0'} 16%, transparent)`, color: source.tint || '#7C6FE0' }}><Icon name={source.icon || 'folder'} size={14} /></span>
                <h3 style={{ color: 'var(--text)' }}>{source.nom}</h3>
                <div className="right"><span className="hint">{matList.reduce((n, m) => n + m.docs.length, 0)} doc.</span></div>
              </div>
              {openS && (
                <div className="card-body" style={{ paddingTop: 0 }}>
                  {matList.map(({ matiere, docs: mdocs }) => {
                    const mm = matiereMeta(matiere);
                    return (
                      <div key={matiere.id} style={{ marginTop: 14 }}>
                        <div className="cat-badge" style={{ background: `color-mix(in srgb, ${mm.tint} 14%, transparent)`, color: mm.tint, borderColor: `color-mix(in srgb, ${mm.tint} 30%, transparent)`, marginBottom: 8 }}>
                          <Icon name={mm.icon} size={12} /> {mm.label} <span style={{ marginLeft: 4, opacity: .75 }}>({mdocs.length})</span>
                        </div>
                        {mdocs.map((f) => {
                          const kind = docKind(f);
                          const meta = DOC_META[kind];
                          return (
                            <div key={f.id} className="pdfpick-row" style={{ cursor: 'default' }}>
                              <Icon name={meta.icon} size={15} />
                              <span className="pdfpick-name" style={{ flex: 1 }}>{f.titre}</span>
                              <span className="pill" style={{ height: 22, fontSize: 11 }}>{meta.label}</span>
                              <button className="btn ghost sm" onClick={() => openDoc(f)}>
                                <Icon name="chevR" size={13} /> Ouvrir
                              </button>
                              {kind === 'transcript' && (
                                <button className="icon-btn sm" title="Supprimer ce transcript" onClick={() => removeTranscript(f)}><Icon name="trash" size={13} /></button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* création d'un transcript : destination + titre + collage + APERÇU nettoyage réversible */
function NewTranscript({ ctx, onDone }) {
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
    ctx.openTranscript(fiche.id);
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
