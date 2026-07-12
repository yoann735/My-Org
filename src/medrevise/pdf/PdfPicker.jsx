/* ============================================================
   MedRevise — B1 : onglet "PDF" dédié. Sélecteur Cours → Matière →
   Fiche (cohérent avec la hiérarchie de l'app), qui n'affiche que les
   fiches auxquelles un PDF est rattaché. Sélection → ouverture du
   PdfReader (écran 'pdf').
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop, matiereMeta } from '../components/ui.jsx';

export function PdfPicker({ ctx }) {
  const { db } = ctx;
  const [open, setOpen] = useState({});
  const [openMat, setOpenMat] = useState({});

  const matieresOf = (sid) => db.matieres.filter((m) => m.sourceId === sid && !m.archive);
  const fichesWithPdf = (mid) => db.fiches.filter((f) => f.matiereId === mid && !f.archive && f.pdfId);
  const sources = db.sources.filter((s) => !s.archive).filter((s) => matieresOf(s.id).some((m) => fichesWithPdf(m.id).length > 0));

  const openReader = (ficheId) => ctx.openPdfReader(ficheId, 'read', 'pdflist');

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div>
          <h1 className="serif">PDF</h1>
          <div className="sub">Cours → matière → fiche : choisis un PDF à consulter ou annoter.</div>
        </div>
        <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
      </div>

      {sources.length === 0 ? (
        <div className="card"><div className="card-body">
          <div className="hint"><Icon name="info" size={13} /> Aucun PDF rattaché pour l'instant. Attache un PDF à une fiche depuis la Bibliothèque.</div>
        </div></div>
      ) : (
        <div className="lib-tree" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sources.map((src) => {
            const mats = matieresOf(src.id).filter((m) => fichesWithPdf(m.id).length > 0);
            const openS = !!open[src.id];
            return (
              <div className="card" key={src.id}>
                <div className="card-head" style={{ cursor: 'pointer', color: 'var(--text)' }} onClick={() => setOpen((o) => ({ ...o, [src.id]: !openS }))}>
                  <Icon name={openS ? 'chevD' : 'chevR'} size={16} className="ic" />
                  <span className="tsrc-ic" style={{ background: `color-mix(in srgb, ${src.tint || '#7C6FE0'} 16%, transparent)`, color: src.tint || '#7C6FE0' }}><Icon name={src.icon || 'folder'} size={14} /></span>
                  <h3 style={{ color: 'var(--text)' }}>{src.nom}</h3>
                  <div className="right"><span className="hint">{mats.length} matière{mats.length > 1 ? 's' : ''}</span></div>
                </div>
                {openS && (
                  <div className="card-body" style={{ paddingTop: 0 }}>
                    {mats.map((mat) => {
                      const mm = matiereMeta(mat);
                      const fiches = fichesWithPdf(mat.id);
                      const openM = !!openMat[mat.id];
                      return (
                        <div key={mat.id} style={{ marginTop: 14 }}>
                          <div className="cat-badge" style={{ background: `color-mix(in srgb, ${mm.tint} 14%, transparent)`, color: mm.tint, borderColor: `color-mix(in srgb, ${mm.tint} 30%, transparent)`, marginBottom: 8, cursor: 'pointer' }}
                            onClick={() => setOpenMat((o) => ({ ...o, [mat.id]: !openM }))}>
                            <Icon name={openM ? 'chevD' : 'chevR'} size={11} /> <Icon name={mm.icon} size={12} /> {mm.label} <span style={{ marginLeft: 4, opacity: .75 }}>({fiches.length})</span>
                          </div>
                          {openM && fiches.map((f) => (
                            <button key={f.id} className="pdfpick-row" onClick={() => openReader(f.id)}>
                              <Icon name="filePdf" size={15} />
                              <span className="pdfpick-name">{f.titre}</span>
                              <Icon name="chevR" size={14} className="pdfpick-go" />
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
