/* ============================================================
   MedRevise — PAGE EXERCICE (étape 3) : un vrai poste de travail.
   GAUCHE : énoncé, données, formules (repliables), indices (un par un).
   DROITE : bloc-notes (persisté), calculatrice intégrée, zone de réponse.
   Correction 100 % LOCALE, AUCUNE IA / AUCUN RÉSEAU :
   - "numerique" : normalisation + test valeur_min <= saisie <= valeur_max
     (bornes DÉJÀ dans le JSON, aucune tolérance recalculée) ; unité validée
     si fournie et présente dans unites_acceptees.
   - "ouvert" : pas de correction auto → correction affichée, grille cochée,
     verdict selon regle_reussite, forçage manuel possible.
   Planifiable SM-2 (étape 4) : qualité = juste/faux (ou verdict grille),
   modulée à la baisse par le nombre d'indices révélés.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Breadcrumb, EdTop, matiereMeta } from '../components/ui.jsx';
import { Tex } from '../components/Tex.jsx';
import { index, effectiveCoef } from '../lib/planning.js';
import { applyReview, qualityForExercice, todayISO, computeStreak } from '../lib/sm2.js';
import { checkNumerique } from '../lib/correction.js';
import { evalExpr } from '../lib/calc.js';
import { getExoNote, setExoNote } from '../lib/storage.js';

const DIFF = { 1: 'Facile', 2: 'Intermédiaire', 3: 'Difficile' };

export function Exercice({ ctx }) {
  const payload = ctx.exercice || { items: [], title: 'Exercices' };
  const items = (payload.items || []).filter((it) => it.type === 'exercice');
  const ix = useMemo(() => index(ctx.db), [ctx.db]);
  const [idx, setIdx] = useState(0);

  if (!items.length) {
    return (
      <div className="screen scroll fadein">
        <div className="rev-empty" style={{ marginTop: 60 }}>
          <Icon name="target" size={30} /><div className="re-title">Aucun exercice à faire</div>
          <button className="btn primary" onClick={() => ctx.go('revise')}>Retour</button>
        </div>
      </div>
    );
  }

  const item = items[idx];
  const fiche = ix.fById[item.ficheId];
  const meta = matiereMeta(fiche && ix.mById[fiche.matiereId]);
  const goNext = () => setIdx((i) => Math.min(items.length - 1, i + 1));
  const goPrev = () => setIdx((i) => Math.max(0, i - 1));

  return (
    <div className="screen scroll fadein">
      <div className="ctx-bar">
        <div style={{ minWidth: 0 }}>
          <Breadcrumb parts={['Réviser', meta.label, (fiche && fiche.titre) || payload.title, 'Exercice']} />
          <div className="row" style={{ gap: 10, marginTop: 9 }}>
            <span className="rp-count tnum">{idx + 1} / {items.length}</span>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn ghost" onClick={() => ctx.go('revise')}><Icon name="x" size={16} /> Quitter</button>
          <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
        </div>
      </div>

      {/* remount par exercice → tout l'état (indices, notes, réponse) se réinitialise */}
      <Workstation key={item.id} item={item} fiche={fiche} meta={meta} ctx={ctx} ix={ix}
        isFirst={idx === 0} isLast={idx === items.length - 1} onNext={goNext} onPrev={goPrev} />
    </div>
  );
}

/* ============================================================
   Poste de travail d'UN exercice
   ============================================================ */
