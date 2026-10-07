/* ============================================================
   MedRevise — FENÊTRE DE CRÉATION (08/10, docs/compte-rendu-nettoyage-document.md).

   UNE fenêtre, partagée par « Nouveau document » (Bibliothèque) et « Importer un PDF »
   (dépôt d'un fichier sur l'arbre, Bibliothèque et Réviser) : les deux créations sont
   identiques. Compacte (440 px), centrée, dans l'ordre :
     Titre · Cours de destination · Matière · [champs propres à l'import] · Annuler / Créer
   Les deux choix sont des MENUS DÉROULANTS (pastille de couleur, « + Nouveau cours » /
   « + Nouvelle matière » en bas du menu), pré-remplis avec le contexte d'où l'on vient.
   Entrée = créer, Échap = annuler (Échap ferme d'abord un menu ouvert).
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Modal, matiereMeta } from './ui.jsx';
import '../../styles/fenetre-creation.css';

const CLE_DERNIERE = 'medrevise.creation.matiere';
export const lireDerniereMatiere = () => { try { return localStorage.getItem(CLE_DERNIERE) || null; } catch (e) { return null; } };
const noterDerniereMatiere = (id) => { try { if (id) localStorage.setItem(CLE_DERNIERE, id); } catch (e) { /* ignore */ } };

/* MENU DÉROULANT de la DA : un bouton (pastille + nom + chevron) qui ouvre une liste.
   Clavier : ↑ ↓ pour parcourir, Entrée pour choisir, Échap pour refermer. La dernière
   ligne crée un élément : elle devient un champ, Entrée crée et le sélectionne. */
export function MenuDeroulant({ id, valeur, options, onChoisir, libelleNouveau, placeholderNouveau, onCreer, vide = 'Aucun élément', desactive = false }) {
  const [ouvert, setOuvert] = useState(false);
  const [survol, setSurvol] = useState(0);
  const [nouveau, setNouveau] = useState(null); // texte du nouvel élément, ou null
  const racine = useRef(null);
  const bouton = useRef(null);
  const courant = options.find((o) => o.id === valeur) || null;
  const n = options.length + (onCreer ? 1 : 0);

  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (racine.current && !racine.current.contains(e.target)) { setOuvert(false); setNouveau(null); } };
    window.addEventListener('pointerdown', dehors, true);
    return () => window.removeEventListener('pointerdown', dehors, true);
  }, [ouvert]);
  useEffect(() => {
    if (ouvert) setSurvol(Math.max(0, options.findIndex((o) => o.id === valeur)));
  }, [ouvert]); // eslint-disable-line react-hooks/exhaustive-deps

  const fermer = () => { setOuvert(false); setNouveau(null); if (bouton.current) bouton.current.focus(); };
  const choisir = (o) => { onChoisir(o.id); fermer(); };
  const creer = async () => {
    const nom = (nouveau || '').trim();
    if (!nom) return;
    const idNouveau = await onCreer(nom);
    setNouveau(null); setOuvert(false);
    if (idNouveau) onChoisir(idNouveau);
    if (bouton.current) bouton.current.focus();
  };
  const clavier = (e) => {
    if (nouveau != null) return; // le champ de création gère ses touches
    if (!ouvert) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === ' ') { e.preventDefault(); setOuvert(true); }
      // menu fermé : Entrée valide la fenêtre (= créer), comme depuis le champ Titre
      if (e.key === 'Enter') { e.preventDefault(); const f = e.currentTarget.closest('form'); if (f) f.requestSubmit(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSurvol((i) => (i + 1) % n); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSurvol((i) => (i - 1 + n) % n); return; }
    if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      if (survol < options.length) choisir(options[survol]); else if (onCreer) setNouveau('');
    }
  };

  return (
    <div className={'fc-deroulant' + (ouvert ? ' ouvert' : '')} ref={racine} onKeyDown={clavier}>
      <button ref={bouton} id={id} type="button" className="fc-champ fc-choix" disabled={desactive} aria-haspopup="listbox" aria-expanded={ouvert}
        onClick={() => { setOuvert((v) => !v); setNouveau(null); }}>
        {courant ? <span className="fc-point" style={{ background: courant.tint }} /> : null}
        <span className={'fc-choix-nom' + (courant ? '' : ' vide')}>{courant ? courant.label : vide}</span>
        <Icon name="chevD" size={14} className="fc-chevron" />
      </button>
      {ouvert && (
        <div className="fc-menu" role="listbox" aria-labelledby={id}>
          {options.map((o, i) => (
            <button key={o.id} type="button" role="option" aria-selected={o.id === valeur}
              className={'fc-option' + (i === survol ? ' survol' : '') + (o.id === valeur ? ' choisi' : '')}
              onMouseEnter={() => setSurvol(i)} onClick={() => choisir(o)}>
              <span className="fc-point" style={{ background: o.tint }} />
              <span className="fc-option-nom">{o.label}</span>
              {o.id === valeur && <Icon name="check" size={14} className="fc-coche" />}
            </button>
          ))}
          {options.length === 0 && <div className="fc-menu-vide">{vide}</div>}
          {onCreer && (<>
            <div className="fc-menu-sep" />
            {nouveau == null ? (
              <button type="button" className={'fc-option fc-nouveau' + (survol === options.length ? ' survol' : '')}
                onMouseEnter={() => setSurvol(options.length)} onClick={() => setNouveau('')}>
                <Icon name="plus" size={14} /> <span className="fc-option-nom">{libelleNouveau}</span>
              </button>
            ) : (
              <div className="fc-creer">
                <input autoFocus className="fc-champ" placeholder={placeholderNouveau} value={nouveau} onChange={(e) => setNouveau(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); creer(); }
                    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setNouveau(null); }
                  }} />
                <button type="button" className="btn primary sm" disabled={!nouveau.trim()} onClick={creer}>Créer</button>
              </div>
            )}
          </>)}
        </div>
      )}
    </div>
  );
}

