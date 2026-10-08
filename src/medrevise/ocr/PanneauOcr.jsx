/* ============================================================
   MedRevise — OCR : réglages et progression (Réglages → Reconnaissance de texte).
   ============================================================ */
import { useEffect, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Card, Switch } from '../components/ui.jsx';
import { useEtatOcr } from './useOcr.js';
import { pause, reprendre, ocrAutoActif, setOcrAuto, lancerDossier, estMobile, pagesEnEchec, relancer } from './service.js';
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

/* (08/10) pages dont la reconnaissance a échoué DEUX fois (un nouvel essai est fait
   automatiquement) : signalées ici, avec « Relancer » pour le cours. */
function PagesEnEchec() {
  const e = useEtatOcr();
  const [liste, setListe] = useState(null);
  useEffect(() => { let vivant = true; pagesEnEchec().then((l) => { if (vivant) setListe(l); }).catch(() => {}); return () => { vivant = false; }; }, [e.courant && e.courant.page, e.file.length]);
  if (!liste || !liste.length) return <div className="hint ocr-echecs-vide"><Icon name="check" size={12} /> Aucune page en échec.</div>;
  return (
    <div className="ocr-echecs" role="list">
      {liste.map((x) => (
        <div key={x.coucheId} className="ocr-echec" role="listitem">
          <Icon name="alert" size={13} />
          <span className="ocr-echec-txt"><b>{x.titre}</b> — page{x.pages.length > 1 ? 's' : ''} {x.pages.join(', ')} non reconnue{x.pages.length > 1 ? 's' : ''}{x.message ? <span className="hint"> ({x.message})</span> : null}</span>
          {x.pdfId && <button type="button" className="btn sm" onClick={() => relancer(x.pdfId, { courseId: x.courseId, titre: x.titre })}><Icon name="refresh" size={12} /> Relancer</button>}
        </div>
      ))}
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
      <div className="imp-field" style={{ marginTop: 12 }}>
        <label>Pages en échec</label>
        <PagesEnEchec />
      </div>
    </Card>
  );
}
