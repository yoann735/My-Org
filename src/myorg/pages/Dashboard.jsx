/* ============================================================
   My Org — Dashboard : grille de cards résumé, chacune cliquable
   vers la feature correspondante. Placeholders « Bientôt » pour
   Calendrier / Finance / Santé (prompts à venir).
   ============================================================ */
import { Icon } from '../../shared/Icon.jsx';
import { isLate } from '../lib/storage.js';
import { CATEGORY_PILL_CLASS } from '../components/ui.jsx';

/* début de la semaine en cours (lundi 00:00, convention FR) */
function startOfWeek() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // lundi = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function StatRow({ icon, value, label, tone }) {
  return (
    <div className="mo-stat">
      <span className="mo-stat-ic" style={tone ? { color: `var(--${tone})` } : null}><Icon name={icon} size={15} /></span>
      <b>{value}</b> {label}
    </div>
  );
}

export function Dashboard({ ctx }) {
  const { db } = ctx;
  const year = new Date().getFullYear();

  // ---- News ----
  const newsItems = db.newsCache?.payload?.items || [];
  const newsHero = newsItems[0] || null;
  const newsRest = newsHero ? newsItems.slice(1, 6) : [];

  // ---- KPIs To-do ----
  const nbTodo = db.todos.filter((t) => t.statut !== 'done').length;
  const nbLate = db.todos.filter(isLate).length;
  const week = startOfWeek();
  const nbDoneWeek = db.todos.filter((t) => t.statut === 'done' && t.doneAt && new Date(t.doneAt) >= week).length;

  // ---- KPIs Objectifs (année en cours) ----
  const goalsYear = db.goals.filter((g) => g.annee === year);
  const avgProg = goalsYear.length ? Math.round(goalsYear.reduce((s, g) => s + (g.progression || 0), 0) / goalsYear.length) : 0;
  const nbAtteints = goalsYear.filter((g) => g.statut === 'atteint').length;

  const soonCards = [
    { id: 'calendrier', label: 'Calendrier', icon: 'calendar' },
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
        <div className="card mo-card">
          <div className="card-head" role="button" tabIndex={0} onClick={() => ctx.go('news')}
            onKeyDown={(e) => { if (e.key === 'Enter') ctx.go('news'); }} style={{ cursor: 'pointer' }}>
            <Icon name="newspaper" size={17} className="ic" /><h3>News</h3>
            <div className="right"><Icon name="arrowR" size={16} className="ic" /></div>
          </div>
          <div className="card-body">
            {newsHero ? (
              <>
                <div
                  role="button" tabIndex={0}
                  onClick={() => ctx.openNewsReader(newsHero)}
                  onKeyDown={(e) => { if (e.key === 'Enter') ctx.openNewsReader(newsHero); }}
                  style={{ cursor: 'pointer', marginBottom: 8 }}
                >
                  <div className="mo-row-title" style={{ marginBottom: 4 }}>{newsHero.title}</div>
                  <div className="hint" style={{ fontSize: 12.5 }}>{newsHero.source}</div>
                </div>
                <div className="news-dash-list">
                  {newsRest.map((it) => (
                    <div
                      key={it.url}
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

        {/* To-do */}
        <div className="card mo-card" role="button" tabIndex={0} onClick={() => ctx.go('todos')}
          onKeyDown={(e) => { if (e.key === 'Enter') ctx.go('todos'); }}>
          <div className="card-head"><Icon name="check" size={17} className="ic" /><h3>To-do</h3>
            <div className="right"><Icon name="arrowR" size={16} className="ic" /></div></div>
          <div className="card-body">
            <StatRow icon="list" value={nbTodo} label="à faire" />
            <StatRow icon="alert" value={nbLate} label="en retard" tone={nbLate ? 'crit' : undefined} />
            <StatRow icon="check" value={nbDoneWeek} label="faites cette semaine" tone="ok" />
          </div>
        </div>

        {/* Objectifs */}
        <div className="card mo-card" role="button" tabIndex={0} onClick={() => ctx.go('goals')}
          onKeyDown={(e) => { if (e.key === 'Enter') ctx.go('goals'); }}>
          <div className="card-head"><Icon name="target" size={17} className="ic" /><h3>Objectifs {year}</h3>
            <div className="right"><Icon name="arrowR" size={16} className="ic" /></div></div>
          <div className="card-body">
            <div className="mo-goal-prog" style={{ marginBottom: 10 }}>
              <div className="bar" style={{ flex: 1 }}><span style={{ width: `${avgProg}%` }} /></div>
              <span className="mo-goal-pct">{avgProg} %</span>
            </div>
            <StatRow icon="trophy" value={nbAtteints} label={`objectif(s) atteint(s) sur ${goalsYear.length}`} tone="ok" />
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
