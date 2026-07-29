/* ============================================================
   MedRevise — ajout MANUEL d'un item à une fiche (sans passer par un import
   JSON). Un seul formulaire compact par type (QCM / Flashcard / Exercice /
   Feynman), volontairement réduit aux champs utiles à une saisie manuelle —
   mais l'item construit respecte le schéma v1.0 (schema.js) et passe par le
   MÊME chemin que l'import (appendItemsToFiche → toInternalItem →
   normalizeV1Item → newItem) : id unique, état SM-2 initial, aucun cas
   particulier côté lecteur (Session/Exercice/Feynman le traitent comme un
   item importé). AUCUN appel réseau/IA.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Modal } from './ui.jsx';
import { appendItemsToFiche } from '../lib/import.js';
import { parsePastedJson } from '../lib/parsePastedJson.js';
import { ImportJsonField } from './ImportFlow.jsx';

const OPT_LETTERS = ['a', 'b', 'c', 'd'];
const TYPES = [
  { id: 'qcm', label: 'QCM', icon: 'list' },
  { id: 'flashcard', label: 'Flashcard', icon: 'cards' },
  { id: 'exercice', label: 'Exercice', icon: 'target' },
  { id: 'feynman', label: 'Feynman', icon: 'lightbulb' },
];

/** textarea "une ligne = une entrée" → tableau de chaînes non vides. */
const lines = (s) => (s || '').split('\n').map((l) => l.trim()).filter(Boolean);

