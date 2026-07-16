/* ============================================================
   My Org — page placeholder « Bientôt disponible » (Calendrier /
   Finance / Santé, en attendant leurs prompts dédiés).
   ============================================================ */
import { Icon } from '../../shared/Icon.jsx';

export function Placeholder({ ctx, icon = 'box', title = 'Bientôt' }) {
  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div><h1 className="serif">{title}</h1><div className="sub">Cette section arrive bientôt.</div></div>
        <div className="topbar-actions">
          <button className="icon-btn" type="button" title="Changer d'app" onClick={ctx.goHub}><Icon name="grid" size={19} /></button>
          <button className="icon-btn" type="button" title={ctx.theme === 'dark' ? 'Mode clair' : 'Mode sombre'} onClick={ctx.toggleTheme}>
            <Icon name={ctx.theme === 'dark' ? 'sun' : 'moon'} size={19} />
          </button>
        </div>
      </div>

      <div className="mo-soon card">
        <div className="mo-soon-ic"><Icon name={icon} size={30} /></div>
        <div className="serif" style={{ fontSize: 22 }}>Bientôt disponible</div>
        <div className="hint" style={{ fontSize: 13.5, textAlign: 'center' }}>
          Le module « {title} » sera ajouté dans une prochaine étape.
        </div>
        <button className="btn" onClick={() => ctx.go('dashboard')}><Icon name="home" size={15} /> Retour au dashboard</button>
      </div>
    </div>
  );
}
