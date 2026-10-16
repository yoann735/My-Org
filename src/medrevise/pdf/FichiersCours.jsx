/* ============================================================
   MedRevise — « FICHIERS DU COURS » (16/10, lib/fichiersCours.js, docs/compte-rendu-fichiers-cours.md).
   Menu Fichier › « Fichiers du cours… » (et Bibliothèque › ⋯). Deux lignes, rien d'autre :
   - Document principal : nom (éditable), pages, date d'import, taille — Remplacer · Exporter
     (« Importer » s'il n'y en a pas : cours à cartes seules) ;
   - Fiche jumelle : idem, ou « Aucune » — Importer / Remplacer · Supprimer · Exporter.
   Remplacer le principal et supprimer la fiche demandent une confirmation explicite ; une
   sauvegarde (putBackup) est faite avant ; rien n'est effacé physiquement.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Modal } from '../components/ui.jsx';
import {
  principalDe, infosFichier, taillePourAffichage, verifierFichiers, importerPrincipal, remplacerPrincipal, supprimerJumelle,
  renommerPrincipal, renommerJumelle, exporterFichier, importEnCours, TAILLE_MAX, mo,
} from '../lib/fichiersCours.js';
import '../../styles/fichiers-cours.css';

const leJour = (iso) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : null);
// accord de CHAQUE mot (« 3 annotations replacées », « 1 page »)
const pl = (n, s) => `${n} ${n > 1 ? s.split(' ').map((m) => m + 's').join(' ') : s}`;

function NomEditable({ nom, onRenommer, desactive }) {
  const [edition, setEdition] = useState(null);
  if (edition != null) {
    const valider = () => { const v = edition.trim(); setEdition(null); if (v && v !== nom) onRenommer(v); };
    return <input className="imp-title fcrs-nom-champ" autoFocus value={edition} aria-label="Nom du fichier" onChange={(e) => setEdition(e.target.value)}
      onBlur={valider} onKeyDown={(e) => { if (e.key === 'Enter') valider(); if (e.key === 'Escape') setEdition(null); }} />;
  }
  return (
    <span className="fcrs-nom">
      <span className="fcrs-nom-texte" title={nom}>{nom}</span>
      {onRenommer && <button type="button" className="cd-ic" disabled={desactive} title="Renommer le fichier" aria-label="Renommer le fichier" onClick={() => setEdition(nom)}><Icon name="edit" size={12} /></button>}
    </span>
  );
}

export function FichiersCours({ ctx, fiche, jumelle = null, onFermer, onImporterJumelle = null, onExporterDocument = null, onRemplace = null, onNonReplacees = null, pagesDocument = null }) {
  const p = principalDe(fiche);
  const [infoP, setInfoP] = useState(null);
  const [infoJ, setInfoJ] = useState(null);
  const [etape, setEtape] = useState(null); // null | { quoi: 'remplacer', fichiers } | { quoi: 'supprimerJumelle' } | { quoi: 'encours', texte } | { quoi: 'fini', texte } | { quoi: 'erreur', texte }
  const entree = useRef(null);
  const [cible, setCible] = useState(null); // 'principal' | 'importer'
  useEffect(() => { let v = true; if (p.fileId) infosFichier(p.fileId).then((i) => v && setInfoP(i)); else setInfoP(null); return () => { v = false; }; }, [p.fileId]);
  useEffect(() => { let v = true; if (jumelle) infosFichier(jumelle.fileId).then((i) => v && setInfoJ(i)); else setInfoJ(null); return () => { v = false; }; }, [jumelle && jumelle.fileId]); // eslint-disable-line react-hooks/exhaustive-deps
  const occupe = !!importEnCours() || (etape && etape.quoi === 'encours');

  const choisir = (quoi) => { setCible(quoi); if (entree.current) { entree.current.value = ''; entree.current.click(); } };
  const recevoir = async (fichiers) => {
    const err = verifierFichiers(fichiers, { images: true });
    if (err) { setEtape({ quoi: 'erreur', texte: err }); return; }
    if (cible === 'importer') {
      setEtape({ quoi: 'encours', texte: 'Import du document principal…' });
      try { await importerPrincipal({ fiche, fichiers }); await ctx.reload(); setEtape({ quoi: 'fini', texte: 'Document principal importé.' }); if (onRemplace) onRemplace(); }
      catch (e) { setEtape({ quoi: 'erreur', texte: e.message }); }
      return;
    }
    setEtape({ quoi: 'remplacer', fichiers });
  };
  const remplacer = async () => {
    const fichiers = etape.fichiers;
    setEtape({ quoi: 'encours', texte: 'Remplacement : lecture des deux PDF, correspondance des pages, replacement des annotations…' });
    try {
      const { retire } = await remplacerPrincipal({ fiche, fichiers });
      await ctx.reload();
      if (onRemplace) onRemplace();
      const nr = retire.nonReplacees.length;
      setEtape({ quoi: 'fini', texte: `Document principal remplacé. ${pl(retire.replacees, 'annotation replacée')} sur la page correspondante${nr ? `, ${pl(nr, 'annotation non replacée')} (gardée${nr > 1 ? 's' : ''}, consultable${nr > 1 ? 's' : ''})` : ''}. L’ancien fichier est conservé (Réglages › Archives).`, nonReplacees: nr ? retire : null });
    } catch (e) { setEtape({ quoi: 'erreur', texte: e.message }); }
  };
  const supprimerFiche = async () => {
    setEtape({ quoi: 'encours', texte: 'Suppression de la fiche jumelle…' });
    try { const n = await supprimerJumelle({ fiche, rec: jumelle }); setEtape({ quoi: 'fini', texte: `Fiche jumelle retirée du cours${n ? ` avec ses ${pl(n, 'annotation')}` : ''}. Une sauvegarde a été faite avant ; le fichier reste dans Réglages › Archives.` }); }
    catch (e) { setEtape({ quoi: 'erreur', texte: e.message }); }
  };
  const exporter = async (fileId, nom) => { try { await exporterFichier(fileId, nom); } catch (e) { setEtape({ quoi: 'erreur', texte: e.message }); } };

  const retireDernier = (fiche.fichiersRetires || []).filter((r) => r.type !== 'jumelle' && (r.nonReplacees || []).length).slice(-1)[0];
  const metaP = p.type === 'document'
    ? [pagesDocument ? pl(pagesDocument, 'page') : null, fiche.dateImport ? `créé le ${leJour(fiche.dateImport)}` : null, 'document de l’app'].filter(Boolean).join(' · ')
    : p.type ? [infoP && infoP.pages ? pl(infoP.pages, 'page') : null, (fiche.pdfImporteLe || fiche.dateImport) ? `importé le ${leJour(fiche.pdfImporteLe || fiche.dateImport)}` : null, infoP && infoP.present ? taillePourAffichage(infoP.taille) : infoP ? 'pas encore sur cet appareil' : null].filter(Boolean).join(' · ') : null;
  const metaJ = jumelle ? [infoJ && infoJ.pages ? pl(infoJ.pages, 'page') : null, jumelle.importeLe ? `importée le ${leJour(jumelle.importeLe)}` : null, infoJ && infoJ.present ? taillePourAffichage(infoJ.taille) : null].filter(Boolean).join(' · ') : null;

  return (
    <Modal title="Fichiers du cours" onClose={() => { if (!occupe) onFermer(); }} width="min(640px, 96vw)">
      <div className="fcrs">
        <input ref={entree} type="file" accept="application/pdf,.pdf,image/*" multiple style={{ display: 'none' }}
          onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ''; if (l.length) recevoir(l); }} />

        <div className="fcrs-ligne" data-ligne="principal">
          <span className="fcrs-ic"><Icon name={p.type === 'document' ? 'edit' : p.type === 'html' ? 'fileHtml' : 'filePdf'} size={18} /></span>
          <div className="fcrs-corps">
            <div className="fcrs-role">Document principal</div>
            {p.type ? <NomEditable nom={p.type === 'document' ? fiche.titre : p.nom} desactive={occupe} onRenommer={p.type === 'pdf' ? (v) => renommerPrincipal(fiche, v).then(() => ctx.reload()) : p.type === 'document' ? (v) => ctx.renameFiche(fiche.id, v) : null} />
              : <span className="fcrs-aucun">Aucun</span>}
            {metaP && <div className="fcrs-meta">{metaP}</div>}
            {retireDernier && <button type="button" className="fcrs-lien" onClick={() => onNonReplacees && onNonReplacees(retireDernier)}>{pl(retireDernier.nonReplacees.length, 'annotation non replacée')} au dernier remplacement — voir</button>}
          </div>
          <div className="fcrs-actions">
            {!p.type ? (
              <button type="button" className="btn sm primary" disabled={occupe} onClick={() => choisir('importer')}><Icon name="upload" size={13} /> Importer</button>
            ) : (<>
              <button type="button" className="btn sm" disabled={occupe || p.type === 'document'} onClick={() => choisir('principal')}
                title={p.type === 'document' ? 'Un document créé dans l’app se modifie directement : il n’a pas de fichier à remplacer' : 'Un nouveau PDF (ou des images) prend la place ; les annotations suivent leur page'}><Icon name="refresh" size={13} /> Remplacer</button>
              <button type="button" className="btn sm ghost" disabled={occupe || (p.type !== 'document' && !(infoP && infoP.present))}
                onClick={() => (p.type === 'document' ? onExporterDocument && onExporterDocument() : exporter(p.fileId, p.nom))}
                title={p.type === 'document' ? 'Exporter le document en PDF' : 'Télécharger le fichier tel quel'}><Icon name="ext" size={13} /> Exporter</button>
            </>)}
          </div>
        </div>

        <div className="fcrs-ligne" data-ligne="jumelle">
          <span className="fcrs-ic"><Icon name="filePdf" size={18} /></span>
          <div className="fcrs-corps">
            <div className="fcrs-role">Fiche jumelle</div>
            {jumelle ? <NomEditable nom={jumelle.fileName} desactive={occupe} onRenommer={(v) => renommerJumelle(jumelle, v)} /> : <span className="fcrs-aucun">Aucune</span>}
            {metaJ && <div className="fcrs-meta">{metaJ}</div>}
            {!jumelle && !p.type && <div className="fcrs-meta">Importe d’abord le document principal.</div>}
          </div>
          <div className="fcrs-actions">
            <button type="button" className="btn sm" disabled={occupe || !onImporterJumelle || !p.type || p.type === 'html'}
              title={!p.type ? 'Importe d’abord le document principal' : p.type === 'html' ? 'Non disponible pour une fiche HTML' : jumelle ? 'Nouvelle version : les annotations de la fiche suivent leur page' : 'Ton PDF résumé, à côté du cours'}
              onClick={() => { onFermer(); onImporterJumelle(); }}><Icon name={jumelle ? 'refresh' : 'upload'} size={13} /> {jumelle ? 'Remplacer' : 'Importer'}</button>
            <button type="button" className="btn sm ghost fcrs-danger" disabled={occupe || !jumelle} onClick={() => setEtape({ quoi: 'supprimerJumelle' })}><Icon name="trash" size={13} /> Supprimer</button>
            <button type="button" className="btn sm ghost" disabled={occupe || !jumelle || !(infoJ && infoJ.present)} onClick={() => exporter(jumelle.fileId, jumelle.fileName)}><Icon name="ext" size={13} /> Exporter</button>
          </div>
        </div>

        <div className="fcrs-pied">Un cours = un document principal (PDF, ou images converties en PDF ; ou document créé dans l’app) et au plus une fiche jumelle (PDF). {mo(TAILLE_MAX)} maximum par fichier, un import à la fois.</div>

        {etape && etape.quoi === 'remplacer' && (
          <div className="fcrs-confirme" role="alertdialog" aria-label="Confirmer le remplacement">
            <b>Remplacer « {p.nom} » par « {etape.fichiers.length > 1 ? `${etape.fichiers.length} images (un PDF)` : etape.fichiers[0].name} » ?</b>
            <p>Le nouveau fichier devient le document principal ; l’ancien est retiré du cours (conservé, jamais effacé). Les annotations sont replacées sur les pages correspondantes quand le texte le permet ; les autres sont gardées dans « Annotations non replacées ». Cartes, notions, transcripts, sessions, fiche jumelle et position de lecture restent attachés au cours. Une sauvegarde est faite avant.</p>
            <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn ghost sm" onClick={() => setEtape(null)}>Annuler</button>
              <button type="button" className="btn primary sm" onClick={remplacer}><Icon name="refresh" size={13} /> Remplacer le document principal</button>
            </div>
          </div>
        )}
        {etape && etape.quoi === 'supprimerJumelle' && (
          <div className="fcrs-confirme danger" role="alertdialog" aria-label="Confirmer la suppression de la fiche jumelle">
            <b>Supprimer la fiche jumelle « {jumelle.fileName} » ?</b>
            <p>La fiche et ses annotations propres sont retirées du cours (sur tous tes appareils). Le cours revient à son seul document principal. Une sauvegarde est faite avant ; le fichier reste lisible dans Réglages › Archives.</p>
            <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn ghost sm" onClick={() => setEtape(null)}>Annuler</button>
              <button type="button" className="btn danger sm" onClick={supprimerFiche}><Icon name="trash" size={13} /> Supprimer la fiche jumelle</button>
            </div>
          </div>
        )}
        {etape && etape.quoi === 'encours' && <div className="fcrs-etat"><div className="gen-spinner" style={{ width: 22, height: 22 }} /> {etape.texte}</div>}
        {etape && etape.quoi === 'fini' && (
          <div className="fcrs-etat ok" role="status"><Icon name="check" size={14} /> <span>{etape.texte}</span>
            {etape.nonReplacees && onNonReplacees && <button type="button" className="fcrs-lien" onClick={() => onNonReplacees(etape.nonReplacees)}>Voir les non replacées</button>}
          </div>
        )}
        {etape && etape.quoi === 'erreur' && <div className="fj-erreur" role="alert">{etape.texte}</div>}
      </div>
    </Modal>
  );
}