function Workstation({ item, fiche, meta, ctx, ix, isFirst, isLast, onNext, onPrev }) {
  const numeric = item.sous_type === 'numerique';
  const indices = item.indices || [];
  const [revealed, setRevealed] = useState(0);          // indices révélés (0..n)
  const [validated, setValidated] = useState(false);    // réponse soumise
  const appliedRef = useRef(false);

  // ---- SM-2 : appliqué une seule fois, à la validation ----
  const applyResult = async (success) => {
    if (appliedRef.current) return;
    appliedRef.current = true;
    const quality = qualityForExercice(success, revealed);
    const coef = effectiveCoef(ctx.db, fiche, ix);
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 18, alignItems: 'start', maxWidth: 1180, margin: '0 auto' }}>
      {/* ---------------- GAUCHE : énoncé ---------------- */}
      <div className="card"><div className="card-body">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
          <span className="rev-concept" style={{ margin: 0 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.tint, display: 'inline-block' }} /> {meta.label} · {item.theme}</span>
          <span className="pill" style={{ height: 22 }}>{DIFF[item.difficulte] || 'Intermédiaire'}</span>
          {item.necessite_calculatrice && <span className="pill accent" style={{ height: 22 }}><Icon name="grad" size={12} /> Calculatrice</span>}
        </div>
        <div className="serif" style={{ fontSize: 20, lineHeight: 1.5, margin: '6px 0 12px' }}><Tex>{item.enonce}</Tex></div>

        {(item.donnees || []).length > 0 && <DonneesTable donnees={item.donnees} />}
        {(item.formules || []).length > 0 && <FormulesBlock formules={item.formules} />}

        {indices.length > 0 && (
          <div style={{ marginTop: 14 }}>
            {revealed < indices.length && (
              <button className="btn ghost" onClick={() => setRevealed((r) => r + 1)}>
                <Icon name="lightbulb" size={15} /> Indice {revealed + 1}/{indices.length}
              </button>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: revealed > 0 ? 10 : 0 }}>
              {indices.slice(0, revealed).map((ind, i) => (
                <div key={i} className="hint" style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '8px 12px', borderRadius: 10, background: 'var(--accent-soft)' }}>
                  <strong style={{ color: 'var(--accent)', flex: '0 0 auto' }}>Indice {i + 1}</strong>
                  <span><Tex>{ind.texte}</Tex></span>
                </div>
              ))}
            </div>
            {revealed > 0 && <div className="hint" style={{ marginTop: 6, fontSize: 12 }}>Les indices utilisés réduisent la note de mémorisation.</div>}
          </div>
        )}
      </div></div>

      {/* ---------------- DROITE : espace de travail ---------------- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Notepad itemId={item.id} />
        {item.necessite_calculatrice && <Calculator />}

        {numeric
          ? <NumericAnswer item={item} validated={validated} onValidate={(ok) => { setValidated(true); applyResult(ok); }} />
          : <OpenAnswer item={item} onApply={applyResult} />}

        {/* correction numérique : après validation */}
        {numeric && validated && <NumericCorrection item={item} />}

        <div className="row spread" style={{ marginTop: 2 }}>
          <button className="btn ghost" onClick={onPrev} disabled={isFirst}><Icon name="chevL" size={15} /> Précédent</button>
          <button className="btn primary" onClick={onNext} disabled={isLast}>Exercice suivant <Icon name="chevR" size={15} /></button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Données ---------------- */
