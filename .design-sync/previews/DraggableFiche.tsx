/* Les trois pièces du glisser-déposer de fiches ne se lisent qu'ENSEMBLE :
   FicheDndProvider fournit le contexte, DraggableFiche rend une ligne saisissable,
   DropSlot marque une cible d'insertion. Chaque aperçu montre donc la même scène,
   sous l'angle de la pièce concernée.

   À savoir : au repos, un DropSlot est volontairement INVISIBLE (une bande de
   quelques pixels) — il ne s'ouvre en zone « Déposer ici » que pendant un glisser
   réel, geste qu'une capture statique ne peut pas reproduire. */
import { FicheDndProvider, DraggableFiche } from 'mealweek';

const noop = () => {};
const overlay = (id: string) => <div className="dnd-overlay-card tree-course on">{id}</div>;

const Ligne = ({ titre, badge }: { titre: string; badge?: number }) => (
  <div className="tree-course">
    <button className="tree-check"><span className="tc-box" /></button>
    <button className="tree-course-main">
      <span className="tc-name">{titre}</span>
      {badge ? <span className="tc-meta"><span className="due-badge sm">{badge}</span></span> : null}
    </button>
  </div>
);

/* Toute la boîte est la zone de préhension : les écouteurs sont posés sur
   l'enveloppe entière, pas sur une poignée dédiée. */
export const FichesSaisissables = () => (
  <div style={{ width: 340, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--card)', padding: 10 }}>
    <FicheDndProvider onDropAt={noop} renderOverlay={overlay}>
      <DraggableFiche id="f1"><Ligne titre="Ostéologie du coude" badge={12} /></DraggableFiche>
      <DraggableFiche id="f2"><Ligne titre="Plexus brachial" /></DraggableFiche>
      <DraggableFiche id="f3"><Ligne titre="Muscles de la coiffe" badge={3} /></DraggableFiche>
    </FicheDndProvider>
  </div>
);

/* `disabled` neutralise la saisie — utilisé pendant le renommage d'une fiche,
   pour qu'un clic dans le champ ne déclenche pas un glisser. */
export const SaisieDesactivee = () => (
  <div style={{ width: 340, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--card)', padding: 10 }}>
    <FicheDndProvider onDropAt={noop} renderOverlay={overlay}>
      <DraggableFiche id="f1" disabled>
        <div className="tree-course on">
          <span className="tree-check" style={{ visibility: 'hidden' }} />
          <input className="tree-rename" defaultValue="Ostéologie du coude" />
        </div>
      </DraggableFiche>
      <DraggableFiche id="f2"><Ligne titre="Plexus brachial" /></DraggableFiche>
    </FicheDndProvider>
  </div>
);
