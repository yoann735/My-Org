/* ============================================================
   My Org — News : lecteur (overlay plein écran / large). À
   l'ouverture, appelle /api/article?url=… pour extraire l'article
   complet (texte + images). Si l'extraction échoue (paywall, flux
   non extractible…) : bascule sur le résumé (summary) + lien
   « Lire sur le site ». Pas d'iframe.
   ============================================================ */
import { useEffect, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { CATEGORY_PILL_CLASS, LangBadge } from './ui.jsx';

function fmtDate(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return null; }
}

export function NewsReader({ item, onClose }) {
  const [state, setState] = useState({ loading: true, article: null });

  useEffect(() => {
    if (!item?.url) return;
    let cancelled = false;
    setState({ loading: true, article: null });
    fetch('/api/article?url=' + encodeURIComponent(item.url))
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setState({ loading: false, article: data }); })
      .catch(() => { if (!cancelled) setState({ loading: false, article: { ok: false } }); });
    return () => { cancelled = true; };
  }, [item?.url]);

  if (!item) return null;
  const pillClass = CATEGORY_PILL_CLASS[item.category] || '';
  const article = state.article;
  const full = article?.ok ? article : null;

  return (
    <div className="news-reader-scrim" onClick={onClose}>
      <div className="news-reader-panel" onClick={(e) => e.stopPropagation()}>
        <div className="news-reader-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={'pill' + (pillClass ? ' ' + pillClass : '')} style={{ height: 22, fontSize: 11 }}>{item.category}</span>
            <LangBadge lang={item.lang} />
            <span className="hint" style={{ fontSize: 12.5 }}>{full?.source || item.source}</span>
            {full?.published && <span className="hint" style={{ fontSize: 12.5 }}>· {fmtDate(full.published)}</span>}
          </div>
          <button className="icon-btn" type="button" title="Fermer" onClick={onClose}><Icon name="x" size={19} /></button>
        </div>

        <div className="news-reader-body">
          {state.loading && (
            <div className="news-reader-loading">
              <Icon name="refresh" size={22} className="spin" />
              <span className="hint">Récupération de l’article…</span>
            </div>
          )}

          {!state.loading && full && (
            <>
              <h1 className="serif news-reader-title">{full.title}</h1>
              {full.images?.[0] && <img className="news-reader-hero-img" src={full.images[0]} alt="" />}
              <div className="news-reader-article" dangerouslySetInnerHTML={{ __html: full.content }} />
            </>
          )}

          {!state.loading && !full && (
            <>
              <h1 className="serif news-reader-title">{item.title}</h1>
              <div className="news-reader-summary">{item.summary}</div>
              <div className="hint news-reader-notice">
                <Icon name="info" size={14} /> Article non extractible (site protégé ou format non supporté) — voici le résumé.
              </div>
            </>
          )}
        </div>

        <div className="news-reader-foot">
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>Fermer</button>
          <a
            className="btn primary"
            style={{ flex: 1, justifyContent: 'center' }}
            href={full?.url || item.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="ext" size={15} /> {full ? 'Ouvrir la source' : 'Lire sur le site'}
          </a>
        </div>
      </div>
    </div>
  );
}
