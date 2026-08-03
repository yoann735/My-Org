/* ============================================================
   MedRevise — Dashboard : CTA série du jour (méthode des J),
   calendrier de la SEMAINE, import de fiche, streak.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Card, EdTop, TodaySeriesCard, DestPicker, CourseDocField, detectDocKind, matiereMeta, OverdueBox, Modal, DateActionModal, ConfirmModal } from '../components/ui.jsx';
import { ImportJsonField, ImportPreviewCard, ImportDoneScreen } from '../components/ImportFlow.jsx';
import { Tex } from '../components/Tex.jsx';
import { weekData, dueToday, dueSchemasToday, todayPlan, overdueByFiche, isWeekend, dueByCoursOn, dueFromOn, addDays, diffDays, weekendReviewByFiche, carnetV1Questions, carnetV2Questions } from '../lib/planning.js';
import { isoDate } from '../lib/sm2.js';
import { createFicheFromQuestions, appendItemsToFiche, findMatchingFiche } from '../lib/import.js';
import { putBlob } from '../lib/storage.js';
import { parsePastedJson } from '../lib/parsePastedJson.js';
import { emptyCounts } from '../lib/schema.js';
import { cleanTranscript } from '../documents/lib/transcript.js';
import { ImportAnatomieTheorie } from './ImportAnatomieTheorie.jsx';
import { ImportAnatomieVisuel } from './ImportAnatomieVisuel.jsx';
import { ImportRattrapage } from './ImportRattrapage.jsx';

const TYPE_LABEL = { qcm: 'QCM', flashcard: 'flashcards', feynman: 'Feynman' };
const fmtShort = (iso) => { const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}`; };

export function Dashboard({ ctx }) {
  const { db } = ctx;
  const [selDay, setSelDay] = useState(null);
  const [showCleaner, setShowCleaner] = useState(false);
  const due = dueToday(db);
  const dueSchemas = dueSchemasToday(db);
  const plan = todayPlan(db);
  const overdue = overdueByFiche(db);
  const startOverdueFiche = (g) => (g.isSchema ? ctx.startAnatQuiz(g.fiche, { mode: 'total' }) : ctx.startSession(g.items, g.fiche.titre + ' — Rattrapage'));

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div>
          <h1 className="serif">Bonjour 👋</h1>
          <div className="sub">Ton planning de révision selon la méthode des J.</div>
        </div>
        <div className="topbar-actions">
          <button className="btn ghost" onClick={() => setShowCleaner(true)}><Icon name="sparkle" size={14} /> Nettoyer un transcript</button>
          <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
        </div>
      </div>

      {showCleaner && (
        <Modal title="Nettoyer un transcript" onClose={() => setShowCleaner(false)}>
          <TranscriptCleanerBody />
        </Modal>
      )}

      <TodaySeriesCard plan={plan} onStart={ctx.startSession} />

      {/* grille unique (colonnes + gap partagés) : Calendrier (large) + Import à
         gauche, À rattraper + Série en cours (compactes) à droite — au lieu de
         deux grilles séparées qui ne garantissaient pas un alignement pixel-parfait. */}
      <div className="dash-grid">
        <div className="dash-grid-col">
          <Card title="Calendrier de la semaine — méthode des J" icon="calendar"
            action={<span className="pill accent"><Icon name="cards" size={13} /> {due.length} carte{due.length > 1 ? 's' : ''}{dueSchemas.length > 0 ? ` + ${dueSchemas.length} schéma${dueSchemas.length > 1 ? 's' : ''}` : ''} aujourd'hui</span>}>
            <WeekCalendar ctx={ctx} onPick={setSelDay} />
            <div className="jcal-legend" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-2)' }}>
              {db.matieres.map((m) => { const mm = matiereMeta(m); return <span key={m.id}><i style={{ background: mm.tint }} /> {mm.label}</span>; })}
            </div>
          </Card>
          <ImportPanel ctx={ctx} />
        </div>

        <div className="dash-grid-col">
          <RattrapageCard ctx={ctx} overdue={overdue} startOverdueFiche={startOverdueFiche} />
          <CarnetErreurCard ctx={ctx} />
          <WeekendReviewCard ctx={ctx} />
          <StreakWidget stats={ctx.stats} />
        </div>
      </div>

      {selDay && <DayPopup day={selDay} ctx={ctx} onClose={() => setSelDay(null)} />}
    </div>
  );
}

