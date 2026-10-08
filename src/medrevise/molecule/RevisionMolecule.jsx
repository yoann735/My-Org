/* ============================================================
   MedRevise — RÉVISION D'UNE CARTE MOLÉCULE (08/10, docs/compte-rendu-flashcards-molecules.md).
   Chargé à la demande par les écrans de révision (séance classique, séance du jour, mobile).

   - VueMolecule : la molécule dessinée (SVG d'OpenChemLib), thémée.
   - VersoMolecule (sens nom → molécule) : au retournement, l'ATELIER s'ouvre en plein écran avec
     l'éditeur VIDE ; je reconstruis la molécule de zéro ; « Vérifier » compare (chimie.js) :
     identique → verdict vert et la référence à côté de mon dessin ; sinon côte à côte (mon
     dessin / la référence), atomes et liaisons en trop / manquants surlignés, formules brutes,
     et en stéréo stricte les centres qui diffèrent. On corrige et revérifie à volonté.
     « Terminé » referme : la notation habituelle (raté / difficile / facile, su / pas su) reste
     MA décision — la vérification est une aide, jamais un juge du score.
   - sens molécule → nom : le recto montre la molécule, le verso le nom (retournement classique).
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { chargerOCL, lire, comparer, svg } from './chimie.js';
import { EditeurMolecule } from './EditeurMolecule.jsx';
import { NIVEAUX } from './carte.js';

/** une molécule (molfile ou SMILES, ou molécule OCL déjà lue) en SVG ; atomes / liaisons surlignés */
export function VueMolecule({ molfile = null, smiles = null, mol = null, atomes = [], liaisons = [], hauteur = 220, classe = '' }) {
  const [html, setHtml] = useState('');
  const cle = JSON.stringify([molfile && molfile.length, smiles, atomes, liaisons, !!mol]);
  useEffect(() => {
    let vivant = true;
    chargerOCL().then((OCL) => {
      if (!vivant) return;
      try { setHtml(svg(OCL, mol || lire(OCL, { molfile, smiles }), { largeur: 520, hauteur: 360, atomes, liaisons })); } catch (e) { setHtml(''); }
    });
    return () => { vivant = false; };
  }, [cle, mol]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className={'mol-vue ' + classe} style={{ maxHeight: hauteur }} dangerouslySetInnerHTML={{ __html: html }} aria-label="Molécule" role="img" />;
}

/** verdict d'une vérification, en une phrase */
function Verdict({ r }) {
  if (!r) return null;
  if (r.vide) return <div className="mol-verdict neutre"><Icon name="alert" size={15} /> Dessine d’abord la molécule.</div>;
  if (r.identique) return (
    <div className="mol-verdict ok"><Icon name="check" size={16} /> Identique à la référence{r.mode === 'stereo' ? ', stéréochimie comprise' : ''}.
      {r.ionisation && <span className="mol-note"> (état d’ionisation différent : même molécule)</span>}
      {r.mode !== 'stereo' && r.stereoDiffere && <span className="mol-note"> La stéréo diffère, mais cette carte compare la constitution seule.</span>}
    </div>
  );
  if (r.stereoDiffere) return <div className="mol-verdict ko"><Icon name="x" size={15} /> Bonne constitution, mais la stéréochimie diffère ({r.detailStereo.length || r.stereo.liaisonsR.length} centre{(r.detailStereo.length || r.stereo.liaisonsR.length) > 1 ? 's' : ''}).</div>;
  const s = r.structure;
  const n = s.atomesEnTrop.length + s.atomesManquants.length;
  return <div className="mol-verdict ko"><Icon name="x" size={15} /> Différente de la référence — {s.atomesEnTrop.length} atome{s.atomesEnTrop.length > 1 ? 's' : ''} en trop, {s.atomesManquants.length} manquant{s.atomesManquants.length > 1 ? 's' : ''}{!n && (s.liaisonsEnTrop.length || s.liaisonsManquantes.length) ? `, ${s.liaisonsEnTrop.length + s.liaisonsManquantes.length} liaison(s) à revoir` : ''}.</div>;
}

/** comparaison côte à côte : mon dessin / la référence, différences surlignées */
function CoteACote({ r }) {
  if (!r || r.vide) return null;
  const s = r.structure, st = r.stereo;
  return (
    <div className="mol-cote">
      <figure className={'mol-panneau' + (r.identique ? ' ok' : '')}>
        <figcaption>Mon dessin <span className="tnum">{r.formuleU}</span></figcaption>
        <VueMolecule mol={r.u} atomes={[...s.atomesEnTrop, ...st.centresU]} liaisons={[...s.liaisonsEnTrop, ...st.liaisonsU]} hauteur={260} />
      </figure>
      <figure className={'mol-panneau ref' + (r.identique ? ' ok' : '')}>
        <figcaption>Référence <span className="tnum">{r.formuleR}</span></figcaption>
        <VueMolecule mol={r.r} atomes={[...s.atomesManquants, ...st.centresR]} liaisons={[...s.liaisonsManquantes, ...st.liaisonsR]} hauteur={260} />
      </figure>
      {!r.identique && (
        <ul className="mol-details">
          {s.atomesEnTrop.length > 0 && <li><span className="mol-pastille" /> En trop dans mon dessin : {grouper(s.atomesEnTrop.map((a) => r.u.getAtomLabel(a)))}</li>}
          {s.atomesManquants.length > 0 && <li><span className="mol-pastille" /> Manquant (référence) : {grouper(s.atomesManquants.map((a) => r.r.getAtomLabel(a)))}</li>}
          {(s.liaisonsEnTrop.length > 0 || s.liaisonsManquantes.length > 0) && <li><span className="mol-pastille" /> Liaisons différentes : {s.liaisonsEnTrop.length} dans mon dessin, {s.liaisonsManquantes.length} dans la référence (ordre ou position)</li>}
          {r.formuleU !== r.formuleR && <li>Formules brutes : <b className="tnum">{r.formuleU || '—'}</b> (moi) · <b className="tnum">{r.formuleR}</b> (référence)</li>}
          {r.detailStereo.map((d, i) => <li key={i}><span className="mol-pastille" /> Centre {d.atome} : référence <b>{d.ref}</b>, mon dessin <b>{d.moi}</b></li>)}
          {r.stereo.liaisonsR.length > 0 && <li><span className="mol-pastille" /> Double liaison : configuration cis/trans différente</li>}
        </ul>
      )}
    </div>
  );
}
const grouper = (labels) => Object.entries(labels.reduce((t, l) => { t[l] = (t[l] || 0) + 1; return t; }, {})).map(([l, n]) => (n > 1 ? `${n} ${l}` : l)).join(', ');

/** l'atelier plein écran : éditeur vide, Vérifier, comparaison */
export function AtelierMolecule({ carte, depart = null, onFermer, onResultat }) {
  const m = carte.molecule;
  const editeur = useRef(null);
  const [r, setR] = useState(null);
  const [verif, setVerif] = useState(false);
  const verifier = async () => {
    setVerif(true);
    try {
      const OCL = await chargerOCL();
      const moi = editeur.current && editeur.current.molecule();
      const res = comparer(OCL, moi || new OCL.Molecule(0, 0), lire(OCL, { molfile: m.molfile, smiles: m.smiles }), m.comparaison || 'constitution');
      setR(res);
      const d = editeur.current && editeur.current.exporter();
      onResultat && onResultat({ identique: res.identique, molfile: d && d.molfile, formule: res.formuleU });
    } finally { setVerif(false); }
  };
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onFermer(); } };
    window.addEventListener('keydown', k);
    const ancien = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ancien; };
  }, [onFermer]);
  const niveau = NIVEAUX.find((n) => n.id === (m.comparaison || 'constitution'));
  return createPortal(
    <div className="mol-atelier" role="dialog" aria-modal="true" aria-label={'Reconstruire : ' + m.nom} onClick={(e) => e.stopPropagation()}>
      <div className="mol-atelier-tete">
        <div className="mol-atelier-titre">
          <span className="mol-atelier-sur">Reconstruis la molécule</span>
          <b>{m.nom}</b>
          <span className="mol-niveau" title={niveau.aide}>{niveau.label}</span>
        </div>
        <button type="button" className="btn primary" onClick={verifier} disabled={verif}><Icon name="check" size={15} /> Vérifier</button>
        <button type="button" className="btn" onClick={onFermer}>Terminé — noter</button>
      </div>
      <div className="mol-atelier-corps">
        <div className="mol-atelier-dessin">
          <EditeurMolecule ref={editeur} molfile={depart} hauteur="100%" classe="plein" onChange={() => { if (r) setR(null); }} />
        </div>
        {r && (
          <div className="mol-atelier-resultat" aria-live="polite">
            <Verdict r={r} />
            <CoteACote r={r} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** face VERSO, sens nom → molécule : ouvre l'atelier (au retournement), puis résume */
export function VersoMolecule({ carte, ouvrirAuto = true }) {
  const [ouvert, setOuvert] = useState(ouvrirAuto);
  const [dernier, setDernier] = useState(null); // { identique, molfile }
  const m = carte.molecule;
  return (
    <div className="mol-verso" onClick={(e) => e.stopPropagation()}>
      <div className="mol-verso-titre">{m.nom}</div>
      {dernier ? (
        <div className={'mol-verso-etat ' + (dernier.identique ? 'ok' : 'ko')}>
          <Icon name={dernier.identique ? 'check' : 'x'} size={14} /> {dernier.identique ? 'Reconstruite correctement' : 'Pas encore identique à la référence'}
        </div>
      ) : <div className="hint">Reconstruis-la de zéro, puis « Vérifier ».</div>}
      <div className="mol-verso-cote">
        {dernier && dernier.molfile && <figure><figcaption>Mon dessin</figcaption><VueMolecule molfile={dernier.molfile} hauteur={170} /></figure>}
        <figure><figcaption>Référence</figcaption><VueMolecule molfile={m.molfile} smiles={m.smiles} hauteur={170} /></figure>
      </div>
      {/* pas de <button> : sur mobile et en séance du jour, la carte elle-même est un bouton */}
      <span role="button" tabIndex={0} className="btn sm mol-redessiner" onClick={() => setOuvert(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOuvert(true); } }}><Icon name="edit" size={13} /> {dernier ? 'Corriger mon dessin' : 'Dessiner'}</span>
      {ouvert && <AtelierMolecule carte={carte} depart={dernier && dernier.molfile} onFermer={() => setOuvert(false)} onResultat={(x) => setDernier(x)} />}
    </div>
  );
}

/** une face d'une carte Molécule (recto / verso / les deux), pour les écrans de révision */
export default function FaceMolecule({ carte, cote = 'recto', ouvrirAuto = true }) {
  const m = carte.molecule;
  const inverse = m.sens === 'molecule-nom';
  if (cote === 'deux') return (
    <div className="mol-face">
      <div className="mol-face-nom">{m.nom}</div>
      <VueMolecule molfile={m.molfile} smiles={m.smiles} hauteur={240} />
    </div>
  );
  if (cote === 'recto') return inverse
    ? <div className="mol-face"><div className="mol-face-question">Quelle est cette molécule ?</div><VueMolecule molfile={m.molfile} smiles={m.smiles} hauteur={260} /></div>
    : <div className="mol-face"><div className="mol-face-nom grand">{m.nom}</div><div className="hint">Retourne la carte pour la dessiner.</div></div>;
  return inverse
    ? <div className="mol-face"><div className="mol-face-nom">{m.nom}</div><VueMolecule molfile={m.molfile} smiles={m.smiles} hauteur={200} /></div>
    : <VersoMolecule carte={carte} ouvrirAuto={ouvrirAuto} />;
}
