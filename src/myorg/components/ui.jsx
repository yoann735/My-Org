/* ============================================================
   My Org — petits composants UI partagés par les pages.
   Réutilise les classes globales du design system (design.css) :
   .day-pop* (popovers), .pill, .card… — thème clair/sombre inclus.
   (Copie locale du pattern MedRevise, sans import cross-app.)
   ============================================================ */
import { Icon } from '../../shared/Icon.jsx';

/* ---- modale de confirmation (suppression : jamais au simple clic) ---- */
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

/* ---- pill de priorité (basse / moyenne / haute) ---- */
export const PRIORITES = [
  { id: 'basse', label: 'Basse', cls: 'ok' },
  { id: 'moyenne', label: 'Moyenne', cls: 'amber' },
  { id: 'haute', label: 'Haute', cls: 'crit' },
];
export function PrioPill({ priorite }) {
  const p = PRIORITES.find((x) => x.id === priorite) || PRIORITES[1];
  return <span className={'pill ' + p.cls} style={{ height: 24, fontSize: 11.5 }}>{p.label}</span>;
}

/* ---- News : catégories (ordre d'affichage) + couleur de badge ---- */
export const NEWS_CATEGORIES = ['Monde', 'Aviation', 'Business', 'Médecine', 'Culture & Savoir'];
export const CATEGORY_PILL_CLASS = {
  Monde: 'accent',
  Aviation: 'amber',
  Business: 'ok',
  'Médecine': '',
  'Culture & Savoir': 'solid',
};

/* ---- état vide générique ---- */
export function EmptyState({ icon = 'box', title, hint }) {
  return (
    <div className="mo-empty">
      <div className="mo-empty-ic"><Icon name={icon} size={26} /></div>
      <div style={{ fontWeight: 600 }}>{title}</div>
      {hint ? <div className="hint" style={{ fontSize: 13 }}>{hint}</div> : null}
    </div>
  );
}
