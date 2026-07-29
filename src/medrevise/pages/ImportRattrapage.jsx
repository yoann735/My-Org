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
import { DestPicker, CourseDocField, detectDocKind } from '../components/ui.jsx';
import { ImportJsonField, ImportPreviewCard, ImportDoneScreen } from '../components/ImportFlow.jsx';
import { parsePastedJson } from '../lib/parsePastedJson.js';
import { createFicheFromQuestions, appendItemsToFiche, findMatchingFiche } from '../lib/import.js';
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
  const [doc, setDoc] = useState(null); // document du cours (optionnel, PDF OU HTML) à rattacher
  const [forceNew, setForceNew] = useState(false); // override : créer quand même une nouvelle fiche malgré le titre identique

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

  // fiche existante de même destination (même matière + même titre) — évite de
  // créer une fiche en double quand Théorie et Pratique d'un même cours sont
  // collées séparément (§2). Uniquement pertinent en mode "Nouvelle fiche" (le
  // mode "Fiche existante" désigne déjà explicitement sa cible).
  const matchedFiche = useMemo(
    () => (destMode === 'new' ? findMatchingFiche(db.fiches, { matiereId: matId, titre: title }) : null),
    [db.fiches, destMode, matId, title],
  );
  const willAppendToMatch = destMode === 'new' && !!matchedFiche && !forceNew;
  const effAppend = destMode === 'existing' || willAppendToMatch;
  const effFicheId = destMode === 'existing' ? ficheId : (willAppendToMatch ? matchedFiche.id : null);

  const srcLabel = (db.sources.find((s) => s.id === srcId) || {}).nom || '—';
  const matLabel = (db.matieres.find((m) => m.id === matId) || {}).nom || '—';
  const destLabel = willAppendToMatch
    ? `${ficheLabel(matchedFiche)} (fiche existante)`
    : destMode === 'new'
      ? `${srcLabel} / ${matLabel} / ${title.trim() || 'Fiche de rattrapage'}`
      : ((existingFiches.find((f) => f.id === ficheId) && ficheLabel(existingFiches.find((f) => f.id === ficheId))) || '—');

  const missing = destMode === 'new'
    ? [!srcId && 'un cours', !matId && 'une matière', !title.trim() && 'un titre'].filter(Boolean)
    : [!ficheId && 'une fiche existante'].filter(Boolean);
  const canPreview = !!matiere && missing.length === 0 && !!jsonText.trim();

  // fiche ciblée en mode ajout (existant explicite OU match auto détecté) + ses
  // documents déjà rattachés (pour ne jamais écraser silencieusement — affichés
  // en info, remplacés seulement si on attache un nouveau document du MÊME type).
  const targetFiche = effAppend ? (destMode === 'existing' ? existingFiches.find((f) => f.id === ficheId) : matchedFiche) : null;
  const targetHasPdf = !!(targetFiche && targetFiche.pdfId);
  const targetHasHtml = !!(targetFiche && targetFiche.htmlId);
  const docKind = detectDocKind(doc);

  const reset = () => {
    setJsonText(''); setParseError(null); setPreview(null); setState('edit'); setResult(null);
    setDoc(null); setForceNew(false);
  };

  const doPreview = () => {
    const res = parsePastedJson(jsonText);
    if (!res.ok) { setParseError(res.error); return; }
    if (!res.items.length) { setParseError('Aucun item valide trouvé — vérifie que tu as bien collé toute la réponse.'); return; }

    const exos = res.items.filter((i) => i.type === 'exercice');
    const numeriques = exos.filter((e) => e.sous_type === 'numerique').length;
    const ouverts = exos.filter((e) => e.sous_type === 'ouvert').length;
    const theoryCount = res.counts.qcm + res.counts.flashcard + res.counts.feynman;

    // doublons (uniquement si ajout à une fiche existante, explicite ou auto-détectée)
    let duplicates = 0;
    if (effAppend && effFicheId) {
      const existingSrc = new Set(db.questions.filter((q) => q.ficheId === effFicheId).map((q) => q.srcId).filter(Boolean));
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
    // document du cours (optionnel, PDF OU HTML) — stocké une seule fois, le
    // type détecté route vers fiche.pdfId ou fiche.htmlId ; l'autre type déjà
    // rattaché à une fiche existante n'est jamais touché.
    let pdfId = null, pdfName = null, htmlId = null, htmlName = null;
    if (doc) {
      try {
        const blobId = await putBlob(doc);
        if (docKind === 'html') { htmlId = blobId; htmlName = doc.name; } else { pdfId = blobId; pdfName = doc.name; }
      } catch (e) { /* ignore */ }
    }
    let res;
    if (effAppend) {
      const r = await appendItemsToFiche({ ficheId: effFicheId, items: preview.res.items });
      if (pdfId) await ctx.setFichePdf(effFicheId, pdfId, pdfName);
      if (htmlId) await ctx.setFicheHtml(effFicheId, htmlId, htmlName);
      res = { fiche: r.fiche, count: r.count, duplicates: r.duplicates, appended: true };
    } else {
      const r = await createFicheFromQuestions({
        matiereId: matId, titre: title, items: preview.res.items,
        synthese: preview.res.synthese, meta: { ...preview.res.meta, matiere },
        pdfId, pdfName, htmlId, htmlName,
      });
      res = { fiche: r.fiche, count: r.count, duplicates: 0, appended: false };
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
        title={result.appended ? 'Items ajoutés !' : 'Fiche prête !'}
        message={<>
          ✓ {result.count} item{result.count > 1 ? 's' : ''} {result.appended ? 'ajouté' + (result.count > 1 ? 's' : '') : 'importé' + (result.count > 1 ? 's' : '')}
          {result.duplicates > 0 && ` · ${result.duplicates} doublon${result.duplicates > 1 ? 's' : ''} ignoré${result.duplicates > 1 ? 's' : ''}`}.
        </>}
        resetLabel="Coller un autre JSON" onReset={reset} ctx={ctx} ficheId={result.fiche.id} />
    );
  }

  /* ---------- 3. aperçu avant confirmation ---------- */
  if (state === 'preview' && preview) {
    const c = preview.res.counts;
    return (
      <ImportPreviewCard counts={c} destLabel={(effAppend ? 'ajout à — ' : 'nouvelle fiche — ') + destLabel}
        infoLines={[
          preview.exos > 0 && { text: <>{preview.exos} exercice{preview.exos > 1 ? 's' : ''} (dont {preview.numeriques} numérique{preview.numeriques > 1 ? 's' : ''}, {preview.ouverts} ouvert{preview.ouverts > 1 ? 's' : ''}).</> },
          {
            text: doc
              ? <>{docKind === 'html' ? 'Fiche HTML' : 'PDF du cours'} {(docKind === 'html' ? targetHasHtml : targetHasPdf) ? 'remplacé(e) par' : 'joint(e)'} : {doc.name} ✓</>
              : (targetHasPdf || targetHasHtml)
                ? <>Document(s) du cours conservé(s) : {[targetHasPdf && (targetFiche.pdfName || 'PDF'), targetHasHtml && (targetFiche.htmlName || 'HTML')].filter(Boolean).join(' + ')}.</>
                : 'Aucun document du cours joint.',
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

          {/* fiche existante détectée (même matière + même titre) — évite de créer
             une fiche en double (ex: Théorie puis Pratique du même cours collées
             séparément). Par défaut on ajoute à cette fiche ; override explicite. */}
          {matchedFiche && (
            <div className="err-mini ok" style={{ marginBottom: 14 }}>
              <div className="em-ic"><Icon name="check" size={16} /></div>
              <div className="em-body">
                <div className="em-title">Fiche existante trouvée : « {matchedFiche.titre} »</div>
                <div className="hint">
                  {forceNew
                    ? <>Une nouvelle fiche sera créée quand même, malgré le titre identique. <button type="button" className="linklike" onClick={() => setForceNew(false)}>Ajouter plutôt à la fiche existante</button></>
                    : <>Les items seront ajoutés à cette fiche (théorie + pratique dans une seule fiche). <button type="button" className="linklike" onClick={() => setForceNew(true)}>Créer quand même une nouvelle fiche</button></>}
                </div>
              </div>
            </div>
          )}
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

      {/* document du cours (optionnel, PDF OU HTML) — un seul champ, partout.
         Le type est détecté à la volée ; s'il correspond à un document déjà
         rattaché à la fiche ciblée, il le remplace, sinon il s'ajoute. */}
      {(destMode === 'new' || (destMode === 'existing' && ficheId)) && (
        <div className="imp-field">
          <label>Document du cours</label>
          {(targetHasPdf || targetHasHtml) && (
            <div className="err-mini ok" style={{ marginBottom: 8 }}>
              <div className="em-ic"><Icon name={targetHasPdf ? 'filePdf' : 'fileHtml'} size={16} /></div>
              <div className="em-body" style={{ minWidth: 0 }}>
                <div className="em-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[targetHasPdf && (targetFiche.pdfName || 'PDF'), targetHasHtml && (targetFiche.htmlName || 'Fiche HTML')].filter(Boolean).join(' · ')}
                </div>
                <div className="hint">Déjà rattaché à cette fiche — conservé, sauf si tu attaches un nouveau document du même type ci-dessous.</div>
              </div>
            </div>
          )}
          <CourseDocField file={doc} onFile={setDoc} label="Nouveau document (optionnel)"
            hint="PDF ou fiche HTML. Rattaché à la fiche pour « Voir le cours » et le surlignage (PDF)." />
        </div>
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
