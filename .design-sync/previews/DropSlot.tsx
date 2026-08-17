/* Les trois pièces du glisser-déposer de fiches ne se lisent qu'ENSEMBLE :
   FicheDndProvider fournit le contexte, DraggableFiche rend une ligne saisissable,
   DropSlot marque une cible d'insertion. Chaque aperçu montre donc la même scène,
   sous l'angle de la pièce concernée.

   À savoir : au repos, un DropSlot est volontairement INVISIBLE (une bande de
   quelques pixels) — il ne s'ouvre en zone « Déposer ici » que pendant un glisser
   réel, geste qu'une capture statique ne peut pas reproduire. */
import { FicheDndProvider, DraggableFiche, DropSlot } from 'mealweek';

const noop = () => {};
const overlay = (id: string) => <div className="dnd-overlay-card tree-course on">{id}</div>;

const Fiche = ({ id, titre }: { id: string; titre: string }) => (
  <DraggableFiche id={id}>
    <div className="tree-course">
      <button className="tree-check"><span className="tc-box" /></button>
      <button className="tree-course-main"><span className="tc-name">{titre}</span></button>
    </div>
  </DraggableFiche>
);

/* variant="line" : barre d'insertion fine ENTRE deux fiches. Au repos elle
   n'occupe que quelques pixels — c'est voulu, la liste reste dense. */
export const EntreDeuxFiches = () => (
  <div style={{ width: 340, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--card)', padding: 10 }}>
    <FicheDndProvider onDropAt={noop} renderOverlay={overlay}>
      <Fiche id="f1" titre="Ostéologie du coude" />
      <DropSlot matiereId="m1" beforeId="f2" />
      <Fiche id="f2" titre="Plexus brachial" />
      <DropSlot matiereId="m1" beforeId="f3" />
      <Fiche id="f3" titre="Muscles de la coiffe" />
    </FicheDndProvider>
  </div>
);

/* variant="zone" : cible de fin de liste ou de dossier vide. `dossierId` null
   vise la racine de la matière ; renseigné, il vise ce dossier précis. */
export const ZonesDeFinDeListe = () => (
  <div style={{ width: 340, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--card)', padding: 10 }}>
    <FicheDndProvider onDropAt={noop} renderOverlay={overlay}>
      <Fiche id="f1" titre="Ostéologie du coude" />
      <DropSlot matiereId="m1" dossierId={null} variant="zone" label="Déposer ici (racine)" />
      <div style={{ marginLeft: 18, paddingLeft: 10, borderLeft: '2px solid var(--border-2)', marginTop: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, padding: '4px 2px' }}>Épaule</div>
        <DropSlot matiereId="m1" dossierId="d2" variant="zone" label="Déposer dans ce chapitre" />
      </div>
    </FicheDndProvider>
  </div>
);
