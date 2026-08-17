/* ConfirmModal — confirmation bloquante.

   Le composant rend son propre voile plein écran (.day-pop-scrim, position: fixed).
   Dans l'app c'est exactement ce qu'on veut ; dans une carte d'aperçu, un élément
   fixe se cale sur la fenêtre et déborde de sa cellule. Chaque cellule est donc
   posée dans un BLOC CONTENEUR (`transform` non nul en crée un : le fixed s'y
   ancre au lieu de la fenêtre). Le composant n'est pas modifié — seule la scène
   autour de lui l'est.

   Textes repris des confirmations réelles de MedRevise : elles annoncent toujours
   la conséquence exacte, corbeille restaurable ou suppression définitive. */
import { ConfirmModal } from 'mealweek';

const Scene = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    position: 'relative', transform: 'translateZ(0)', height: 300,
    borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)',
    background: 'var(--bg)',
  }}>
    {children}
  </div>
);

export const Corbeille = () => (
  <Scene>
    <ConfirmModal
      title="Supprimer cette fiche ?"
      body="« Ostéologie du coude » sera déplacée dans la corbeille — restaurable depuis Réglages."
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  </Scene>
);

export const Irreversible = () => (
  <Scene>
    <ConfirmModal
      title="Supprimer tous les exercices ?"
      body="Les 14 exercices de « Thermodynamique » seront supprimés définitivement (sur tous tes appareils, dès la prochaine synchro). Cette action est irréversible."
      confirmLabel="Supprimer"
      danger
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  </Scene>
);
