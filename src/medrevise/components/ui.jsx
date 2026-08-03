/* ============================================================
   MedRevise — UI primitives + shell widgets. Reuses the ported
   etudes.css classes for visual fidelity, but is wired to our real
   data model (matiere = {id,nom,couleur,icon}, fiche, questions).
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { Icon } from '../../shared/Icon.jsx';
import { todayISO } from '../lib/sm2.js';

const FALLBACK_TINT = '#7C6FE0';
/** palette de secours pour une matière SANS couleur choisie (m.couleur) —
   distincte par matière (hash déterministe de son id), pour que le calendrier
   distingue les matières visuellement dès avant tout réglage utilisateur
   (Réglages → Couleurs par matière écrase ce choix via m.couleur). */
const MATIERE_PALETTE = ['#7C6FE0', '#4FA6D9', '#4CAF7D', '#E0A63E', '#E0637C', '#8E6BB0', '#3E9CB5', '#C9873E'];
function hashId(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function defaultTintFor(m) {
  const key = (m && (m.id || m.nom)) || '';
  return key ? MATIERE_PALETTE[hashId(key) % MATIERE_PALETTE.length] : FALLBACK_TINT;
}

/* ---- étiquette de cours (Bibliothèque + sidebar Réviser + fin de session) ----
   100 % manuelle, purement informative : AUCUN effet sur SM-2 / méthode des J
   (voir CLAUDE.md / le prompt qui l'a demandée). Stockée sur fiche.etiquette. */
export const ETIQUETTES = [
  { id: 'a_apprendre', label: 'À apprendre', color: 'var(--accent)' },
  { id: 'a_reapprendre', label: 'À réapprendre', color: 'var(--crit)' },
  { id: 'revision_j', label: 'Révision des J', color: 'var(--ok)' },
];
export const etiquetteMeta = (id) => ETIQUETTES.find((e) => e.id === id) || null;

/** petit point de couleur, purement décoratif (affichage seul — sidebar Réviser). */
export function EtiquetteDot({ value, style }) {
  const e = etiquetteMeta(value);
  if (!e) return null;
  return <span className="etq-dot" style={{ background: e.color, ...style }} title={e.label} />;
}

/** poignée de repli UNIFORME des deux sidebars de la Bibliothèque (liste des cours à
   gauche, cartes QCM/Flashcard à droite) : barre fine pleine hauteur, au bord du
   panneau opposé au contenu central — jamais un repli vertical, jamais un "moignon".
   `side` = de quel côté du contenu central vit le panneau que cette poignée commande
   ('left' = panneau à gauche, comme la liste ; 'right' = panneau à droite, comme les
   cartes). Convention du chevron : replié → pointe vers le centre (« clique pour
   rouvrir vers ici ») ; ouvert → pointe vers le bord de l'écran (« clique pour
   replier vers là ») — même règle des deux côtés, juste en miroir. */
export function SplitHandle({ side, collapsed, onClick }) {
  const icon = side === 'left' ? (collapsed ? 'chevR' : 'chevL') : (collapsed ? 'chevL' : 'chevR');
  return (
    <button type="button" className="split-handle" onClick={onClick} title={collapsed ? 'Afficher le panneau' : 'Replier le panneau'}>
      <Icon name={icon} size={13} />
    </button>
  );
}

/** icône seule, cliquable (Bibliothèque) : pastille pleine si étiquette posée,
   contour discret sinon — ne pousse jamais le titre du cours hors du cadre.
   Le clic est géré par l'appelant (ouvre un ContextMenu avec les 3 valeurs +
   « aucune »), pas par ce composant — reste un simple bouton d'affichage. */
export function EtiquetteIconButton({ value, onClick }) {
  const e = etiquetteMeta(value);
  return (
    <button type="button" className="cd-ic" onClick={onClick}
      title={e ? `Étiquette : ${e.label} (cliquer pour changer)` : 'Aucune étiquette (cliquer pour en poser une)'}>
      <Icon name="tag" size={14} fill={!!e} style={{ color: e ? e.color : 'var(--text-3)' }} />
    </button>
  );
}
/** items ContextMenu prêts à l'emploi pour changer l'étiquette d'une fiche. */
export function etiquetteMenuItems(value, onChange) {
  return [
    {
      label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: !value ? 700 : 500 }}>Aucune étiquette{!value ? ' ✓' : ''}</span>,
      onClick: () => onChange(null),
    },
    ...ETIQUETTES.map((e) => ({
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: value === e.id ? 700 : 500 }}>
          <span className="etq-dot" style={{ background: e.color }} />{e.label}{value === e.id ? ' ✓' : ''}
        </span>
      ),
      onClick: () => onChange(e.id),
    })),
  ];
}

/** proposition (non bloquante) en fin de session : chips cliquables, une seule fiche. */
export function EtiquetteQuickSet({ value, onChange }) {
  return (
    <div className="etq-quickset">
      <span className="hint" style={{ marginRight: 2 }}><Icon name="tag" size={13} /> Étiquette de cette fiche :</span>
      <button type="button" className={'imp-chip' + (!value ? ' on' : '')} onClick={() => onChange(null)}>Aucune</button>
      {ETIQUETTES.map((e) => (
        <button type="button" key={e.id} className={'imp-chip' + (value === e.id ? ' on' : '')} onClick={() => onChange(e.id)}>
          <span className="imp-dot" style={{ background: e.color }} />{e.label}
        </button>
      ))}
    </div>
  );
}