function DonneesTable({ donnees }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="list" size={14} /> Données</div>
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <tbody>
            {donnees.map((d, i) => (
              <tr key={i} style={{ borderTop: i ? '1px solid var(--border-2)' : 'none' }}>
                <td style={{ padding: '7px 10px', fontWeight: 700, whiteSpace: 'nowrap' }}><Tex>{d.symbole}</Tex></td>
                <td style={{ padding: '7px 10px', color: 'var(--text-2)' }}><Tex>{d.libelle}</Tex></td>
                <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap' }} className="tnum">
                  <Tex>{`${d.valeur !== '' && d.valeur != null ? d.valeur : ''} ${d.unite || ''}`}</Tex>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Formules (repliable) ---------------- */
function FormulesBlock({ formules }) {
  return (
    <details style={{ marginTop: 12, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }} open>
      <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="grad" size={14} /> Formules
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        {formules.map((f, i) => (
          <div key={i}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{f.nom}</div>
            <div style={{ margin: '2px 0' }}><Tex>{f.expression && (f.expression.includes('$') ? f.expression : `$${f.expression}$`)}</Tex></div>
            {f.usage && <div className="hint" style={{ fontSize: 12.5 }}><Tex>{f.usage}</Tex></div>}
          </div>
        ))}
      </div>
    </details>
  );
}

/* ---------------- Bloc-notes (persisté par exercice) ---------------- */
function Notepad({ itemId }) {
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
    tRef.current = setTimeout(() => setExoNote(itemId, v), 400); // debounce persistance
  };
  return (
    <div className="card"><div className="card-body">
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="edit" size={14} /> Bloc-notes <span className="hint" style={{ fontWeight: 400, fontSize: 11 }}>· brouillon enregistré</span></div>
      <textarea className="imp-title" style={{ minHeight: 120, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 13, width: '100%' }}
        placeholder="Pose ton raisonnement, tes étapes de calcul…" value={note} onChange={(e) => onChange(e.target.value)} disabled={!loaded} />
    </div></div>
  );
}

/* ---------------- Calculatrice intégrée ---------------- */
const CALC_KEYS = [
  ['7', '8', '9', '/', '('],
  ['4', '5', '6', '*', ')'],
  ['1', '2', '3', '-', '^'],
  ['0', '.', 'E', '+', '√'],
];
const CALC_FUNCS = ['sqrt(', 'log(', 'ln(', 'exp(', 'pi', 'e'];
function Calculator() {
  const [expr, setExpr] = useState('');
  const [mem, setMem] = useState(null);
  const [history, setHistory] = useState([]); // [{expr, res}] session
  const [err, setErr] = useState(false);
  const push = (s) => { setErr(false); setExpr((e) => e + s); };
  const compute = () => {
    if (!expr.trim()) return;
    try {
      const res = evalExpr(expr);
      const out = String(Number(res.toPrecision(12))); // évite le bruit flottant
      setHistory((h) => [{ expr, res: out }, ...h].slice(0, 30));
      setExpr(out); setErr(false);
    } catch (e) { setErr(true); }
  };
  const key = (k) => {
    if (k === '√') return push('sqrt(');
    if (k === 'E') return push('e'); // notation scientifique : ex. 1.2*10^-3 ; e = exposant via ^, on offre exp/^
    push(k);
  };
  return (
    <div className="card"><div className="card-body">
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="grad" size={14} /> Calculatrice</div>
      <input className="imp-title" value={expr} onChange={(e) => { setErr(false); setExpr(e.target.value); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); compute(); } }}
        placeholder="ex : sqrt(2*20/9.81)" spellCheck={false}
        style={{ width: '100%', textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontSize: 16, color: err ? 'var(--accent-2)' : 'inherit' }} />
      {err && <div className="hint" style={{ color: 'var(--accent-2)', fontSize: 12, marginTop: 4 }}>Expression invalide</div>}

      <div className="row" style={{ gap: 6, margin: '8px 0', flexWrap: 'wrap' }}>
        {CALC_FUNCS.map((f) => <button key={f} className="btn ghost sm" style={{ fontFamily: 'ui-monospace, monospace' }} onClick={() => push(f)}>{f.replace('(', '')}</button>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        {CALC_KEYS.flat().map((k) => (
          <button key={k} className="btn" style={{ justifyContent: 'center', padding: '10px 0', fontFamily: 'ui-monospace, monospace' }} onClick={() => key(k)}>{k}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 6 }}>
        <button className="btn ghost" style={{ justifyContent: 'center' }} onClick={() => setExpr('')}>C</button>
        <button className="btn ghost" style={{ justifyContent: 'center' }} onClick={() => setExpr((e) => e.slice(0, -1))}>⌫</button>
        <button className="btn ghost" style={{ justifyContent: 'center' }} title="Mémoriser le résultat" onClick={() => { try { setMem(evalExpr(expr)); } catch (e) { /* ignore */ } }}>M+</button>
        <button className="btn ghost" style={{ justifyContent: 'center' }} title="Rappeler la mémoire" onClick={() => mem != null && push(String(mem))} disabled={mem == null}>MR</button>
        <button className="btn primary" style={{ justifyContent: 'center' }} onClick={compute}>=</button>
      </div>

      {history.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border-2)', paddingTop: 8 }}>
          <div className="hint" style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Historique</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 120, overflowY: 'auto' }}>
            {history.map((h, i) => (
              <button key={i} className="linklike" style={{ textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontSize: 12.5, color: 'var(--text-2)' }} onClick={() => setExpr(h.res)} title="Réutiliser le résultat">
                {h.expr} = <strong style={{ color: 'var(--text)' }}>{h.res}</strong>
              </button>
            ))}
          </div>
        </div>
      )}
    </div></div>
  );
}

