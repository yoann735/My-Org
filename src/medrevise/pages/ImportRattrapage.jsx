/* ============================================================
   MedRevise — mode d'import RATTRAPAGE (Bio/Chimie/Physique/Maths).
   Un cours vidéo = 2 JSON v1.0 collés SÉPARÉMENT (Théorie: qcm/flashcard/
   feynman · Pratique: exercice), qui alimentent LA MÊME FICHE :
     - créer une nouvelle fiche (cours + matière + titre, obligatoires), ou
     - ajouter à une fiche existante (append, dédoublonnage sur item.id).
   Réutilise le validateur v1.0 (parsePastedJson), le DestPicker et le
   pattern d'aperçu existants. AUCUN appel API / IA.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { DestPicker, CoursePdfField } from '../components/ui.jsx';
import { ImportJsonField, ImportPreviewCard, ImportDoneScreen } from '../components/ImportFlow.jsx';
import { parsePastedJson } from '../lib/parsePastedJson.js';
import { createFicheFromQuestions, appendItemsToFiche } from '../lib/import.js';
import { putBlob } from '../lib/storage.js';

const SUBJECTS = [
  { id: 'Biologie', label: 'Biologie', icon: 'lungs' },
  { id: 'Chimie', label: 'Chimie', icon: 'sparkle' },
  { id: 'Physique', label: 'Physique', icon: 'target' },
  { id: 'Mathematiques', label: 'Mathématiques', icon: 'grad' },
];
const subjectLabel = (id) => (SUBJECTS.find((s) => s.id === id) || {}).label || id;

export function ImportRattrapage({ ctx }) {
  const { db } = ctx;
  const sources = db.sources.filter((s) => !s.archive);
  const matieresFor = (sid) => db.matieres.filter((m) => m.sourceId === sid && !m.archive);

  const [matiere, setMatiere] = useState(null);          // meta.matiere (sujet)
  const [kind, setKind] = useState('theorie');           // theorie | pratique (informatif + avertissement)
  const [destMode, setDestMode] = useState('new');       // new | existing
  const [srcId, setSrcId] = useState(() => (sources[0] || {}).id);
  const [matId, setMatId] = useState(() => (matieresFor((sources[0] || {}).id)[0] || {}).id || null);
  const [title, setTitle] = useState('');
  const [ficheId, setFicheId] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [parseError, setParseError] = useState(null);
  const [preview, setPreview] = useState(null);          // { res, exos, numeriques, ouverts, theoryCount, duplicates, warnings }
  const [state, setState] = useState('edit');            // edit | preview | done
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState(null);                  // PDF du cours (optionnel) à rattacher
  const [replaceMode, setReplaceMode] = useState('keep'); // keep | replace (fiche existante ayant déjà un PDF)
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);

  // fiches candidates pour l'ajout (fiches v1.0 "standard", non archivées)
  const srcById = useMemo(() => Object.fromEntries(db.sources.map((s) => [s.id, s])), [db.sources]);
  const matById = useMemo(() => Object.fromEntries(db.matieres.map((m) => [m.id, m])), [db.matieres]);
  const existingFiches = useMemo(
    () => db.fiches.filter((f) => f.type === 'standard' && !f.archive),
    [db.fiches],
  );
  const ficheLabel = (f) => {
    const m = matById[f.matiereId]; const s = m && srcById[m.sourceId];
    return `${s ? s.nom : '?'} › ${m ? m.nom : '?'} › ${f.titre}`;
  };

  const srcLabel = (db.sources.find((s) => s.id === srcId) || {}).nom || '—';
  const matLabel = (db.matieres.find((m) => m.id === matId) || {}).nom || '—';
  const destLabel = destMode === 'new'
    ? `${srcLabel} / ${matLabel} / ${title.trim() || 'Fiche de rattrapage'}`
    : ((existingFiches.find((f) => f.id === ficheId) && ficheLabel(existingFiches.find((f) => f.id === ficheId))) || '—');

  const missing = destMode === 'new'
    ? [!srcId && 'un cours', !matId && 'une matière', !title.trim() && 'un titre'].filter(Boolean)
    : [!ficheId && 'une fiche existante'].filter(Boolean);
  const canPreview = !!matiere && missing.length === 0 && !!jsonText.trim();

  // fiche ciblée en mode ajout + son état PDF (pour ne jamais écraser silencieusement)
  const targetFiche = destMode === 'existing' ? existingFiches.find((f) => f.id === ficheId) : null;
  const targetHasPdf = !!(targetFiche && targetFiche.pdfId);
  // le PDF choisi sera-t-il effectivement rattaché ?
  const willAttachPdf = !!pdf && (
    destMode === 'new'
    || (destMode === 'existing' && !targetHasPdf)
    || (destMode === 'existing' && targetHasPdf && replaceMode === 'replace' && replaceConfirmed)
  );

  const reset = () => {
    setJsonText(''); setParseError(null); setPreview(null); setState('edit'); setResult(null);
    setPdf(null); setReplaceMode('keep'); setReplaceConfirmed(false);
  };

  const doPreview = () => {
    const res = parsePastedJson(jsonText);
    if (!res.ok) { setParseError(res.error); return; }
    if (!res.items.length) { setParseError('Aucun item valide trouvé — vérifie que tu as bien collé toute la réponse.'); return; }

    const exos = res.items.filter((i) => i.type === 'exercice');
    const numeriques = exos.filter((e) => e.sous_type === 'numerique').length;
    const ouverts = exos.filter((e) => e.sous_type === 'ouvert').length;
    const theoryCount = res.counts.qcm + res.counts.flashcard + res.counts.feynman;

    // doublons (uniquement si ajout à une fiche existante) — calculé depuis ctx.db
    let duplicates = 0;
    if (destMode === 'existing' && ficheId) {
      const existingSrc = new Set(db.questions.filter((q) => q.ficheId === ficheId).map((q) => q.srcId).filter(Boolean));
      duplicates = res.items.filter((it) => it.id && existingSrc.has(it.id)).length;
    }

    // avertissements non bloquants
    const warnings = [];
    if (res.meta && res.meta.matiere && res.meta.matiere !== matiere) {
      warnings.push(`Le JSON annonce « ${subjectLabel(res.meta.matiere)} » mais tu as sélectionné « ${subjectLabel(matiere)} ».`);
    }
    if (kind === 'theorie' && theoryCount === 0 && exos.length > 0) {
      warnings.push('Tu as choisi « Théorie » mais le JSON ne contient que des exercices.');
    }
    if (kind === 'pratique' && exos.length === 0 && theoryCount > 0) {
      warnings.push('Tu as choisi « Pratique » mais le JSON ne contient aucun exercice.');
    }

    setParseError(null);
    setPreview({ res, exos: exos.length, numeriques, ouverts, theoryCount, duplicates, warnings });
    setState('preview');
  };

  const confirmImport = async () => {
    if (!preview) return;
    setBusy(true);
    // PDF du cours (optionnel) — stocké une seule fois, réutilise putBlob → fiche.pdfId.
    let pdfId = null;
    if (willAttachPdf) { try { pdfId = await putBlob(pdf); } catch (e) { /* ignore */ } }
    let res;
    if (destMode === 'new') {
      res = await createFicheFromQuestions({
        matiereId: matId, titre: title, items: preview.res.items,
        synthese: preview.res.synthese, meta: { ...preview.res.meta, matiere },
        pdfId, pdfName: pdfId ? pdf.name : null,
      });
      res = { fiche: res.fiche, count: res.count, duplicates: 0 };
    } else {
      res = await appendItemsToFiche({ ficheId, items: preview.res.items });
      // rattache le PDF si demandé — jamais d'écrasement silencieux (voir willAttachPdf).
      if (pdfId) await ctx.setFichePdf(ficheId, pdfId, pdf.name);
    }
    await ctx.reload();
    setResult(res); setState('done'); setBusy(false);
  };

  /* ---------- 1. choix de la matière (sujet) ---------- */
  if (!matiere) {
    return (
      <div className="fadein">
        <div className="imp-field">
          <label>Matière du cours de rattrapage</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 6 }}>
            {SUBJECTS.map((s) => (
              <button key={s.id} className="rev-mode" style={{ padding: '16px 12px' }} onClick={() => setMatiere(s.id)}>
                <div className="rm-ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name={s.icon} size={20} /></div>
                <div className="rm-l" style={{ marginTop: 6 }}>{s.label}</div>
              </button>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 10 }}>Théorie et Pratique d'un même cours se collent séparément mais alimentent la même fiche.</div>
        </div>
      </div>
    );
  }

  /* ---------- 4. écran final ---------- */
  if (state === 'done' && result) {
    return (
      <ImportDoneScreen
        title={destMode === 'new' ? 'Fiche prête !' : 'Items ajoutés !'}
        message={<>
          ✓ {result.count} item{result.count > 1 ? 's' : ''} {destMode === 'new' ? 'importé' + (result.count > 1 ? 's' : '') : 'ajouté' + (result.count > 1 ? 's' : '')}
          {result.duplicates > 0 && ` · ${result.duplicates} doublon${result.duplicates > 1 ? 's' : ''} ignoré${result.duplicates > 1 ? 's' : ''}`}.
        </>}
        resetLabel="Coller un autre JSON" onReset={reset} ctx={ctx} ficheId={result.fiche.id} />
    );
  }

  /* ---------- 3. aperçu avant confirmation ---------- */
  if (state === 'preview' && preview) {
    const c = preview.res.counts;
    return (
      <ImportPreviewCard counts={c} destLabel={(destMode === 'new' ? 'nouvelle fiche — ' : 'ajout à — ') + destLabel}
        infoLines={[
          preview.exos > 0 && { text: <>{preview.exos} exercice{preview.exos > 1 ? 's' : ''} (dont {preview.numeriques} numérique{preview.numeriques > 1 ? 's' : ''}, {preview.ouverts} ouvert{preview.ouverts > 1 ? 's' : ''}).</> },
          {
            text: willAttachPdf
              ? (targetHasPdf ? <>PDF du cours : remplacé par {pdf.name} ✓</> : <>PDF du cours joint : {pdf.name} ✓</>)
              : (pdf && targetHasPdf && replaceMode === 'replace')
                ? <>Remplacement non confirmé — le PDF actuel sera conservé.</>
                : targetHasPdf
                  ? <>PDF du cours conservé : {targetFiche.pdfName || 'PDF déjà rattaché'}.</>
                  : 'Aucun PDF du cours joint.',
            icon: (pdf && targetHasPdf && replaceMode === 'replace') ? 'alert' : undefined,
            accent: (pdf && targetHasPdf && replaceMode === 'replace'),
          },
          preview.duplicates > 0 && { text: `${preview.duplicates} doublon${preview.duplicates > 1 ? 's' : ''} ignoré${preview.duplicates > 1 ? 's' : ''} (déjà dans la fiche)`, icon: 'alert', accent: true },
        ]}
        warnings={preview.warnings}
        onBack={() => setState('edit')} onConfirm={confirmImport} busy={busy} />
    );
  }

  /* ---------- 2. formulaire : type de contenu + destination + collage ---------- */
  return (
    <div className="fadein imp-dest">
      <div className="row spread" style={{ marginBottom: 12 }}>
        <span className="pill accent" style={{ height: 26 }}><Icon name="grad" size={13} /> {subjectLabel(matiere)}</span>
        <button type="button" className="linklike" onClick={() => { setMatiere(null); reset(); }}>Changer de matière</button>
      </div>

      <div className="imp-field">
        <label>Type de contenu collé</label>
        <div className="seg" style={{ transform: 'scale(.96)', transformOrigin: 'left center' }}>
          <button type="button" className={'seg-btn' + (kind === 'theorie' ? ' active' : '')} onClick={() => setKind('theorie')}><Icon name="lightbulb" size={13} /> Théorie</button>
          <button type="button" className={'seg-btn' + (kind === 'pratique' ? ' active' : '')} onClick={() => setKind('pratique')}><Icon name="target" size={13} /> Pratique</button>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          {kind === 'theorie' ? 'JSON de QCM / flashcards / Feynman.' : 'JSON d\'exercices (numériques et ouverts).'}
        </div>
      </div>

      <div className="imp-field">
        <label>Destination</label>
        <div className="seg" style={{ transform: 'scale(.96)', transformOrigin: 'left center' }}>
          <button type="button" className={'seg-btn' + (destMode === 'new' ? ' active' : '')} onClick={() => setDestMode('new')}><Icon name="upload" size={13} /> Nouvelle fiche</button>
          <button type="button" className={'seg-btn' + (destMode === 'existing' ? ' active' : '')} onClick={() => setDestMode('existing')} disabled={!existingFiches.length}><Icon name="book" size={13} /> Fiche existante</button>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          {destMode === 'new' ? 'Crée la fiche (colle la Théorie en premier, en général).' : 'Ajoute à une fiche déjà créée (ex : coller la Pratique après la Théorie).'}
        </div>
      </div>

      {destMode === 'new' ? (
        <>
          <DestPicker ctx={ctx} srcId={srcId} setSrcId={setSrcId} matId={matId} setMatId={setMatId} />
          <div className="imp-field">
            <label>Titre de la fiche</label>
            <input className="imp-title" placeholder="ex : Chimie — Cinétique réactionnelle (cours 4)" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </>
      ) : (
        <div className="imp-field">
          <label>Fiche à compléter</label>
          <select className="imp-title" value={ficheId} onChange={(e) => setFicheId(e.target.value)} style={{ width: '100%' }}>
            <option value="">— choisir une fiche —</option>
            {existingFiches.map((f) => <option key={f.id} value={f.id}>{ficheLabel(f)}</option>)}
          </select>
          {!existingFiches.length && <div className="hint" style={{ marginTop: 6 }}>Aucune fiche existante — crée-en une d'abord.</div>}
        </div>
      )}

      {/* PDF du cours (optionnel) — alimente « Voir le cours » + surlignage */}
      {(destMode === 'new' || (destMode === 'existing' && ficheId)) && (
        !targetHasPdf ? (
          <CoursePdfField file={pdf} onFile={setPdf}
            hint="Rattaché à la fiche pour « Voir le cours » et le surlignage. Facultatif." />
        ) : (
          <div className="imp-field">
            <label>Document du cours (PDF)</label>
            <div className="err-mini ok" style={{ marginBottom: 8 }}>
              <div className="em-ic"><Icon name="filePdf" size={16} /></div>
              <div className="em-body" style={{ minWidth: 0 }}>
                <div className="em-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{targetFiche.pdfName || 'PDF déjà rattaché'}</div>
                <div className="hint">Cette fiche a déjà un PDF. Il est conservé par défaut.</div>
              </div>
            </div>
            <div className="seg" style={{ transform: 'scale(.96)', transformOrigin: 'left center' }}>
              <button type="button" className={'seg-btn' + (replaceMode === 'keep' ? ' active' : '')} onClick={() => { setReplaceMode('keep'); setPdf(null); setReplaceConfirmed(false); }}><Icon name="check" size={13} /> Conserver</button>
              <button type="button" className={'seg-btn' + (replaceMode === 'replace' ? ' active' : '')} onClick={() => setReplaceMode('replace')}><Icon name="refresh" size={13} /> Remplacer</button>
            </div>
            {replaceMode === 'replace' && (
              <div style={{ marginTop: 10 }}>
                <CoursePdfField file={pdf} onFile={setPdf} label="Nouveau PDF" />
                {pdf && (
                  <label className="row" style={{ gap: 8, alignItems: 'flex-start', marginTop: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={replaceConfirmed} onChange={(e) => setReplaceConfirmed(e.target.checked)} style={{ marginTop: 3 }} />
                    <span className="hint">Je confirme le remplacement du PDF actuel de cette fiche.</span>
                  </label>
                )}
              </div>
            )}
          </div>
        )
      )}

      <ImportJsonField label="RÉPONSE (JSON v1.0)" placeholder="Colle ici le JSON généré (Théorie ou Pratique)."
        value={jsonText} onChange={(v) => { setJsonText(v); setParseError(null); }} error={parseError} />

      <div className="imp-actions">
        <button className="btn primary" onClick={doPreview} disabled={!canPreview}><Icon name="check" size={15} /> Prévisualiser l'import</button>
      </div>
      {missing.length > 0 && <div className="hint" style={{ marginTop: 8 }}>Il manque : {missing.join(', ')}.</div>}
    </div>
  );
}
