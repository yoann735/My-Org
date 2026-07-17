/* ============================================================
   My Org — News : lecture 100 % IndexedDB-first (cache combiné
   fr+en affiché instantanément), puis fetch /api/news en arrière-
   plan. Filtre Tous/FR/EN purement client-side (myorg_meta, ne
   redéclenche pas de fetch). Design firehose en cards, sectorisé :
   « Pour toi » (affinité apprise des clics) → « Une » (importance/
   récence max) → une section par catégorie → « Docs & longs
   formats » en dernier. Clic → lecteur (article complet).
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import {
  ConfirmModal, EmptyState, NEWS_CATEGORIES, DOCS_CATEGORY,
  CATEGORY_PILL_CLASS, LangBadge, catSlug, pickHero,
} from '../components/ui.jsx';

const LANG_FILTERS = [
  { id: 'all', label: 'Tous' },
  { id: 'fr', label: 'FR' },
  { id: 'en', label: 'EN' },
];

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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <CategoryBadge category={item.category} />
          <LangBadge lang={item.lang} />
        </div>
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
  const { newsLoading, newsLangFilter, newsItems, forYouItems, newsCache } = ctx;
  const [forgetting, setForgetting] = useState(null);
  const [resettingProfile, setResettingProfile] = useState(false);

  const payload = newsCache?.payload || null;
  const readUrls = ctx.db?.newsReadUrls || new Set();

  const { hero, byCategory, docs } = useMemo(() => {
    const nonDocs = newsItems.filter((it) => it.category !== DOCS_CATEGORY);
    const docItems = newsItems.filter((it) => it.category === DOCS_CATEGORY)
      .sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));

    const heroItem = pickHero(nonDocs);

    const grouped = {};
    for (const cat of NEWS_CATEGORIES) grouped[cat] = [];
    for (const it of nonDocs) {
      if (heroItem && it.id === heroItem.id) continue;
      if (grouped[it.category]) grouped[it.category].push(it);
    }
    for (const cat of NEWS_CATEGORIES) {
      grouped[cat].sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    }

    return { hero: heroItem, byCategory: grouped, docs: docItems };
  }, [newsItems]);

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div>
          <h1 className="serif">News</h1>
          <div className="sub">
            {newsItems.length} actu{newsItems.length > 1 ? 's' : ''}
            {payload?.generatedAt ? ` · maj ${fmtGeneratedAt(payload.generatedAt)}` : ''}
          </div>
        </div>
        <div className="topbar-actions">
          <div className="seg">
            {LANG_FILTERS.map((f) => (
              <button key={f.id} type="button" className={'seg-btn' + (newsLangFilter === f.id ? ' active' : '')} onClick={() => ctx.setNewsLangFilter(f.id)}>{f.label}</button>
            ))}
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

      {!newsItems.length && (
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

      {!!forYouItems.length && (
        <div className="news-section">
          <div className="news-group-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Pour toi</span>
            <button type="button" className="news-forget-link" onClick={() => setResettingProfile(true)}>Oublier mes préférences</button>
          </div>
          <div className="news-card-grid">
            {forYouItems.map((it) => (
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
      )}

      {hero && (
        <div className="news-hero" onClick={() => ctx.openNewsReader(hero)}>
          {hero.image
            ? <img className="news-hero-img" src={hero.image} alt="" loading="lazy" />
            : <div className={'news-hero-img news-card-ph cat-' + catSlug(hero.category)}><Icon name="newspaper" size={40} /></div>}
          <div className="news-hero-body">
            <div className="news-hero-meta">
              <CategoryBadge category={hero.category} />
              <LangBadge lang={hero.lang} />
              <span className="hint" style={{ fontSize: 12.5 }}>{hero.source}</span>
            </div>
            <div className="news-hero-title">{hero.title}</div>
            {hero.summary && <div className="news-hero-summary">{hero.summary}</div>}
          </div>
        </div>
      )}

      {NEWS_CATEGORIES.map((cat) => {
        const catItems = byCategory[cat] || [];
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

      {!!docs.length && (
        <div className="news-section">
          <div className="news-group-title">{DOCS_CATEGORY}</div>
          <div className="news-card-grid">
            {docs.map((it) => (
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
      )}

      {forgetting && (
        <ConfirmModal
          title="Oublier cette lecture ?"
          body={<>« {forgetting.title} » ne sera plus grisé dans la liste.</>}
          confirmLabel="Oublier"
          onConfirm={async () => { await ctx.forgetNewsRead(forgetting.url); setForgetting(null); }}
          onCancel={() => setForgetting(null)}
        />
      )}

      {resettingProfile && (
        <ConfirmModal
          title="Oublier tes préférences ?"
          body="Le profil appris de tes clics (catégories, sources, mots-clés) sera réinitialisé. « Pour toi » repartira d'un mix varié."
          confirmLabel="Oublier"
          danger
          onConfirm={async () => { await ctx.resetNewsProfile(); setResettingProfile(false); }}
          onCancel={() => setResettingProfile(false)}
        />
      )}
    </div>
  );
}