/* ---------------- Réponse NUMÉRIQUE ---------------- */
function NumericAnswer({ item, validated, onValidate }) {
  const r = item.reponse || {};
  const [val, setVal] = useState('');
  const [unit, setUnit] = useState('');
  const units = [r.unite, ...(r.unites_acceptees || [])].filter(Boolean);
  const uniqUnits = [...new Set(units)];
  const [res, setRes] = useState(null);

  const submit = () => {
    const check = checkNumerique(`${val} ${unit}`.trim(), r);
    setRes(check);
    onValidate(check.ok);
  };

  return (
    <div className="card"><div className="card-body">
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Ta réponse</div>
      <div className="row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px' }}>
          <label className="hint" style={{ display: 'block', marginBottom: 4 }}>Valeur</label>
          <input className="imp-title" value={val} onChange={(e) => setVal(e.target.value)} disabled={validated}
            placeholder="ex : 2.02" inputMode="decimal" style={{ width: '100%', fontFamily: 'ui-monospace, monospace' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !validated && val.trim()) submit(); }} />
        </div>
        <div style={{ flex: '0 1 140px' }}>
          <label className="hint" style={{ display: 'block', marginBottom: 4 }}>Unité</label>
          {uniqUnits.length > 1 ? (
            <select className="imp-title" value={unit} onChange={(e) => setUnit(e.target.value)} disabled={validated} style={{ width: '100%' }}>
              <option value="">—</option>
              {uniqUnits.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          ) : (
            <input className="imp-title" value={unit} onChange={(e) => setUnit(e.target.value)} disabled={validated}
              placeholder={r.unite || 'unité'} style={{ width: '100%' }} />
          )}
        </div>
      </div>
      {r.chiffres_significatifs != null && (
        <div className="hint" style={{ marginTop: 8, fontSize: 12.5 }}><Icon name="info" size={12} /> {r.chiffres_significatifs} chiffre{r.chiffres_significatifs > 1 ? 's' : ''} significatif{r.chiffres_significatifs > 1 ? 's' : ''} attendu{r.chiffres_significatifs > 1 ? 's' : ''}.</div>
      )}

      {!validated && (
        <button className="btn primary lg" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }} onClick={submit} disabled={!val.trim()}>Valider</button>
      )}

      {validated && res && (
        <div className={'err-mini' + (res.ok ? ' ok' : '')} style={{ marginTop: 14, alignItems: 'center' }}>
          <div className={'em-ic' + (res.ok ? '' : ' crit')}><Icon name={res.ok ? 'check' : 'x'} size={18} stroke={2.5} /></div>
          <div className="em-body">
            <div className="em-title">{res.ok ? 'Juste !' : 'Faux'}</div>
            <div className="hint">
              {!res.inRange && 'La valeur est hors de la plage attendue. '}
              {res.inRange && !res.unitOk && "L'unité saisie n'est pas acceptée. "}
              {r.affichage_attendu && <>Réponse attendue : <strong><Tex>{r.affichage_attendu}</Tex></strong>.</>}
            </div>
          </div>
        </div>
      )}
    </div></div>
  );
}

/* ---------------- Correction NUMÉRIQUE (étapes + conclusion + pièges) ---------------- */
function NumericCorrection({ item }) {
  const c = item.correction || {};
  return (
    <div className="card"><div className="card-body">
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="list" size={15} /> Correction détaillée</div>
      <CorrectionSteps correction={c} />
      <Pieges pieges={item.pieges} />
    </div></div>
  );
}

