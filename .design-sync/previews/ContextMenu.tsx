/* ContextMenu — menu au clic droit / appui long.

   Il se rend dans un PORTAIL vers le body (position fixe, z-index élevé) pour ne
   jamais être rogné par un conteneur défilant. Un portail échappe à tout bloc
   conteneur : la cellule affiche donc la ligne d'où part le menu — contenu réel
   du root — et le menu se dessine par-dessus, aux coordonnées données.
   Les entrées sont celles de l'arbre Réviser : révision d'abord, gestion ensuite. */
import { ContextMenu, Icon } from 'mealweek';

const Ligne = ({ nom }: { nom: string }) => (
  <div style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', width: 260, fontSize: 13.5, fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center' }}>
    <Icon name="cards" size={14} /> {nom}
  </div>
);

export const MenuDeFiche = () => (
  <div style={{ height: 300, position: 'relative' }}>
    <Ligne nom="Ostéologie du coude" />
    <ContextMenu
      x={300} y={120}
      onClose={() => {}}
      items={[
        { label: 'Rattraper maintenant', icon: 'clock', onClick: () => {} },
        { label: 'Voir le cours', icon: 'filePdf', onClick: () => {} },
        { label: "Lancer aujourd'hui (12)", icon: 'play', onClick: () => {} },
        { label: 'Renommer', icon: 'edit', onClick: () => {} },
        { label: 'Déplacer vers…', icon: 'folder', onClick: () => {} },
        { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => {} },
      ]}
    />
  </div>
);

export const MenuCourt = () => (
  <div style={{ height: 220, position: 'relative' }}>
    <Ligne nom="Membre supérieur" />
    <ContextMenu
      x={300} y={110}
      onClose={() => {}}
      items={[
        { label: 'Nouveau chapitre', icon: 'folder', onClick: () => {} },
        { label: 'Renommer', icon: 'edit', onClick: () => {} },
        { label: "Supprimer l'unité", icon: 'trash', danger: true, onClick: () => {} },
      ]}
    />
  </div>
);
