/* ============================================================
   App selector (hub) — landing screen, choose MealWeek / MedRevise.
   Ported from the Claude Design `index.html`. Shares the theme with
   both apps. MedRevise is shown but flagged "bientôt" until built.
   ============================================================ */
import { Icon } from './shared/Icon.jsx';
import { weekKpis } from './mealweek/data/dataLayer.js';

function readJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
  catch (e) { return fallback; }
}

export function Selecteur({ themeApi, onOpen, medReady = false }) {
  const { theme, toggleTheme } = themeApi;

  // live MealWeek stat (current week's planned meals)
  const weekKey = readJSON('mw.week', 'S1');
  const slotsOff = readJSON('mw.slotsOff', {});
  let meals = 0;
  try { meals = weekKpis(weekKey, slotsOff).mealsPlanned; } catch (e) { meals = 0; }

  return (
    <div className="hub">
      <div className="hub-top">
        <button className="icon-btn" type="button" onClick={toggleTheme} title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={19} />
        </button>
      </div>

      <div className="hub-head">
        <div className="hub-logo"><Icon name="grid" size={28} /></div>
        <h1 className="serif">Bonjour</h1>
        <p>Choisis ton espace pour aujourd'hui.</p>
      </div>

      <div className="hub-cards">
        {/* MealWeek */}
        <div className="hub-card" onClick={() => onOpen('mealweek')}>
          <div className="hc-glow" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--accent) 40%, transparent), transparent 65%)' }} />
          <div className="hc-icon" style={{ background: 'linear-gradient(145deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--accent-2)))' }}><Icon name="bowl" size={28} stroke={2.2} /></div>
          <div className="hc-title">MealWeek</div>
          <div className="hc-desc">Planifie tes repas de la semaine, gère ta liste de courses Chronodrive et ton budget alimentaire.</div>
          <div className="hc-foot">
            <span className="hc-stat" style={{ color: 'var(--accent)' }}><Icon name="calendar" size={15} /> {meals} repas planifiés</span>
            <span className="hc-enter">Ouvrir <Icon name="arrowR" size={16} /></span>
          </div>
        </div>

        {/* MedRevise */}
        <div className="hub-card" onClick={() => onOpen('medrevise')}>
          <div className="hc-glow" style={{ background: 'radial-gradient(circle, color-mix(in srgb, #4FA6D9 45%, transparent), transparent 65%)' }} />
          <div className="hc-icon" style={{ background: 'linear-gradient(145deg, var(--accent), #4FA6D9)' }}><Icon name="grad" size={28} /></div>
          <div className="hc-title">MedRevise</div>
          <div className="hc-desc">Révise tes cours de médecine : QCM, flashcards et mode Feynman, générés depuis tes fiches.</div>
          <div className="hc-foot">
            <span className="hc-stat" style={{ color: '#4FA6D9' }}>
              <Icon name="cards" size={15} /> {medReady ? '0 cartes à réviser' : 'Bientôt disponible'}
            </span>
            <span className="hc-enter">Ouvrir <Icon name="arrowR" size={16} /></span>
          </div>
        </div>
      </div>

      <div className="hub-foot">Deux apps, un même univers · thème {theme === 'dark' ? 'sombre' : 'clair'}</div>
    </div>
  );
}