/* ---------- boîte de rattrapage (Dashboard UNIQUEMENT) ----------
   RETARDS UNIQUEMENT (overdueByFiche, réutilise OverdueBox en mode `bare` —
   aucune logique dupliquée). L'ancien carnet d'erreurs (missedQuestions/
   weakPoints) qui vivait ici a été entièrement retiré — le SEUL carnet
   d'erreurs de l'app est désormais le v2 (CarnetErreurCard ci-dessous,
   SCREENS.carnet). NE TOUCHE JAMAIS aux dates : "Rattraper" lance une
   session normale (ctx.startSession → advanceQuestion), qui fait sortir la
   carte de la boîte au prochain rendu (cursor avancé → plus overdue).
   Week-end (isWeekend, planning.js) : bordure/fond verts + titre dédié ; en
   semaine, même contenu, style neutre. */
function RattrapageCard({ ctx, overdue, startOverdueFiche }) {
  if (!overdue.length) return null;

  const weekend = isWeekend();
  const title = weekend ? 'Retards de la semaine à rattraper' : 'À rattraper';

  return (
    <Card title={title} icon="clock" className={weekend ? 'rattrapage-weekend' : ''}
      action={<span className="pill">{overdue.length} fiche{overdue.length > 1 ? 's' : ''}</span>}>
      <OverdueBox bare groups={overdue} onStartFiche={startOverdueFiche}
        onStartAll={(items) => ctx.startSession(items, 'Rattrapage')}
        onDismissFiche={ctx.dismissOverdue} />
    </Card>
  );
}

// aperçu carnet (Dashboard, liste compacte) : {{mots}} de cloze dépliés en
// texte normal (pas d'interactivité dans un simple aperçu) — même traitement
// que CarnetDashboard.jsx/MobileHome.jsx. Le résultat DOIT être rendu via
// <Tex> côté appelant pour le LaTeX ($...$) — cette fonction ne fait que le
// nettoyage cloze, elle ne rend rien seule.
const carnetPreviewText = (s, n) => {
  const cleaned = (s || '').replace(/\{\{([^{}]+)\}\}/g, '$1');
  return cleaned.length > n ? cleaned.slice(0, n).trim() + '…' : cleaned;
};

/* ---------- carnet d'erreurs v2 (Dashboard UNIQUEMENT) ----------
   Emplacement principal de la card de synthèse : compteurs + les 5 erreurs
   V1 les plus RÉCENTES (tri par carnetAt desc — simple intitulé, sans détail,
   juste pour voir d'un coup d'œil ce qui est en carnet) + entrée vers l'écran
   dédié (SCREENS.carnet). SEUL carnet d'erreurs de l'app désormais — l'ancien
   mécanisme (missed/weakPoints, qui vivait dans RattrapageCard ci-dessus) a
   été entièrement retiré. */
function CarnetErreurCard({ ctx }) {
  const { db } = ctx;
  const v1 = carnetV1Questions(db);
  const aRevoir = carnetV2Questions(db, 'a_revoir');
  if (!v1.length) return null;
  const recent = [...v1].sort((a, b) => (b.carnetAt || '').localeCompare(a.carnetAt || '')).slice(0, 5);
  return (
    <Card title="Carnet d'erreurs" icon="target" action={<span className="pill">{v1.length}</span>}>
      <div className="hint" style={{ fontSize: 12.5, marginBottom: 10 }}>
        {v1.length} flashcard{v1.length > 1 ? 's' : ''} en carnet · {aRevoir.length} flashcard{aRevoir.length > 1 ? 's' : ''} d'erreur à revoir
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {recent.map((v) => (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 9, background: 'var(--bg-2)' }}>
            <span style={{ width: 3, height: 14, borderRadius: 2, background: 'var(--accent)', flex: '0 0 auto' }} />
            <span style={{ fontSize: 12.5, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <Tex>{carnetPreviewText(v.recto, 70)}</Tex>
            </span>
          </div>
        ))}
      </div>
      <button className="btn primary sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => ctx.go('carnet')}>
        <Icon name="ext" size={13} /> Ouvrir le carnet
      </button>
    </Card>
  );
}

/* ---------- révision du week-end (Dashboard UNIQUEMENT, isWeekend) ----------
   DISTINCTE de RattrapageCard (retards/erreurs) et des exos dus normaux
   (dueExosOn, calendrier) : ici, des exos DÉJÀ faits cette semaine (lundi →
   aujourd'hui, weekendReviewByFiche), 2 max par fiche, à refaire pour ancrer.
   Lancés via startExercice(..., { mode: 'weekend' }) — AUCUNE écriture côté
   Exercice.jsx (voir Workstation.applyResult) : rejouer ne touche jamais le
   statut/historique/dueDate normal de l'exo, session bonus pure. */