/**
 * @param titreFenetre     « Nouveau document » / « Importer un PDF »
 * @param sousTitre        ligne sous le titre (nom du fichier importé), facultatif
 * @param matiereInitiale  matière pré-sélectionnée (contexte d'où l'on vient)
 * @param supplement       champs propres à l'appelant, sous la matière (date de J0…)
 * @param onCreer          ({ titre, matiereId, matiereChangee }) → promesse
 */
export function FenetreCreation({ ctx, titreFenetre, sousTitre = null, placeholderTitre, titreInitial = '', selectionnerTitre = false,
  matiereInitiale = null, supplement = null, libelleCreer = 'Créer', iconeCreer = 'plus', occupe = false, onAnnuler, onCreer }) {
  const { db } = ctx;
  const sources = useMemo(() => (db.sources || []).filter((s) => !s.archive), [db.sources]);
  const matieresDe = (sid) => (db.matieres || []).filter((m) => m.sourceId === sid && !m.archive);
  const depart = useMemo(() => {
    const m = (db.matieres || []).find((x) => x.id === (matiereInitiale || lireDerniereMatiere()) && !x.archive);
    if (m && sources.some((s) => s.id === m.sourceId)) return { src: m.sourceId, mat: m.id };
    const s = sources[0];
    return { src: s ? s.id : null, mat: s ? ((matieresDe(s.id)[0] || {}).id || null) : null };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [titre, setTitre] = useState(titreInitial);
  const [srcId, setSrcId] = useState(depart.src);
  const [matId, setMatId] = useState(depart.mat);
  const champTitre = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => { if (champTitre.current) { champTitre.current.focus(); if (selectionnerTitre) champTitre.current.select(); } }, 30);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const choisirCours = (id) => { setSrcId(id); const m = matieresDe(id)[0]; setMatId(m ? m.id : null); };
  const pret = !!matId && !occupe;
  const valider = async (e) => {
    if (e) e.preventDefault();
    if (!pret) return;
    noterDerniereMatiere(matId);
    await onCreer({ titre: titre.trim(), matiereId: matId, matiereChangee: matId !== matiereInitiale });
  };
  const optionsCours = sources.map((s) => ({ id: s.id, label: s.nom, tint: s.tint || '#7C6FE0' }));
  const optionsMatieres = srcId ? matieresDe(srcId).map((m) => { const mm = matiereMeta(m); return { id: m.id, label: mm.label, tint: mm.tint }; }) : [];

  return (
    <Modal title={titreFenetre} width="min(440px, 94vw)" onClose={() => { if (!occupe) onAnnuler(); }}>
      <form className="fc" onSubmit={valider}>
        {sousTitre && <div className="fc-sous-titre">{sousTitre}</div>}
        <label className="fc-ligne" htmlFor="fc-titre">
          <span className="fc-etiquette">Titre</span>
          <input id="fc-titre" ref={champTitre} className="fc-champ" value={titre} placeholder={placeholderTitre}
            onChange={(e) => setTitre(e.target.value)} autoComplete="off" />
        </label>
        <div className="fc-ligne">
          <label className="fc-etiquette" htmlFor="fc-cours">Cours de destination</label>
          <MenuDeroulant id="fc-cours" valeur={srcId} options={optionsCours} onChoisir={choisirCours} vide="Aucun cours"
            libelleNouveau="Nouveau cours" placeholderNouveau="Nom du cours" onCreer={(nom) => ctx.addSource(nom)} />
        </div>
        <div className="fc-ligne">
          <label className="fc-etiquette" htmlFor="fc-matiere">Matière</label>
          <MenuDeroulant id="fc-matiere" valeur={matId} options={optionsMatieres} onChoisir={setMatId} desactive={!srcId}
            vide={srcId ? 'Aucune matière dans ce cours' : 'Choisis d’abord un cours'}
            libelleNouveau="Nouvelle matière" placeholderNouveau="Nom de la matière" onCreer={srcId ? (nom) => ctx.addMatiere(srcId, nom) : null} />
        </div>
        {supplement}
        <div className="fc-actions">
          <button type="button" className="btn ghost" onClick={onAnnuler} disabled={occupe}>Annuler</button>
          <button type="submit" className="btn primary" disabled={!pret}><Icon name={iconeCreer} size={14} /> {occupe ? 'Un instant…' : libelleCreer}</button>
        </div>
      </form>
    </Modal>
  );
}
