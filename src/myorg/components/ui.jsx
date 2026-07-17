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

/* ---- News : catégories (ordre d'affichage, par langue) + couleur de badge ---- */
export const NEWS_CATEGORIES_BY_LANG = {
  fr: ['Monde', 'Business', 'Aviation', 'Médecine', 'Sport', 'Sciences & Espace', 'Tech & IA', 'Culture & Savoir'],
  en: ['World', 'Business', 'Aviation', 'Health & Medicine', 'Sport', 'Science & Space', 'Tech & AI', 'Culture & Knowledge'],
};
export const CATEGORY_PILL_CLASS = {
  Monde: 'accent', World: 'accent',
  Business: 'ok',
  Aviation: 'amber',
  'Médecine': 'warn', 'Health & Medicine': 'warn',
  Sport: 'solid',
  'Sciences & Espace': 'accent', 'Science & Space': 'accent',
  'Tech & IA': 'ok', 'Tech & AI': 'ok',
  'Culture & Savoir': 'solid', 'Culture & Knowledge': 'solid',
};

/* bucket stable (a-f) pour la couleur du placeholder image d'une card
   sans image — indépendant de la langue/catégorie exacte */
export function catSlug(category) {
  const str = category || '';
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  const buckets = ['a', 'b', 'c', 'd', 'e', 'f'];
  return buckets[hash % buckets.length];
}

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