function WeekendReviewCard({ ctx }) {
  const { db } = ctx;
  if (!isWeekend()) return null;
  const groups = weekendReviewByFiche(db);
  if (!groups.length) return null;
  const allItems = groups.flatMap((g) => g.items);

  return (
    <Card title="Révision du week-end" icon="refresh" className="rattrapage-weekend"
      action={<span className="pill">{allItems.length} exo{allItems.length > 1 ? 's' : ''}</span>}>
      <div className="hint" style={{ fontSize: 12, marginBottom: 10 }}>
        Les exercices faits cette semaine, à refaire pour ancrer — ça ne touche pas leur statut normal.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {groups.map((g, i) => {
          const meta = matiereMeta(g.matiere);
          return (
            <div className="row spread" key={g.fiche.id} style={{ gap: 8, padding: '7px 0', borderTop: i ? '1px solid var(--border-2)' : 'none' }}>
              <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.fiche.titre}</div>
                <div className="hint" style={{ fontSize: 11 }}>{meta.label} · {g.items.length} exo{g.items.length > 1 ? 's' : ''}</div>
              </div>
              <button className="btn ghost sm" onClick={() => ctx.startExercice(g.items, g.fiche.titre + ' — Révision week-end', { mode: 'weekend' })}>Refaire</button>
            </div>
          );
        })}
      </div>
      <button className="btn ghost sm" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
        onClick={() => ctx.startExercice(allItems, 'Révision du week-end', { mode: 'weekend' })}>
        Tout refaire ({allItems.length})
      </button>
    </Card>
  );
}

/* ---------- week calendar ---------- */
/** libellé du pied de case-jour (Fiches/schémas + Exercices) — extrait pour
   être réutilisé tel quel si besoin, et pour ne pas alourdir le JSX de la
   case avec la logique des séparateurs " · ". */
