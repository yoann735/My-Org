/* ============================================================
   MedRevise mobile — exercice (numérique ou ouvert). RÉUTILISE
   checkNumerique (correction.js), qualityForExercice/applyReview (sm2.js),
   evalExpr (calc.js) et ctx.saveQuestion/getExoNote/setExoNote — identique
   au desktop (session/Exercice.jsx), présentation neuve : une carte à la
   fois, indices repliés, calculatrice réduite à un champ + "=".
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Tex } from '../components/Tex.jsx';
import { applyReview, qualityForExercice, todayISO, computeStreak } from '../lib/sm2.js';
import { checkNumerique, parseScientificValue } from '../lib/correction.js';
import { evalExpr } from '../lib/calc.js';
import { effectiveCoef, index } from '../lib/planning.js';
import { getExoNote, setExoNote } from '../lib/storage.js';

export function MobileExercice({ ctx, onQuit }) {
  const payload = ctx.exercice || { items: [], title: 'Exercices' };
  const items = (payload.items || []).filter((it) => it.type === 'exercice');
  const ix = index(ctx.db);
  const [idx, setIdx] = useState(0);
  const item = items[idx];

  if (!items.length) {
    return (
      <div className="mrm-app">
        <div className="mrm-done">
          <Icon name="target" size={34} />
          <div>Aucun exercice à faire.</div>
          <button type="button" className="mrm-primary-btn" style={{ maxWidth: 220 }} onClick={onQuit}>Retour</button>
        </div>
      </div>
    );
  }

  const fiche = ix.fById[item.ficheId];
  const coef = effectiveCoef(ctx.db, fiche, ix);

  return (
    <div className="mrm-app">
      <div className="mrm-header">
        <button type="button" className="mrm-quit" onClick={onQuit} aria-label="Quitter"><Icon name="x" size={18} /></button>
        <div className="mrm-progress"><span style={{ width: (idx / items.length) * 100 + '%' }} /></div>
        <span className="mrm-progress-n">{idx + 1} / {items.length}</span>
      </div>
      <div className="mrm-body">
        <Workstation key={item.id} item={item} coef={coef} ctx={ctx}
          isLast={idx === items.length - 1}
          onNext={() => setIdx((i) => Math.min(items.length - 1, i + 1))}
          onDone={idx === items.length - 1 ? onQuit : null} />
      </div>
    </div>
  );
}

function Workstation({ item, coef, ctx, isLast, onNext, onDone }) {
  const numeric = item.sous_type === 'numerique';
  const indices = item.indices || [];
  const [revealed, setRevealed] = useState(0);
  const [validated, setValidated] = useState(false);
  const appliedRef = useRef(false);

  const applyResult = async (success) => {
    if (appliedRef.current) return;
    appliedRef.current = true;
    const quality = qualityForExercice(success, revealed);
    const updated = applyReview(item, quality, coef);
    await ctx.saveQuestion(updated);
    const s = ctx.stats || {};
    const today = todayISO();
    if (!(s.activityDays || []).includes(today)) {
      const activityDays = [...(s.activityDays || []), today];
      const streak = computeStreak(activityDays);
      await ctx.saveStats({ ...s, activityDays, streak, best: Math.max(s.best || 0, streak), dernierJourRevise: today });
    }
  };

  return (
    <div>
      <div className="mrm-concept">{item.theme || item.concept}</div>
      <div className="mrm-question"><Tex>{item.enonce}</Tex></div>

      {(item.donnees || []).length > 0 && (
        <div className="mrm-explication" style={{ marginBottom: 14 }}>
          {item.donnees.map((d, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span><Tex>{d.symbole}</Tex> — {d.libelle}</span>
              <span className="tnum"><Tex>{`${d.valeur ?? ''} ${d.unite || ''}`}</Tex></span>
            </div>
          ))}
        </div>
      )}

      {indices.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {revealed < indices.length && (
            <button type="button" className="mrm-ghost-btn" onClick={() => setRevealed((r) => r + 1)}>
              <Icon name="lightbulb" size={15} /> Indice {revealed + 1}/{indices.length}
            </button>
          )}
          {indices.slice(0, revealed).map((ind, i) => (
            <div className="mrm-indice" key={i} style={{ marginTop: 8 }}><strong>Indice {i + 1} : </strong><Tex>{ind.texte}</Tex></div>
          ))}
        </div>
      )}

      <MobileNotepad itemId={item.id} />
      {item.necessite_calculatrice && <MobileCalculator />}

      {numeric
        ? <NumericAnswer item={item} validated={validated} onValidate={(ok) => { setValidated(true); applyResult(ok); }} />
        : <OpenAnswer item={item} onApply={applyResult} />}

      {numeric && validated && (
        <div className="mrm-explication" style={{ marginTop: 14 }}>
          <strong>Correction</strong>
          {(item.correction && item.correction.etapes || []).map((e, i) => (
            <div key={i} style={{ marginTop: 8 }}>
              {e.titre && <div style={{ fontWeight: 700 }}><Tex>{e.titre}</Tex></div>}
              {e.detail && <div style={{ color: 'var(--text-2)' }}><Tex>{e.detail}</Tex></div>}
              {e.calcul && <div style={{ fontFamily: 'ui-monospace, monospace', marginTop: 4 }}><Tex>{e.calcul}</Tex></div>}
            </div>
          ))}
          {item.correction && item.correction.conclusion && <div style={{ marginTop: 8, fontWeight: 600 }}><Tex>{item.correction.conclusion}</Tex></div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        {onDone ? (
          <button type="button" className="mrm-primary-btn" onClick={onDone}><Icon name="check" size={16} /> Terminer</button>
        ) : (
          <button type="button" className="mrm-primary-btn" onClick={onNext}>Exercice suivant <Icon name="chevR" size={16} /></button>
        )}
      </div>
    </div>
  );
}

// clavier scientifique du champ Valeur — identique au desktop (session/Exercice.jsx) :
// insère du texte déjà valide pour evalExpr, rien de nouveau à parser.
const SCI_KEYS = [
  { label: '^', insert: '^', title: 'Exposant (ex. 2^3)' },
  { label: '×10ⁿ', insert: '*10^', title: 'Notation scientifique (ex. 3*10^-3)' },
  { label: '√', insert: 'sqrt(', title: 'Racine carrée' },
  { label: 'π', insert: 'pi', title: 'Pi' },
  { label: '±', insert: '-', title: 'Signe moins (ex. exposant négatif)' },
];

function NumericAnswer({ item, validated, onValidate }) {
  const r = item.reponse || {};
  const [val, setVal] = useState('');
  const [unit, setUnit] = useState(r.unite || '');
  const [res, setRes] = useState(null);
  const valRef = useRef(null);

  const insertAtCursor = (text) => {
    const el = valRef.current;
    const start = el ? (el.selectionStart ?? val.length) : val.length;
    const end = el ? (el.selectionEnd ?? val.length) : val.length;
    const next = val.slice(0, start) + text + val.slice(end);
    setVal(next);
    const pos = start + text.length;
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(pos, pos); } });
  };

  const preview = val.trim() ? parseScientificValue(val) : null;
  const previewInvalid = !!val.trim() && preview == null;

  const submit = () => {
    const check = checkNumerique(val, unit, r);
    setRes(check);
    onValidate(check.ok);
  };

  return (
    <div className="mrm-field">
      <label>Ta réponse{r.unite ? ` (${r.unite})` : ''}</label>
      {!validated && (
        <div className="row" style={{ gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {SCI_KEYS.map((k) => (
            <button key={k.label} type="button" className="mrm-btn" style={{ flex: '0 1 auto', minHeight: 40, padding: '0 14px', fontFamily: 'ui-monospace, monospace' }}
              title={k.title} onClick={() => insertAtCursor(k.insert)}>{k.label}</button>
          ))}
        </div>
      )}
      <input ref={valRef} className="mrm-input" inputMode="text" value={val} disabled={validated}
        onChange={(e) => setVal(e.target.value)} placeholder="ex : 2.02 ou 3*10^-3" />
      {!validated && val.trim() && (
        <div className="hint" style={{ marginTop: 4, fontSize: 12, color: previewInvalid ? 'var(--crit)' : undefined }}>
          {previewInvalid ? 'Expression invalide' : `≈ ${preview}`}
        </div>
      )}
      {!validated && (
        <button type="button" className="mrm-primary-btn" disabled={!val.trim()} onClick={submit}>Valider</button>
      )}
      {validated && res && (
        <div className={'mrm-verdict ' + (res.ok ? 'ok' : 'ko')}>
          <Icon name={res.ok ? 'check' : 'x'} size={18} stroke={2.5} />
          <span>{res.ok ? 'Juste !' : 'Faux'}{r.affichage_attendu ? ` — attendu : ${r.affichage_attendu}` : ''}</span>
        </div>
      )}
    </div>
  );
}

function OpenAnswer({ item, onApply }) {
  const grille = item.grille_autoevaluation || [];
  const essentiels = grille.filter((g) => g.essentiel);
  const [revealed, setRevealed] = useState(false);
  const [checked, setChecked] = useState({});
  const [override, setOverride] = useState(null);
  const [saved, setSaved] = useState(false);

  const grilleOk = (essentiels.length ? essentiels : grille).every((g) => checked[g.id]);
  const verdict = override || (grille.length ? (grilleOk ? 'ok' : 'ko') : null);
  const save = () => { setSaved(true); onApply(verdict === 'ok'); };

  return (
    <div>
      {!revealed ? (
        <button type="button" className="mrm-primary-btn" onClick={() => setRevealed(true)}>Voir la correction</button>
      ) : (
        <>
          {item.correction && item.correction.conclusion && <div className="mrm-explication"><Tex>{item.correction.conclusion}</Tex></div>}
          {grille.length > 0 && grille.map((g) => (
            <button type="button" key={g.id} className={'mrm-criterion' + (checked[g.id] ? ' on' : '')} onClick={() => setChecked((c) => ({ ...c, [g.id]: !c[g.id] }))}>
              <input type="checkbox" readOnly checked={!!checked[g.id]} />
              <span><Tex>{g.critere}</Tex></span>
            </button>
          ))}
          {verdict && (
            <div className={'mrm-verdict ' + (verdict === 'ok' ? 'ok' : 'ko')}>
              <Icon name={verdict === 'ok' ? 'check' : 'target'} size={18} stroke={2.5} />
              <span>{verdict === 'ok' ? 'Réussi' : 'À revoir'}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="mrm-btn" onClick={() => setOverride('ok')}>Juste</button>
            <button type="button" className="mrm-btn" onClick={() => setOverride('ko')}>À revoir</button>
          </div>
          <button type="button" className="mrm-primary-btn" disabled={saved || !verdict} onClick={save}>
            {saved ? 'Enregistré ✓' : 'Enregistrer le résultat'}
          </button>
        </>
      )}
    </div>
  );
}

function MobileNotepad({ itemId }) {
  const [note, setNote] = useState('');
  const [loaded, setLoaded] = useState(false);
  const tRef = useRef(null);
  useEffect(() => {
    let on = true;
    getExoNote(itemId).then((rec) => { if (on) { setNote(rec ? rec.note || '' : ''); setLoaded(true); } });
    return () => { on = false; };
  }, [itemId]);
  const onChange = (v) => {
    setNote(v);
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => setExoNote(itemId, v), 400);
  };
  return (
    <div className="mrm-field">
      <label>Bloc-notes</label>
      <textarea className="mrm-textarea" style={{ minHeight: 70 }} value={note} disabled={!loaded}
        onChange={(e) => onChange(e.target.value)} placeholder="Ton raisonnement…" />
    </div>
  );
}

function MobileCalculator() {
  const [expr, setExpr] = useState('');
  const [err, setErr] = useState(false);
  const compute = () => {
    if (!expr.trim()) return;
    try { setExpr(String(Number(evalExpr(expr).toPrecision(12)))); setErr(false); } catch (e) { setErr(true); }
  };
  return (
    <div className="mrm-field">
      <label>Calculatrice</label>
      <div className="mrm-calc-row">
        <input className="mrm-input" value={expr} onChange={(e) => { setErr(false); setExpr(e.target.value); }}
          onKeyDown={(e) => { if (e.key === 'Enter') compute(); }} placeholder="ex : sqrt(2*20/9.81)"
          style={{ color: err ? 'var(--crit)' : undefined }} inputMode="decimal" />
        <button type="button" className="mrm-calc-eq" onClick={compute}>=</button>
      </div>
    </div>
  );
}
