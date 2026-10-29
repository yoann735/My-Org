/* ============================================================
   MedRevise — SUPPRIMER LA DIAPO ORIGINALE / LA FICHE (17/10, menu Fichier en sections,
   docs/compte-rendu-fichier-carnet-calendrier.md). Une confirmation qui :
   - répète le NOM EXACT du fichier concerné ;
   - dit ce qui est CONSERVÉ (annotations, flashcards, notions, transcripts) et ce qui part ;
   - refuse de supprimer la diapo originale tant qu'une fiche y est rattachée, avec la marche à
     suivre (« Importez d'abord un autre document principal ou remplacez-le »).
   Les écritures passent par lib/fichiersCours.js : putBackup AVANT, fichier jamais effacé
   (Réglages › Archives).
   ============================================================ */
import { useEffect, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Modal } from '../components/ui.jsx';
import { getAll } from '../lib/storage.js';
import { supprimerJumelle, supprimerPrincipal } from '../lib/fichiersCours.js';
import { prefixeCalques } from '../lib/ficheJumelle.js';

const pl = (n, s) => `${n} ${s}${n > 1 ? 's' : ''}`;

/* `quoi` : 'original' | 'fiche' | 'refus' */
export function SuppressionDocument({ quoi, fiche, jumelle, db, onFermer, onRemplacer, onFait }) {
  const [compte, setCompte] = useState(null); // { orig, fiche, cartes, notions }
  const [etat, setEtat] = useState(null); // null | 'encours' | { erreur }
  useEffect(() => {
    let vivant = true;
    (async () => {
      const [hs, ans] = [await getAll('highlights'), await getAll('annotations')];
      // (29/10) les calques de LA fiche affichée (avec plusieurs fiches, pas celles des autres)
      const pref = jumelle ? prefixeCalques({ ...jumelle, courseId: jumelle.courseId || fiche.id }) : `${fiche.id}::fiche:`;
      const du = (ns) => (a) => (typeof ns === 'string' ? a.ficheId === ns : String(a.ficheId).startsWith(pref));
      const orig = hs.filter(du(fiche.id)).length + ans.filter(du(fiche.id)).length;
      const fi = hs.filter(du(null)).length + ans.filter(du(null)).length;
      const notions = hs.filter((h) => h.ficheId === fiche.id || String(h.ficheId).startsWith(pref)).length;
      const cartes = (db.questions || []).filter((q) => q.ficheId === fiche.id).length;
      if (vivant) setCompte({ orig, fiche: fi, cartes, notions });
    })();
    return () => { vivant = false; };
  }, [fiche.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const nomOrig = fiche.pdfName || 'cours.pdf';
  const nomFiche = jumelle ? jumelle.fileName || 'fiche.pdf' : '';
  const supprimer = async () => {
    setEtat('encours');
    try {
      if (quoi === 'fiche') await supprimerJumelle({ fiche, rec: jumelle });
      else await supprimerPrincipal({ fiche, jumelle });
      onFait && onFait(quoi);
    } catch (e) { setEtat({ erreur: (e && e.message) || 'La suppression a échoué.' }); }
  };

  if (quoi === 'refus') {
    return (
      <Modal title="Supprimer la diapo originale" onClose={onFermer} width="min(480px, 94vw)">
        <div className="sdoc" data-sdoc="refus">
          <p className="sdoc-titre"><Icon name="ban" size={15} /> <span>Impossible de supprimer « <b>{nomOrig}</b> » : la fiche « <b>{nomFiche}</b> » y est rattachée.</span></p>
          <p className="hint">La fiche est reliée à la diapo page par page (correspondance des pages). Importez d’abord un autre document principal ou remplacez-le : « Remplacer ce fichier… » garde la fiche et replace les annotations sur les pages correspondantes.</p>
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="btn ghost sm" onClick={onFermer}>Fermer</button>
            <button type="button" className="btn primary sm" onClick={onRemplacer}><Icon name="refresh" size={13} /> Remplacer la diapo originale…</button>
          </div>
        </div>
      </Modal>
    );
  }
  const estFiche = quoi === 'fiche';
  const nom = estFiche ? nomFiche : nomOrig;
  const c = compte;
  return (
    <Modal title={estFiche ? 'Supprimer la fiche' : 'Supprimer la diapo originale'} onClose={() => { if (etat !== 'encours') onFermer(); }} width="min(500px, 94vw)">
      <div className="sdoc" data-sdoc={quoi}>
        <p className="sdoc-titre"><Icon name="trash" size={15} /> <span>Supprimer {estFiche ? 'la fiche' : 'la diapo originale'} « <b className="sdoc-nom">{nom}</b> » du cours « {fiche.titre} » ?</span></p>
        <div className="sdoc-liste">
          <div className="sdoc-col garde">
            <div className="sdoc-col-titre">Conservé</div>
            <ul>
              {estFiche
                ? <li>la diapo originale « {nomOrig || fiche.titre} »{c && c.orig ? ` et ses ${pl(c.orig, 'annotation')}` : ''}</li>
                : <li>{c ? pl(c.orig, 'annotation') : 'les annotations'} de la diapo (gardées dans le cours, elles reviennent si tu réimportes une diapo)</li>}
              <li>{c ? pl(c.cartes, 'flashcard') : 'les flashcards'} et leur planning</li>
              <li>{c ? pl(c.notions, 'notion') : 'les notions'}{estFiche && c && c.fiche ? ' (sauf celles surlignées dans la fiche)' : ''}</li>
              <li>transcripts, sessions et onglet Notes</li>
            </ul>
          </div>
          <div className="sdoc-col part">
            <div className="sdoc-col-titre">Retiré</div>
            <ul>
              <li>le fichier « {nom} » (pas effacé : lisible dans Réglages › Archives)</li>
              {estFiche && <li>{c ? pl(c.fiche, 'annotation') : 'les annotations'} posée{c && c.fiche > 1 ? 's' : ''} sur la fiche (sauvegardée{c && c.fiche > 1 ? 's' : ''} avant)</li>}
              {!estFiche && <li>le cours garde ses cartes et redevient « sans diapo » : « Importer » en rattache une autre</li>}
            </ul>
          </div>
        </div>
        <p className="hint">Une sauvegarde est faite avant, sur cet appareil. La suppression vaut pour tous tes appareils.</p>
        {etat && etat.erreur && <div className="fj-erreur" role="alert">{etat.erreur}</div>}
        <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn ghost sm" disabled={etat === 'encours'} onClick={onFermer}>Annuler</button>
          <button type="button" className="btn danger sm" disabled={etat === 'encours'} onClick={supprimer} data-sdoc-confirmer="">
            <Icon name="trash" size={13} /> {etat === 'encours' ? 'Suppression…' : estFiche ? 'Supprimer la fiche' : 'Supprimer la diapo originale'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