/* ---------------- Réponse OUVERTE (éditeur riche + grille) ---------------- */
function OpenAnswer({ item, onApply }) {
  const grille = item.grille_autoevaluation || [];
  const essentiels = grille.filter((g) => g.essentiel);
  const [revealed, setRevealed] = useState(false);
  const [checked, setChecked] = useState({});
  const [override, setOverride] = useState(null); // 'ok' | 'ko'
  const [saved, setSaved] = useState(false);

  const grilleOk = (essentiels.length ? essentiels : grille).every((g) => checked[g.id]);
  const verdict = override || (grille.length ? (grilleOk ? 'ok' : 'ko') : null);

  const save = () => { setSaved(true); onApply(verdict === 'ok'); };

  return (
    <>
      <div className="card"><div className="card-body">
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Ta solution rédigée</div>
        <RichEditor disabled={revealed} />
        {!revealed && (
          <button className="btn primary lg" style={{ marginTop: 12, width: '100%', justifyContent: 'center' }} onClick={() => setRevealed(true)}>
            <Icon name="check" size={15} /> Valider et voir la correction
          </button>
        )}
      </div></div>

      {revealed && (
        <div className="card fadein"><div className="card-body">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="list" size={15} /> Correction modèle</div>
          <CorrectionSteps correction={item.correction} />

          {grille.length > 0 && (
            <div style={{ marginTop: 14, border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--card-2)' }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}>Auto-évaluation — coche ce que ta solution couvre</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {grille.map((g) => (
                  <label key={g.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: '8px 10px', borderRadius: 9, background: checked[g.id] ? 'var(--accent-soft)' : 'transparent', border: '1px solid ' + (checked[g.id] ? 'var(--accent)' : 'var(--border)') }}>
                    <input type="checkbox" checked={!!checked[g.id]} onChange={() => setChecked((c) => ({ ...c, [g.id]: !c[g.id] }))} style={{ marginTop: 3, accentColor: 'var(--accent)' }} />
                    <span style={{ fontSize: 14 }}><Tex>{g.critere}</Tex>{g.essentiel && <span className="pill accent" style={{ marginLeft: 8, height: 20, fontSize: 11 }}>essentiel</span>}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {verdict && (
            <div className={'err-mini' + (verdict === 'ok' ? ' ok' : '')} style={{ marginTop: 12, alignItems: 'center' }}>
              <div className={'em-ic' + (verdict === 'ok' ? '' : ' crit')}><Icon name={verdict === 'ok' ? 'check' : 'target'} size={18} stroke={2.5} /></div>
              <div className="em-body"><div className="em-title">{verdict === 'ok' ? 'Réussi — l\'essentiel est couvert.' : 'À revoir — critères essentiels manquants.'}</div></div>
            </div>
          )}

          <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="hint">Forcer :</span>
            <button className={'btn sm' + (override === 'ok' ? ' primary' : '')} onClick={() => setOverride('ok')}><Icon name="check" size={13} /> Juste</button>
            <button className={'btn sm' + (override === 'ko' ? ' primary' : '')} onClick={() => setOverride('ko')}><Icon name="refresh" size={13} /> À revoir</button>
            <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={save} disabled={saved || !verdict}>
              <Icon name="check" size={14} /> {saved ? 'Enregistré ✓' : 'Enregistrer le résultat'}
            </button>
          </div>

          <Pieges pieges={item.pieges} />
        </div></div>
      )}
    </>
  );
}

/* étapes numérotées + conclusion (partagé numérique/ouvert) */
function CorrectionSteps({ correction }) {
  const c = correction || {};
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(c.etapes || []).map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 12 }}>
            <span className="rc-key" style={{ flex: '0 0 auto' }}>{e.n || i + 1}</span>
            <div style={{ minWidth: 0 }}>
              {e.titre && <div style={{ fontWeight: 700, fontSize: 14 }}><Tex>{e.titre}</Tex></div>}
              {e.detail && <div className="hint" style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '2px 0' }}><Tex>{e.detail}</Tex></div>}
              {e.calcul && <div style={{ padding: '6px 10px', background: 'var(--bg-2)', borderRadius: 8, marginTop: 4, fontFamily: 'ui-monospace, monospace', overflowX: 'auto' }}><Tex>{e.calcul}</Tex></div>}
            </div>
          </div>
        ))}
      </div>
      {c.conclusion && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent)', fontWeight: 600 }}>
          <Tex>{c.conclusion}</Tex>
        </div>
      )}
    </>
  );
}

/* pièges (fin de correction, dans les deux modes) */
function Pieges({ pieges }) {
  if (!pieges || !pieges.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-2)' }}><Icon name="alert" size={14} /> Pièges à éviter</div>
      <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7, color: 'var(--text-2)', fontSize: 13.5 }}>
        {pieges.map((p, i) => <li key={i}><Tex>{p}</Tex></li>)}
      </ul>
    </div>
  );
}

/* ---------------- éditeur de texte riche (léger, sans dépendance) ---------------- */
function RichEditor({ disabled }) {
  const ref = useRef(null);
  const cmd = (c) => { document.execCommand(c, false, null); if (ref.current) ref.current.focus(); };
  const Btn = ({ c, label }) => (
    <button type="button" className="btn ghost sm" onMouseDown={(e) => { e.preventDefault(); cmd(c); }} disabled={disabled}>{label}</button>
  );
  return (
    <div>
      <div className="row" style={{ gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        <Btn c="bold" label={<strong>G</strong>} />
        <Btn c="italic" label={<em>I</em>} />
        <Btn c="insertUnorderedList" label="• Liste" />
        <Btn c="insertOrderedList" label="1. Liste" />
      </div>
      <div ref={ref} contentEditable={!disabled} suppressContentEditableWarning
        className="imp-title" style={{ minHeight: 140, width: '100%', lineHeight: 1.6, opacity: disabled ? 0.7 : 1, overflowY: 'auto' }}
        data-placeholder="Rédige ta démonstration / ton raisonnement…" />
    </div>
  );
}