function dayFootLabel(day) {
  const parts = [];
  if (day.cardsTotal > 0) parts.push(day.isProjected ? `${day.cardsTotal} cours` : `${day.cardsTotal} carte${day.cardsTotal > 1 ? 's' : ''}`);
  if ((day.schemas || []).length > 0) parts.push(`${day.schemas.length} schéma${day.schemas.length > 1 ? 's' : ''}`);
  if (day.exosTotal > 0) parts.push(`${day.exosTotal} exo${day.exosTotal > 1 ? 's' : ''}`);
  return parts.join(' · ');
}
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
                    <div className="wcal-course" key={c.fiche.id + '-' + (c.jLabel || '')}>
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
                    <div className="wcal-course" key={s.fiche.id + '-' + (s.jLabel || '')}>
                      <span className="wcc-bar" style={{ background: meta.tint }} />
                      <div className="wcc-text">
                        <div className="wcc-cat" style={{ color: meta.tint }}><Icon name="image" size={10} /> {meta.label}</div>
                        <div className="wcc-title">{s.fiche.titre} <span className="wcc-j">{s.jLabel} · schéma</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* section "Exercices" — canal séparé de la théorie ci-dessus
                 (day.exos, planning.js dueExosByFicheOn), séparateur + libellé
                 discrets (.wcal-exos) pour la repérer d'un coup d'œil. */}
              {(day.exos || []).length > 0 && (
                <div className="wcal-exos">
                  <div className="wcal-exos-label">Exercices</div>
                  {day.exos.map((g) => {
                    const meta = matiereMeta(g.matiere);
                    return (
                      <div className="wcal-course" key={g.fiche.id}>
                        <span className="wcc-bar" style={{ background: meta.tint }} />
                        <div className="wcc-text">
                          <div className="wcc-cat" style={{ color: meta.tint }}>{meta.label}</div>
                          <div className="wcc-title">{g.fiche.titre} <span className="wcc-j">{g.items.length} exo{g.items.length > 1 ? 's' : ''}</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {day.total > 0 && <div className="wcal-foot">{dayFootLabel(day)}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- day detail popup ---------- */
/** libellé d'en-tête pour un jour non-aujourd'hui (today affiche juste la date,
   inchangé) — combine "cours prévus" (théorie projetée) et "exercices" (canal
   séparé, jamais mélangé dans le compte) selon ce que le jour contient. */
function dayHeaderLabel(day) {
  const theoryN = day.byFiche.length + (day.schemas || []).length;
  const exN = day.exosTotal || 0;
  if (!day.isProjected) return `${day.total} carte${day.total > 1 ? 's' : ''}`;
  const parts = [];
  if (theoryN > 0) parts.push(`${theoryN} cours prévu${theoryN > 1 ? 's' : ''}`);
  if (exN > 0) parts.push(`${exN} exercice${exN > 1 ? 's' : ''}`);
  return parts.join(' + ') || `${day.total} cours prévu${day.total > 1 ? 's' : ''}`;
}
function DayPopup({ day, ctx, onClose }) {
  // aujourd'hui : regroupement RÉEL par matière+type (inchangé, actionnable).
  // jour futur (isProjected) : day.byFiche/day.schemas sont déjà des projections
  // { fiche, matiere, jLabel } — même forme que dans la case du calendrier.
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

  // rééquilibrage calendrier (étape 2/3) : recalculé depuis ctx.db (RÉEL, pas
  // day.byFiche qui pour un jour futur est une PROJECTION) — le jour source
  // dégonfle et disparaît de la liste dès qu'il n'a plus rien de dû, sans
  // fermer la popup, puisque ce recalcul suit ctx.db à chaque rendu.
  const [reorg, setReorg] = useState(false);
  const [moveTarget, setMoveTarget] = useState(null); // { type: 'source'|'fiche', id, nom, count, cascadeCount }
  const [cascadeOn, setCascadeOn] = useState(false);
  const coursGroups = reorg ? dueByCoursOn(ctx.db, day.date) : [];
  // cascadeCount précalculé au clic sur « Déplacer » (voir dueFromOn, étape 3/3) —
  // ne dépend PAS de la date choisie dans la modale, seulement de day.date/du
  // périmètre, donc pas besoin de le recalculer à chaque frappe dans le sélecteur.
  const startMove = (target) => {
    const cascadeCount = target.type === 'source'
      ? dueFromOn(ctx.db, day.date, { sourceId: target.id }).length
      : dueFromOn(ctx.db, day.date, { ficheId: target.id }).length;
    setCascadeOn(false);
    setMoveTarget({ ...target, cascadeCount });
  };
  const confirmMove = async (toDate) => {
    if (!moveTarget) return;
    if (moveTarget.type === 'source') await ctx.moveSourceDay(moveTarget.id, day.date, toDate, { cascade: cascadeOn });
    else await ctx.moveFicheDay(moveTarget.id, day.date, toDate, { cascade: cascadeOn });
    setMoveTarget(null);
  };
  // « Sauter » : disponible pour N'IMPORTE QUEL jour affiché (day.date), pas
  // seulement aujourd'hui — cible = cartes dues CE jour précis.
  const [skipTarget, setSkipTarget] = useState(null); // { type, id, nom, count }
  const confirmSkip = async () => {
    if (!skipTarget) return;
    if (skipTarget.type === 'source') await ctx.skipDaySource(skipTarget.id, day.date);
    else await ctx.skipDayFiche(skipTarget.id, day.date);
    setSkipTarget(null);
  };

  return (
    <div className="day-pop-scrim" onClick={onClose}>
      <div className="day-pop" onClick={(e) => e.stopPropagation()}>
        <div className="day-pop-head">
          <div className="row spread">
            <div>
              <div className="kpi-label" style={{ marginBottom: 4 }}>{day.isToday ? "Aujourd'hui" : 'Le ' + dateLabel}</div>
              <div className="serif" style={{ fontSize: 22, textTransform: 'capitalize' }}>
                {day.isToday ? dateLabel : dayHeaderLabel(day)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className={reorg ? 'btn primary sm' : 'btn ghost sm'} onClick={() => setReorg((v) => !v)} title="Déplacer des cartes de ce jour vers un autre">
                <Icon name="sliders" size={13} /> Réorganiser
              </button>
              <button className="icon-btn sm" onClick={onClose}><Icon name="x" size={16} /></button>
            </div>
          </div>
        </div>
        <div className="day-pop-body">
          {reorg ? (
            coursGroups.length === 0 ? (
              <div className="hint">Plus aucune carte dues ce jour-là (qcm/flashcards) — rien à déplacer.</div>
            ) : coursGroups.map((cg) => {
              const srcMeta = matiereMeta(null);
              return (
                <div key={cg.source ? cg.source.id : '?'} style={{ marginBottom: 14 }}>
                  <div className="row spread" style={{ marginBottom: 6 }}>
                    <div className="dl-title">
                      <span className="tsrc-ic" style={{ background: `color-mix(in srgb, ${(cg.source && cg.source.tint) || srcMeta.tint} 16%, transparent)`, color: (cg.source && cg.source.tint) || srcMeta.tint, marginRight: 6 }}>
                        <Icon name={(cg.source && cg.source.icon) || 'folder'} size={12} />
                      </span>
                      {cg.source ? cg.source.nom : 'Sans cours'} <span className="hint">· {cg.total} carte{cg.total > 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn ghost sm" onClick={() => setSkipTarget({ type: 'source', id: cg.source.id, nom: cg.source.nom, count: cg.total })} disabled={!cg.source}>
                        <Icon name="clock" size={12} /> Sauter ce jour
                      </button>
                      <button className="btn ghost sm" onClick={() => startMove({ type: 'source', id: cg.source.id, nom: cg.source.nom, count: cg.total })} disabled={!cg.source}>
                        <Icon name="arrowR" size={12} /> Déplacer le cours
                      </button>
                    </div>
                  </div>
                  {cg.fiches.map((g) => (
                    <div className="day-line" key={g.fiche.id}>
                      <div className="dl-ic" style={{ background: `color-mix(in srgb, ${matiereMeta(g.matiere).tint} 15%, transparent)`, color: matiereMeta(g.matiere).tint }}><Icon name="cards" size={17} /></div>
                      <div className="dl-main">
                        <div className="dl-title">{g.fiche.titre} <span className="j-tag">{g.jLabel}</span></div>
                        <div className="dl-sub"><span>{g.items.length} carte{g.items.length > 1 ? 's' : ''} · {matiereMeta(g.matiere).label}</span></div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn ghost sm" onClick={() => setSkipTarget({ type: 'fiche', id: g.fiche.id, nom: g.fiche.titre, count: g.items.length })}>
                          <Icon name="clock" size={12} /> Sauter
                        </button>
                        <button className="btn ghost sm" onClick={() => startMove({ type: 'fiche', id: g.fiche.id, nom: g.fiche.titre, count: g.items.length })}>
                          <Icon name="arrowR" size={12} /> Déplacer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })
          ) : (
          <>
          {day.isProjected && (
            <div className="hint" style={{ marginBottom: 10 }}><Icon name="info" size={12} /> Projection à titre indicatif (méthode des J) — se recalcule selon tes révisions réelles.</div>
          )}
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
          {day.isProjected && day.byFiche.map((c) => {
            const meta = matiereMeta(c.matiere);
            return (
              <div className="day-line" key={c.fiche.id}>
                <div className="dl-ic" style={{ background: `color-mix(in srgb, ${meta.tint} 15%, transparent)`, color: meta.tint }}><Icon name="cards" size={17} /></div>
                <div className="dl-main">
                  <div className="dl-title">{c.fiche.titre}</div>
                  <div className="dl-sub"><span>{meta.label} · <span className="j-tag">{c.jLabel}</span></span></div>
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
                  <div className="dl-sub"><span>{s.fiche.titre}{day.isProjected ? <> · <span className="j-tag">{s.jLabel}</span></> : null}</span></div>
                </div>
                {day.isToday && <button className="btn ghost sm" onClick={() => { onClose(); ctx.startAnatQuiz(s.fiche, { mode: 'total' }); }}><Icon name="play" size={13} /> Réviser</button>}
              </div>
            );
          })}
          {/* section "Exercices" — canal séparé de la théorie ci-dessus (day.exos,
             planning.js dueExosByFicheOn), séparateur + libellé discrets
             (.day-pop-exos) pour la repérer d'un coup d'œil. Seul point d'accès
             aux exercices du jour depuis le Dashboard (plus de card dédiée). */}
          {(day.exos || []).length > 0 && (
            <div className="day-pop-exos">
              <div className="day-pop-exos-label">Exercices</div>
              {day.exos.map((g) => {
                const meta = matiereMeta(g.matiere);
                return (
                  <div className="day-line" key={g.fiche.id}>
                    <div className="dl-ic" style={{ background: `color-mix(in srgb, ${meta.tint} 15%, transparent)`, color: meta.tint }}><Icon name="target" size={17} /></div>
                    <div className="dl-main">
                      <div className="dl-title">{g.items.length} exercice{g.items.length > 1 ? 's' : ''} · {meta.label}</div>
                      <div className="dl-sub"><span>{g.fiche.titre}</span></div>
                    </div>
                    {day.isToday && <button className="btn ghost sm" onClick={() => { onClose(); ctx.startExercice(g.items, g.fiche.titre + ' — Exercices'); }}>Faire</button>}
                  </div>
                );
              })}
            </div>
          )}
          </>
          )}
        </div>
        {!reorg && (
          <div className="day-pop-foot">
            <button className="btn" style={{ flex: 1 }} onClick={onClose}>Fermer</button>
            {day.isToday && day.items.length > 0 && (
              <button className="btn primary" style={{ flex: 1 }} onClick={() => { onClose(); ctx.startSession(day.items, 'Révision du jour'); }}>
                <Icon name="play" size={15} fill /> Réviser les cartes
              </button>
            )}
          </div>
        )}
      </div>
      {moveTarget && (
        <DateActionModal
          title={`Déplacer « ${moveTarget.nom} »`}
          label="Nouvelle date"
          confirmLabel="Déplacer"
          count={cascadeOn ? moveTarget.cascadeCount : moveTarget.count}
          minDate={cascadeOn ? addDays(day.date, 1) : undefined}
          cascade={{
            checked: cascadeOn,
            onChange: setCascadeOn,
            label: `Décaler aussi les révisions suivantes de ${moveTarget.type === 'source' ? 'ce cours' : 'cette fiche'} (${moveTarget.cascadeCount} carte${moveTarget.cascadeCount > 1 ? 's' : ''} au total)`,
          }}
          body={(date) => cascadeOn
            ? `${moveTarget.cascadeCount} carte${moveTarget.cascadeCount > 1 ? 's' : ''} (dues ce jour-là et toutes leurs échéances futures déjà programmées) ${moveTarget.cascadeCount > 1 ? 'seront décalées' : 'sera décalée'} de ${diffDays(day.date, date)} jour${diffDays(day.date, date) > 1 ? 's' : ''}. Les cartes déjà passées avant ce jour ne bougent pas. Palier, historique et progression restent inchangés.`
            : `${moveTarget.count} carte${moveTarget.count > 1 ? 's' : ''} ${moveTarget.count > 1 ? 'seront déplacées' : 'sera déplacée'} vers cette date. Palier, historique et progression restent inchangés — seule la date de réapparition change.`}
          onConfirm={confirmMove}
          onCancel={() => setMoveTarget(null)}
        />
      )}
      {skipTarget && (
        <ConfirmModal
          title={`Sauter ce jour — « ${skipTarget.nom} »`}
          body={`${skipTarget.count} carte${skipTarget.count > 1 ? 's' : ''} ${skipTarget.count > 1 ? 'avanceront' : 'avancera'} à leur palier suivant, comme lors d'une révision réussie ce jour-là (sans note à donner) — elles disparaissent de ce jour, le reste du planning est inchangé.`}
          confirmLabel="Sauter"
          onConfirm={confirmSkip}
          onCancel={() => setSkipTarget(null)}
        />
      )}
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
  const [pasteDoc, setPasteDoc] = useState(null); // document du cours (optionnel, PDF OU HTML) rattaché à la fiche créée
  const [forceNew, setForceNew] = useState(false); // override : créer quand même une nouvelle fiche malgré le titre identique
  const [startDate, setStartDate] = useState(isoDate()); // date du palier J0 (méthode des J), modifiable à l'aperçu

  const reset = () => {
    setState('form'); setTitle(''); setResult(null);
    setJsonText(''); setParseError(null); setParsed(null); setPasteDoc(null); setForceNew(false); setStartDate(isoDate());
  };

  const srcLabel = (db.sources.find((s) => s.id === srcId) || {}).nom || '—';
  const matLabel = (db.matieres.find((m) => m.id === matId) || {}).nom || '—';
  // fiche existante de même destination (même matière + même titre) — évite de
  // créer une fiche en double quand Théorie et Pratique d'un même cours sont
  // importées séparément (§2). Par défaut, on y ajoute plutôt que d'en créer une.
  const matchedFiche = useMemo(() => findMatchingFiche(db.fiches, { matiereId: matId, titre: title }), [db.fiches, matId, title]);
  const willAppend = !!matchedFiche && !forceNew;
  const destLabel = willAppend
    ? `${srcLabel} / ${matLabel} / ${matchedFiche.titre} (fiche existante)`
    : `${srcLabel} / ${matLabel} / ${title.trim() || 'Fiche importée'}`;
  const missing = [!srcId && 'un cours', !matId && 'une matière', !title.trim() && 'un titre'].filter(Boolean);
  // le JSON collé est OPTIONNEL depuis l'ajout de l'import "fiche HTML seule" :
  // il faut soit des questions collées, soit un document (PDF/HTML) à rattacher —
  // les deux vides n'ont rien à importer.
  const ready = missing.length === 0 && (!!jsonText.trim() || !!pasteDoc);
  const previewDuplicates = useMemo(() => {
    if (!willAppend || !parsed) return 0;
    const existingSrc = new Set(db.questions.filter((q) => q.ficheId === matchedFiche.id).map((q) => q.srcId).filter(Boolean));
    return parsed.items.filter((it) => it.id && existingSrc.has(it.id)).length;
  }, [willAppend, parsed, matchedFiche, db.questions]);

  const parseJson = () => {
    // pas de JSON collé → fiche (ou doc rattaché à une fiche existante) SANS
    // aucune question, cartes créées après coup dans l'app ("Voir le cours").
    if (!jsonText.trim()) {
      setParseError(null);
      setParsed({ items: [], meta: null, counts: emptyCounts(), synthese: '', errors: [] });
      setState('preview');
      return;
    }
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
    let pdfId = null, pdfName = null, htmlId = null, htmlName = null;
    if (pasteDoc) {
      try {
        const blobId = await putBlob(pasteDoc);
        if (detectDocKind(pasteDoc) === 'html') { htmlId = blobId; htmlName = pasteDoc.name; }
        else { pdfId = blobId; pdfName = pasteDoc.name; }
      } catch (e) { /* ignore */ }
    }
    let res;
    if (willAppend) {
      // meta (ex. difficulte_chapitre) : même correctif que ImportRattrapage.jsx —
      // sans ce paramètre, un ajout à une fiche existante perdait silencieusement
      // le meta du paste (voir appendItemsToFiche, lib/import.js).
      const r = await appendItemsToFiche({ ficheId: matchedFiche.id, items: parsed.items, startDate, meta: parsed.meta });
      if (pdfId) await ctx.setFichePdf(matchedFiche.id, pdfId, pdfName);
      if (htmlId) await ctx.setFicheHtml(matchedFiche.id, htmlId, htmlName);
      res = { fiche: r.fiche, count: r.count, duplicates: r.duplicates, appended: true };
    } else {
      const r = await createFicheFromQuestions({
        matiereId: matId, titre: title, items: parsed.items, synthese: parsed.synthese, meta: parsed.meta,
        pdfId, pdfName, htmlId, htmlName, startDate,
      });
      res = { fiche: r.fiche, count: r.count, duplicates: 0, appended: false };
    }
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

          {/* fiche existante détectée (même matière + même titre) — évite de créer
             une fiche en double (ex: Théorie puis Pratique du même cours). Par
             défaut on ajoute à cette fiche ; override explicite possible. */}
          {matchedFiche && (
            <div className="err-mini ok" style={{ marginBottom: 14 }}>
              <div className="em-ic"><Icon name="check" size={16} /></div>
              <div className="em-body">
                <div className="em-title">Fiche existante trouvée : « {matchedFiche.titre} »</div>
                <div className="hint">
                  {forceNew
                    ? <>Une nouvelle fiche sera créée quand même, malgré le titre identique. <button type="button" className="linklike" onClick={() => setForceNew(false)}>Ajouter plutôt à la fiche existante</button></>
                    : <>Les items seront ajoutés à cette fiche (pas de nouvelle fiche créée). <button type="button" className="linklike" onClick={() => setForceNew(true)}>Créer quand même une nouvelle fiche</button></>}
                </div>
              </div>
            </div>
          )}

          <CourseDocField file={pasteDoc} onFile={setPasteDoc}
            hint="PDF (lecture + surlignage) ou fiche HTML autonome. Rattaché à la fiche pour « Voir le cours ». Facultatif." />

          <ImportJsonField label="RÉPONSE DE CLAUDE (JSON)" placeholder="Colle ici la réponse JSON que Claude t'a donnée dans le chat."
            value={jsonText} onChange={(v) => { setJsonText(v); setParseError(null); }} error={parseError} />

          <div className="imp-actions">
            <button className="btn ghost" onClick={reset}>Annuler</button>
            <button className="btn primary" onClick={parseJson} disabled={!ready}><Icon name="check" size={15} /> {jsonText.trim() ? 'Importer les questions' : 'Créer la fiche'}</button>
          </div>
          {missing.length > 0 && <div className="hint" style={{ marginTop: 8 }}>Il manque : {missing.join(', ')}.</div>}
          {missing.length === 0 && !jsonText.trim() && !pasteDoc && (
            <div className="hint" style={{ marginTop: 8 }}>Colle des questions (JSON) et/ou attache un document (PDF/HTML) pour continuer — une fiche HTML seule, sans questions, est possible.</div>
          )}
        </div>
      )}

      {mode === 'standard' && state === 'preview' && parsed && (
        <ImportPreviewCard counts={parsed.counts} errors={parsed.errors} destLabel={(willAppend ? 'ajout à — ' : 'nouvelle fiche — ') + destLabel}
          infoLines={[
            parsed.synthese && !willAppend && { text: 'Synthèse incluse ✓' },
            { text: pasteDoc ? <>{detectDocKind(pasteDoc) === 'html' ? 'Fiche HTML jointe' : 'PDF du cours joint'} : {pasteDoc.name} ✓</> : 'Aucun document du cours joint.' },
            willAppend && previewDuplicates > 0 && { text: `${previewDuplicates} doublon${previewDuplicates > 1 ? 's' : ''} ignoré${previewDuplicates > 1 ? 's' : ''} (déjà dans la fiche)`, icon: 'alert', accent: true },
          ]}
          startDate={startDate} onStartDateChange={setStartDate}
          onBack={() => setState('form')} onConfirm={confirmImport} busy={busy} />
      )}

      {mode === 'standard' && state === 'done' && result && (
        <ImportDoneScreen title={result.appended ? 'Items ajoutés !' : 'Fiche prête !'}
          message={result.count === 0
            ? <>✓ Fiche créée, sans question pour l’instant — ajoute des cartes depuis « Voir le cours ».</>
            : <>
              ✓ {result.count} question{result.count > 1 ? 's' : ''} {result.appended ? 'ajoutée' + (result.count > 1 ? 's' : '') : 'importée' + (result.count > 1 ? 's' : '')}
              {result.duplicates > 0 && ` · ${result.duplicates} doublon${result.duplicates > 1 ? 's' : ''} ignoré${result.duplicates > 1 ? 's' : ''}`}.
            </>}
          onReset={reset} ctx={ctx} ficheId={result.fiche.id} />
      )}
    </Card>
  );
}

/* ---------- nettoyeur de transcript (presse-papier), ouvert en overlay ----------
   RÉUTILISE cleanTranscript (documents/lib/transcript.js), la même fonction
   que le mode "nouveau transcript" de la Bibliothèque — aucune duplication.
   Ici, aucun enregistrement : coller → nettoyer → copier, rien de plus. */
function TranscriptCleanerBody() {
  const [raw, setRaw] = useState('');
  const [cleaned, setCleaned] = useState(null); // null = pas encore nettoyé
  const [copied, setCopied] = useState(false);

  const clean = () => { setCleaned(cleanTranscript(raw).cleaned); setCopied(false); };
  const copy = async () => {
    if (!cleaned) return;
    try {
      await navigator.clipboard.writeText(cleaned);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (e) { /* ignore */ }
  };

  return (
    <>
      <div className="hint" style={{ marginBottom: 10 }}>
        Colle un transcript brut (horodatages, hésitations…) pour obtenir une version lisible — rien n'est enregistré, purement presse-papier.
      </div>
      <div className="imp-field">
        <label>Transcript brut (collé)</label>
        <textarea className="imp-title" style={{ minHeight: 140, resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
          placeholder="Colle ici ton transcript brut…" value={raw} onChange={(e) => { setRaw(e.target.value); setCleaned(null); }} />
      </div>
      <div className="imp-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" disabled={!raw.trim()} onClick={clean}><Icon name="sparkle" size={14} /> Nettoyer</button>
      </div>
      {cleaned !== null && (
        <div className="fadein" style={{ marginTop: 14 }}>
          <div className="hint" style={{ fontWeight: 700, marginBottom: 4 }}>Résultat nettoyé</div>
          <pre className="rt-diff">{cleaned || "(le nettoyage n'a rien laissé — vérifie le texte collé)"}</pre>
          <div className="imp-actions" style={{ marginTop: 10, justifyContent: 'flex-start' }}>
            <button className="btn" onClick={copy} disabled={!cleaned}><Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copié !' : 'Copier le texte nettoyé'}</button>
          </div>
        </div>
      )}
    </>
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
