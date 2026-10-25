/* ============================================================
   MedRevise — LE CHOIX DES PAGES D'UN EXPORT (25/10, docs/compte-rendu-boites-tableaux.md §4). UN composant pour tous les
   exports du lecteur : PDF annoté (diapo, fiche jumelle), document créé dans l'app, PNG par page, .md, export spécial IA.
     Toutes · Page courante · Plage (de X à Y) · Pages précises (« 1-3, 7, 10-12 »)
   avec validation au fil de la frappe et aperçu du nombre de pages ; le dernier choix est mémorisé PAR COURS.
   <ChoixPages coursId nbPages pageCourante onPages />        les contrôles (posés dans un panneau existant : export IA)
   <FenetreExportPages titre … onExporter(pages) onFermer />   la fenêtre « Exporter … » : le choix + Exporter / Annuler
   Modèle et validation : pdf/choixPages.js.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { pagesDuChoix, resumePages, lireChoixMemorise, memoriserChoix } from './choixPages.js';

const LIBELLES = { toutes: 'Toutes', courante: 'Page courante', plage: 'Plage', precises: 'Pages précises' };

export function ChoixPages({ coursId, nbPages, pageCourante = 1, onPages, desactive = false }) {
  const [choix, setChoix] = useState(() => lireChoixMemorise(coursId) || { mode: 'toutes', de: '', a: '', liste: '' });
  const r = pagesDuChoix(choix, nbPages, pageCourante);
  const cle = JSON.stringify(r.pages || r.erreur);
  const onPagesRef = useRef(onPages); onPagesRef.current = onPages;
  useEffect(() => { onPagesRef.current(r.pages || null, r.erreur || null); }, [cle]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!r.erreur) memoriserChoix(coursId, choix); }, [coursId, JSON.stringify(choix), !!r.erreur]); // eslint-disable-line react-hooks/exhaustive-deps
  const maj = (patch) => setChoix((c) => {
    const n = { ...c, ...patch };
    // une plage ou une liste vide : pré-remplie depuis la page affichée (rien à taper pour le cas courant)
    if (patch.mode === 'plage' && (!n.de || !n.a)) { n.de = String(pageCourante); n.a = String(Math.min(nbPages, pageCourante + 1)); }
    if (patch.mode === 'precises' && !String(n.liste || '').trim()) n.liste = String(pageCourante);
    return n;
  });
  const clavier = (e) => e.stopPropagation(); // ⌘1–6, Suppr… restent au champ
  return (
    <div className="cp" data-choix-pages="">
      <div className="cp-modes" role="radiogroup" aria-label="Pages à exporter">
        {Object.entries(LIBELLES).map(([id, lib]) => (
          <button key={id} type="button" role="radio" aria-checked={choix.mode === id} data-mode={id} disabled={desactive}
            className={'cp-mode' + (choix.mode === id ? ' actif' : '')} onClick={() => maj({ mode: id })}>
            {lib}{id === 'toutes' ? <small>{nbPages} p.</small> : id === 'courante' ? <small>p. {pageCourante}</small> : null}
          </button>
        ))}
      </div>
      {choix.mode === 'plage' && (
        <div className="cp-ligne">
          <label className="mep-champ">de <input type="number" min={1} max={nbPages} value={choix.de} data-champ="de" aria-label="Première page" disabled={desactive}
            onKeyDown={clavier} onChange={(e) => maj({ de: e.target.value })} /></label>
          <label className="mep-champ">à <input type="number" min={1} max={nbPages} value={choix.a} data-champ="a" aria-label="Dernière page" disabled={desactive}
            onKeyDown={clavier} onChange={(e) => maj({ a: e.target.value })} /></label>
        </div>
      )}
      {choix.mode === 'precises' && (
        <div className="cp-ligne">
          <input type="text" className="cp-liste" value={choix.liste} placeholder="ex. 1-3, 7, 10-12" data-champ="liste" aria-label="Pages précises (ex. 1-3, 7, 10-12)" disabled={desactive}
            onKeyDown={clavier} onChange={(e) => maj({ liste: e.target.value })} />
        </div>
      )}
      <div className={'cp-resume' + (r.erreur ? ' erreur' : '')} role="status" data-resume="">
        {r.erreur ? r.erreur : r.pages.length === nbPages ? `${nbPages} page${nbPages > 1 ? 's' : ''} : tout le document`
          : `${r.pages.length} page${r.pages.length > 1 ? 's' : ''} : ${resumePages(r.pages)}`}
      </div>
    </div>
  );
}

/** la fenêtre « Exporter … » : choix des pages, puis Exporter (désactivé tant que le choix est invalide) */
export function FenetreExportPages({ titre, aide = null, coursId, nbPages, pageCourante, libelleAction = 'Exporter', onExporter, onFermer, occupe = false }) {
  const [pages, setPages] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape' && !occupe) { e.stopPropagation(); onFermer(); } };
    const dehors = (e) => { if (!occupe && ref.current && !ref.current.contains(e.target) && !(e.target.closest && e.target.closest('.mf'))) onFermer(); };
    window.addEventListener('keydown', touche, true);
    window.addEventListener('pointerdown', dehors, true);
    return () => { window.removeEventListener('keydown', touche, true); window.removeEventListener('pointerdown', dehors, true); };
  });
  const lancer = () => { if (pages && pages.length && !occupe) onExporter(pages); };
  return (
    <div ref={ref} className="mep-panneau ta-panneau cp-fenetre" role="dialog" aria-label={titre}
      onKeyDown={(e) => { if (e.key === 'Enter' && pages && !occupe) { e.preventDefault(); lancer(); } }}>
      <div className="mep-tete">
        <span className="mep-titre">{titre}</span>
        <button type="button" className="icon-btn sm" onClick={onFermer} title="Fermer (Échap)" aria-label="Fermer"><Icon name="x" size={14} /></button>
      </div>
      <div className="ta-corps">
        {aide && <p className="ta-aide">{aide}</p>}
        <ChoixPages coursId={coursId} nbPages={nbPages} pageCourante={pageCourante} onPages={(p) => setPages(p)} desactive={occupe} />
        <div className="ta-actions">
          <button type="button" className="btn primary sm" data-action="exporter" disabled={!pages || !pages.length || occupe} onClick={lancer}>
            <Icon name="upload" size={13} /> {occupe ? 'Export en cours…' : `${libelleAction}${pages ? ` (${pages.length} p.)` : ''}`}
          </button>
          <button type="button" className="btn sm" onClick={onFermer} disabled={occupe}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