export function AddItemModal({ ctx, ficheId, ficheTitre, onClose }) {
  const [source, setSource] = useState('form'); // form | json
  const [type, setType] = useState('qcm');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0); // compteur, pour "Ajouté ✓ (N)" + permettre d'en ajouter plusieurs à la suite

  const add = async (raw) => {
    setBusy(true);
    try {
      await appendItemsToFiche({ ficheId, items: [raw] });
      await ctx.reload();
      setDone((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Ajouter un item — ${ficheTitre}`} onClose={onClose} width="min(640px, 94vw)">
      <div className="seg" style={{ marginBottom: 14 }}>
        <button type="button" className={'seg-btn' + (source === 'form' ? ' active' : '')} onClick={() => { setSource('form'); setDone(0); }}><Icon name="edit" size={13} /> Formulaire</button>
        <button type="button" className={'seg-btn' + (source === 'json' ? ' active' : '')} onClick={() => { setSource('json'); setDone(0); }}><Icon name="upload" size={13} /> Coller du JSON</button>
      </div>

      {source === 'form' ? (
        <>
          <div className="seg" style={{ marginBottom: 14 }}>
            {TYPES.map((t) => (
              <button key={t.id} type="button" className={'seg-btn' + (type === t.id ? ' active' : '')} onClick={() => { setType(t.id); setDone(0); }}>
                <Icon name={t.icon} size={13} /> {t.label}
              </button>
            ))}
          </div>
          {done > 0 && (
            <div className="err-mini ok" style={{ marginBottom: 12 }}>
              <div className="em-ic"><Icon name="check" size={16} stroke={2.5} /></div>
              <div className="em-body"><div className="em-title">{done} item{done > 1 ? 's' : ''} ajouté{done > 1 ? 's' : ''} ✓</div><div className="hint">Révisable immédiatement, comme un item importé.</div></div>
            </div>
          )}
          {type === 'qcm' && <QcmForm onAdd={add} busy={busy} />}
          {type === 'flashcard' && <FlashcardForm onAdd={add} busy={busy} />}
          {type === 'exercice' && <ExerciceForm onAdd={add} busy={busy} />}
          {type === 'feynman' && <FeynmanForm onAdd={add} busy={busy} />}
        </>
      ) : (
        <PasteJsonForm ctx={ctx} ficheId={ficheId} done={done} setDone={setDone} />
      )}
    </Modal>
  );
}

/* ---- « Coller du JSON » : un item seul ({...}) ou {"items":[...]} v1.1, RÉUTILISE
   le validateur d'import (parsePastedJson → normalizeV1Item) — items invalides
   ignorés et comptés, comme le flux d'import complet. Aperçu avant confirmation,
   puis appendItemsToFiche (mêmes ids uniques + dédoublonnage sur srcId que
   l'import Rattrapage — jamais d'écrasement des items déjà présents). ---- */
function PasteJsonForm({ ctx, ficheId, done, setDone }) {
  const [jsonText, setJsonText] = useState('');
  const [parseError, setParseError] = useState(null);
  const [preview, setPreview] = useState(null); // { items, counts, duplicates }
  const [busy, setBusy] = useState(false);

  const doPreview = () => {
    const res = parsePastedJson(jsonText);
    if (!res.ok) { setParseError(res.error); return; }
    if (!res.items.length) { setParseError('Aucun item valide trouvé dans ce JSON.'); return; }
    const existingSrc = new Set((ctx.db.questions || []).filter((q) => q.ficheId === ficheId).map((q) => q.srcId).filter(Boolean));
    const duplicates = res.items.filter((it) => it.id && existingSrc.has(it.id)).length;
    setParseError(null);
    setPreview({ items: res.items, counts: res.counts, duplicates });
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await appendItemsToFiche({ ficheId, items: preview.items });
      await ctx.reload();
      setDone((n) => n + res.count);
      setJsonText(''); setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  if (preview) {
    const c = preview.counts;
    const total = c.qcm + c.flashcard + c.feynman + c.exercice;
    return (
      <div className="fadein">
        <div className="err-mini ok" style={{ marginBottom: 12 }}>
          <div className="em-ic"><Icon name="check" size={16} stroke={2.5} /></div>
          <div className="em-body">
            <div className="em-title">{c.qcm} QCM · {c.flashcard} flashcards · {c.feynman} Feynman · {c.exercice} exercice{c.exercice > 1 ? 's' : ''} détecté{total > 1 ? 's' : ''}</div>
            {c.ignored > 0 && <div className="hint" style={{ marginTop: 4, color: 'var(--accent-2)' }}><Icon name="alert" size={12} /> {c.ignored} item{c.ignored > 1 ? 's' : ''} ignoré{c.ignored > 1 ? 's' : ''} (format invalide)</div>}
            {preview.duplicates > 0 && <div className="hint" style={{ marginTop: 4, color: 'var(--accent-2)' }}><Icon name="alert" size={12} /> {preview.duplicates} doublon{preview.duplicates > 1 ? 's' : ''} ignoré{preview.duplicates > 1 ? 's' : ''} (déjà dans cette fiche)</div>}
          </div>
        </div>
        <div className="imp-actions">
          <button className="btn ghost" onClick={() => setPreview(null)}>Retour</button>
          <button className="btn primary" onClick={confirm} disabled={busy}><Icon name="check" size={15} /> Ajouter à la fiche</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fadein">
      {done > 0 && (
        <div className="err-mini ok" style={{ marginBottom: 12 }}>
          <div className="em-ic"><Icon name="check" size={16} stroke={2.5} /></div>
          <div className="em-body"><div className="em-title">{done} item{done > 1 ? 's' : ''} ajouté{done > 1 ? 's' : ''} ✓</div><div className="hint">Révisable immédiatement (SM-2, cloze, rotation…), comme un item importé.</div></div>
        </div>
      )}
      <ImportJsonField label={'JSON (un item seul, ou {"items":[...]})'} placeholder={'Colle ici un item v1.1 ({"type":"qcm", ...}) ou {"items":[...]}.'}
        value={jsonText} onChange={(v) => { setJsonText(v); setParseError(null); }} error={parseError} />
      <div className="imp-actions">
        <button className="btn primary" onClick={doPreview} disabled={!jsonText.trim()}><Icon name="check" size={15} /> Prévisualiser</button>
      </div>
    </div>
  );
}

/* ---- QCM : énoncé, 4 options, la/les bonne(s), explication ---- */
function QcmForm({ onAdd, busy }) {
  const [theme, setTheme] = useState('');
  const [enonce, setEnonce] = useState('');
  const [options, setOptions] = useState(OPT_LETTERS.map(() => ({ texte: '', correct: false })));
  const [explication, setExplication] = useState('');

  const setOpt = (i, patch) => setOptions((o) => o.map((x, j) => (i === j ? { ...x, ...patch } : x)));
  const filled = options.filter((o) => o.texte.trim());
  const correctCount = options.filter((o) => o.texte.trim() && o.correct).length;
  const ready = !!enonce.trim() && filled.length >= 2 && correctCount >= 1;

  const submit = async () => {
    if (!ready) return;
    const kept = options.map((o, i) => ({ ...o, id: OPT_LETTERS[i] })).filter((o) => o.texte.trim());
    await onAdd({
      type: 'qcm', theme: theme.trim(), difficulte: 'intermediaire',
      enonce: enonce.trim(),
      multiple: correctCount > 1,
      options: kept.map((o) => ({ id: o.id, texte: o.texte.trim() })),
      reponses_correctes: kept.filter((o) => o.correct).map((o) => o.id),
      explication: explication.trim(),
    });
    setEnonce(''); setOptions(OPT_LETTERS.map(() => ({ texte: '', correct: false }))); setExplication('');
  };

  return (
    <div>
      <div className="imp-field">
        <label>Thème <span className="imp-opt">(optionnel)</span></label>
        <input className="imp-title" placeholder="ex : Effet Bohr" value={theme} onChange={(e) => setTheme(e.target.value)} />
      </div>
      <div className="imp-field">
        <label>Énoncé</label>
        <textarea className="imp-title" style={{ minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }} value={enonce} onChange={(e) => setEnonce(e.target.value)} placeholder="Question posée…" />
      </div>
      <div className="imp-field">
        <label>Options — coche la (ou les) bonne(s) réponse(s)</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {options.map((o, i) => (
            <div key={i} className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={o.correct} onChange={(e) => setOpt(i, { correct: e.target.checked })} disabled={!o.texte.trim()} style={{ accentColor: 'var(--accent)' }} />
              <input className="imp-title" style={{ flex: 1 }} placeholder={`Option ${OPT_LETTERS[i].toUpperCase()}`} value={o.texte} onChange={(e) => setOpt(i, { texte: e.target.value })} />
            </div>
          ))}
        </div>
      </div>
      <div className="imp-field">
        <label>Explication <span className="imp-opt">(optionnel)</span></label>
        <textarea className="imp-title" style={{ minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} value={explication} onChange={(e) => setExplication(e.target.value)} placeholder="Pourquoi c'est la bonne réponse…" />
      </div>
      <div className="imp-actions">
        <button className="btn primary" onClick={submit} disabled={!ready || busy}><Icon name="check" size={15} /> Ajouter ce QCM</button>
      </div>
      {!ready && <div className="hint" style={{ marginTop: 8 }}>Énoncé + au moins 2 options + 1 bonne réponse cochée.</div>}
    </div>
  );
}

/* ---- Flashcard : recto, verso, indice/à-retenir optionnels ---- */
function FlashcardForm({ onAdd, busy }) {
  const [theme, setTheme] = useState('');
  const [recto, setRecto] = useState('');
  const [verso, setVerso] = useState('');
  const [indice, setIndice] = useState('');
  const [aRetenir, setARetenir] = useState('');
  const ready = !!recto.trim() && !!verso.trim();

  const submit = async () => {
    if (!ready) return;
    await onAdd({
      type: 'flashcard', theme: theme.trim(), difficulte: 'intermediaire',
      recto: recto.trim(), verso: verso.trim(),
      indice: indice.trim() || null, a_retenir: aRetenir.trim(),
    });
    setRecto(''); setVerso(''); setIndice(''); setARetenir('');
  };

  return (
    <div>
      <div className="imp-field">
        <label>Thème <span className="imp-opt">(optionnel)</span></label>
        <input className="imp-title" placeholder="ex : Surfactant" value={theme} onChange={(e) => setTheme(e.target.value)} />
      </div>
      <div className="imp-field">
        <label>Recto</label>
        <textarea className="imp-title" style={{ minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} value={recto} onChange={(e) => setRecto(e.target.value)} placeholder="Question / terme…" />
      </div>
      <div className="imp-field">
        <label>Verso</label>
        <textarea className="imp-title" style={{ minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} value={verso} onChange={(e) => setVerso(e.target.value)} placeholder="Réponse…" />
      </div>
      <div className="imp-field">
        <label>Indice <span className="imp-opt">(optionnel)</span></label>
        <input className="imp-title" value={indice} onChange={(e) => setIndice(e.target.value)} />
      </div>
      <div className="imp-field">
        <label>À retenir <span className="imp-opt">(optionnel)</span></label>
        <input className="imp-title" value={aRetenir} onChange={(e) => setARetenir(e.target.value)} />
      </div>
      <div className="imp-actions">
        <button className="btn primary" onClick={submit} disabled={!ready || busy}><Icon name="check" size={15} /> Ajouter cette flashcard</button>
      </div>
      {!ready && <div className="hint" style={{ marginTop: 8 }}>Recto et verso requis.</div>}
    </div>
  );
}

/* ---- Feynman : consigne, réponse-modèle, points clés, grille ---- */
function FeynmanForm({ onAdd, busy }) {
  const [theme, setTheme] = useState('');
  const [consigne, setConsigne] = useState('');
  const [reponseModele, setReponseModele] = useState('');
  const [pointsCles, setPointsCles] = useState('');
  const [grille, setGrille] = useState('');
  const ready = !!consigne.trim() && !!reponseModele.trim();

  const submit = async () => {
    if (!ready) return;
    await onAdd({
      type: 'feynman', theme: theme.trim(), difficulte: 'intermediaire',
      consigne: consigne.trim(), reponse_modele: reponseModele.trim(),
      points_cles_attendus: lines(pointsCles),
      grille_autoevaluation: lines(grille).map((critere) => ({ critere, essentiel: true })),
      regle_reussite: 'tous_essentiels',
    });
    setConsigne(''); setReponseModele(''); setPointsCles(''); setGrille('');
  };

  return (
    <div>
      <div className="imp-field">
        <label>Thème <span className="imp-opt">(optionnel)</span></label>
        <input className="imp-title" placeholder="ex : Plexus brachial" value={theme} onChange={(e) => setTheme(e.target.value)} />
      </div>
      <div className="imp-field">
        <label>Consigne</label>
        <textarea className="imp-title" style={{ minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} value={consigne} onChange={(e) => setConsigne(e.target.value)} placeholder="ex : Explique le plexus brachial" />
      </div>
      <div className="imp-field">
        <label>Réponse modèle</label>
        <textarea className="imp-title" style={{ minHeight: 90, resize: 'vertical', fontFamily: 'inherit' }} value={reponseModele} onChange={(e) => setReponseModele(e.target.value)} />
      </div>
      <div className="imp-field">
        <label>Points clés attendus <span className="imp-opt">(optionnel, un par ligne)</span></label>
        <textarea className="imp-title" style={{ minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} value={pointsCles} onChange={(e) => setPointsCles(e.target.value)} />
      </div>
      <div className="imp-field">
        <label>Grille d'auto-évaluation <span className="imp-opt">(optionnel, un critère par ligne)</span></label>
        <textarea className="imp-title" style={{ minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} value={grille} onChange={(e) => setGrille(e.target.value)} />
      </div>
      <div className="imp-actions">
        <button className="btn primary" onClick={submit} disabled={!ready || busy}><Icon name="check" size={15} /> Ajouter ce Feynman</button>
      </div>
      {!ready && <div className="hint" style={{ marginTop: 8 }}>Consigne et réponse modèle requises.</div>}
    </div>
  );
}

/* ---- Exercice : énoncé, sous_type (numérique | ouvert), indices, correction ---- */
function ExerciceForm({ onAdd, busy }) {
  const [theme, setTheme] = useState('');
  const [enonce, setEnonce] = useState('');
  const [sousType, setSousType] = useState('numerique');
  const [valeurMin, setValeurMin] = useState('');
  const [valeurMax, setValeurMax] = useState('');
  const [unite, setUnite] = useState('');
  const [grille, setGrille] = useState('');
  const [indices, setIndices] = useState('');
  const [conclusion, setConclusion] = useState('');

  const minN = Number(valeurMin), maxN = Number(valeurMax);
  const numOk = sousType === 'numerique' && valeurMin.trim() !== '' && valeurMax.trim() !== '' && Number.isFinite(minN) && Number.isFinite(maxN);
  const ouvertOk = sousType === 'ouvert' && lines(grille).length > 0;
  const ready = !!enonce.trim() && (numOk || ouvertOk);

  const submit = async () => {
    if (!ready) return;
    const base = {
      type: 'exercice', theme: theme.trim(), difficulte: 'intermediaire',
      sous_type: sousType, enonce: enonce.trim(),
      indices: lines(indices).map((texte, i) => ({ niveau: i + 1, texte })),
      correction: { etapes: [], conclusion: conclusion.trim() },
    };
    if (sousType === 'numerique') {
      await onAdd({ ...base, reponse: { valeur_min: minN, valeur_max: maxN, unite: unite.trim(), unites_acceptees: [] } });
    } else {
      await onAdd({ ...base, grille_autoevaluation: lines(grille).map((critere) => ({ critere, essentiel: true })), regle_reussite: 'tous_essentiels' });
    }
    setEnonce(''); setValeurMin(''); setValeurMax(''); setUnite(''); setGrille(''); setIndices(''); setConclusion('');
  };

  return (
    <div>
      <div className="imp-field">
        <label>Thème <span className="imp-opt">(optionnel)</span></label>
        <input className="imp-title" placeholder="ex : Cinétique réactionnelle" value={theme} onChange={(e) => setTheme(e.target.value)} />
      </div>
      <div className="imp-field">
        <label>Énoncé</label>
        <textarea className="imp-title" style={{ minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }} value={enonce} onChange={(e) => setEnonce(e.target.value)} />
      </div>
      <div className="imp-field">
        <label>Type de réponse</label>
        <div className="seg" style={{ transform: 'scale(.96)', transformOrigin: 'left center' }}>
          <button type="button" className={'seg-btn' + (sousType === 'numerique' ? ' active' : '')} onClick={() => setSousType('numerique')}>Numérique</button>
          <button type="button" className={'seg-btn' + (sousType === 'ouvert' ? ' active' : '')} onClick={() => setSousType('ouvert')}>Ouvert</button>
        </div>
      </div>
      {sousType === 'numerique' ? (
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div className="imp-field" style={{ flex: '1 1 120px' }}>
            <label>Valeur min</label>
            <input className="imp-title" inputMode="decimal" value={valeurMin} onChange={(e) => setValeurMin(e.target.value)} placeholder="ex : 7.35" />
          </div>
          <div className="imp-field" style={{ flex: '1 1 120px' }}>
            <label>Valeur max</label>
            <input className="imp-title" inputMode="decimal" value={valeurMax} onChange={(e) => setValeurMax(e.target.value)} placeholder="ex : 7.45" />
          </div>
          <div className="imp-field" style={{ flex: '1 1 100px' }}>
            <label>Unité <span className="imp-opt">(optionnel)</span></label>
            <input className="imp-title" value={unite} onChange={(e) => setUnite(e.target.value)} placeholder="ex : mmol/L" />
          </div>
        </div>
      ) : (
        <div className="imp-field">
          <label>Grille d'auto-évaluation <span className="imp-opt">(un critère par ligne)</span></label>
          <textarea className="imp-title" style={{ minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} value={grille} onChange={(e) => setGrille(e.target.value)} />
        </div>
      )}
      <div className="imp-field">
        <label>Indices <span className="imp-opt">(optionnel, un par ligne, du plus léger au plus fort)</span></label>
        <textarea className="imp-title" style={{ minHeight: 50, resize: 'vertical', fontFamily: 'inherit' }} value={indices} onChange={(e) => setIndices(e.target.value)} />
      </div>
      <div className="imp-field">
        <label>Correction — conclusion <span className="imp-opt">(optionnel)</span></label>
        <textarea className="imp-title" style={{ minHeight: 50, resize: 'vertical', fontFamily: 'inherit' }} value={conclusion} onChange={(e) => setConclusion(e.target.value)} />
      </div>
      <div className="imp-actions">
        <button className="btn primary" onClick={submit} disabled={!ready || busy}><Icon name="check" size={15} /> Ajouter cet exercice</button>
      </div>
      {!ready && <div className="hint" style={{ marginTop: 8 }}>Énoncé requis, {sousType === 'numerique' ? 'valeurs min/max requises' : 'au moins un critère de grille requis'}.</div>}
    </div>
  );
}
