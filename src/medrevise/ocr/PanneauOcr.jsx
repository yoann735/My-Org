/* ============================================================
   MedRevise — OCR : progression (Bibliothèque) et réglages.
   ============================================================ */
import { useEffect, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Card, Switch } from '../components/ui.jsx';
import { useEtatOcr } from './useOcr.js';
import { pause, reprendre, ocrAutoActif, setOcrAuto, lancerDossier, estMobile } from './service.js';
import { getAll } from '../lib/storage.js';

const CLE_REPLI = 'medrevise.ocr.panneau.replie';

/** « OCR : 14/37 cours · 212 pages » — repliable, avec Pause. Invisible quand rien ne tourne. */
export function PanneauOcrBibliotheque() {
  const e = useEtatOcr();
  const [replie, setReplie] = useState(() => { try { return localStorage.getItem(CLE_REPLI) === '1'; } catch (x) { return false; } });
  const basculer = () => setReplie((v) => { try { localStorage.setItem(CLE_REPLI, v ? '0' : '1'); } catch (x) { /* bloqué */ } return !v; });
  const m = e.masse;
  const actif = !!(e.courant || (m && !m.termine) || e.file.length);
  if (!actif && !(m && m.termine && m.coursTotal)) return null;
  const resume = m && m.coursTotal
    ? `OCR : ${m.coursFaits}/${m.coursTotal} cours · ${m.pages} page${m.pages > 1 ? 's' : ''}`
    : `OCR : ${e.file.length} PDF en file`;
  return (
    <div className={'ocr-panneau' + (replie ? ' replie' : '')} role="status">
      <button type="button" className="ocr-panneau-tete" onClick={basculer} aria-expanded={!replie} title={replie ? 'Déplier' : 'Replier'}>
        {actif && !e.pause ? <span className="ocr-point" /> : <Icon name={m && m.termine ? 'check' : 'clock'} size={12} />}
        <span className="tnum">{m && m.termine && !actif ? `OCR terminé : ${m.coursTotal} cours · ${m.pages} pages` : resume}</span>
        {e.pause && <span className="ocr-pause-lbl">en pause</span>}
        <Icon name={replie ? 'chevD' : 'chevU'} size={12} />
      </button>
      {!replie && (
        <div className="ocr-panneau-corps">
          {e.courant
            ? <div className="hint">Texte en cours de reconnaissance : <b>{e.courant.titre || 'PDF'}</b> — page {e.courant.page}/{e.courant.total}</div>
            : <div className="hint">{e.pause ? 'En pause.' : actif ? 'En attente…' : 'Tous les cours sont traités.'}</div>}
          {m && m.nom && <div className="hint">Section : {m.nom}{m.manquants ? ` · ${m.manquants} PDF absent${m.manquants > 1 ? 's' : ''} de cet appareil (repris plus tard)` : ''}</div>}
          {actif && (
            <button type="button" className="btn sm" onClick={() => (e.pause ? reprendre() : pause())}>
              {e.pause ? <><Icon name="play" size={12} /> Reprendre</> : <><span className="trx-ic-pause" /> Pause</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Carte des Réglages : OCR automatique à l'import + lancer sur un dossier. */
export function CarteOcrReglages() {
  const e = useEtatOcr();
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
      {(e.courant || e.file.length > 0) && <div className="hint" style={{ marginTop: 8 }}>En cours : {e.courant ? `${e.courant.titre || 'PDF'} (page ${e.courant.page}/${e.courant.total})` : '—'} · {e.file.length} PDF en file{e.pause ? ' · en pause' : ''}</div>}
    </Card>
  );
}
