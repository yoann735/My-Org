/* ============================================================
   My Org — News : lecteur (overlay). Titre + source + résumé
   complet + bouton « Lire l'article complet » (nouvel onglet,
   noopener/noreferrer). Pas d'iframe. Même pattern que ConfirmModal.
   ============================================================ */
import { Icon } from '../../shared/Icon.jsx';
import { CATEGORY_PILL_CLASS } from './ui.jsx';

export function NewsReader({ item, onClose }) {
  if (!item) return null;
  const pillClass = CATEGORY_PILL_CLASS[item.category] || '';

  return (
    <div className="day-pop-scrim" onClick={onClose}>
      <div className="day-pop" style={{ width: 'min(560px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="day-pop-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className={'pill' + (pillClass ? ' ' + pillClass : '')} style={{ height: 22, fontSize: 11 }}>{item.category}</span>
            <span className="hint" style={{ fontSize: 12.5 }}>{item.source}</span>
          </div>
          <div className="serif" style={{ fontSize: 19, lineHeight: 1.3 }}>{item.title}</div>
        </div>
        <div className="day-pop-body">
          <div className="news-reader-summary">{item.summary_fr}</div>
        </div>
        <div className="day-pop-foot">
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>Fermer</button>
          <a
            className="btn primary"
            style={{ flex: 1, justifyContent: 'center' }}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="ext" size={15} /> Lire l’article complet
          </a>
        </div>
      </div>
    </div>
  );
}
