/* DateActionModal — action datée : choisir une date, voir combien d'éléments
   elle concerne, confirmer. Usage réel : « Décaler le départ (J0) » d'un cours
   ou d'une fiche, où une date PASSÉE est légitime (cours déjà commencé). */
import { DateActionModal } from 'mealweek';

const Scene = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    position: 'relative', transform: 'translateZ(0)', height: 380,
    borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg)',
  }}>{children}</div>
);

export const DecalerLeDepart = () => (
  <Scene>
    <DateActionModal
      title="Décaler le départ — « Anatomie humaine »"
      label="Nouvelle date de départ (J0)"
      confirmLabel="Décaler"
      count={42}
      allowPast
      body="42 cartes sans planning actif seront décalées à cette date — une date passée est acceptée (cours déjà commencé) : les jalons déjà écoulés seront traités comme déjà faits, pas comme du retard."
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  </Scene>
);

export const RienADecaler = () => (
  <Scene>
    <DateActionModal
      title="Décaler le départ — « Plexus brachial »"
      label="Nouvelle date de départ (J0)"
      confirmLabel="Décaler"
      count={0}
      body="Aucune carte sans planning actif ici — rien à décaler."
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  </Scene>
);
