/* ============================================================
   MedRevise — Dashboard : CTA série du jour (méthode des J),
   calendrier de la SEMAINE, import de fiche, streak.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Card, EdTop, TodaySeriesCard, DestPicker, CoursePdfField, matiereMeta } from '../components/ui.jsx';
import { weekData, dueToday, dueSchemasToday, todayPlan } from '../lib/planning.js';
import { isoDate } from '../lib/sm2.js';
import { createFicheFromQuestions } from '../lib/import.js';
import { putBlob } from '../lib/storage.js';
import { parsePastedJson } from '../lib/parsePastedJson.js';
import { ImportAnatomieTheorie } from './ImportAnatomieTheorie.jsx';
import { ImportAnatomieVisuel } from './ImportAnatomieVisuel.jsx';
import { ImportRattrapage } from './ImportRattrapage.jsx';

const TYPE_LABEL = { qcm: 'QCM', flashcard: 'flashcards', feynman: 'Feynman' };
const fmtShort = (iso) => { const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}`; };

export function Dashboard({ ctx }) {
  const { db } = ctx;
  const [selDay, setSelDay] = useState(null);
  const due = dueToday(db);
  const dueSchemas = dueSchemasToday(db);
  const plan = todayPlan(db);

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div>
          <h1 className="serif">Bonjour 👋</h1>
          <div className="sub">Ton planning de révision selon la méthode des J.</div>
        </div>
        <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
      </div>

      <TodaySeriesCard plan={plan} onStart={ctx.startSession} />

      <Card title="Calendrier de la semaine — méthode des J" icon="calendar"
        action={<span className="pill accent"><Icon name="cards" size={13} /> {due.length} carte{due.length > 1 ? 's' : ''}{dueSchemas.length > 0 ? ` + ${dueSchemas.length} schéma${dueSchemas.length > 1 ? 's' : ''}` : ''} aujourd'hui</span>}>
        <WeekCalendar ctx={ctx} onPick={setSelDay} />
        <div className="jcal-legend" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-2)' }}>
          {db.matieres.map((m) => { const mm = matiereMeta(m); return <span key={m.id}><i style={{ background: mm.tint }} /> {mm.label}</span>; })}
        </div>
      </Card>

      <div className="dash-imp-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(280px,1fr)', gap: 20, marginTop: 20, alignItems: 'start' }}>
        <ImportPanel ctx={ctx} />
        <StreakWidget stats={ctx.stats} />
      </div>

      {selDay && <DayPopup day={selDay} ctx={ctx} onClose={() => setSelDay(null)} />}
    </div>
  );
}

/* ---------- week calendar ---------- */
function WeekCalendar({ ctx, onPick }) {
  const [wk, setWk] = useState(0);
  const { monday, days } = weekData(ctx.db, wk);
  const end = (() => { const d = new Date(monday + 'T00:00:00'); d.setDate(d.getDate() + 6); return d.toISOString().split('T')[0]; })();
  const rangeLabel = `${fmtShort(monday)} – ${fmtShort(end)}`;
  const weekLabel = wk === 0 ? 'Cette semaine' : wk === 1 ? 'Semaine prochaine' : wk === -1 ? 'Semaine dernière' : rangeLabel;

  return (
    <div>
      <div className="wcal-nav">
        <div className="weeknav">
          <button onClick={() => setWk((w) => w - 1)} title="Semaine précédente"><Icon name="chevL" size={18} /></button>
          <span className="wk">{weekLabel}</span>
          <button onClick={() => setWk((w) => w + 1)} title="Semaine suivante"><Icon name="chevR" size={18} /></button>
        </div>
        <span className="wcal-range" style={{ marginLeft: 4 }}><span>{rangeLabel}</span></span>
        {wk !== 0 && <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setWk(0)}>Aujourd'hui</button>}
      </div>
      <div className="wcal-grid">
        {days.map((day, i) => {
          const cls = 'wcal-day' + (day.isToday ? ' today' : '') + (day.isPast ? ' past' : '');
          return (
            <button className={cls} key={i} disabled={day.total === 0} onClick={() => day.total && onPick(day)}>
              <div className="wcal-dhead">
                <span className="wcal-dow">{day.dow}</span>
                <span className="wcal-dnum">{day.dayNum}</span>
                {day.isToday && <span className="wcal-today-dot">Auj.</span>}
              </div>
              <div className="wcal-courses">
                {day.byFiche.length === 0 && (day.schemas || []).length === 0 && <div className="wcal-empty">{day.isPast ? '' : '—'}</div>}
                {day.byFiche.map((c) => {
                  const meta = matiereMeta(c.matiere);
                  return (
                    <div className="wcal-course" key={c.fiche.id}>
                      <span className="wcc-bar" style={{ background: meta.tint }} />
                      <div className="wcc-text">
                        <div className="wcc-cat" style={{ color: meta.tint }}>{meta.label}</div>
                        <div className="wcc-title">{c.fiche.titre} <span className="wcc-j">{c.jLabel}</span></div>
                      </div>
                    </div>
                  );
                })}
                {(day.schemas || []).map((s) => {
                  const meta = matiereMeta(s.matiere);
                  return (
                    <div className="wcal-course" key={s.fiche.id}>
                      <span className="wcc-bar" style={{ background: meta.tint }} />
                      <div className="wcc-text">
                        <div className="wcc-cat" style={{ color: meta.tint }}><Icon name="image" size={10} /> {meta.label}</div>
                        <div className="wcc-title">{s.fiche.titre} <span className="wcc-j">{s.jLabel} · schéma</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {day.total > 0 && <div className="wcal-foot">{day.cardsTotal > 0 && `${day.cardsTotal} carte${day.cardsTotal > 1 ? 's' : ''}`}{day.cardsTotal > 0 && (day.schemas || []).length > 0 ? ' · ' : ''}{(day.schemas || []).length > 0 && `${day.schemas.length} schéma${day.schemas.length > 1 ? 's' : ''}`}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- day detail popup ---------- */
function DayPopup({ day, ctx, onClose }) {
  const groups = {};
  day.items.forEach((it) => {
    const f = ctx.db.fiches.find((x) => x.id === it.ficheId);
    const m = f && ctx.db.matieres.find((x) => x.id === f.matiereId);
    const key = (m ? m.id : '?') + '|' + it.type;
    if (!groups[key]) groups[key] = { matiere: m, type: it.type, items: [], fiches: new Set() };
    groups[key].items.push(it);
    if (f) groups[key].fiches.add(f.titre);
  });
  const lines = Object.values(groups).sort((a, b) => b.items.length - a.items.length);
  const dateLabel = new Date(day.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="day-pop-scrim" onClick={onClose}>
      <div className="day-pop" onClick={(e) => e.stopPropagation()}>
        <div className="day-pop-head">
          <div className="row spread">
            <div>
              <div className="kpi-label" style={{ marginBottom: 4 }}>{day.isToday ? "Aujourd'hui" : 'Le ' + dateLabel}</div>
              <div className="serif" style={{ fontSize: 22, textTransform: 'capitalize' }}>{day.isToday ? dateLabel : `${day.total} carte${day.total > 1 ? 's' : ''}`}</div>
            </div>
            <button className="icon-btn sm" onClick={onClose}><Icon name="x" size={16} /></button>
          </div>
        </div>
        <div className="day-pop-body">
          {lines.map((g, i) => {
            const meta = matiereMeta(g.matiere);
            return (
              <div className="day-line" key={i}>
                <div className="dl-ic" style={{ background: `color-mix(in srgb, ${meta.tint} 15%, transparent)`, color: meta.tint }}>
                  <Icon name={g.type === 'flashcard' ? 'cards' : 'list'} size={17} />
                </div>
                <div className="dl-main">
                  <div className="dl-title">{g.items.length} {TYPE_LABEL[g.type]} · {meta.label}</div>
                  <div className="dl-sub"><span>{[...g.fiches].join(', ')}</span></div>
                </div>
              </div>
            );
          })}
          {(day.schemas || []).map((s) => {
            const meta = matiereMeta(s.matiere);
            return (
              <div className="day-line" key={s.fiche.id}>
                <div className="dl-ic" style={{ background: `color-mix(in srgb, ${meta.tint} 15%, transparent)`, color: meta.tint }}><Icon name="image" size={17} /></div>
                <div className="dl-main">
                  <div className="dl-title">Schéma · {meta.label}</div>
                  <div className="dl-sub"><span>{s.fiche.titre}</span></div>
                </div>
                {day.isToday && <button className="btn ghost sm" onClick={() => { onClose(); ctx.startAnatQuiz(s.fiche, { mode: 'total' }); }}><Icon name="play" size={13} /> Réviser</button>}
              </div>
            );
          })}
        </div>
        <div className="day-pop-foot">
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>Fermer</button>
          {day.isToday && day.items.length > 0 && (
            <button className="btn primary" style={{ flex: 1 }} onClick={() => { onClose(); ctx.startSession(day.items, 'Révision du jour'); }}>
              <Icon name="play" size={15} fill /> Réviser les cartes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- import : destination → coller le JSON → aperçu → confirmer ----------
   Full JSON local (aucun appel réseau) : même flux que Rattrapage. */
function ImportPanel({ ctx }) {
  const { db } = ctx;
  const [mode, setMode] = useState('standard'); // standard | anat | rattrapage
  const [anatSub, setAnatSub] = useState('theorie'); // theorie (existant, inchangé) | visuel (schéma annoté → anat_schema)
  const [state, setState] = useState('form'); // form | preview | done
  const sources = db.sources.filter((s) => !s.archive);
  const [srcId, setSrcId] = useState(() => (sources[0] || {}).id);
  const matieresFor = (sid) => db.matieres.filter((m) => m.sourceId === sid && !m.archive);
  const [matId, setMatId] = useState(() => (matieresFor((sources[0] || {}).id)[0] || {}).id || null);
  const [title, setTitle] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [parseError, setParseError] = useState(null);
  const [parsed, setParsed] = useState(null); // { questions, synthese, counts }
  const [pastePdf, setPastePdf] = useState(null); // PDF du cours (optionnel) rattaché à la fiche créée

  const reset = () => {
    setState('form'); setTitle(''); setResult(null);
    setJsonText(''); setParseError(null); setParsed(null); setPastePdf(null);
  };

  const srcLabel = (db.sources.find((s) => s.id === srcId) || {}).nom || '—';
  const matLabel = (db.matieres.find((m) => m.id === matId) || {}).nom || '—';
  const destLabel = `${srcLabel} / ${matLabel} / ${title.trim() || 'Fiche importée'}`;
  const missing = [!srcId && 'un cours', !matId && 'une matière', !title.trim() && 'un titre'].filter(Boolean);
  const ready = missing.length === 0 && !!jsonText.trim();

  const parseJson = () => {
    const res = parsePastedJson(jsonText);
    if (!res.ok) { setParseError(res.error); return; }
    if (res.items.length === 0) {
      setParseError('Aucun item valide trouvé — vérifie que tu as bien collé toute la réponse de Claude.');
      return;
    }
    setParseError(null); setParsed(res); setState('preview');
  };
  const confirmImport = async () => {
    if (!parsed || !matId) return;
    setBusy(true);
    let pdfId = null;
    if (pastePdf) { try { pdfId = await putBlob(pastePdf); } catch (e) { /* ignore */ } }
    const res = await createFicheFromQuestions({
      matiereId: matId, titre: title, items: parsed.items, synthese: parsed.synthese, meta: parsed.meta,
      pdfId, pdfName: pastePdf ? pastePdf.name : null,
    });
    await ctx.reload();
    setResult(res); setState('done'); setBusy(false);
  };

  return (
    <Card title="Importer une fiche" icon="upload"
      action={(
        <div className="seg" style={{ transform: 'scale(.92)' }}>
          <button type="button" className={'seg-btn' + (mode === 'standard' ? ' active' : '')} onClick={() => setMode('standard')}><Icon name="filePdf" size={13} /> Standard</button>
          <button type="button" className={'seg-btn' + (mode === 'anat' ? ' active' : '')} onClick={() => setMode('anat')}><Icon name="bone" size={13} /> Anatomie</button>
          <button type="button" className={'seg-btn' + (mode === 'rattrapage' ? ' active' : '')} onClick={() => setMode('rattrapage')}><Icon name="grad" size={13} /> Rattrapage</button>
        </div>
      )}>
      {mode === 'rattrapage' && <ImportRattrapage ctx={ctx} />}
      {mode === 'anat' && (
        <div className="fadein">
          <div className="imp-field">
            <label>Type de fiche anatomie</label>
            <div className="seg" style={{ transform: 'scale(.96)', transformOrigin: 'left center' }}>
              <button type="button" className={'seg-btn' + (anatSub === 'theorie' ? ' active' : '')} onClick={() => setAnatSub('theorie')}><Icon name="list" size={13} /> Théorie</button>
              <button type="button" className={'seg-btn' + (anatSub === 'visuel' ? ' active' : '')} onClick={() => setAnatSub('visuel')}><Icon name="image" size={13} /> Schéma</button>
            </div>
            <div className="hint" style={{ marginTop: 6 }}>
              {anatSub === 'theorie'
                ? 'Colle un texte descriptif typé → extraction locale des champs (origine, insertion…), sans IA.'
                : 'Schéma annoté (coches + zones) → quiz de schéma (plusieurs vues possibles).'}
            </div>
          </div>
          {anatSub === 'theorie'
            ? <ImportAnatomieTheorie ctx={ctx} />
            : <ImportAnatomieVisuel ctx={ctx} />}
        </div>
      )}

      {mode === 'standard' && state === 'form' && (
        <div className="fadein imp-dest">
          <div className="imp-dest-head"><Icon name="folder" size={15} /> Où ranger cette fiche&nbsp;?</div>

          <DestPicker ctx={ctx} srcId={srcId} setSrcId={setSrcId} matId={matId} setMatId={setMatId} />

          <div className="imp-field">
            <label>Titre de la fiche</label>
            <input className="imp-title" placeholder="ex : Système respiratoire — chapitre 3" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <CoursePdfField file={pastePdf} onFile={setPastePdf}
            hint="Rattaché à la fiche pour « Voir le cours » et le surlignage. Facultatif." />

          <div className="imp-field">
            <label>RÉPONSE DE CLAUDE (JSON)</label>
            <textarea className="imp-title" style={{ minHeight: 160, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12.5 }}
              placeholder="Colle ici la réponse JSON que Claude t'a donnée dans le chat."
              value={jsonText} onChange={(e) => { setJsonText(e.target.value); setParseError(null); }} />
            {parseError && (
              <div className="err-mini" style={{ marginTop: 8 }}>
                <div className="em-ic crit"><Icon name="alert" size={16} /></div>
                <div className="em-body"><div className="em-title">{parseError}</div></div>
              </div>
            )}
          </div>

          <div className="imp-actions">
            <button className="btn ghost" onClick={reset}>Annuler</button>
            <button className="btn primary" onClick={parseJson} disabled={!ready}><Icon name="check" size={15} /> Importer les questions</button>
          </div>
          {missing.length > 0 && <div className="hint" style={{ marginTop: 8 }}>Il manque : {missing.join(', ')}.</div>}
        </div>
      )}

      {mode === 'standard' && state === 'preview' && parsed && (
        <div className="fadein imp-dest">
          <div className="imp-dest-head"><Icon name="check" size={15} /> Aperçu avant import</div>
          <div className="err-mini ok" style={{ marginBottom: 14 }}>
            <div className="em-ic"><Icon name="check" size={16} stroke={2.5} /></div>
            <div className="em-body">
              <div className="em-title">{parsed.counts.qcm} QCM · {parsed.counts.flashcard} flashcards · {parsed.counts.feynman} Feynman · {parsed.counts.exercice} exercice{parsed.counts.exercice > 1 ? 's' : ''} détecté{parsed.counts.qcm + parsed.counts.flashcard + parsed.counts.feynman + parsed.counts.exercice > 1 ? 's' : ''}</div>
              <div className="hint" style={{ marginTop: 4 }}>Destination : {destLabel}</div>
              {parsed.counts.ignored > 0 && (
                <div className="hint" style={{ marginTop: 4, color: 'var(--accent-2)' }}>
                  <Icon name="alert" size={12} /> {parsed.counts.ignored} item{parsed.counts.ignored > 1 ? 's' : ''} ignoré{parsed.counts.ignored > 1 ? 's' : ''} (format invalide)
                </div>
              )}
              {parsed.synthese && <div className="hint" style={{ marginTop: 4 }}>Synthèse incluse ✓</div>}
              <div className="hint" style={{ marginTop: 4 }}>
                {pastePdf ? <>PDF du cours joint : {pastePdf.name} ✓</> : 'Aucun PDF du cours joint.'}
              </div>
            </div>
          </div>
          <div className="imp-actions">
            <button className="btn ghost" onClick={() => setState('form')}>Annuler</button>
            <button className="btn primary" onClick={confirmImport} disabled={busy}><Icon name="check" size={15} /> Confirmer l'import</button>
          </div>
        </div>
      )}

      {mode === 'standard' && state === 'done' && result && (
        <div className="fadein" style={{ textAlign: 'center', padding: '6px 0' }}>
          <div className="gd-badge" style={{ width: 60, height: 60, borderRadius: 18, margin: '0 auto 14px' }}><Icon name="check" size={30} stroke={3} /></div>
          <div className="serif" style={{ fontSize: 21 }}>Fiche prête !</div>
          <div className="hint" style={{ marginTop: 8 }}>✓ {result.count} questions importées.</div>
          <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
            <button className="btn" onClick={reset}><Icon name="refresh" size={14} /> Autre fiche</button>
            <button className="btn" onClick={() => ctx.go('library')}><Icon name="book" size={14} /> Bibliothèque</button>
            <button className="btn primary" onClick={() => { ctx.setFocusFiche(result.fiche.id); ctx.go('revise'); }}><Icon name="cards" size={14} /> Réviser</button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------- streak (jours réellement actifs uniquement) ---------- */
function StreakWidget({ stats }) {
  const s = stats || { streak: 0, best: 0, activityDays: [] };
  const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const active = new Set(s.activityDays || []);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayISO = isoDate(today);
  // Monday of the current week
  const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekDates = DAYS.map((_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return isoDate(d); });

  return (
    <Card title="Série en cours" icon="fire" action={<span className="pill amber"><Icon name="trophy" size={13} /> Record {s.best || 0}j</span>}>
      <div className="row" style={{ gap: 14, marginBottom: 16, alignItems: 'baseline' }}>
        <span className="serif" style={{ fontSize: 44, lineHeight: 1, color: 'var(--accent-2)' }}>{s.streak || 0}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>jours d'affilée</div>
          <div className="hint">Ne casse pas la chaîne !</div>
        </div>
      </div>
      <div className="streak-days">
        {DAYS.map((d, i) => {
          const iso = weekDates[i];
          const done = active.has(iso);
          const isToday = iso === todayISO;
          return (
            <div className="streak-day" key={i}>
              <div className={'streak-dot' + (done ? ' on' : '') + (isToday ? ' today' : '')}>
                {done ? <Icon name="fire" size={15} fill /> : ''}
              </div>
              <span className="sd-label">{d}</span>
            </div>
          );
        })}
      </div>
      <div className="hint" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon name="info" size={14} /> Seuls tes vrais jours de révision comptent.
      </div>
    </Card>
  );
}
