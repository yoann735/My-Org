/* ============================================================
   MedRevise — Dashboard : CTA série du jour (méthode des J),
   calendrier de la SEMAINE, import de fiche, streak.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Card, EdTop, TodaySeriesCard, DestPicker, matiereMeta } from '../components/ui.jsx';
import { weekData, dueToday, todayPlan } from '../lib/planning.js';
import { isoDate } from '../lib/sm2.js';
import { importStandard } from '../lib/import.js';
import { putBlob } from '../lib/storage.js';
import { ImportAnatomie } from './ImportAnatomie.jsx';

const TYPE_LABEL = { qcm: 'QCM', flashcard: 'flashcards', feynman: 'Feynman' };
const fmtShort = (iso) => { const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}`; };

export function Dashboard({ ctx }) {
  const { db } = ctx;
  const [selDay, setSelDay] = useState(null);
  const due = dueToday(db);
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
        action={<span className="pill accent"><Icon name="cards" size={13} /> {due.length} cartes aujourd'hui</span>}>
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
                {day.byFiche.length === 0 && <div className="wcal-empty">{day.isPast ? '' : '—'}</div>}
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
              </div>
              {day.total > 0 && <div className="wcal-foot">{day.total} carte{day.total > 1 ? 's' : ''}</div>}
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
        </div>
        <div className="day-pop-foot">
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>Fermer</button>
          {day.isToday && day.total > 0 && (
            <button className="btn primary" style={{ flex: 1 }} onClick={() => { onClose(); ctx.startSession(day.items, 'Révision du jour'); }}>
              <Icon name="play" size={15} fill /> Réviser maintenant
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- import : drop / paste → destination → génération ---------- */
function ImportPanel({ ctx }) {
  const { db } = ctx;
  const [mode, setMode] = useState('standard'); // standard | anat
  const [state, setState] = useState('empty'); // empty | dest | loading | done
  const [over, setOver] = useState(false);
  const [contenu, setContenu] = useState('');
  const [pdfBlob, setPdfBlob] = useState(null);
  const sources = db.sources.filter((s) => !s.archive);
  const [srcId, setSrcId] = useState(() => (sources[0] || {}).id);
  const matieresFor = (sid) => db.matieres.filter((m) => m.sourceId === sid && !m.archive);
  const [matId, setMatId] = useState(() => (matieresFor((sources[0] || {}).id)[0] || {}).id || null);
  const [title, setTitle] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file) => {
    if (!file) return;
    setState('dest');
    if (file.type === 'text/plain' || /\.(txt|md)$/i.test(file.name)) {
      setContenu(await file.text());
    } else if (file.type === 'application/pdf') {
      setPdfBlob(file); // stored as blob; texte à coller (pas d'OCR en v1)
    }
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
  };

  const canGen = !!(matId && contenu.trim().length > 20);

  const generate = async () => {
    if (!canGen) return;
    setState('loading'); setBusy(true);
    let pdfId = null;
    if (pdfBlob) { try { pdfId = await putBlob(pdfBlob); } catch (e) { /* ignore */ } }
    const res = await importStandard({ matiereId: matId, titre: title, contenu, pdfId });
    await ctx.reload();
    setResult(res); setState('done'); setBusy(false);
  };
  const reset = () => { setState('empty'); setContenu(''); setPdfBlob(null); setTitle(''); setResult(null); };

  return (
    <Card title="Importer une fiche" icon="upload"
      action={(
        <div className="seg" style={{ transform: 'scale(.92)' }}>
          <button type="button" className={'seg-btn' + (mode === 'standard' ? ' active' : '')} onClick={() => setMode('standard')}><Icon name="filePdf" size={13} /> Standard</button>
          <button type="button" className={'seg-btn' + (mode === 'anat' ? ' active' : '')} onClick={() => setMode('anat')}><Icon name="bone" size={13} /> Anatomie</button>
        </div>
      )}>
      {mode === 'anat' && <ImportAnatomie ctx={ctx} onDone={() => ctx.go('library')} />}
      {mode === 'standard' && state === 'empty' && (
        <div className="fadein">
          <label className={'dz-compact dz-tall' + (over ? ' over' : '')}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]); }}>
            <input type="file" accept=".txt,.md,.pdf,image/*" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files[0])} />
            <div className="dz-ic"><Icon name="upload" size={26} /></div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Glisse ta fiche ici</div>
            <div className="hint" style={{ marginTop: 5 }}>PDF, image ou texte — tu choisis ensuite sa destination</div>
          </label>
          <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setState('dest')}><Icon name="edit" size={13} /> Ou coller du texte</button>
        </div>
      )}

      {mode === 'standard' && state === 'dest' && (
        <div className="fadein imp-dest">
          <div className="imp-dest-head"><Icon name="folder" size={15} /> Où ranger cette fiche&nbsp;?</div>

          <DestPicker ctx={ctx} srcId={srcId} setSrcId={setSrcId} matId={matId} setMatId={setMatId} />

          <div className="imp-field">
            <label>Titre de la fiche <span className="imp-opt">(optionnel)</span></label>
            <input className="imp-title" placeholder="ex : Système respiratoire — chapitre 3" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="imp-field">
            <label>Contenu de la fiche {pdfBlob && <span className="imp-opt">(PDF conservé · colle le texte ci-dessous)</span>}</label>
            <textarea className="imp-title" style={{ minHeight: 120, resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Colle ici le texte de ton cours (l'IA génère QCM, flashcards et Feynman à partir de CE texte uniquement)…"
              value={contenu} onChange={(e) => setContenu(e.target.value)} />
          </div>

          <div className="imp-actions">
            <button className="btn ghost" onClick={reset}>Annuler</button>
            <button className="btn primary" onClick={generate} disabled={!canGen || busy}><Icon name="sparkle" size={15} /> Générer les questions</button>
          </div>
          {!canGen && <div className="hint" style={{ marginTop: 8 }}>Choisis une matière et colle au moins quelques lignes de cours.</div>}
        </div>
      )}

      {mode === 'standard' && state === 'loading' && (
        <div className="fadein" style={{ textAlign: 'center', padding: '24px 0' }}>
          <div className="gen-spinner" style={{ width: 48, height: 48, margin: '0 auto 16px' }} />
          <div style={{ fontWeight: 600, fontSize: 16 }}>Génération de tes questions…</div>
          <div className="hint" style={{ marginTop: 6 }}>{title ? `« ${title} »` : 'Nouvelle fiche'}</div>
        </div>
      )}

      {mode === 'standard' && state === 'done' && result && (
        <div className="fadein" style={{ textAlign: 'center', padding: '6px 0' }}>
          <div className="gd-badge" style={{ width: 60, height: 60, borderRadius: 18, margin: '0 auto 14px' }}><Icon name="check" size={30} stroke={3} /></div>
          <div className="serif" style={{ fontSize: 21 }}>Fiche prête !</div>
          <div className="hint" style={{ marginTop: 8 }}>✓ {result.count} questions générées{result.mock ? ' (démo hors-ligne — IA réelle sur Vercel)' : ''}.</div>
          <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
            <button className="btn" onClick={reset}><Icon name="refresh" size={14} /> Autre fiche</button>
            <button className="btn" onClick={() => ctx.go('library')}><Icon name="book" size={14} /> Bibliothèque</button>
            <button className="btn primary" onClick={() => ctx.go('revise')}><Icon name="cards" size={14} /> Réviser</button>
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
