/* ============================================================
   MedRevise — IMPORT « MODE APPRENTISSAGE » : un lot d'exos (JSON du prompt
   d'apprentissage) + le PDF du cours → une unité (lib/apprentissage.js).

   Composant À PART des imports Standard / Anatomie / Rattrapage : il n'en modifie
   aucun. Même flux et mêmes briques visuelles (ImportJsonField, ImportPreviewCard —
   sans le champ J0 : ces exos ne sont jamais planifiés) : formulaire → aperçu →
   confirmer. Le PDF est OBLIGATOIRE (c'est la moitié de l'unité), au choix :
   - un fichier joint (putBlob → outbox des blobs, synchronisé) ;
   - le PDF d'une fiche existante (même blob, rien n'est dupliqué, surlignages communs).
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { matiereMeta } from './ui.jsx';
import { ImportJsonField, ImportPreviewCard } from './ImportFlow.jsx';
import { putBlob } from '../lib/storage.js';
import { titreFromFilename } from '../lib/fileTitre.js';
import { parseApprentissageJson, createUnite } from '../lib/apprentissage.js';

const estPdf = (f) => !!f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));

export function ImportApprentissage({ ctx, onDone, onCancel }) {
  const { db } = ctx;
  const [state, setState] = useState('form'); // form | preview
  const [titre, setTitre] = useState('');
  const [matiereId, setMatiereId] = useState('');
  const [source, setSource] = useState('fichier'); // fichier | fiche
  const [fichier, setFichier] = useState(null);
  const [ficheId, setFicheId] = useState('');
  const [over, setOver] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [parseError, setParseError] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);

  const nomSource = (sid) => (db.sources.find((s) => s.id === sid) || {}).nom || '';
  const matieres = useMemo(() => db.matieres.filter((m) => !m.archive), [db.matieres]);
  const fichesPdf = useMemo(() => db.fiches.filter((f) => f.pdfId && !f.archive)
    .map((f) => {
      const m = db.matieres.find((x) => x.id === f.matiereId);
      return { f, label: [m && nomSource(m.sourceId), m && m.nom, f.titre].filter(Boolean).join(' / ') };
    })
    .sort((a, b) => a.label.localeCompare(b.label)), [db.fiches, db.matieres, db.sources]); // eslint-disable-line react-hooks/exhaustive-deps
  const fiche = source === 'fiche' ? db.fiches.find((f) => f.id === ficheId) : null;

  const choisirFichier = (f) => {
    if (!estPdf(f)) { setParseError('Le cours doit être un PDF.'); return; }
    setParseError(null);
    setFichier(f);
    if (!titre.trim()) setTitre(titreFromFilename(f.name));
  };
  const choisirFiche = (id) => {
    setFicheId(id);
    const f = db.fiches.find((x) => x.id === id);
    if (f) {
      if (!titre.trim()) setTitre(f.titre);
      if (!matiereId) setMatiereId(f.matiereId || '');
    }
  };

  const pdfPret = source === 'fichier' ? !!fichier : !!fiche;
  const manque = [!titre.trim() && 'un titre', !pdfPret && 'le PDF du cours', !jsonText.trim() && 'le JSON des exos'].filter(Boolean);

  const analyser = () => {
    const res = parseApprentissageJson(jsonText);
    if (!res.ok) { setParseError(res.error); return; }
    setParseError(null); setParsed(res); setState('preview');
  };

  const confirmer = async () => {
    if (!parsed || busy) return;
    setBusy(true);
    try {
      let pdfId, pdfName;
      if (source === 'fichier') { pdfId = await putBlob(fichier); pdfName = fichier.name; }
      else { pdfId = fiche.pdfId; pdfName = fiche.pdfName || fiche.titre; }
      const unite = await createUnite({
        titre, matiereId: matiereId || null, pdfId, pdfName,
        ficheId: source === 'fiche' ? fiche.id : null,
        items: parsed.items, meta: parsed.meta,
      });
      await ctx.reload();
      onDone && onDone(unite);
    } finally {
      setBusy(false);
    }
  };

  if (state === 'preview' && parsed) {
    const mat = matieres.find((m) => m.id === matiereId);
    return (
      <ImportPreviewCard counts={parsed.counts} errors={parsed.errors}
        destLabel={`unité d'apprentissage — ${titre.trim()}${mat ? ` (${mat.nom})` : ''}`}
        infoLines={[
          { text: <>PDF du cours : {source === 'fichier' ? fichier.name : `${fiche.pdfName || fiche.titre} (repris de la fiche « ${fiche.titre} »)`} ✓</> },
          { text: 'Exos affichés dans l’ordre du JSON · aucune planification, aucun suivi.' },
        ]}
        onBack={() => setState('form')} onConfirm={confirmer} busy={busy} />
    );
  }

  return (
    <div className="fadein imp-dest">
      <div className="imp-dest-head"><Icon name="brain" size={15} /> Nouvelle unité d'apprentissage</div>

      <div className="imp-field">
        <label>Titre de l'unité</label>
        <input className="imp-title" placeholder="ex : Maths de base — les nombres et les opérations" value={titre} onChange={(e) => setTitre(e.target.value)} />
      </div>

      <div className="imp-field">
        <label>Matière <span className="imp-opt">(optionnel — pour la couleur)</span></label>
        <div className="imp-chips">
          <button type="button" className={'imp-chip' + (!matiereId ? ' on' : '')} onClick={() => setMatiereId('')}>Aucune</button>
          {matieres.map((m) => { const mm = matiereMeta(m); return (
            <button type="button" key={m.id} className={'imp-chip' + (matiereId === m.id ? ' on' : '')} onClick={() => setMatiereId(m.id)} title={nomSource(m.sourceId)}>
              <span className="imp-dot" style={{ background: mm.tint }} />{mm.label}
            </button>
          ); })}
        </div>
      </div>

      <div className="imp-field">
        <label>PDF du cours</label>
        <div className="seg" style={{ transform: 'scale(.96)', transformOrigin: 'left center', marginBottom: 8 }}>
          <button type="button" className={'seg-btn' + (source === 'fichier' ? ' active' : '')} onClick={() => setSource('fichier')}><Icon name="upload" size={13} /> Joindre un PDF</button>
          <button type="button" className={'seg-btn' + (source === 'fiche' ? ' active' : '')} onClick={() => setSource('fiche')} disabled={!fichesPdf.length}><Icon name="filePdf" size={13} /> PDF d'une fiche existante</button>
        </div>
        {source === 'fichier' ? (
          fichier ? (
            <div className="row spread" style={{ gap: 10, padding: '10px 12px', border: '1px solid var(--border-2)', borderRadius: 10, background: 'var(--bg-2)' }}>
              <div className="row" style={{ gap: 8, minWidth: 0, alignItems: 'center' }}>
                <Icon name="filePdf" size={16} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fichier.name}</span>
              </div>
              <button type="button" className="btn ghost sm" onClick={() => setFichier(null)}><Icon name="x" size={13} /> Retirer</button>
            </div>
          ) : (
            <label className={'imp-drop' + (over ? ' over' : '')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '18px 12px', border: '1.5px dashed var(--border)', borderRadius: 10, cursor: 'pointer', background: over ? 'var(--accent-soft)' : 'transparent' }}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); choisirFichier(e.dataTransfer.files && e.dataTransfer.files[0]); }}>
              <Icon name="upload" size={15} /> Glisse le PDF ici ou clique pour le choisir
              <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => choisirFichier(e.target.files[0])} />
            </label>
          )
        ) : (
          <select className="imp-title" value={ficheId} onChange={(e) => choisirFiche(e.target.value)} style={{ width: '100%' }}>
            <option value="">— Choisir une fiche qui a un PDF —</option>
            {fichesPdf.map(({ f, label }) => <option key={f.id} value={f.id}>{label}</option>)}
          </select>
        )}
        <div className="hint" style={{ marginTop: 6 }}>
          {source === 'fichier'
            ? 'Stocké sur cet appareil et envoyé au cloud comme les autres PDF.'
            : 'Même fichier que la fiche (rien n’est dupliqué) — ses surlignages s’affichent aussi dans l’unité.'}
        </div>
      </div>

      <ImportJsonField label="EXOS D'APPRENTISSAGE (JSON)" placeholder="Colle ici la réponse JSON du prompt d'apprentissage (qcm + exercice, schéma v1.1)."
        value={jsonText} onChange={(v) => { setJsonText(v); setParseError(null); }} error={parseError} />

      <div className="imp-actions">
        <button className="btn ghost" onClick={onCancel}>Annuler</button>
        <button className="btn primary" onClick={analyser} disabled={manque.length > 0}><Icon name="check" size={15} /> Vérifier les exos</button>
      </div>
      {manque.length > 0 && <div className="hint" style={{ marginTop: 8 }}>Il manque : {manque.join(', ')}.</div>}
    </div>
  );
}
