/* Modal — fenêtre générique (titre, corps défilant, fermeture par la croix,
   par le voile ou par Échap). Comme ConfirmModal, elle rend son propre voile
   en position fixe : chaque cellule est posée dans un bloc conteneur pour que
   l'aperçu reste dans sa carte. */
import { Modal } from 'mealweek';

const Scene = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    position: 'relative', transform: 'translateZ(0)', height: 340,
    borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg)',
  }}>{children}</div>
);

export const Formulaire = () => (
  <Scene>
    <Modal title="Ajouter un item" onClose={() => {}}>
      <div className="imp-field">
        <label>Type d'item</label>
        <div className="imp-chips">
          <button className="imp-chip on">QCM</button>
          <button className="imp-chip">Flashcard</button>
          <button className="imp-chip">Feynman</button>
        </div>
      </div>
      <div className="imp-field" style={{ marginTop: 14 }}>
        <label>Question</label>
        <div className="hint">Colle ici le JSON de l'item, ou saisis-le à la main.</div>
      </div>
    </Modal>
  </Scene>
);

export const Etroite = () => (
  <Scene>
    <Modal title="Renommer le cours" width="min(380px, 92vw)" onClose={() => {}}>
      <div className="imp-field">
        <label>Nouveau nom</label>
        <div className="hint">Anatomie humaine — 2ᵉ année</div>
      </div>
    </Modal>
  </Scene>
);

export const ContenuLong = () => (
  <Scene>
    <Modal title="Journal de synchronisation" onClose={() => {}}>
      {['Réconciliation au démarrage — 128 enregistrements lus',
        'Envoi de 3 fiches modifiées',
        'Conflit résolu par date (last-write-wins) sur « Plexus brachial »',
        'Blobs : 2 images envoyées, 1 déjà présente',
        'Terminé — aucune erreur'].map((l, i) => (
        <div key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--border-2)' : 'none', fontSize: 13 }}>{l}</div>
      ))}
    </Modal>
  </Scene>
);
