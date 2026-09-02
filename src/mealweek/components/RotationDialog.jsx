/* ============================================================
   Choix proposé quand on ouvre une autre semaine alors que la rotation
   automatique tourne : soit on la regarde sans rien casser (aperçu
   éphémère, la rotation continue de suivre les dimanches), soit on
   reprend la main pour de bon et la rotation s'arrête.

   Boutons empilés pleine largeur : lisibles et cliquables au doigt.
   ============================================================ */
import { useEffect } from 'react';
import { Icon } from '../../shared/Icon.jsx';

export function RotationDialog({ cible, onApercu, onDesactiver, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const numero = String(cible || '').replace(/\D/g, '');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rotation automatique en cours"
      style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'grid', placeItems: 'center', padding: 16 }}
    >
      <div className="overlay-scrim" onClick={onClose} />
      <div
        className="card"
        style={{
          position: 'relative', zIndex: 1, width: 'min(430px, 100%)',
          padding: '22px 22px 18px', display: 'flex', flexDirection: 'column', gap: 15,
        }}
      >
        <div className="row" style={{ gap: 11 }}>
          <span
            className="kpi-ic"
            style={{ width: 34, height: 34, background: 'var(--accent-soft)', color: 'var(--accent)', flex: '0 0 auto' }}
          >
            <Icon name="refresh" size={17} />
          </span>
          <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 700, letterSpacing: '-.01em' }}>
            La rotation automatique est active
          </h3>
        </div>

        <p className="hint" style={{ margin: 0, lineHeight: 1.55 }}>
          Votre semaine change toute seule chaque dimanche. Vous ouvrez la
          <strong style={{ color: 'var(--text)' }}> semaine {numero}</strong> : que voulez-vous faire ?
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <button type="button" className="btn primary" style={{ width: '100%', minHeight: 46 }} onClick={onApercu}>
            <Icon name="search" size={15} /> Juste regarder
          </button>
          <span className="hint" style={{ marginTop: -4, marginBottom: 4, fontSize: 11.5, lineHeight: 1.45 }}>
            La rotation continue : dimanche prochain, l'app reviendra d'elle-même sur la bonne semaine.
          </span>

          <button type="button" className="btn" style={{ width: '100%', minHeight: 46 }} onClick={onDesactiver}>
            <Icon name="ban" size={15} /> Désactiver la rotation et garder la semaine {numero}
          </button>

          <button type="button" className="btn ghost" style={{ width: '100%' }} onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
