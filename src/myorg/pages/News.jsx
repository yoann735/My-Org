/* ============================================================
   My Org — News : lecture 100 % IndexedDB-first (cache affiché
   instantanément), puis fetch /api/news en arrière-plan. « Une »
   en haut (item le + important), suivie de la liste groupée par
   catégorie triée par importance. Clic → lecteur (NewsReader).
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { ConfirmModal, EmptyState, NEWS_CATEGORIES, CATEGORY_PILL_CLASS } from '../components/ui.jsx';

function fmtGeneratedAt(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return null; }
}

function NewsRow({ item, read, onOpen, onForget }) {
  const pillClass = CATEGORY_PILL_CLASS[item.category] || '';
  return (
    <div className={'news-row' + (read ? ' read' : '')} onClick={() => onOpen(item)}>
      <div className="news-row-main">
        <div className="news-row-title">{item.title}</div>
        {item.summary_fr && <div className="news-row-summary">{item.summary_fr}</div>}
        <div className="news-row-meta">
          <span className={'pill' + (pillClass ? ' ' + pillClass : '')} style={{ height: 22, fontSize: 10.5 }}>{item.category}</span>
          <span className="hint" style={{ fontSize: 11.5 }}>{item.source}</span>
        </div>
      </div>
      {read && (
        <button
          className="icon-btn"
          type="button"
          title="Oublier cette lecture"
          onClick={(e) => { e.stopPropagation(); onForget(item); }}
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

export function News({ ctx }) {
  const { db, newsLoading } = ctx;
  const [forgetting, setForgetting] = useState(null);

  const payload = db.newsCache?.payload || null;
  const items = payload?.items || [];
  const readUrls = db.newsReadUrls || new Set();

  const hero = items[0] || null;
  const rest = hero ? items.slice(1) : [];

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div>
          <h1 className="serif">News</h1>
          <div className="sub">
            {items.length} actu{items.length > 1 ? 's' : ''}
            {payload?.generatedAt ? ` · maj ${fmtGeneratedAt(payload.generatedAt)}` : ''}
          </div>
        </div>
        <div className="topbar-actions">
          <button className="icon-btn" type="button" title="Rafraîchir" disabled={newsLoading} onClick={() => ctx.refreshNews(true)}>
            <Icon name="refresh" size={19} className={newsLoading ? 'spin' : ''} />
          </button>
          <button className="icon-btn" type="button" title="Changer d'app" onClick={ctx.goHub}><Icon name="grid" size={19} /></button>
          <button className="icon-btn" type="button" title={ctx.theme === 'dark' ? 'Mode clair' : 'Mode sombre'} onClick={ctx.toggleTheme}>
            <Icon name={ctx.theme === 'dark' ? 'sun' : 'moon'} size={19} />
          </button>
        </div>
      </div>

      {!items.length && (
        <div className="card" style={{ maxWidth: 820 }}>
          <div className="card-body">
            <EmptyState
              icon="newspaper"
              title={newsLoading ? 'Récupération des actus…' : 'Aucune actu pour l’instant'}
              hint={newsLoading ? null : 'Clique sur « Rafraîchir » pour lancer une première récupération.'}
            />
          </div>
        </div>
      )}

      {hero && (
        <div className="news-hero" onClick={() => ctx.openNewsReader(hero)}>
          <div className="news-hero-meta">
            <span className={'pill' + (CATEGORY_PILL_CLASS[hero.category] ? ' ' + CATEGORY_PILL_CLASS[hero.category] : '')} style={{ height: 24, fontSize: 11.5 }}>{hero.category}</span>
            <span className="hint" style={{ fontSize: 12.5 }}>{hero.source}</span>
          </div>
          <div className="news-hero-title">{hero.title}</div>
          {hero.summary_fr && <div className="news-hero-summary">{hero.summary_fr}</div>}
        </div>
      )}

      {NEWS_CATEGORIES.map((cat) => {
        const catItems = rest.filter((it) => it.category === cat);
        if (!catItems.length) return null;
        return (
          <div className="news-group" key={cat}>
            <div className="news-group-title">{cat}</div>
            <div className="mo-list">
              {catItems.map((it) => (
                <NewsRow
                  key={it.url}
                  item={it}
                  read={readUrls.has(it.url)}
                  onOpen={ctx.openNewsReader}
                  onForget={(item) => setForgetting(item)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {forgetting && (
        <ConfirmModal
          title="Oublier cette lecture ?"
          body={<>« {forgetting.title} » ne sera plus grisé dans la liste.</>}
          confirmLabel="Oublier"
          onConfirm={async () => { await ctx.forgetNewsRead(forgetting.url); setForgetting(null); }}
          onCancel={() => setForgetting(null)}
        />
      )}
    </div>
  );
}
