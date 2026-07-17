/* ============================================================
   My Org — Dashboard : carte News (fonctionnelle) + placeholders
   « Bientôt » pour Objectifs / Finance / Santé (prompts à venir).
   ============================================================ */
import { Icon } from '../../shared/Icon.jsx';
import { CATEGORY_PILL_CLASS, catSlug } from '../components/ui.jsx';

export function Dashboard({ ctx }) {
  // ---- News ----
  const newsItems = ctx.newsCache?.payload?.items || [];
  const newsHero = newsItems[0] || null;
  const newsRest = newsHero ? newsItems.slice(1, 6) : [];

  const soonCards = [
    { id: 'goals', label: 'Objectifs', icon: 'target' },
    { id: 'finance', label: 'Finance', icon: 'euro' },
    { id: 'sante', label: 'Santé', icon: 'heart' },
  ];

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div><h1 className="serif">My Org</h1><div className="sub">Ton organisation perso, en un coup d'œil.</div></div>
        <div className="topbar-actions">
          <button className="icon-btn" type="button" title="Changer d'app" onClick={ctx.goHub}><Icon name="grid" size={19} /></button>
          <button className="icon-btn" type="button" title={ctx.theme === 'dark' ? 'Mode clair' : 'Mode sombre'} onClick={ctx.toggleTheme}>
            <Icon name={ctx.theme === 'dark' ? 'sun' : 'moon'} size={19} />
          </button>
        </div>
      </div>

      <div className="mo-grid">
        {/* News */}
        <div className="card mo-card news-dash-card">
          <div className="card-head" role="button" tabIndex={0} onClick={() => ctx.go('news')}
            onKeyDown={(e) => { if (e.key === 'Enter') ctx.go('news'); }} style={{ cursor: 'pointer' }}>
            <Icon name="newspaper" size={17} className="ic" /><h3>News</h3>
            <div className="right"><Icon name="arrowR" size={16} className="ic" /></div>
          </div>
          <div className="card-body">
            {newsHero ? (
              <>
                <div
                  className="news-dash-hero"
                  role="button" tabIndex={0}
                  onClick={() => ctx.openNewsReader(newsHero)}
                  onKeyDown={(e) => { if (e.key === 'Enter') ctx.openNewsReader(newsHero); }}
                >
                  {newsHero.image
                    ? <img className="news-dash-hero-img" src={newsHero.image} alt="" loading="lazy" />
                    : <div className={'news-dash-hero-img news-card-ph cat-' + catSlug(newsHero.category)} />}
                  <div className="news-dash-hero-body">
                    <div className="mo-row-title" style={{ marginBottom: 4 }}>{newsHero.title}</div>
                    <div className="hint" style={{ fontSize: 12.5 }}>{newsHero.source}</div>
                  </div>
                </div>
                <div className="news-dash-list">
                  {newsRest.map((it) => (
                    <div
                      key={it.id || it.url}
                      className="news-dash-item"
                      role="button" tabIndex={0}
                      onClick={() => ctx.openNewsReader(it)}
                      onKeyDown={(e) => { if (e.key === 'Enter') ctx.openNewsReader(it); }}
                    >
                      <span className={'pill' + (CATEGORY_PILL_CLASS[it.category] ? ' ' + CATEGORY_PILL_CLASS[it.category] : '')} style={{ height: 20, fontSize: 10 }}>{it.category}</span>
                      <span className="news-dash-item-title">{it.title}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <span className="hint" style={{ fontSize: 13 }}>Pas encore d’actus — ouvre l’onglet News.</span>
            )}
          </div>
        </div>

        {/* Placeholders */}
        {soonCards.map((c) => (
          <div className="card mo-card mo-card-soon" role="button" tabIndex={0} key={c.id} onClick={() => ctx.go(c.id)}
            onKeyDown={(e) => { if (e.key === 'Enter') ctx.go(c.id); }}>
            <div className="card-head"><Icon name={c.icon} size={17} className="ic" /><h3>{c.label}</h3>
              <div className="right"><Icon name="arrowR" size={16} className="ic" /></div></div>
            <div className="card-body">
              <span className="pill" style={{ height: 24, fontSize: 11.5 }}><Icon name="clock" size={12} /> Bientôt</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
