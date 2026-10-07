/* ============================================================
   MedRevise — OCR : réglages et progression (Réglages → Reconnaissance de texte).
   ============================================================ */
import { useEffect, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Card, Switch } from '../components/ui.jsx';
import { useEtatOcr } from './useOcr.js';
import { pause, reprendre, ocrAutoActif, setOcrAuto, lancerDossier, estMobile } from './service.js';
import { getAll } from '../lib/storage.js';

/* (08/10) Le panneau de progression a QUITTÉ la Bibliothèque : l'OCR tourne en silence.
   Son état (progression, pause / reprise) est ici, dans Réglages → Reconnaissance de texte,
   et dans le menu Fichier de chaque cours (lecteur). */
function EtatOcr() {
  const e = useEtatOcr();
  const m = e.masse;
  const actif = !!(e.courant || (m && !m.termine) || e.file.length);
  return (
    <div className="ocr-etat" role="status">
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        {actif && !e.pause ? <span className="ocr-point" /> : <Icon name={actif ? 'clock' : 'check'} size={13} />}
        <span style={{ fontWeight: 600 }} className="tnum">
          {!actif ? (m && m.termine && m.coursTotal ? `Terminé : ${m.coursTotal} cours · ${m.pages} pages` : 'Rien en cours')
            : m && m.coursTotal ? `${m.coursFaits}/${m.coursTotal} cours · ${m.pages} page${m.pages > 1 ? 's' : ''}` : `${e.file.length} PDF en file`}
        </span>
        {e.pause && <span className="ocr-pause-lbl">en pause</span>}
        {actif && (
          <button type="button" className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => (e.pause ? reprendre() : pause())}>
            {e.pause ? <><Icon name="play" size={12} /> Reprendre</> : <><span className="trx-ic-pause" /> Pause</>}
          </button>
        )}
      </div>
      {e.courant && <div className="hint" style={{ marginTop: 4 }}>Texte en cours de reconnaissance : <b>{e.courant.titre || 'PDF'}</b> — page {e.courant.page}/{e.courant.total}</div>}
      {actif && !e.courant && <div className="hint" style={{ marginTop: 4 }}>{e.pause ? 'En pause.' : 'En attente…'}</div>}
      {m && m.nom && actif && <div className="hint">Section : {m.nom}{m.manquants ? ` · ${m.manquants} PDF absent${m.manquants > 1 ? 's' : ''} de cet appareil (repris plus tard)` : ''}</div>}
    </div>
  );
}

/** Carte des Réglages : OCR automatique à l'import + lancer sur un dossier. */
export function CarteOcrReglages() {
  const [auto, setAuto] = useState(ocrAutoActif());
  const [cibles, setCibles] = useState([]);
  const [cible, setCible] = useState('');
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    Promise.all([getAll('sources'), getAll('matieres')]).then(([s, m]) => {
      const l = [];
      (s || []).filter((x) => x && !x.archive).forEach((src) => {
        l.push({ type: 'source', id: src.id, nom: src.nom || src.titre });
        (m || []).filter((x) => x && x.sourceId === src.id && !x.archive).forEach((mat) => l.push({ type: 'matiere', id: mat.id, nom: `${src.nom || src.titre} › ${mat.nom || mat.titre}` }));
      });
      setCibles(l);
    });
  }, []);
  return (
    <Card title="Reconnaissance de texte (OCR)" icon="search">
      <div className="row spread" style={{ alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600 }}>OCR automatique à l’import</div>
          <div className="hint">Les PDF scannés deviennent sélectionnables et cherchables, en tâche de fond.{estMobile() ? ' Désactivé par défaut sur ce téléphone (trop lourd) ; les couches calculées ailleurs arrivent par la synchro.' : ''}</div>
        </div>
        <Switch on={auto} onChange={(v) => { setAuto(v); setOcrAuto(v); }} label="OCR automatique à l’import" />
      </div>
      <div className="imp-field" style={{ marginTop: 12 }}>
        <label>Lancer l’OCR sur un dossier…</label>
        <div className="row" style={{ gap: 8 }}>
          <select className="imp-title" value={cible} onChange={(x) => setCible(x.target.value)} style={{ flex: 1 }}>
            <option value="">Choisir une section ou une matière</option>
            {cibles.map((c) => <option key={c.type + c.id} value={c.type + ':' + c.id}>{c.nom}</option>)}
          </select>
          <button type="button" className="btn" disabled={!cible} onClick={async () => {
            const c = cibles.find((x) => x.type + ':' + x.id === cible);
            const r = await lancerDossier(c);
            setMsg(`${r.total} cours · ${r.aFaire} à traiter (les autres le sont déjà).`);
          }}><Icon name="play" size={14} /> Lancer</button>
        </div>
        {msg && <div className="hint" style={{ marginTop: 6 }}>{msg}</div>}
      </div>
      <div className="imp-field" style={{ marginTop: 12 }}>
        <label>Progression</label>
        <EtatOcr />
      </div>
    </Card>
  );
}
