/* Les trois pièces du glisser-déposer de fiches ne se lisent qu'ENSEMBLE :
   FicheDndProvider fournit le contexte, DraggableFiche rend une ligne saisissable,
   DropSlot marque une cible d'insertion. Chaque aperçu montre donc la même scène,
   sous l'angle de la pièce concernée.

   À savoir : au repos, un DropSlot est volontairement INVISIBLE (une bande de
   quelques pixels) — il ne s'ouvre en zone « Déposer ici » que pendant un glisser
   réel, geste qu'une capture statique ne peut pas reproduire. */
import { FicheDndProvider, DraggableFiche, DropSlot } from 'mealweek';

const noop = () => {};

const Fiche = ({ id, titre }: { id: string; titre: string }) => (
  <DraggableFiche id={id}>
    <div className="tree-course">
      <button className="tree-check"><span className="tc-box" /></button>
      <button className="tree-course-main"><span className="tc-name">{titre}</span></button>
    </div>
  </DraggableFiche>
);

/* Le provider enveloppe TOUT l'arbre : c'est lui qui reçoit le dépôt final
   (onDropAt) et qui rend la fiche fantôme pendant le déplacement (renderOverlay). */
export const ArbreComplet = () => (
  <div style={{ width: 340, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--card)', padding: 10 }}>
    <FicheDndProvider onDropAt={noop} renderOverlay={(id) => <div className="dnd-overlay-card tree-course on">{id}</div>}>
      <DropSlot matiereId="m1" beforeId="f1" />
      <Fiche id="f1" titre="Ostéologie du coude" />
      <DropSlot matiereId="m1" beforeId="f2" />
      <Fiche id="f2" titre="Plexus brachial" />
      <DropSlot matiereId="m1" beforeId="f3" />
      <Fiche id="f3" titre="Muscles de la coiffe" />
      <DropSlot matiereId="m1" variant="zone" />
    </FicheDndProvider>
  </div>
);
