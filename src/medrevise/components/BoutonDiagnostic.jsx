/* Bouton « Exporter un diagnostic » (v1.2, lib/diagnosticExport.js) — Réglages → Synchronisation
   (ordinateur) et section Synchronisation de l'accueil mobile. Lecture seule. */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { exporterDiagnostic } from '../lib/diagnosticExport.js';

export function BoutonDiagnostic({ mobile = false }) {
  const [etat, setEtat] = useState({ busy: false, message: '' });
  const lancer = async () => {
    setEtat({ busy: true, message: '' });
    const r = await exporterDiagnostic();
    setEtat({ busy: false, message: r.message });
  };
  return (
    <div className="diag-export" style={{ marginTop: 12 }}>
      <button type="button" className={mobile ? 'mrm-btn' : 'btn'} style={mobile ? { width: '100%' } : undefined}
        disabled={etat.busy} onClick={lancer}
        title="Fichier JSON en lecture seule : état de chaque carte, séance en cours, plan du jour, empreinte cloud, date et fuseau de l’appareil">
        <Icon name="info" size={15} /> {etat.busy ? 'Export en cours…' : 'Exporter un diagnostic'}
      </button>
      {etat.message && <div className={mobile ? 'mrm-row-sub' : 'hint'} style={{ marginTop: 8 }}>{etat.message}</div>}
    </div>
  );
}
