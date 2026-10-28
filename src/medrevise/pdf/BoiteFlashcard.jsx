/* ============================================================
   MedRevise — BOÎTE → FLASHCARD : l'APERÇU MODIFIABLE (25/10, docs/compte-rendu-boites-tableaux.md §2). Ouvert par
   « → Flashcard » de la mini barre d'une boîte (lecteur : cours PDF, document, fiche jumelle).
   Découpage automatique (lib/boiteVersCarte.js) : recto / verso pré-remplis et modifiables, image de la boîte (au recto
   ou au verso), boîte-tableau = carte Tableau (aperçu du tableau tel qu'il sera révisé), thème (la catégorie de la
   carte, celui des cartes de la fiche par défaut) et date de départ (aujourd'hui par défaut), comme à l'import.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Tex } from '../components/Tex.jsx';
import { TableauRevision } from '../components/FlashcardTableau.jsx';
import { ImageFlashcard } from '../components/FlashcardImage.jsx';
import { todayISO } from '../lib/sm2.js';
import { decouperBoite, carteDeBoite } from '../lib/boiteVersCarte.js';
import { genId } from '../lib/storage.js';

export function FenetreBoiteFlashcard({ boite, ns = null, themeDefaut = '', onCreer, onFermer }) {
  const decoupe = useMemo(() => decouperBoite(boite.content), [boite.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const tableau = !!(boite.grille && Array.isArray(boite.grille.lignes));
  const avecImage = !!(boite.image && boite.image.blobId);
  const [recto, setRecto] = useState(() => (tableau ? 'Compléter le tableau' : decoupe.recto));
  const [verso, setVerso] = useState(decoupe.verso);
  const [theme, setTheme] = useState(themeDefaut || '');
  const [depart, setDepart] = useState(todayISO());
  const [place, setPlace] = useState(avecImage && boite.image.position === 'dessous' ? 'verso' : 'recto');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState(null);
  const ref = useRef(null);
  const apercu = useMemo(() => carteDeBoite(boite, { recto, verso, theme, imagePlace: avecImage ? place : null, ns, id: 'apercu' }), [boite, recto, verso, theme, place]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // (28/10) Échap ne ferme plus la fenêtre (le brouillon n'est jamais perdu) : il quitte le champ ; « Annuler » / ✕ ferment
    const touche = (e) => {
      if (e.key !== 'Escape' || !ref.current || !ref.current.contains(document.activeElement)) return;
      if (e.target && e.target.closest && e.target.closest('.sc-pop, .mf-menu')) return; // un menu ouvert garde son Échap
      e.preventDefault(); e.stopPropagation();
      const champ = document.activeElement.closest('input, textarea, select');
      if (champ) champ.blur();
    };
    window.addEventListener('keydown', touche, true);
    return () => window.removeEventListener('keydown', touche, true);
  });
  const manque = !recto.trim() ? 'Le recto est vide.' : !tableau && !verso.trim() ? 'Le verso est vide : écris la réponse (une carte a un recto et un verso).' : null;
  const creer = async () => {
    if (manque || occupe) return;
    setOccupe(true); setErreur(null);
    try { await onCreer(carteDeBoite(boite, { recto, verso, theme, imagePlace: avecImage ? place : null, ns, id: genId('bfc') }), depart); }
    catch (e) { setErreur('La carte n’a pas pu être créée : ' + ((e && e.message) || 'erreur inconnue')); setOccupe(false); }
  };
  const clavier = (e) => e.stopPropagation(); // ⌘1–6, Suppr… restent aux champs
  return (
    <div ref={ref} className="mep-panneau ta-panneau bfc-fenetre" role="dialog" aria-label="Boîte → Flashcard" onPointerDown={(e) => e.stopPropagation()}>
      <div className="mep-tete">
        <span className="mep-titre">Boîte → Flashcard <span className="bfc-type" data-type={tableau ? 'tableau' : 'texte'}>{tableau ? 'Tableau' : 'Texte'}</span></span>
        <button type="button" className="icon-btn sm" onClick={onFermer} title="Fermer" aria-label="Fermer"><Icon name="x" size={14} /></button>
      </div>
      <div className="ta-corps bfc-corps">
        <label className="bfc-champ"><span>Recto</span>
          <textarea rows={2} value={recto} data-champ="recto" onKeyDown={clavier} onChange={(e) => setRecto(e.target.value)} placeholder="La question, le titre…" /></label>
        {tableau ? (
          <div className="bfc-champ"><span>Verso : le tableau (couleurs, fusions et bordures gardées)</span>
            <div className="bfc-tableau"><TableauRevision item={apercu} masquable={false} compact /></div></div>
        ) : (<>
          <label className="bfc-champ"><span>Verso <small>**gras**, *italique*, « - » puce : la mise en forme de la boîte</small></span>
            <textarea rows={5} value={verso} data-champ="verso" onKeyDown={clavier} onChange={(e) => setVerso(e.target.value)} placeholder="L’explication, « Ex : », « Déf : »…" /></label>
          {verso.trim() && <div className="bfc-apercu" data-apercu="verso"><Tex leger>{verso}</Tex></div>}
        </>)}
        {avecImage && (
          <div className="bfc-image">
            <ImageFlashcard imageId={boite.image.blobId} maxH={90} />
            <div className="bfc-place" role="radiogroup" aria-label="Place de l’image">
              {[['recto', 'Image au recto'], ['verso', 'Image au verso']].map(([id, lib]) => (
                <button key={id} type="button" role="radio" aria-checked={place === id} data-place={id} className={'cp-mode' + (place === id ? ' actif' : '')} onClick={() => setPlace(id)}>{lib}</button>
              ))}
            </div>
          </div>
        )}
        <div className="bfc-ligne">
          <label className="bfc-champ"><span>Thème (catégorie)</span>
            <input type="text" value={theme} data-champ="theme" onKeyDown={clavier} onChange={(e) => setTheme(e.target.value)} placeholder="ex : Néphron" /></label>
          <label className="bfc-champ"><span>Date de départ</span>
            <input type="date" value={depart} data-champ="depart" onKeyDown={clavier} onChange={(e) => setDepart(e.target.value || todayISO())} /></label>
        </div>
        {(erreur || manque) && <div className="ta-message erreur" role="status" data-manque="">{erreur || manque}</div>}
        <div className="ta-actions">
          <button type="button" className="btn primary sm" data-action="creer" disabled={!!manque || occupe} onClick={creer}><Icon name="cards" size={13} /> {occupe ? 'Création…' : 'Créer la flashcard'}</button>
          <button type="button" className="btn sm" onClick={onFermer} disabled={occupe}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
