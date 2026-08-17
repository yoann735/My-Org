/* BellButton — met un cours en pause dans la méthode des J (ses fiches ne
   sortent plus dans la série du jour, mais restent révisables à la main).
   L'infobulle explicative s'ouvre au survol : elle n'apparaît donc pas sur une
   capture, seul l'état de l'icône est visible. */
import { BellButton } from 'mealweek';

const Ligne = ({ nom, on }: { nom: string; on: boolean }) => (
  <div className="row spread" style={{ gap: 12, alignItems: 'center', minWidth: 280, padding: '6px 8px' }}>
    <span style={{ fontWeight: 700, fontSize: 14, opacity: on ? 1 : 0.55 }}>{nom}</span>
    <BellButton on={on} onToggle={() => {}} />
  </div>
);

export const RappelsActifs = () => <Ligne nom="Anatomie humaine" on />;

export const CoursEnPause = () => <Ligne nom="Pharmacologie" on={false} />;

export const DansUneListeDeCours = () => (
  <div>
    <Ligne nom="Anatomie humaine" on />
    <Ligne nom="Physiologie" on />
    <Ligne nom="Pharmacologie" on={false} />
  </div>
);
