/* ============================================================
   MedRevise — FORMULAIRE D'UNE CARTE MOLÉCULE (08/10, docs/compte-rendu-flashcards-molecules.md).
   Chargé à la demande (« + Molécule » du formulaire unifié, ou modification d'une carte Molécule).

   - « Nom de la molécule » : recherche avec autocomplétion dans la bibliothèque embarquée
     (nom, synonymes, catégorie) ; choisir une entrée met son nom au recto et charge son dessin
     dans l'éditeur, modifiable ; on peut aussi dessiner de zéro sans rien choisir ;
   - sens (nom → molécule, ou molécule → nom), niveau de comparaison (constitution par défaut,
     ou stéréo stricte), thème / indice / à retenir comme les autres cartes ;
   - ⌘Entrée enregistre (hors de l'éditeur), Échap ferme.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { RACCOURCI_ENREGISTRER, estEnregistrer } from '../components/AddItemForm.jsx';
import { EditeurMolecule } from './EditeurMolecule.jsx';
import { rechercher } from './recherche.js';
import { carteMolecule, SENS, NIVEAUX } from './carte.js';
import BIBLIO from './bibliotheque.json';

export default function FormulaireMolecule({ initial = null, themeDefaut = '', onAdd, onCancel, busy, submitLabel = 'Ajouter', actif = true }) {
  const m0 = (initial && initial.molecule) || null;
  const [theme, setTheme] = useState(initial ? (initial.theme || '') : themeDefaut);
  const themeRetouche = useRef(false);
  useEffect(() => { if (!initial && !themeRetouche.current) setTheme(themeDefaut); }, [themeDefaut]); // eslint-disable-line react-hooks/exhaustive-deps
  const [nom, setNom] = useState(m0 ? m0.nom || '' : '');
  const [sens, setSens] = useState(m0 ? m0.sens || 'nom-molecule' : 'nom-molecule');
  const [comparaison, setComparaison] = useState(m0 ? m0.comparaison || 'constitution' : 'constitution');
  const [biblio, setBiblio] = useState(m0 ? m0.biblio || null : null);
  const [indice, setIndice] = useState(initial?.indice || '');
  const [aRetenir, setARetenir] = useState(initial?.a_retenir || '');
  const [dessin, setDessin] = useState(m0 ? { smiles: m0.smiles, molfile: m0.molfile, formule: m0.formule, atomes: 1 } : null);
  const [ouvert, setOuvert] = useState(false);
  const [surbrillance, setSurbrillance] = useState(0);
  const [cleEditeur, setCleEditeur] = useState(0);
  const editeur = useRef(null);
  const champ = useRef(null);

  const suggestions = useMemo(() => (ouvert && nom.trim() ? rechercher(BIBLIO.entrees, nom, 8) : []), [nom, ouvert]);
  useEffect(() => setSurbrillance(0), [nom]);

  const choisir = (e) => {
    setNom(e.nom); setBiblio(e.id); setOuvert(false);
    if (editeur.current) editeur.current.charger(e.molfile);
    else { setDessin({ smiles: e.smiles, molfile: e.molfile, formule: e.formule, atomes: 1 }); setCleEditeur((k) => k + 1); }
  };
  const clavierRecherche = (e) => {
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSurbrillance((i) => Math.min(suggestions.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSurbrillance((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); choisir(suggestions[surbrillance]); }
    else if (e.key === 'Escape') { e.stopPropagation(); setOuvert(false); }
  };

  const pret = !!nom.trim() && !!(dessin && dessin.atomes && dessin.smiles);
  const valider = async () => {
    if (!pret || busy) return;
    const d = (editeur.current && editeur.current.exporter()) || dessin;
    await onAdd(carteMolecule({ nom, smiles: d.smiles, molfile: d.molfile, formule: d.formule, sens, comparaison, biblio, theme, indice, aRetenir, difficulte: initial?.difficulte || 'intermediaire' }));
    if (!initial) {
      setNom(''); setBiblio(null); setIndice(''); setARetenir(''); setDessin(null);
      setTheme(themeDefaut); themeRetouche.current = false;
      if (editeur.current) editeur.current.charger(null);
      requestAnimationFrame(() => champ.current && champ.current.focus());
    }
  };
  const clavier = (e) => {
    if (e.target.closest && e.target.closest('.mol-zone')) return; // l'éditeur garde ses touches
    if (e.key === 'Escape' && onCancel && !ouvert) { e.preventDefault(); e.stopPropagation(); onCancel(); return; }
    if (estEnregistrer(e)) { e.preventDefault(); e.stopPropagation(); valider(); }
  };

  return (
    <div className="aif-champs mol-form" onKeyDown={clavier}>
      <div className="imp-field mol-recherche">
        <label htmlFor="mol-nom">Nom de la molécule</label>
        <input id="mol-nom" ref={champ} className="imp-title" autoComplete="off" value={nom} placeholder="ex : Alanine, glucose β, dextrose, ATP…"
          role="combobox" aria-expanded={!!suggestions.length} aria-autocomplete="list"
          onChange={(e) => { setNom(e.target.value); setOuvert(true); }} onFocus={() => setOuvert(true)} onBlur={() => setTimeout(() => setOuvert(false), 150)}
          onKeyDown={clavierRecherche} />
        {suggestions.length > 0 && (
          <div className="mol-suggestions" role="listbox">
            {suggestions.map((e, i) => (
              <button key={e.id} type="button" role="option" aria-selected={i === surbrillance} className={'mol-sugg' + (i === surbrillance ? ' actif' : '')}
                onMouseDown={(x) => x.preventDefault()} onClick={() => choisir(e)}>
                <span className="mol-sugg-nom">{e.nom}</span>
                <span className="mol-sugg-meta">{e.categorie} · {e.formule}</span>
              </button>
            ))}
          </div>
        )}
        <div className="hint">{biblio ? <>Dessin de la bibliothèque chargé — retouche-le si besoin. Le nom reste modifiable (c’est le recto).</> : <>Choisis une molécule de la bibliothèque ({BIBLIO.entrees.length} entrées) ou dessine-la de zéro.</>}</div>
      </div>

      <EditeurMolecule key={cleEditeur} ref={editeur} molfile={dessin ? dessin.molfile : null} hauteur={360}
        onChange={(d) => setDessin(d)} />
      <div className="mol-infos">
        <span className="tnum">{dessin && dessin.atomes ? <>Formule : <b>{dessin.formule}</b></> : 'Molécule vide'}</span>
      </div>

      <div className="mol-options">
        <div className="mol-option">
          <span className="fc-reglages-titre">Sens</span>
          <div className="seg fc-seg">
            {SENS.map((s) => <button key={s.id} type="button" className={'seg-btn' + (sens === s.id ? ' active' : '')} onClick={() => setSens(s.id)}>{s.label}</button>)}
          </div>
        </div>
        <div className="mol-option">
          <span className="fc-reglages-titre">Comparaison</span>
          <div className="seg fc-seg">
            {NIVEAUX.map((n) => <button key={n.id} type="button" title={n.aide} className={'seg-btn' + (comparaison === n.id ? ' active' : '')} onClick={() => setComparaison(n.id)}>{n.label}</button>)}
          </div>
          <span className="hint">{NIVEAUX.find((n) => n.id === comparaison).aide}</span>
        </div>
      </div>

      <div className="imp-field">
        <label>Thème <span className="imp-opt">(optionnel)</span></label>
        <input className="imp-title" placeholder="ex : Acides aminés" value={theme} onChange={(e) => { themeRetouche.current = true; setTheme(e.target.value); }} />
      </div>
      <div className="imp-field">
        <label>Indice <span className="imp-opt">(optionnel)</span></label>
        <textarea className="imp-title fc-txt-court" rows={1} value={indice} onChange={(e) => setIndice(e.target.value)} />
      </div>
      <div className="imp-field">
        <label>À retenir <span className="imp-opt">(optionnel)</span></label>
        <textarea className="imp-title fc-txt-court" rows={1} value={aRetenir} onChange={(e) => setARetenir(e.target.value)} />
      </div>
      <div className="imp-actions">
        <span className="fc-raccourci" title="Échap = annuler">{RACCOURCI_ENREGISTRER} pour enregistrer</span>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Annuler</button>}
        <button type="button" className="btn primary" onClick={valider} disabled={!pret || busy}><Icon name="check" size={15} /> {submitLabel}</button>
      </div>
      {!pret && <div className="hint">{!nom.trim() ? 'Nom de la molécule requis.' : 'Dessine la molécule (ou choisis-la dans la bibliothèque).'}</div>}
      {void actif}
    </div>
  );
}
