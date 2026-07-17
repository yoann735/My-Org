/* ============================================================
   My Org — News : lecture 100 % IndexedDB-first (cache par langue
   affiché instantanément), puis fetch /api/news?lang=… en arrière-
   plan. Toggle FR/EN (persisté dans myorg_meta). Design en cards :
   « Une » en grand (image) en haut, puis une section par catégorie
   avec une grille de cards (image ou placeholder coloré, badge,
   titre, résumé). Clic → lecteur (article complet).
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { ConfirmModal, EmptyState, NEWS_CATEGORIES_BY_LANG, CATEGORY_PILL_CLASS, catSlug } from '../components/ui.jsx';

function fmtGeneratedAt(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return null; }
}

function CategoryBadge({ category }) {
  const pillClass = CATEGORY_PILL_CLASS[category] || '';
  return <span className={'pill' + (pillClass ? ' ' + pillClass : '')} style={{ height: 22, fontSize: 10.5 }}>{category}</span>;
}

function NewsCard({ item, read, onOpen, onForget }) {
  return (
    <div className={'news-card' + (read ? ' read' : '')} onClick={() => onOpen(item)}>
      {item.image
        ? <img className="news-card-img" src={item.image} alt="" loading="lazy" />
        : <div className={'news-card-img news-card-ph cat-' + catSlug(item.category)}><Icon name="newspaper" size={26} /></div>}
      <div className="news-card-body">
        <CategoryBadge category={item.category} />
        <div className="news-card-title">{item.title}</div>
        {item.summary && <div className="news-card-summary">{item.summary}</div>}
        <div className="news-card-source">{item.source}</div>
      </div>
      {read && (
        <button
          className="icon-btn news-card-forget"
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
  const { newsLoading, newsLang, newsCache } = ctx;
  const [forgetting, setForgetting] = useState(null);

  const payload = newsCache?.payload || null;
  const items = payload?.items || [];
  const readUrls = ctx.db?.newsReadUrls || new Set();
  const categories = NEWS_CATEGORIES_BY_LANG[newsLang] || NEWS_CATEGORIES_BY_LANG.fr;

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
          <div className="seg">
            <button type="button" className={'seg-btn' + (newsLang === 'fr' ? ' active' : '')} onClick={() => ctx.setNewsLang('fr')}>FR</button>
            <button type="button" className={'seg-btn' + (newsLang === 'en' ? ' active' : '')} onClick={() => ctx.setNewsLang('en')}>EN</button>
          </div>
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
          {hero.image
            ? <img className="news-hero-img" src={hero.image} alt="" loading="lazy" />
            : <div className={'news-hero-img news-card-ph cat-' + catSlug(hero.category)}><Icon name="newspaper" size={40} /></div>}
          <div className="news-hero-body">
            <div className="news-hero-meta">
              <CategoryBadge category={hero.category} />
              <span className="hint" style={{ fontSize: 12.5 }}>{hero.source}</span>
            </div>
            <div className="news-hero-title">{hero.title}</div>
            {hero.summary && <div className="news-hero-summary">{hero.summary}</div>}
          </div>
        </div>
      )}

      {categories.map((cat) => {
        const catItems = rest.filter((it) => it.category === cat);
        if (!catItems.length) return null;
        return (
          <div className="news-section" key={cat}>
            <div className="news-group-title">{cat}</div>
            <div className="news-card-grid">
              {catItems.map((it) => (
                <NewsCard
                  key={it.id || it.url}
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