/** display meta for a matière (label / tint / icon), tolerant of missing fields */
export function matiereMeta(m) {
  if (!m) return { label: '—', tint: FALLBACK_TINT, icon: 'book' };
  return { label: m.nom, tint: m.couleur || defaultTintFor(m), icon: m.icon || 'book' };
}

/* ---- statut de syncNow() (lib/storage.js), partagé Réglages (desktop) et
   MobileHome (bouton "Forcer la synchro" de l'accueil mobile) ---- */
export function syncStatusLabel(syncState) {
  const s = syncState && syncState.status;
  if (s === 'syncing') return 'Synchronisation en cours…';
  if (s === 'disabled') return 'Synchro cloud désactivée (variables Supabase absentes sur ce déploiement).';
  if (s === 'offline') return 'Hors ligne ou cloud injoignable — nouvel essai automatique à la reconnexion.';
  if (s === 'ok' && syncState.at) return 'Synchronisé à ' + new Date(syncState.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '.';
  return 'Pas encore synchronisé cette session.';
}

/* ---- Card ---- */
export function Card({ title, icon, action, children, style, className = '' }) {
  return (
    <div className={'card ' + className} style={style}>
      {title && (
        <div className="card-head">
          {icon && <Icon name={icon} size={17} className="ic" />}
          <h3>{title}</h3>
          {action && <div className="right">{action}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
}

/* ---- Switch ---- */
export function Switch({ on, onChange }) {
  return (
    <button className={'switch' + (on ? ' on' : '')} type="button" aria-pressed={on} onClick={() => onChange(!on)} />
  );
}

/* ---- topbar actions (hub + theme + avatar) ---- */
export function EdTop({ theme, onTheme, onHub }) {
  return (
    <div className="topbar-actions">
      {onHub && <button className="icon-btn" type="button" title="Changer d'app" onClick={onHub}><Icon name="grid" size={19} /></button>}
      <button className="icon-btn" type="button" title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'} onClick={onTheme}>
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={19} />
      </button>
      <div className="avatar" title="Mon espace">MR</div>
    </div>
  );
}

/* ---- left sidebar ---- */
const ED_NAV = [
  { id: 'dashboard', label: 'Accueil', icon: 'home' },
  { id: 'revise', label: 'Réviser', icon: 'cards' },
  { id: 'library', label: 'Bibliothèque', icon: 'book' },
  { id: 'carnet', label: "Carnet d'erreurs", icon: 'target' },
];

export function StudySidebar({ current, onNav, expanded, onToggle, onHub }) {
  // 'carnet' est un onglet à part entière désormais (plus un sous-état de
  // 'revise') — retiré de la liste ci-dessous pour ne pas allumer les DEUX
  // onglets à la fois quand on est sur l'écran carnet.
  const isActive = (id) => current === id || (id === 'revise' && ['session', 'feynman', 'exercice', 'anatquiz', 'pdf', 'schemaedit'].includes(current));
  return (
    <nav className={'sidebar' + (expanded ? ' expanded' : '')}>
      <div className="sb-brand">
        <div className="sb-logo" style={{ background: 'linear-gradient(145deg, var(--accent), color-mix(in srgb, var(--accent) 50%, #4FA6D9))' }}><Icon name="grad" size={20} stroke={2} /></div>
        <div className="sb-brand-name">MedRevise<small>Révision</small></div>
      </div>
      <div className="sb-nav">
        {ED_NAV.map((n) => (
          <div key={n.id} className={'sb-item' + (isActive(n.id) ? ' active' : '')} onClick={() => onNav(n.id)} title={n.label}>
            <span className="sb-icon"><Icon name={n.icon} size={20} /></span>
            <span className="sb-label">{n.label}</span>
          </div>
        ))}
      </div>
      <div className="sb-spacer" />
      <div className="sb-foot">
        <div className={'sb-item' + (current === 'settings' ? ' active' : '')} onClick={() => onNav('settings')} title="Réglages">
          <span className="sb-icon"><Icon name="settings" size={20} /></span>
          <span className="sb-label">Réglages</span>
        </div>
        <div className="sb-item" onClick={onHub} title="Accueil — changer d'app">
          <span className="sb-icon"><Icon name="grid" size={20} /></span>
          <span className="sb-label">Changer d'app</span>
        </div>
        <button className="sb-toggle" onClick={onToggle} title={expanded ? 'Réduire' : 'Étendre'}>
          <span className="sb-icon"><Icon name="panel" size={19} /></span>
          <span className="sb-label">Réduire</span>
        </button>
      </div>
    </nav>
  );
}

/* ---- type chip ---- */
export function TypeChip({ type, count }) {
  const map = {
    qcm: { label: 'QCM', icon: 'list', cls: 'accent' },
    flashcard: { label: 'Flashcards', icon: 'cards', cls: 'amber' },
    feynman: { label: 'Feynman', icon: 'lightbulb', cls: '' },
  };
  const m = map[type] || map.qcm;
  return <span className={'pill ' + m.cls} style={{ height: 24, fontSize: 11.5 }}><Icon name={m.icon} size={12} /> {count != null ? count + ' ' : ''}{m.label}</span>;
}

/* ---- matière badge ---- */
export function CatBadge({ matiere }) {
  const m = matiereMeta(matiere);
  return (
    <span className="cat-badge" style={{ background: `color-mix(in srgb, ${m.tint} 14%, transparent)`, color: m.tint, borderColor: `color-mix(in srgb, ${m.tint} 30%, transparent)` }}>
      <Icon name={m.icon} size={12} /> {m.label}
    </span>
  );
}

/* ---- méthode des J — badge d'intervalle (remplace l'ancienne frise à 7
   crans, JLadder) : le moteur adaptatif n'a plus de paliers nommés, juste un
   intervalle courant en jours — plus rien à représenter comme une
   progression le long d'une échelle fixe. `jLabel` vient de
   lib/sm2.js#labelForCursor ("J+N" ou "Terminée"). */
export function JBadge({ jLabel }) {
  if (!jLabel) return null;
  return <span className="j-tag jbadge">{jLabel}</span>;
}

/* ---- graphique d'évolution en fin de série (Celebration desktop / MobileSessionDone) —
   SVG maison, pas de lib de chart (aucune n'est installée). `points` : déjà triés
   chronologiquement, [{ date, rate }] (rate 0..1). preserveAspectRatio="none" + une
   largeur CSS à 100% (voir .strend-svg) : la largeur RÉELLE s'adapte au conteneur
   (desktop large / mobile étroit), la viewBox ne fixe qu'un ratio de dessin. ---- */
export function SessionTrendChart({ points, height = 56 }) {
  if (!points || points.length < 2) return null;
  const width = 260; // viewBox uniquement — la largeur affichée vient du CSS
  const n = points.length;
  const gap = 4;
  const barW = Math.max(4, (width - gap * (n - 1)) / n);
  const lastIdx = n - 1;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="strend-svg">
      {points.map((p, i) => {
        const h = Math.max(2, Math.round(p.rate * (height - 4)));
        const x = i * (barW + gap);
        const y = height - h;
        return (
          <rect key={i} x={x} y={y} width={barW} height={h} rx={2}
            style={{ fill: i === lastIdx ? 'var(--accent)' : 'var(--border-2)' }}>
            <title>{p.date} — {Math.round(p.rate * 100)}%</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** carte "Évolution" complète (titre + tendance ↑/↓ + graphique + 2 chiffres clés),
   réutilisée par Session.jsx (desktop) ET MobileSession.jsx (mobile). `log` : entrées
   sessionsLog déjà filtrées sur LA fiche de cette série et triées chronologiquement
   (la plus récente — celle qu'on vient de terminer — en dernier). Honnête si <2
   points : pas de tendance fabriquée, juste une invitation à revenir. */
export function SessionTrendCard({ log }) {
  if (!log || log.length < 2) {
    return (
      <div className="cel-trend">
        <span className="cel-trend-title"><Icon name="clock" size={14} /> Évolution</span>
        <div className="hint" style={{ marginTop: 8 }}>Reviens après ta prochaine série sur cette fiche pour voir la tendance.</div>
      </div>
    );
  }
  const points = log.slice(-10).map((r) => ({ date: r.date, rate: r.total ? r.good / r.total : 0 }));
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const trend = last.rate > prev.rate ? 'up' : last.rate < prev.rate ? 'down' : 'flat';
  const best = Math.max(...points.map((p) => p.rate));

  return (
    <div className="cel-trend">
      <div className="cel-trend-head">
        <span className="cel-trend-title"><Icon name="clock" size={14} /> Évolution — {points.length} dernières séries</span>
        <span className={'cel-trend-arrow ' + trend}>
          {trend === 'up' && <><Icon name="chevU" size={12} /> mieux qu'avant</>}
          {trend === 'down' && <><Icon name="chevD" size={12} /> moins bien qu'avant</>}
          {trend === 'flat' && 'stable'}
        </span>
      </div>
      <SessionTrendChart points={points} />
      <div className="cel-trend-stats">
        <span>Meilleure série : <strong className="tnum">{Math.round(best * 100)}%</strong></span>
        <span>Aujourd'hui : <strong className="tnum">{Math.round(last.rate * 100)}%</strong></span>
      </div>
    </div>
  );
}

/* ---- breadcrumb ---- */
export function Breadcrumb({ parts }) {
  return (
    <div className="breadcrumb">
      {parts.map((p, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && <Icon name="chevR" size={13} className="bc-sep" />}
          <span className={i === parts.length - 1 ? 'bc-cur' : 'bc-part'}>{p}</span>
        </span>
      ))}
    </div>
  );
}

/* ---- "série du jour" CTA (méthode des J), shared dashboard + réviser ----
   `collapsed`/`onToggleCollapse` : repli optionnel (seul l'appelant décide où
   l'activer — actuellement l'onglet Réviser ; état persisté par l'appelant
   dans stats.serieCollapsed). Le chevron vit DANS tc-main (tc-headrow), en
   flex normal — jamais en position absolute — pour ne jamais chevaucher
   tc-aside (le compteur de cartes du jour), quelle que soit la largeur. */
export function TodaySeriesCard({ plan, onStart, compact, collapsed, onToggleCollapse }) {
  const total = plan.reduce((s, c) => s + c.items.length, 0);
  const allItems = plan.flatMap((c) => c.items);
  const collapsible = !!onToggleCollapse;

  if (total === 0) {
    return (
      <div className={'today-cta done' + (compact ? ' tc-compact' : '') + (collapsed ? ' tc-collapsed' : '')}>
        <div className="tc-glow" />
        <div className="tc-main">
          <div className="tc-headrow">
            <div className="tc-eyebrow"><Icon name="check" size={14} stroke={3} /> {collapsed ? "Méthode des J — tout est à jour 🎉" : 'Méthode des J'}</div>
            {collapsible && <CollapseToggle collapsed={collapsed} onToggle={onToggleCollapse} />}
          </div>
          {!collapsed && (
            <>
              <div className="tc-title">Tout est à jour pour aujourd'hui 🎉</div>
              <div className="tc-sub">Aucune fiche due. Repose-toi ou prends de l'avance via la Bibliothèque.</div>
            </>
          )}
        </div>
      </div>
    );
  }

  const next = plan[0];
  const meta = matiereMeta(next.matiere);
  const others = plan.slice(1);
  const typeTxt = next.qcm && next.flash ? `${next.qcm} QCM + ${next.flash} flashcards`
    : next.qcm ? `${next.qcm} QCM` : `${next.flash} flashcards`;

  if (collapsed) {
    return (
      <div className={'today-cta tc-collapsed' + (compact ? ' tc-compact' : '')}>
        <div className="tc-glow" />
        <div className="tc-main">
          <div className="tc-headrow">
            <div className="tc-eyebrow"><Icon name="calendar" size={14} /> Série du jour · {total} carte{total > 1 ? 's' : ''} · Prochain : {next.fiche.titre} <span className="tc-jbadge">{next.jLabel}</span></div>
            {collapsible && <CollapseToggle collapsed={collapsed} onToggle={onToggleCollapse} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={'today-cta' + (compact ? ' tc-compact' : '')}>
      <div className="tc-glow" />
      <div className="tc-main">
        <div className="tc-eyebrow"><Icon name="calendar" size={14} /> Série du jour · méthode des J</div>
        <div className="tc-title">Prochain&nbsp;: {next.fiche.titre} <span className="tc-jbadge">{next.jLabel}</span></div>
        <div className="tc-meta-row">
          <span className="tc-chip"><Icon name={meta.icon} size={13} /> {meta.label}</span>
          <span className="tc-types"><Icon name={next.qcm && next.flash ? 'layers' : next.qcm ? 'list' : 'cards'} size={14} /> {typeTxt}</span>
        </div>
        {others.length > 0 && (
          <div className="tc-next"><span>puis&nbsp;:</span> {others.map((o, i) => (
            <span className="tc-nextitem" key={o.fiche.id}>{o.fiche.titre} <em>{o.jLabel}</em>{i < others.length - 1 ? ' · ' : ''}</span>
          ))}</div>
        )}
      </div>
      <div className="tc-aside">
        {collapsible && <CollapseToggle collapsed={collapsed} onToggle={onToggleCollapse} />}
        <div className="tc-count"><span className="tc-n tnum">{total}</span><span className="tc-l">carte{total > 1 ? 's' : ''} aujourd'hui</span></div>
        <button className="sh-cta" type="button" onClick={() => onStart(allItems, 'Série du jour')}>
          <Icon name="play" size={17} fill /> Commencer la série d'aujourd'hui
        </button>
      </div>
    </div>
  );
}

/* ---- boîte « À rattraper » (J non faits) : fiches dont l'échéance est passée,
   groups = overdueByFiche(db) (planning.js). onStartFiche(group) lance la
   révision : l'appelant choisit ctx.startSession (qcm/flash) ou ctx.startAnatQuiz
   (schéma) selon group.isSchema. Réviser recale le prochain intervalle depuis
   AUJOURD'HUI via le moteur SM-2 existant — rien de spécifique ici.
   Volontairement SOBRE et COMPACTE (pas une bannière d'alerte) : une simple
   card dense, ton neutre, pensée pour tenir à côté du calendrier de la semaine.
   onDismissFiche(group) (optionnel) : « Retirer » — sort la fiche du retard
   SANS la réviser (voir Dashboard/Reviser pour l'implémentation du recalage). */
/** `bare` (Dashboard RattrapageCard) : rend le contenu SANS le `<Card>` propre
   (ni titre/pill/icône) — l'appelant fournit sa propre Card englobante (avec
   son propre en-tête regroupant retards + carnet d'erreurs). Le reste
   (liste, "Tout rattraper", confirm dismiss) est strictement identique,
   aucune logique dupliquée. */
export function OverdueBox({ groups, onStartFiche, onStartAll, onDismissFiche, collapsible, collapsed, onToggleCollapse, bare }) {
  const [confirmDismiss, setConfirmDismiss] = useState(null); // group en attente de confirmation
  if (!groups || !groups.length) return null;
  const questionGroups = groups.filter((g) => !g.isSchema && g.items.length);
  const totalItems = questionGroups.reduce((s, g) => s + g.items.length, 0);

  // repliée (Réviser — redite du Dashboard) : une seule ligne, dépliable au clic.
  if (collapsible && collapsed) {
    return (
      <div className="card">
        <button type="button" className="card-head" onClick={onToggleCollapse}
          style={{ width: '100%', cursor: 'pointer', background: 'none', border: 'none', font: 'inherit', color: 'inherit' }}>
          <Icon name="clock" size={17} className="ic" />
          <h3>À rattraper</h3>
          <div className="right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="pill">{groups.length} fiche{groups.length > 1 ? 's' : ''}</span>
            <Icon name="chevD" size={15} />
          </div>
        </button>
      </div>
    );
  }

  const content = (
    <>
      <div className="hint" style={{ marginBottom: 10, fontSize: 12 }}>Échéance dépassée — la réviser l'avance simplement au palier suivant, la date ne bouge pas.</div>
      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 216, overflowY: 'auto' }}>
        {groups.map((g, i) => (
          <div className="row spread" key={g.fiche.id} style={{ gap: 8, padding: '7px 0', borderTop: i ? '1px solid var(--border-2)' : 'none' }}>
            <div style={{ minWidth: 0, flex: '1 1 auto' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.fiche.titre}</div>
              <div className="hint" style={{ fontSize: 11 }}>{matiereMeta(g.matiere).label} · {g.isSchema ? 'schéma' : `${g.items.length} carte${g.items.length > 1 ? 's' : ''}`}</div>
            </div>
            <div className="row" style={{ gap: 3, flex: '0 0 auto' }}>
              <button className="btn ghost sm" onClick={() => onStartFiche(g)}>Rattraper</button>
              {onDismissFiche && (
                <button className="icon-btn sm" title="Retirer du retard (sans réviser)" onClick={() => setConfirmDismiss(g)}><Icon name="x" size={13} /></button>
              )}
            </div>
          </div>
        ))}
      </div>
      {questionGroups.length > 1 && totalItems > 0 && (
        <button className="btn ghost sm" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={() => onStartAll(questionGroups.flatMap((g) => g.items))}>
          Tout rattraper ({totalItems})
        </button>
      )}
      {confirmDismiss && (
        <ConfirmModal title="Retirer cette fiche du retard ?"
          body={<>« {confirmDismiss.fiche.titre} » ne sera pas révisée. Sa prochaine échéance est simplement recalée à partir d'aujourd'hui (le niveau de la fiche ne change pas).</>}
          confirmLabel="Retirer" onCancel={() => setConfirmDismiss(null)}
          onConfirm={() => { onDismissFiche(confirmDismiss); setConfirmDismiss(null); }} />
      )}
    </>
  );

  if (bare) return content;

  return (
    <Card title="À rattraper" icon="clock"
      action={(
        <div className="row" style={{ gap: 8 }}>
          <span className="pill">{groups.length} fiche{groups.length > 1 ? 's' : ''}</span>
          {collapsible && <button type="button" className="icon-btn sm" title="Replier" onClick={onToggleCollapse}><Icon name="chevU" size={15} /></button>}
        </div>
      )}>
      {content}
    </Card>
  );
}

function CollapseToggle({ collapsed, onToggle }) {
  return (
    <button type="button" className="tc-collapse-btn" title={collapsed ? 'Déplier' : 'Replier'} onClick={onToggle}>
      <Icon name={collapsed ? 'chevD' : 'chevU'} size={16} />
    </button>
  );
}

/* ---- bouton cloche (rappels J d'un cours) avec tooltip hover + tap mobile.
   Texte fidèle à isFicheScheduled (planning.js) : la pause désactive la
   sortie des fiches du cours dans la série du jour, sans les archiver
   (toujours consultables/révisables manuellement).
   Le tooltip est rendu via un portal vers document.body (position: fixed,
   calculée depuis getBoundingClientRect) : il échappe à tout conteneur
   `overflow` ancêtre (ex. la sidebar scrollable "Cours & matières") et à
   son stacking context, contrairement à un simple `position: absolute`. ---- */
export function BellButton({ on, onToggle, onText, offText }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const timer = useRef(null);
  const text = on
    ? (onText || "Rappels J actifs — ce cours entre dans la planification de la méthode des J.")
    : (offText || "Cours en pause — ses fiches ne sortent plus dans la série du jour de la méthode des J, mais restent consultables et révisables manuellement.");
  const openTip = () => {
    const r = btnRef.current && btnRef.current.getBoundingClientRect();
    if (!r) return;
    setPos({ right: window.innerWidth - r.right, bottom: window.innerHeight - r.top + 8 });
    setShow(true);
  };
  const closeTip = () => setShow(false);
  const pulse = () => { openTip(); clearTimeout(timer.current); timer.current = setTimeout(closeTip, 2400); };
  return (
    <button ref={btnRef} type="button" className={'src-mute' + (on ? '' : ' off')} onClick={onToggle}
      onMouseEnter={openTip} onMouseLeave={closeTip} onTouchStart={pulse}
      aria-label={on ? 'Rappels J actifs — mettre en pause' : 'En pause — réactiver'}>
      <Icon name={on ? 'bell' : 'bellOff'} size={15} />
      {show && pos && createPortal(
        <div className="bell-tt-portal" style={{ right: pos.right, bottom: pos.bottom }} role="tooltip">{text}</div>,
        document.body,
      )}
    </button>
  );
}

/* ---- menu contextuel générique (clic droit desktop natif + appui long
   tactile explicite géré par l'appelant — voir Reviser.jsx). Rendu via un
   portal vers document.body (position: fixed, z-index élevé) pour ne
   jamais être clippé/masqué par un conteneur scrollable ancêtre (ex. la
   sidebar). Se ferme au clic ailleurs, au scroll ou à Échap. ---- */
export function ContextMenu({ x, y, items, onClose }) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    // écoute posée un tick après le montage : évite que le pointerdown /
    // contextmenu qui a OUVERT ce menu ne le referme aussitôt.
    const raf = requestAnimationFrame(() => {
      window.addEventListener('pointerdown', close);
      window.addEventListener('contextmenu', close);
    });
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return createPortal(
    <div className="ctx-menu" style={{ left: x, top: y }} onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
      {items.map((it, i) => (
        <button key={i} type="button" className={'ctx-menu-item' + (it.danger ? ' danger' : '')} onClick={() => { onClose(); it.onClick(); }}>
          {it.icon && <Icon name={it.icon} size={13} />} {it.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

/* ---- modale de confirmation générique (suppression → corbeille, etc.) ---- */
/* ---- overlay générique (fond scrim + carte centrée), même pattern visuel que
   DayPopup/ConfirmModal — croix, clic sur le fond, Échap ferment tous les trois. ---- */
export function Modal({ title, onClose, width = 'min(560px, 94vw)', children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="day-pop-scrim" onClick={onClose}>
      <div className="day-pop" style={{ width, maxHeight: '86vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="day-pop-head">
          <div className="row spread">
            <div className="serif" style={{ fontSize: 19 }}>{title}</div>
            <button className="icon-btn sm" onClick={onClose} title="Fermer (Échap)"><Icon name="x" size={16} /></button>
          </div>
        </div>
        <div className="day-pop-body scroll">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmModal({ title, body, confirmLabel = 'Confirmer', danger, onConfirm, onCancel }) {
  return (
    <div className="day-pop-scrim" onClick={onCancel}>
      <div className="day-pop" style={{ width: 'min(420px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="day-pop-head"><div className="serif" style={{ fontSize: 19 }}>{title}</div></div>
        <div className="day-pop-body"><div className="hint" style={{ fontSize: 13.5 }}>{body}</div></div>
        <div className="day-pop-foot">
          <button className="btn" style={{ flex: 1 }} onClick={onCancel}>Annuler</button>
          <button className={'btn' + (danger ? ' danger' : ' primary')} style={{ flex: 1 }} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ---- modale générique « choisir une date puis confirmer » — partagée par le
   décalage du départ J0 (étape 1/3, Reviser.jsx) et le rééquilibrage calendrier
   (étape 2/3, Dashboard.jsx/MobileHome.jsx) : même geste (tap → date →
   confirmer), seul le texte/libellé change selon l'appelant. `count` désactive
   Confirmer à 0 (rien à faire). `body` accepte une chaîne OU une fonction
   `(date) => texte` (état interne `date`, jamais remonté à l'appelant).
   `minDate` (par défaut aujourd'hui) peut être relevé par l'appelant. Plus de
   toggle "cascade" (moteur adaptatif : une seule échéance connue par carte,
   voir la mécanique validée — retiré des deux appelants). */
export function DateActionModal({ title, body, label = 'Nouvelle date', confirmLabel = 'Confirmer', count, minDate, allowPast, onConfirm, onCancel }) {
  // allowPast (pose/décalage du J0, Reviser.jsx "Décaler le départ") : AUCUNE
  // borne — un cours déjà commencé dans la vraie vie peut avoir un J0 passé.
  // Les autres usages (Réorganiser, Sauter) gardent min=aujourd'hui par défaut.
  const min = allowPast ? null : (minDate || todayISO());
  const [date, setDate] = useState(min || todayISO());
  useEffect(() => { if (min && date < min) setDate(min); }, [min]);
  return (
    <div className="day-pop-scrim" onClick={onCancel}>
      <div className="day-pop" style={{ width: 'min(420px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="day-pop-head"><div className="serif" style={{ fontSize: 19 }}>{title}</div></div>
        <div className="day-pop-body">
          <div className="hint" style={{ fontSize: 13.5, marginBottom: 12 }}>{typeof body === 'function' ? body(date) : body}</div>
          <div className="imp-field">
            <label>{label}</label>
            <input type="date" className="imp-title" style={{ maxWidth: 190 }} min={min || undefined} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="day-pop-foot">
          <button className="btn" style={{ flex: 1 }} onClick={onCancel}>Annuler</button>
          <button className="btn primary" style={{ flex: 1 }} disabled={count === 0} onClick={() => onConfirm(date)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Drag & drop des fiches (BUG4/BUG5), sur @dnd-kit/core.
   Choix délibéré : PAS de @dnd-kit/sortable — sa réanimation automatique
   des voisins ("push") est explicitement exclue du besoin ("pas
   d'animation de poussée"). À la place : des créneaux de dépôt (`DropSlot`)
   discrets et immobiles entre chaque fiche (et un en fin de chaque
   matière), qui s'allument en barre d'insertion (ou zone) uniquement quand
   survolés. Les fiches voisines ne bougent jamais — seule celle en cours
   de glissement change d'opacité, et un DragOverlay (portal interne à
   dnd-kit) suit le curseur. Id draggable : "fiche:<id>". Id créneau :
   "slot:<matiereId>:<beforeFicheId|END>".
   ============================================================ */
export function FicheDndProvider({ onDropAt, renderOverlay, children }) {
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );
  const stripPrefix = (id) => String(id).slice('fiche:'.length);
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter}
      onDragStart={(e) => setActiveId(e.active.id)}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={(e) => {
        setActiveId(null);
        const { active, over } = e;
        if (!over) return;
        const ficheId = stripPrefix(active.id);
        const [, matiereId, beforeRaw] = String(over.id).split(':');
        onDropAt({ ficheId, matiereId, beforeFicheId: beforeRaw === 'END' ? null : beforeRaw });
      }}>
      {children}
      <DragOverlay dropAnimation={null}>
        {activeId ? renderOverlay(stripPrefix(activeId)) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** Toute la boîte est la zone de préhension (listeners sur le wrapper entier). */
export function DraggableFiche({ id, disabled, className = '', style, children }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: 'fiche:' + id, disabled });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={className + (isDragging ? ' dnd-dragging' : '')}
      style={{ ...style, opacity: isDragging ? 0.35 : 1, cursor: disabled ? 'default' : 'grab', touchAction: 'none' }}>
      {children}
    </div>
  );
}

/** Créneau de dépôt immobile : "line" = fine barre d'insertion entre 2 fiches,
    "zone" = zone plus large ("déposer ici") en fin de matière / matière vide. */
export function DropSlot({ matiereId, beforeId, variant = 'line', label = 'Déposer ici' }) {
  const id = `slot:${matiereId}:${beforeId || 'END'}`;
  const { setNodeRef, isOver } = useDroppable({ id });
  if (variant === 'zone') {
    return <div ref={setNodeRef} className={'dnd-zone' + (isOver ? ' over' : '')}>{label}</div>;
  }
  return <div ref={setNodeRef} className={'dnd-slot' + (isOver ? ' over' : '')} />;
}

/* ---- destination picker (Cours + Matière) with inline creation ----
   New cours / matière are created from a typed name (placeholder, no
   default label) — shared by both import flows. */
export function DestPicker({ ctx, srcId, setSrcId, matId, setMatId }) {
  const { db } = ctx;
  const sources = db.sources.filter((s) => !s.archive);
  const matieresFor = (sid) => db.matieres.filter((m) => m.sourceId === sid && !m.archive);
  const [newSrc, setNewSrc] = useState(false);
  const [srcName, setSrcName] = useState('');
  const [newCat, setNewCat] = useState(false);
  const [catName, setCatName] = useState('');

  const pickSrc = (id) => { setSrcId(id); const fm = matieresFor(id)[0]; setMatId(fm ? fm.id : null); };
  const cats = srcId ? matieresFor(srcId) : [];
  const createSrc = async () => { if (!srcName.trim()) return; const id = await ctx.addSource(srcName.trim()); setNewSrc(false); setSrcName(''); pickSrc(id); };
  const createCat = async () => { if (!catName.trim() || !srcId) return; const id = await ctx.addMatiere(srcId, catName.trim()); setNewCat(false); setCatName(''); setMatId(id); };

  return (
    <>
      <div className="imp-field">
        <label>Cours de destination</label>
        {newSrc ? (
          <div className="imp-create">
            <input autoFocus placeholder="Nom du cours" value={srcName}
              onChange={(e) => setSrcName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createSrc(); if (e.key === 'Escape') setNewSrc(false); }} />
            <button className="btn primary sm" onClick={createSrc} disabled={!srcName.trim()}>Créer</button>
            <button className="btn ghost sm" onClick={() => setNewSrc(false)}>Annuler</button>
          </div>
        ) : (
          <div className="imp-pick">
            <div className="imp-chips">
              {sources.map((s) => (
                <button key={s.id} className={'imp-chip' + (srcId === s.id ? ' on' : '')} onClick={() => pickSrc(s.id)}>
                  <span className="imp-dot" style={{ background: s.tint || '#7C6FE0' }} />{s.nom}
                </button>
              ))}
            </div>
            <button className="imp-new" onClick={() => { setSrcName(''); setNewSrc(true); }}><Icon name="plus" size={13} stroke={2.6} /> Nouveau cours</button>
          </div>
        )}
      </div>

      <div className="imp-field">
        <label>Matière</label>
        {newCat ? (
          <div className="imp-create">
            <input autoFocus placeholder="Nom de la matière" value={catName}
              onChange={(e) => setCatName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createCat(); if (e.key === 'Escape') setNewCat(false); }} />
            <button className="btn primary sm" onClick={createCat} disabled={!catName.trim()}>Créer</button>
            <button className="btn ghost sm" onClick={() => setNewCat(false)}>Annuler</button>
          </div>
        ) : (
          <div className="imp-pick">
            <div className="imp-chips">
              {cats.map((c) => { const mm = matiereMeta(c); return (
                <button key={c.id} className={'imp-chip' + (matId === c.id ? ' on' : '')} onClick={() => setMatId(c.id)}>
                  <span className="imp-dot" style={{ background: mm.tint }} />{mm.label}
                </button>
              ); })}
              {cats.length === 0 && <span className="hint" style={{ alignSelf: 'center' }}>Aucune matière dans ce cours.</span>}
            </div>
            <button className="imp-new" onClick={() => { setCatName(''); setNewCat(true); }} disabled={!srcId}><Icon name="plus" size={13} stroke={2.6} /> Nouvelle matière</button>
          </div>
        )}
      </div>
    </>
  );
}

/** détecte PDF vs HTML par MIME puis extension — seule bascule de branchement
   (stockage/lecteur) qui subsiste ; l'entrée utilisateur, elle, est unique. */
export function detectDocKind(file) {
  if (!file) return null;
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf';
  if (file.type === 'text/html' || /\.html?$/i.test(file.name)) return 'html';
  return null;
}

/* ---- champ UNIQUE « Document du cours » (PDF OU HTML) : drag & drop ou clic,
   un seul contrôle partout où l'on rattache un document (import, Bibliothèque,
   PdfReader) — plus de deux champs séparés. Contrôlé (file / onFile) ; le type
   est détecté à la volée (detectDocKind), le stockage (putBlob → fiche.pdfId
   OU fiche.htmlId selon le type) et le lecteur restent le chemin existant. ---- */
export function CourseDocField({ file, onFile, label = 'Document du cours (PDF ou HTML)', hint }) {
  const [over, setOver] = useState(false);
  const kind = detectDocKind(file);
  const pick = (f) => { if (f && detectDocKind(f)) onFile(f); };
  return (
    <div className="imp-field">
      <label>{label} <span className="imp-opt">(optionnel)</span></label>
      {file ? (
        <div className="row spread" style={{ gap: 10, padding: '10px 12px', border: '1px solid var(--border-2)', borderRadius: 10, background: 'var(--bg-2)' }}>
          <div className="row" style={{ gap: 8, minWidth: 0, alignItems: 'center' }}>
            <Icon name={kind === 'html' ? 'fileHtml' : 'filePdf'} size={16} />
            <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
          </div>
          <button type="button" className="btn ghost sm" onClick={() => onFile(null)} style={{ flex: '0 0 auto' }}><Icon name="x" size={12} /> Retirer</button>
        </div>
      ) : (
        <label className={'dz-compact' + (over ? ' over' : '')} style={{ cursor: 'pointer' }}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
          <input type="file" accept="application/pdf,text/html,.pdf,.html" style={{ display: 'none' }} onChange={(e) => pick(e.target.files[0])} />
          <div className="row" style={{ gap: 8, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="filePdf" size={16} /> <span style={{ fontWeight: 600 }}>Glisse le PDF ou la fiche HTML du cours, ou clique</span>
          </div>
        </label>
      )}
      {hint && <div className="hint" style={{ marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

/* ---- inline coefficient control (1..5) ---- */
export function CoefControl({ value, inherited, onSet, onReset }) {
  const set = (v) => onSet(Math.max(1, Math.min(5, v)));
  return (
    <div className={'coefctl' + (inherited ? ' inherited' : '')} onClick={(e) => e.stopPropagation()} title="Poids dans le carnet d'erreurs (coefficient) — la cadence des J est désormais fixe, quel que soit le coef">
      <span className="cc-label">coef</span>
      <button className="cc-btn" type="button" onClick={() => set(value - 1)} disabled={value <= 1} aria-label="Diminuer"><Icon name="minus" size={12} stroke={2.6} /></button>
      <span className="cc-val tnum">{value}</span>
      <button className="cc-btn" type="button" onClick={() => set(value + 1)} disabled={value >= 5} aria-label="Augmenter"><Icon name="plus" size={12} stroke={2.6} /></button>
      {!inherited && onReset && <button className="cc-reset" type="button" title="Revenir au coef hérité" onClick={onReset}><Icon name="refresh" size={11} /></button>}
    </div>
  );
}
