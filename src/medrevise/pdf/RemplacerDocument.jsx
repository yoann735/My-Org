/* ============================================================
   MedRevise — « REMPLACER PAR UN PDF… » d'un document créé dans l'app (20/11/2026, lib/remplacerDocument.js,
   docs/compte-rendu-police-duplication-remplacement-pdf.md §3). La fenêtre de confirmation : le nom du fichier,
   son nombre de pages, le nombre d'annotations gardées, et la marche arrière (Historique).
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Modal } from '../components/ui.jsx';
import { remplacerDocumentParPdf } from '../lib/remplacerDocument.js';

const pl = (n, s) => `${n} ${s}${n > 1 ? 's' : ''}`;

/** `choix` : { fichiers, pdf, n, x, nom } — préparé par le lecteur (fichier lu, pages et annotations comptées) */
export function RemplacerDocument({ fiche, choix, onFermer, onFait }) {
  const [etat, setEtat] = useState(null); // null | 'encours' | { erreur }
  const remplacer = async () => {
    setEtat('encours');
    try {
      const r = await remplacerDocumentParPdf({ fiche, fichiers: choix.fichiers, pdfPrepare: { pdf: choix.pdf, n: choix.n } });
      onFait && onFait(r);
    } catch (e) { setEtat({ erreur: (e && e.message) || 'Le remplacement a échoué.' }); }
  };
  return (
    <Modal title="Remplacer par un PDF" onClose={() => { if (etat !== 'encours') onFermer(); }} width="min(500px, 94vw)">
      <div className="sdoc" data-rdoc="">
        <p className="sdoc-titre" data-rdoc-message="">
          <Icon name="refresh" size={15} />
          <span>Le document sera remplacé par <b className="sdoc-nom">{choix.nom}</b> ({pl(choix.n, 'page')}). Tes {pl(choix.x, 'annotation')} restent en place. Annulable dans l’Historique.</span>
        </p>
        <p className="hint">Même cours : flashcards, notions et séances restent rattachées. Chaque annotation garde son numéro de page et sa position ; celles posées au-delà de la page {choix.n} vont sur la dernière. Une sauvegarde est faite avant.</p>
        {etat && etat.erreur && <div className="fj-erreur" role="alert">{etat.erreur}</div>}
        <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn ghost sm" disabled={etat === 'encours'} onClick={onFermer} title="Ne rien changer">Annuler</button>
          <button type="button" className="btn primary sm" disabled={etat === 'encours'} onClick={remplacer} data-rdoc-confirmer="" title="Remplacer le fond du document par ce PDF">
            <Icon name="refresh" size={13} /> {etat === 'encours' ? 'Remplacement…' : 'Remplacer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
