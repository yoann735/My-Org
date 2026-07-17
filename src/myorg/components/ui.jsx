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

/* ---- News : catégories canoniques (ordre d'affichage) + couleur de
   badge. Un item est tagué `lang` (fr/en) indépendamment de sa
   catégorie — le filtre Tous/FR/EN se fait côté client sur ce champ. */
export const NEWS_CATEGORIES = ['Monde', 'Business', 'Aviation', 'Médecine', 'Sciences & Espace', 'Tech & IA', 'Sport', 'Histoire & Culture'];
export const DOCS_CATEGORY = 'Docs & longs formats';
export const CATEGORY_PILL_CLASS = {
  Monde: 'accent',
  Business: 'ok',
  Aviation: 'amber',
  'Médecine': 'warn',
  'Sciences & Espace': 'accent',
  'Tech & IA': 'ok',
  Sport: 'solid',
  'Histoire & Culture': 'solid',
  'Docs & longs formats': 'solid',
};

/* badge langue (FR/EN) affiché sur les cards */
export function LangBadge({ lang }) {
  if (!lang) return null;
  return <span className="pill lang-pill" style={{ height: 20, fontSize: 10 }}>{lang.toUpperCase()}</span>;
}

/* « Une » : item importance/récence max, hors Docs & longs formats.
   Partagé entre l'onglet News et la carte Dashboard pour rester cohérent. */
export function pickHero(items) {
  const candidates = (items || []).filter((it) => it.category !== DOCS_CATEGORY);
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const impDiff = (b.importance || 0) - (a.importance || 0);
    if (impDiff !== 0) return impDiff;
    return new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
  })[0];
}

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
