/* ============================================================
   MedRevise — briques partagées de l'écran d'import (Standard/Rattrapage) :
   champ JSON collé, carte d'aperçu avant import, écran de fin. Même flux
   dans les deux modes (Destination → coller le JSON → Aperçu → Confirmer) →
   un seul jeu de composants pour ne pas dupliquer la mise en page.
   ============================================================ */
import { Icon } from '../../shared/Icon.jsx';

/* ---- champ « coller le JSON » : textarea monospace + erreur de parse ---- */
export function ImportJsonField({ label, placeholder, value, onChange, error }) {
  return (
    <div className="imp-field">
      <label>{label}</label>
      <textarea className="imp-title" style={{ minHeight: 160, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12.5 }}
        placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {error && (
        <div className="err-mini" style={{ marginTop: 8 }}>
          <div className="em-ic crit"><Icon name="alert" size={16} /></div>
          <div className="em-body"><div className="em-title">{error}</div></div>
        </div>
      )}
    </div>
  );
}

/* ---- carte « aperçu avant import » : compteurs + destination + lignes
   d'info spécifiques au mode (PDF joint, doublons, synthèse…) + avertissements
   non bloquants (Rattrapage) ---- */
export function ImportPreviewCard({ counts, destLabel, infoLines = [], warnings = [], onBack, onConfirm, busy }) {
  const total = counts.qcm + counts.flashcard + counts.feynman + counts.exercice;
  return (
    <div className="fadein imp-dest">
      <div className="imp-dest-head"><Icon name="check" size={15} /> Aperçu avant import</div>
      <div className="err-mini ok" style={{ marginBottom: 14 }}>
        <div className="em-ic"><Icon name="check" size={16} stroke={2.5} /></div>
        <div className="em-body">
          <div className="em-title">{counts.qcm} QCM · {counts.flashcard} flashcards · {counts.feynman} Feynman · {counts.exercice} exercice{counts.exercice > 1 ? 's' : ''} détecté{total > 1 ? 's' : ''}</div>
          <div className="hint" style={{ marginTop: 4 }}>Destination : {destLabel}</div>
          {infoLines.filter(Boolean).map((line, i) => (
            <div className="hint" key={i} style={{ marginTop: 4, ...(line.accent ? { color: 'var(--accent-2)' } : {}) }}>
              {line.icon && <Icon name={line.icon} size={12} />} {line.text}
            </div>
          ))}
          {counts.ignored > 0 && (
            <div className="hint" style={{ marginTop: 4, color: 'var(--accent-2)' }}>
              <Icon name="alert" size={12} /> {counts.ignored} item{counts.ignored > 1 ? 's' : ''} ignoré{counts.ignored > 1 ? 's' : ''} (format invalide)
            </div>
          )}
        </div>
      </div>
      {warnings.map((w, i) => (
        <div className="err-mini" key={i} style={{ marginBottom: 10 }}>
          <div className="em-ic crit"><Icon name="alert" size={16} /></div>
          <div className="em-body"><div className="em-title" style={{ fontWeight: 500 }}>{w}</div><div className="hint">Avertissement — n'empêche pas l'import.</div></div>
        </div>
      ))}
      <div className="imp-actions">
        <button className="btn ghost" onClick={onBack}>Annuler</button>
        <button className="btn primary" onClick={onConfirm} disabled={busy}><Icon name="check" size={15} /> Confirmer l'import</button>
      </div>
    </div>
  );
}

/* ---- écran de fin : badge succès + message + actions (autre fiche /
   bibliothèque / réviser) ---- */
export function ImportDoneScreen({ title = 'Fiche prête !', message, resetLabel = 'Autre fiche', onReset, ctx, ficheId }) {
  return (
    <div className="fadein" style={{ textAlign: 'center', padding: '6px 0' }}>
      <div className="gd-badge" style={{ width: 60, height: 60, borderRadius: 18, margin: '0 auto 14px' }}><Icon name="check" size={30} stroke={3} /></div>
      <div className="serif" style={{ fontSize: 21 }}>{title}</div>
      <div className="hint" style={{ marginTop: 8 }}>{message}</div>
      <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
        <button className="btn" onClick={onReset}><Icon name="refresh" size={14} /> {resetLabel}</button>
        <button className="btn" onClick={() => ctx.go('library')}><Icon name="book" size={14} /> Bibliothèque</button>
        <button className="btn primary" onClick={() => { ctx.setFocusFiche(ficheId); ctx.go('revise'); }}><Icon name="cards" size={14} /> Réviser</button>
      </div>
    </div>
  );
}
