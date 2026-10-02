/* ============================================================
   MedRevise — carte « Dessin » de l'accueil mobile (02/10). Dit quelle fiche est
   ouverte sur l'ordi (liaison par le cloud, sondée toutes les 10 s tant que
   l'écran est visible) et ouvre le canvas de dessin.
   ============================================================ */
import { useState } from 'react';
import { IconeOutil } from '../pdf/IconesOutils.jsx';
import { lireFicheActive, useSondage, SYNCHRO_ACTIVE } from '../lib/dessins.js';

/** fiche ouverte sur l'ordi, tenue à jour par le sondage du cloud. */
export function useFicheActiveOrdi() {
  const [active, setActive] = useState(null);
  useSondage('liaison', async () => setActive(await lireFicheActive()));
  return active;
}

export function CarteDessin({ onOuvrir }) {
  const active = useFicheActiveOrdi();
  return (
    <div className="mrm-card mrm-dessin">
      <div className="mrm-dessin-tete">
        <span className="mrm-dessin-ic"><IconeOutil nom="crayon" size={20} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mrm-dessin-titre">Dessin</div>
          <div className="mrm-dessin-sous">
            {!SYNCHRO_ACTIVE ? 'Synchro désactivée : le dessin restera sur ce téléphone'
              : active && active.ficheId
                ? <>{active.ouverte ? <i className="mrm-point-vert" /> : null}{active.ouverte ? 'Sur l’ordi : ' : 'Dernière fiche ouverte sur l’ordi : '}<b>{active.titre || 'fiche sans titre'}</b></>
                : 'Aucune fiche ouverte sur l’ordi pour l’instant'}
          </div>
        </div>
      </div>
      <button type="button" className="mrm-cta mrm-cta-dessin" onClick={onOuvrir}>
        <IconeOutil nom="crayon" size={18} /> Dessiner
      </button>
    </div>
  );
}
