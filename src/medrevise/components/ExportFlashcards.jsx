/* ============================================================
   MedRevise — « EXPORTER » DES FLASHCARDS (26/10, lib/exportFlashcards.js, docs/compte-rendu-export-flashcards.md).
   UN SEUL composant, appelé depuis :
   - le panneau Flashcards d'une fiche (toutes ses cartes, ou la sélection cochée) ;
   - la Bibliothèque (menu « … » d'une matière ou d'un cours) ;
   - le mode Apprentissage (les cartes visibles avec les filtres actuels) ;
   - les Réglages (toutes les flashcards).
   Aperçu (cartes par type et par cours, images), puis un .zip ré-importable : flashcards.json + images/ + README.txt.
   Barre de progression : l'archive se construit par étapes, l'interface ne fige pas. Lecture seule.
   ============================================================ */
import { useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Modal } from './ui.jsx';
import { getBlob } from '../lib/storage.js';
import { todayISO } from '../lib/sm2.js';
import { deliverFile, formatOctets } from '../lib/backupExport.js';
import { construireExport, resumeExport, estExportable, libelleDesCartes, nomArchive, LIBELLES_EXPORT } from '../lib/exportFlashcards.js';
import '../../styles/import-flashcards.css';

const ETAPES = { images: 'Images', cartes: 'Cartes', archive: 'Archive' };
const pct = (p) => {
  if (!p) return 0;
  const f = p.total ? p.fait / p.total : 1;
  return Math.round(p.etape === 'images' ? f * 70 : p.etape === 'cartes' ? 70 + f * 10 : 80 + f * 20);
};

/* `cartes` : les cartes à exporter ; `libelle` : nom du cours / de la matière / de l'ensemble (titre et nom du fichier) ;
   `defautLibelle` : si `libelle` est absent, le cours (ou la matière) commun aux cartes, sinon ce libellé */
export function ExportFlashcards({ ctx, cartes, libelle = null, defautLibelle = 'selection', titre = 'Exporter des flashcards', onFermer }) {
  const liste = useMemo(() => (cartes || []).filter(estExportable), [cartes]);
  const nomContenu = libelle || libelleDesCartes(liste, ctx.db, defautLibelle);
  const resume = useMemo(() => resumeExport(liste, ctx.db), [liste, ctx.db]);
  const [progres, setProgres] = useState(null);
  const [fait, setFait] = useState(null);
  const enCours = useRef(false);

  const exporter = async () => {
    if (enCours.current) return;
    enCours.current = true; setFait(null); setProgres({ etape: 'images', fait: 0, total: resume.images });
    try {
      const r = await construireExport({ cartes: liste, db: ctx.db, lireBlob: getBlob, libelle: nomContenu, today: todayISO(), onProgres: setProgres });
      try { window.__dernierExportFC = { nom: r.nom, octets: r.octets, cartes: r.resume.cartes, images: r.resume.images - r.manquantes.length, manquantes: r.manquantes, blob: r.blob }; } catch (e) { /* ignore */ }
      const remis = await deliverFile(r.blob, r.nom, 'application/zip');
      setFait({ ...r, remis });
    } catch (e) { setFait({ erreur: e.message || String(e) }); } finally { enCours.current = false; setProgres(null); }
  };

  const occupe = !!progres;
  return (
    <Modal title={titre} onClose={() => { if (!enCours.current) onFermer(); }} width="min(560px, 96vw)">
      <div className="ifc" data-export-flashcards="">
        <div className="hint">Contenu : <b style={{ color: 'var(--text)' }}>{nomContenu === 'selection' ? 'sélection' : nomContenu}</b> — un fichier .zip, ré-importable tel quel par « Importer » du panneau Flashcards d’un cours.</div>
        <div className="ifc-compte" data-compte="">
          <b className="tnum">{resume.cartes} carte{resume.cartes > 1 ? 's' : ''}</b>
          {Object.entries(LIBELLES_EXPORT).filter(([k]) => resume.parSorte[k]).map(([k, lib]) => <span key={k} className="ifc-puce" data-sorte={k}>{lib} <span className="tnum">{resume.parSorte[k]}</span></span>)}
          {resume.images > 0 && <span className="ifc-puce" data-images={resume.images}><Icon name="image" size={11} /> <span className="tnum">{resume.images}</span> image{resume.images > 1 ? 's' : ''}</span>}
        </div>
        {resume.parCours.length > 1 && (
          <ul className="efc-cours" aria-label="Cartes par cours">
            {resume.parCours.map(([c, n]) => <li key={c}>{c} : {n}</li>)}
          </ul>
        )}
        <div className="hint">Tout le contenu des cartes, leurs images (dossier images/), le tag « À apprendre », le cours d’origine et les dates. La progression (catégorie, dates, état FSRS) est jointe à part : ignorée au ré-import, sauf si tu coches « Reprendre aussi la progression ». Aucune carte n’est modifiée.</div>
        {occupe && (
          <div className="efc-progres" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct(progres)} aria-label="Progression de l’export" data-progres={pct(progres)}>
            <div className="efc-progres-ligne">{ETAPES[progres.etape]}{progres.total ? ` : ${progres.fait} / ${progres.total}` : ''}</div>
            <div className="efc-barre"><span style={{ width: Math.max(3, pct(progres)) + '%' }} /></div>
          </div>
        )}
        {fait && !fait.erreur && (
          <div className="ifc-fait" role="status" data-fait={fait.resume.cartes}>
            <Icon name="check" size={14} /> {fait.remis === 'annule' ? 'Partage annulé' : <>{fait.nom} <span className="hint">— {formatOctets(fait.octets)}</span></>}
          </div>
        )}
        {fait && !fait.erreur && fait.manquantes.length > 0 && (
          <div className="fj-erreur" role="alert">{fait.manquantes.length} image{fait.manquantes.length > 1 ? 's' : ''} introuvable{fait.manquantes.length > 1 ? 's' : ''} sur cet appareil : non incluse{fait.manquantes.length > 1 ? 's' : ''} (listée{fait.manquantes.length > 1 ? 's' : ''} dans README.txt).</div>
        )}
        {fait && fait.erreur && <div className="fj-erreur" role="alert">{fait.erreur}</div>}
        <div className="row spread" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="hint tnum" data-nom-fichier="">{nomArchive(nomContenu, todayISO())}</span>
          <button type="button" className="btn primary" data-act="exporter-fc" disabled={occupe || !resume.cartes} onClick={exporter}>
            <Icon name="archive" size={14} /> {occupe ? 'Export…' : `Exporter ${resume.cartes} carte${resume.cartes > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
