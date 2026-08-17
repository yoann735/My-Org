/* Card — conteneur de section du design system MyOrg.
   Compositions reprises des usages réels : Dashboard (« À rattraper »),
   Réglages (corbeille), Réviser (carnet d'erreurs). */
import { Card, Icon } from 'mealweek';

export const Simple = () => (
  <Card title="Prochaine échéance">
    <div style={{ fontSize: 14, color: 'var(--text-2)' }}>
      Anatomie du membre supérieur — 12 cartes dues, palier J+7.
    </div>
  </Card>
);

export const AvecIconeEtAction = () => (
  <Card title="À rattraper" icon="clock" action={<span className="pill">3 fiches</span>}>
    <div className="hint" style={{ marginBottom: 10, fontSize: 12 }}>
      Échéance dépassée — la réviser l'avance simplement au palier suivant, la date ne bouge pas.
    </div>
    <div className="row spread" style={{ gap: 8, padding: '7px 0', borderTop: '1px solid var(--border-2)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>Ostéologie du coude</div>
        <div className="hint" style={{ fontSize: 11 }}>Anatomie · 8 cartes</div>
      </div>
      <button className="btn ghost sm">Rattraper</button>
    </div>
    <div className="row spread" style={{ gap: 8, padding: '7px 0', borderTop: '1px solid var(--border-2)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>Plexus brachial</div>
        <div className="hint" style={{ fontSize: 11 }}>Anatomie · 5 cartes</div>
      </div>
      <button className="btn ghost sm">Rattraper</button>
    </div>
  </Card>
);

export const SansTitre = () => (
  <Card>
    <div className="row" style={{ gap: 10, alignItems: 'center' }}>
      <Icon name="sparkle" size={17} />
      <div style={{ fontSize: 14 }}>
        Sans <code>title</code>, l'en-tête entier est omis — la carte n'est plus qu'une surface.
      </div>
    </div>
  </Card>
);

export const TexteLong = () => (
  <Card title="Méthode des J" icon="calendar">
    <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.55, color: 'var(--text-2)' }}>
      Une fiche révisée aujourd'hui revient à J+3, puis J+7, J+14 et J+30. Chaque succès
      fait avancer la carte d'un palier ; un échec la ramène au précédent.
    </p>
    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--text-2)' }}>
      Les exercices sont hors méthode des J : ils se font librement, et leur statut se
      pose à la main.
    </p>
  </Card>
);
