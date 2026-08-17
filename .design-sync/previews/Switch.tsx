/* Switch — bascule compacte, contrôlée (l'état vit chez l'appelant).
   Usage réel : Réglages (synchro cloud, rappels). */
import { Switch } from 'mealweek';

const Ligne = ({ label, on }: { label: string; on: boolean }) => (
  <div className="row spread" style={{ gap: 14, alignItems: 'center', padding: '10px 0' }}>
    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</span>
    <Switch on={on} onChange={() => {}} />
  </div>
);

export const Active = () => <Ligne label="Synchro cloud" on />;

export const Inactive = () => <Ligne label="Rappels de la méthode des J" on={false} />;

export const EnListe = () => (
  <div style={{ minWidth: 280 }}>
    <Ligne label="Synchro cloud" on />
    <div style={{ borderTop: '1px solid var(--border-2)' }} />
    <Ligne label="Mode sombre automatique" on={false} />
    <div style={{ borderTop: '1px solid var(--border-2)' }} />
    <Ligne label="Sons de session" on />
  </div>
);
