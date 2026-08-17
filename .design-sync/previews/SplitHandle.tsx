/* SplitHandle — poignée de repli d'un panneau latéral : barre fine pleine
   hauteur, au bord du panneau. Convention du chevron : replié, il pointe vers
   le centre ; ouvert, vers le bord de l'écran. Elle se lit donc dans une scène
   qui a une hauteur — d'où le cadre ci-dessous. */
import { SplitHandle } from 'mealweek';

const Scene = ({ side, collapsed }: { side: 'left' | 'right'; collapsed: boolean }) => (
  <div className="row" style={{ gap: 0, alignItems: 'stretch', height: 150, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', minWidth: 300 }}>
    {side === 'left' && <div style={{ width: 96, background: 'var(--bg-2)' }} />}
    {side === 'left' && <SplitHandle side="left" collapsed={collapsed} onClick={() => {}} />}
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--text-3)' }}>
      contenu central
    </div>
    {side === 'right' && <SplitHandle side="right" collapsed={collapsed} onClick={() => {}} />}
    {side === 'right' && <div style={{ width: 96, background: 'var(--bg-2)' }} />}
  </div>
);

export const PanneauGaucheOuvert = () => <Scene side="left" collapsed={false} />;
export const PanneauGaucheReplie = () => <Scene side="left" collapsed />;
export const PanneauDroitOuvert = () => <Scene side="right" collapsed={false} />;
