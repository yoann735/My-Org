/* ============================================================
   Screen — Réglages
   Theme (dark/light), accent color, weekly budget, default
   portions, retrieval store. All persisted via ctx (localStorage).
   ============================================================ */
import { Icon } from '../../shared/Icon.jsx';
import { Card, Stepper, Switch } from '../components/primitives.jsx';
import { TopActions } from './_shared.jsx';
import { ACCENTS } from '../../shared/constants.js';
import { useState } from 'react';

const THEME_MODES = [
  { v: 'system', label: 'Système', icon: 'panel' },
  { v: 'light', label: 'Clair', icon: 'sun' },
  { v: 'dark', label: 'Sombre', icon: 'moon' },
];

function ThemeSegmented({ value, onChange }) {
  return (
    <div className="seg" role="radiogroup" aria-label="Thème">
      {THEME_MODES.map((m) => (
        <button
          key={m.v}
          type="button"
          role="radio"
          aria-checked={value === m.v}
          className={'seg-btn' + (value === m.v ? ' active' : '')}
          onClick={() => onChange(m.v)}
        >
          <Icon name={m.icon} size={15} />
          <span>{m.label}</span>
        </button>
      ))}
    </div>
  );
}

function StepperRow({ label, sub, value, suffix, min, max, step, onChange, big }) {
  return (
    <div className="set-row">
      <div style={{ minWidth: 0 }}>
        <div className="set-label">{label}</div>
        {sub && <div className="hint" style={{ marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ marginLeft: 'auto' }}>
        <Stepper value={value} min={min} max={max} step={step} onChange={onChange} suffix={suffix} big={big} />
      </div>
    </div>
  );
}

export function Settings({ ctx }) {
  const [editStore, setEditStore] = useState(false);

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div>
          <h1 className="serif">Réglages</h1>
          <div className="sub">Préférences de votre espace MealWeek · tout est enregistré sur cet appareil.</div>
        </div>
        <div className="topbar-actions"><TopActions ctx={ctx} /></div>
      </div>

      <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 900 }}>
        {/* Apparence */}
        <Card title="Apparence" icon="sun">
          <div className="set-list">
            <div className="set-row">
              <div><div className="set-label">Thème</div><div className="hint" style={{ marginTop: 2 }}>« Système » suit le réglage de votre appareil.</div></div>
              <div style={{ marginLeft: 'auto' }}><ThemeSegmented value={ctx.themeMode} onChange={ctx.setThemeMode} /></div>
            </div>
            <div className="set-div" />
            <div className="set-row">
              <div><div className="set-label">Couleur d'accent</div><div className="hint" style={{ marginTop: 2 }}>Teinte principale de l'interface</div></div>
              <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
                {ACCENTS.map((a) => (
                  <button key={a.v} type="button" title={a.name} onClick={() => ctx.setAccent(a.v)}
                    style={{ width: 26, height: 26, borderRadius: 8, background: a.v, border: ctx.accent === a.v ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer', boxShadow: 'var(--shadow)' }} />
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Mode éco */}
        <Card title="Mode éco" icon="euro">
          <div className="set-row">
            <div style={{ minWidth: 0 }}>
              <div className="set-label">Semaines éco</div>
              <div className="hint" style={{ marginTop: 2 }}>Remplace les semaines standard par des semaines moins chères (E1, E2).</div>
            </div>
            <div style={{ marginLeft: 'auto' }}><Switch on={ctx.ecoMode} onChange={ctx.toggleEco} /></div>
          </div>
          {ctx.ecoMode && <div className="hint" style={{ marginTop: 10 }}><span className="pill ok" style={{ height: 22, fontSize: 11 }}><Icon name="check" size={12} /> Mode éco actif</span></div>}
        </Card>

        {/* Magasin */}
        <Card title="Magasin de retrait" icon="cart">
          <div className="hint" style={{ marginBottom: 10 }}>Le magasin Chronodrive où vous récupérez vos courses.</div>
          {editStore ? (
            <div className="row" style={{ gap: 8 }}>
              <div className="search" style={{ flex: 1, minWidth: 0, boxShadow: 'none' }}>
                <Icon name="search" size={16} className="ic" />
                <input autoFocus value={ctx.store} onChange={(e) => ctx.setStore(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditStore(false)} placeholder="Nom du magasin Chronodrive…" />
              </div>
              <button type="button" className="btn primary" style={{ padding: '9px 13px' }} onClick={() => setEditStore(false)}><Icon name="check" size={15} /></button>
            </div>
          ) : (
            <div className="row spread" style={{ gap: 10 }}>
              <div className="row" style={{ gap: 10, minWidth: 0 }}>
                <span className="kpi-ic" style={{ width: 34, height: 34, background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="cart" size={17} /></span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{ctx.store || 'Chronodrive'}</div>
                  <a className="hint" href="https://www.chronodrive.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>chronodrive.com <Icon name="ext" size={11} /></a>
                </div>
              </div>
              <button type="button" className="btn ghost" style={{ padding: '7px 12px' }} onClick={() => setEditStore(true)}><Icon name="edit" size={14} /> Modifier</button>
            </div>
          )}
        </Card>

        {/* Objectifs */}
        <Card title="Objectifs hebdomadaires" icon="euro" style={{ gridColumn: '1 / -1' }}>
          <div className="set-list">
            <StepperRow label="Budget hebdomadaire" sub="Objectif de dépenses pour la semaine (cible recommandée : 60€)"
              value={ctx.weeklyBudget} suffix="€" min={40} max={300} step={5} onChange={ctx.setWeeklyBudget} big />
            <div className="set-div" />
            <StepperRow label="Portions par défaut" sub="Cuisson ×2 conseillée : 1 dîner + 1 déjeuner du lendemain"
              value={ctx.portions} suffix=" pers." min={1} max={6} step={1} onChange={ctx.setPortions} />
          </div>
        </Card>

        {/* Données */}
        <Card title="Données & confidentialité" icon="box" style={{ gridColumn: '1 / -1' }}>
          <div className="hint" style={{ marginBottom: 12 }}>
            MealWeek est 100% local : aucune donnée ne quitte cet appareil. Vos coches, favoris et réglages sont stockés dans le navigateur (localStorage).
          </div>
          <button type="button" className="btn" style={{ color: 'var(--crit)' }} onClick={ctx.resetAll}>
            <Icon name="trash" size={15} /> Réinitialiser mes données locales
          </button>
        </Card>
      </div>
    </div>
  );
}
