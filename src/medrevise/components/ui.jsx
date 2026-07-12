/* ============================================================
   MedRevise — UI primitives + shell widgets. Reuses the ported
   etudes.css classes for visual fidelity, but is wired to our real
   data model (matiere = {id,nom,couleur,icon}, fiche, questions).
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { J_INTERVALS } from '../lib/sm2.js';

const FALLBACK_TINT = '#7C6FE0';

/** display meta for a matière (label / tint / icon), tolerant of missing fields */
export function matiereMeta(m) {
  if (!m) return { label: '—', tint: FALLBACK_TINT, icon: 'book' };
  return { label: m.nom, tint: m.couleur || FALLBACK_TINT, icon: m.icon || 'book' };
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
];

export function StudySidebar({ current, onNav, expanded, onToggle, onHub }) {
  const isActive = (id) => current === id || (id === 'revise' && ['session', 'feynman'].includes(current));
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

/* ---- méthode des J ladder ---- */
export function JLadder({ jIndex }) {
  return (
    <div className="jladder">
      {J_INTERVALS.map((j, i) => {
        const cls = i < jIndex ? ' past' : i === jIndex ? ' current' : ' future';
        return (
          <span className="jl-wrap" key={j} style={{ display: 'contents' }}>
            {i > 0 && <span className={'jl-link' + (i <= jIndex ? ' done' : '')} />}
            <span className={'jl-step' + cls}>J+{j}{i === jIndex && <em>auj.</em>}</span>
          </span>
        );
      })}
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
   `collapsed`/`onToggleCollapse` : réservé à la variante Dashboard (non-compact) ;
   l'état repliée/dépliée est persistée par l'appelant (stats.serieCollapsed). */
export function TodaySeriesCard({ plan, onStart, compact, collapsed, onToggleCollapse }) {
  const total = plan.reduce((s, c) => s + c.items.length, 0);
  const allItems = plan.flatMap((c) => c.items);
  const collapsible = !compact && onToggleCollapse;

  if (total === 0) {
    return (
      <div className={'today-cta done' + (compact ? ' tc-compact' : '') + (collapsed ? ' tc-collapsed' : '')}>
        <div className="tc-glow" />
        {collapsible && <CollapseToggle collapsed={collapsed} onToggle={onToggleCollapse} />}
        {collapsed ? (
          <div className="tc-main"><div className="tc-eyebrow"><Icon name="check" size={14} stroke={3} /> Méthode des J — tout est à jour 🎉</div></div>
        ) : (
          <div className="tc-main">
            <div className="tc-eyebrow"><Icon name="check" size={14} stroke={3} /> Méthode des J</div>
            <div className="tc-title">Tout est à jour pour aujourd'hui 🎉</div>
            <div className="tc-sub">Aucune fiche due. Repose-toi ou prends de l'avance via la Bibliothèque.</div>
          </div>
        )}
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
        {collapsible && <CollapseToggle collapsed={collapsed} onToggle={onToggleCollapse} />}
        <div className="tc-main">
          <div className="tc-eyebrow"><Icon name="calendar" size={14} /> Série du jour · {total} carte{total > 1 ? 's' : ''} · Prochain : {next.fiche.titre} <span className="tc-jbadge">{next.jLabel}</span></div>
        </div>
      </div>
    );
  }

  return (
    <div className={'today-cta' + (compact ? ' tc-compact' : '')}>
      <div className="tc-glow" />
      {collapsible && <CollapseToggle collapsed={collapsed} onToggle={onToggleCollapse} />}
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
        <div className="tc-count"><span className="tc-n tnum">{total}</span><span className="tc-l">carte{total > 1 ? 's' : ''} aujourd'hui</span></div>
        <button className="sh-cta" type="button" onClick={() => onStart(allItems, 'Série du jour')}>
          <Icon name="play" size={17} fill /> Commencer la série d'aujourd'hui
        </button>
      </div>
    </div>
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
   (toujours consultables/révisables manuellement). ---- */
export function BellButton({ on, onToggle }) {
  const [show, setShow] = useState(false);
  const timer = useRef(null);
  const text = on
    ? "Rappels J actifs — ce cours entre dans la planification de la méthode des J."
    : "Cours en pause — ses fiches ne sortent plus dans la série du jour de la méthode des J, mais restent consultables et révisables manuellement.";
  const pulse = () => { setShow(true); clearTimeout(timer.current); timer.current = setTimeout(() => setShow(false), 2400); };
  return (
    <button type="button" className={'src-mute' + (on ? '' : ' off')} onClick={onToggle} onTouchStart={pulse}
      aria-label={on ? 'Rappels J actifs — mettre en pause' : 'En pause — réactiver'}>
      <Icon name={on ? 'bell' : 'bellOff'} size={15} />
      <span className={'bell-tt' + (show ? ' show' : '')} role="tooltip">{text}</span>
    </button>
  );
}

/* ---- menu contextuel générique (clic droit desktop / appui long mobile,
   les deux déclenchent l'évènement natif "contextmenu"). Se ferme au clic
   ailleurs, au scroll ou à Échap. ---- */
export function ContextMenu({ x, y, items, onClose }) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="ctx-menu" style={{ left: x, top: y }} onPointerDown={(e) => e.stopPropagation()}>
      {items.map((it, i) => (
        <button key={i} type="button" className={'ctx-menu-item' + (it.danger ? ' danger' : '')} onClick={() => { onClose(); it.onClick(); }}>
          {it.icon && <Icon name={it.icon} size={13} />} {it.label}
        </button>
      ))}
    </div>
  );
}

/* ---- modale de confirmation générique (suppression → corbeille, etc.) ---- */
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

/* ---- inline coefficient control (1..5) ---- */
export function CoefControl({ value, inherited, onSet, onReset }) {
  const set = (v) => onSet(Math.max(1, Math.min(5, v)));
  return (
    <div className={'coefctl' + (inherited ? ' inherited' : '')} onClick={(e) => e.stopPropagation()} title="Priorité de révision (coefficient)">
      <span className="cc-label">coef</span>
      <button className="cc-btn" type="button" onClick={() => set(value - 1)} disabled={value <= 1} aria-label="Diminuer"><Icon name="minus" size={12} stroke={2.6} /></button>
      <span className="cc-val tnum">{value}</span>
      <button className="cc-btn" type="button" onClick={() => set(value + 1)} disabled={value >= 5} aria-label="Augmenter"><Icon name="plus" size={12} stroke={2.6} /></button>
      {!inherited && onReset && <button className="cc-reset" type="button" title="Revenir au coef hérité" onClick={onReset}><Icon name="refresh" size={11} /></button>}
    </div>
  );
}
