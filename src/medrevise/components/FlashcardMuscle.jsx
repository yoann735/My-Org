/* ============================================================
   MedRevise — FLASHCARD « MUSCLE » : formulaire et tableau (08/10,
   docs/compte-rendu-flashcards.md, modèle dans lib/muscle.js).

   - FormulaireMuscle : nom du muscle + tableau à 6 lignes étiquetées (Topographie ajoutée le 28/10 ; aucune
     n'est obligatoire) — zones de texte qui grandissent avec leur contenu, thème / indice / à retenir comme les autres
     cartes, « Pré-remplir depuis une image » (OCR existant). Entrée = retour à la ligne,
     Tab = ligne suivante, ⌘Entrée = enregistrer, Échap = quitter le champ (n’annule rien, 28/10). Sert à la création
     (carte d'ajout du panneau) ET à la modification (ItemForm).
   - TableauMuscle : le verso en révision — deux colonnes, filets fins ; en mode « ligne
     par ligne » (réglage, actif par défaut) les contenus sont masqués et se révèlent un
     par un au toucher, ou tous d'un coup. Un toucher sur le tableau ne retourne jamais
     la carte (stopPropagation) ; la notation ne change pas.
   ============================================================ */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Tex } from './Tex.jsx';
import { RACCOURCI_ENREGISTRER, estEnregistrer, echapDansFormulaire } from './AddItemForm.jsx';
import { LIGNES_MUSCLE, lignesDe, lignesVides, blocsContenu, normaliserPuces, carteMuscle, imagesDe, imageGeneraleDe } from '../lib/muscle.js';
import { ImageMuscle, ChampImageMuscle } from './ImagesMuscle.jsx';
import { putBlob } from '../lib/storage.js';
import { glisseDesFichiers } from '../lib/collerImage.js';
import { useCollageAuSurvol } from '../lib/collerAuSurvol.js';
import { MessageCollage } from './CollageImage.jsx';
import { lireTableauMuscle } from '../ocr/ocrMuscle.js';

/** réglage « ligne par ligne » (synchronisé avec les réglages d'apprentissage) */
export const ligneParLigne = (ctx) => !(ctx && ctx.reglagesFC && ctx.reglagesFC.muscleLigneParLigne === false);

/* ---- contenu d'une ligne : paragraphes et listes à puces ---- */
export function ContenuMuscle({ texte }) {
  const blocs = blocsContenu(texte);
  if (!blocs.length) return <span className="mu-vide">—</span>;
  return blocs.map((b, i) => (b.kind === 'puces'
    ? <ul key={i} className="mu-puces">{b.items.map((it, k) => <li key={k} className={it.niveau ? 'n1' : undefined}><Tex>{it.texte}</Tex></li>)}</ul>
    : <p key={i} className="mu-par"><Tex>{b.texte}</Tex></p>));
}

/* ---- image générale du muscle (10/10 soir) : au verso toujours, au recto si l'option est cochée ---- */
export function ImageGeneraleMuscle({ item, face = 'verso' }) {
  const g = imageGeneraleDe(item);
  if (!g || (face === 'recto' && !g.auRecto)) return null;
  return <div className="mu-image-generale"><ImageMuscle imageId={g.imageId} titre={`${(item.recto || 'Muscle').trim()} — image`} grande /></div>;
}

/* ---- le tableau (verso) ---- */
export function TableauMuscle({ item, masquable = false, compact = false }) {
  const lignes = lignesDe(item);
  const images = imagesDe(item); // (10/10 soir) une image par ligne, révélée avec sa ligne
  return (
    <LignesARevelerer masquable={masquable} compact={compact}
      lignes={LIGNES_MUSCLE.map((l) => ({
        id: l.id, etiquette: l.label, pleine: !!(lignes[l.id].trim() || images[l.id]),
        contenu: (
          <>
            {(lignes[l.id].trim() || !images[l.id]) && <ContenuMuscle texte={lignes[l.id]} />}
            {images[l.id] && <div className="mu-ligne-image"><ImageMuscle imageId={images[l.id].imageId} masques={images[l.id].masques} titre={l.label} /></div>}
          </>
        ),
      }))} />
  );
}

/* ---- (26/10) LE composant de révélation, partagé : tableau Muscle et ÉLÉMENTS À RÉVÉLER du verso d'une carte Texte
   (components/ElementsVerso.jsx). Chaque ligne masquée affiche « Toucher pour révéler » et se révèle au clic / tap
   (ou au clavier) ; « Tout révéler (n) » révèle le reste. `lignes` : [{ id, etiquette, contenu, pleine, masque }] —
   `masque: false` = toujours visible. Rendu identique à l'ancien TableauMuscle (classes mu-*). ---- */
export function LignesARevelerer({ lignes, masquable = false, compact = false, classe = '' }) {
  const pleines = lignes.filter((l) => l.pleine && l.masque !== false).map((l) => l.id);
  const [vues, setVues] = useState(() => new Set());
  const cachee = (id) => masquable && pleines.includes(id) && !vues.has(id);
  const reste = masquable ? pleines.filter((id) => !vues.has(id)).length : 0;
  const voir = (id) => (e) => {
    e.stopPropagation();
    if (cachee(id)) setVues((s) => new Set(s).add(id));
  };
  const auClavier = (id) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); voir(id)(e); } };
  return (
    <div className={'mu-tableau' + (compact ? ' compact' : '') + (classe ? ' ' + classe : '')} onClick={masquable ? (e) => e.stopPropagation() : undefined}>
      {lignes.map((l) => {
        const c = cachee(l.id);
        return (
          <div key={l.id} className={'mu-ligne' + (c ? ' cachee' : '')} data-ligne={l.id}
            {...(c ? { role: 'button', tabIndex: 0, 'aria-label': `Révéler : ${l.etiquette}`, onClick: voir(l.id), onKeyDown: auClavier(l.id) } : {})}>
            <div className="mu-etiquette">{l.etiquette}</div>
            <div className="mu-contenu">
              {c ? <span className="mu-masque" aria-hidden="true">Toucher pour révéler</span> : l.contenu}
            </div>
          </div>
        );
      })}
      {reste > 0 && (
        <div className="mu-tout">
          <span role="button" tabIndex={0} className="mu-tout-btn"
            onClick={(e) => { e.stopPropagation(); setVues(new Set(pleines)); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setVues(new Set(pleines)); } }}>
            Tout révéler <span className="tnum">({reste})</span>
          </span>
        </div>
      )}
    </div>
  );
}

/* ---- zone de texte qui grandit avec son contenu (jamais de chevauchement) ---- */
function ZoneAuto({ value, onChange, inputRef, ...rest }) {
  const ref = useRef(null);
  const ajuster = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight + 2, 38) + 'px';
  };
  useLayoutEffect(ajuster, [value]);
  useEffect(() => {
    // largeur qui change (panneau redimensionné) → hauteur recalculée
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; ajuster(); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // coller depuis un slide : les puces « bizarres » deviennent « • » (annulable : insertText)
  const coller = (e) => {
    const t = e.clipboardData && e.clipboardData.getData('text/plain');
    if (!t) return;
    const n = normaliserPuces(t);
    if (n === t) return;
    e.preventDefault();
    if (!document.execCommand || !document.execCommand('insertText', false, n)) {
      const el = e.currentTarget;
      const v = el.value.slice(0, el.selectionStart) + n + el.value.slice(el.selectionEnd);
      onChange(v);
    }
  };
  return (
    <textarea ref={(el) => { ref.current = el; if (inputRef) inputRef(el); }} rows={1} value={value}
      onChange={(e) => onChange(e.target.value)} onPaste={coller} {...rest} />
  );
}

/* ---- formulaire (création et modification) ---- */
export function FormulaireMuscle({ initial = null, themeDefaut = '', onAdd, onCancel, busy, submitLabel = 'Ajouter', actif = true, racine = null }) {
  const [theme, setTheme] = useState(initial ? (initial.theme || '') : themeDefaut);
  const themeRetouche = useRef(false);
  useEffect(() => { if (!initial && !themeRetouche.current) setTheme(themeDefaut); }, [themeDefaut]); // eslint-disable-line react-hooks/exhaustive-deps
  const [nom, setNom] = useState(initial ? (initial.recto || '') : '');
  const [lignes, setLignes] = useState(() => (initial ? lignesDe(initial) : lignesVides()));
  const [indice, setIndice] = useState(initial?.indice || '');
  const [aRetenir, setARetenir] = useState(initial?.a_retenir || '');
  /* IMAGES (10/10 soir) : par ligne { imageId, fichier, masques } et image générale (+ « au recto ») ;
     les fichiers ne sont écrits qu'à l'enregistrement */
  const [images, setImages] = useState(() => (initial ? imagesDe(initial) : {}));
  const [generale, setGenerale] = useState(() => { const g = initial ? imageGeneraleDe(initial) : null; return g ? { imageId: g.imageId } : {}; });
  const [auRecto, setAuRecto] = useState(() => !!(initial && imageGeneraleDe(initial) && imageGeneraleDe(initial).auRecto));
  const imagesRef = useRef(images); imagesRef.current = images;
  const generaleRef = useRef(generale); generaleRef.current = generale;
  const ecrireImage = async (v) => (v && v.fichier ? putBlob(v.fichier) : v && v.imageId) || null;
  const nomRef = useRef(null);
  const refs = useRef({});
  const entree = useRef(null);
  const moi = useRef(null);
  const [ocr, setOcr] = useState(null); // null | { etat: 'zone' | 'lecture' | 'fait' | 'rien', trouvees?, apercu? }
  const [depot, setDepot] = useState(false);

  const pret = !!nom.trim();
  const valider = async () => {
    if (!pret || busy) return;
    const ims = {};
    for (const l of LIGNES_MUSCLE) {
      const v = images[l.id];
      const id = await ecrireImage(v);
      if (id) ims[l.id] = { imageId: id, ...(v.masques && v.masques.length ? { masques: v.masques } : {}) };
    }
    const idGen = await ecrireImage(generale);
    await onAdd(carteMuscle({ nom, lignes, theme, indice, aRetenir, difficulte: initial?.difficulte || 'intermediaire',
      images: ims, imageGenerale: idGen ? { imageId: idGen, auRecto } : null }));
    if (!initial) {
      setNom(''); setLignes(lignesVides()); setIndice(''); setARetenir(''); setOcr(null);
      setImages({}); setGenerale({}); setAuRecto(false);
      setTheme(themeDefaut); themeRetouche.current = false;
      requestAnimationFrame(() => nomRef.current && nomRef.current.focus()); // enchaîner la carte suivante
    }
  };

  const ordre = ['nom', ...LIGNES_MUSCLE.map((l) => l.id)];
  const clavier = (e) => {
    if (echapDansFormulaire(e)) return;
    if (estEnregistrer(e)) { e.preventDefault(); e.stopPropagation(); valider(); return; }
    if (e.key !== 'Tab') return;
    const k = ordre.findIndex((id) => (id === 'nom' ? nomRef.current : refs.current[id]) === e.target);
    if (k < 0) return;
    const j = k + (e.shiftKey ? -1 : 1);
    if (j < 0 || j >= ordre.length) return; // au bord : tabulation normale (thème / indice)
    e.preventDefault();
    const cible = ordre[j] === 'nom' ? nomRef.current : refs.current[ordre[j]];
    if (cible) { cible.focus(); if (cible.setSelectionRange) cible.setSelectionRange(cible.value.length, cible.value.length); }
  };

  /* pré-remplissage : l'OCR lit la capture, chaque étiquette trouvée remplit SA ligne ;
     une étiquette introuvable laisse la ligne telle quelle. Rien de bloquant. */
  const lire = async (f) => {
    if (!f || !/^image\//.test(f.type || '')) return;
    const apercu = URL.createObjectURL(f);
    setOcr({ etat: 'lecture', apercu });
    let r = null;
    try { r = await lireTableauMuscle(f); } catch (e) { r = null; }
    URL.revokeObjectURL(apercu);
    if (!r || !r.lignes || !r.trouvees.length) { setOcr({ etat: 'rien' }); return; }
    setLignes((avant) => ({ ...avant, ...Object.fromEntries(r.trouvees.map((id) => [id, r.lignes[id]])) }));
    if (r.nom) setNom((n) => n || r.nom);
    setOcr({ etat: 'fait', trouvees: r.trouvees });
  };

  /* COLLAGE D'IMAGE AU SURVOL (11/10, lib/collerAuSurvol.js) : ⌘V d'une image → la zone survolée
     (ligne du tableau, image du muscle, ou bloc « Pré-remplir » = OCR du tableau), sinon la ligne
     dont le texte a le focus, sinon l'image du muscle. Remplacer est annulable (⌘Z). Même règle
     pour un fichier déposé. (Avant : sans ligne focalisée, une image collée pré-remplissait le
     tableau par OCR ; ce pré-remplissage reste au survol du bloc « Pré-remplir » et par son bouton.) */
  const aImage = (v) => !!(v && (v.imageId || v.fichier));
  const collage = useCollageAuSurvol(racine || moi, {
    actif,
    defaut: () => 'generale',
    libelle: (cle) => (cle === 'generale' ? 'Image du muscle' : cle === 'ocr' ? 'Pré-remplir' : (LIGNES_MUSCLE.find((l) => l.id === cle) || {}).label),
    appliquer: (cle, f) => {
      if (cle === 'ocr') { lire(f); return null; }
      if (cle === 'generale') {
        const avant = generaleRef.current;
        setGenerale({ imageId: null, fichier: f });
        return aImage(avant) ? avant : null;
      }
      const avant = imagesRef.current[cle];
      setImages((st) => ({ ...st, [cle]: { imageId: null, fichier: f, masques: null } }));
      return aImage(avant) ? avant : null;
    },
    restaurer: (cle, ancienne) => {
      if (cle === 'generale') setGenerale(ancienne);
      else setImages((st) => ({ ...st, [cle]: ancienne }));
    },
  });

  const libelleTrouvees = (ids) => LIGNES_MUSCLE.filter((l) => !ids.includes(l.id)).map((l) => l.label);

  return (
    <div className={'aif-champs mu-form' + (depot ? ' fc-depot' : '')} ref={moi} onKeyDown={clavier}
      onDragOver={(e) => { if (!glisseDesFichiers(e.dataTransfer)) return; e.preventDefault(); e.stopPropagation(); if (!depot) setDepot(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDepot(false); }}
      onDrop={() => setDepot(false)}>
      <input ref={entree} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => { lire(e.target.files[0]); e.target.value = ''; }} />
      <div className="imp-field">
        <label>Thème <span className="imp-opt">(optionnel)</span></label>
        <input className="imp-title" placeholder="ex : Muscles de la hanche" value={theme} onChange={(e) => { themeRetouche.current = true; setTheme(e.target.value); }} />
      </div>
      <div className="imp-field">
        <label>Nom du muscle</label>
        <input ref={nomRef} className="imp-title mu-nom-champ" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex : m. Grand glutéal (fessier)" />
      </div>

      {/* image du muscle (Zones image v2, 11/10) : en tête, même composant que les lignes, « Montrer au recto » à côté */}
      <div className="mu-generale" data-zone-image="generale">
        <span className="mu-generale-titre">Image du muscle <span className="imp-opt">(optionnelle)</span></span>
        <ChampImageMuscle valeur={generale} libelle="Image du muscle" onChange={(v) => setGenerale(v)} onColler={(f) => collage.colleDans('generale', f)}
          aside={(generale.imageId || generale.fichier) ? (
            <label className="mu-recto-opt" title="Cochée : l’image s’affiche aussi au recto. Sinon : au verso seulement.">
              <input type="checkbox" checked={auRecto} onChange={(e) => setAuRecto(e.target.checked)} /> Montrer au recto
            </label>
          ) : null} />
      </div>

      <div className="mu-ocr" data-zone-image="ocr">
        <button type="button" className="btn ghost sm" onClick={() => entree.current && entree.current.click()} disabled={ocr && ocr.etat === 'lecture'}>
          <Icon name="image" size={13} /> Pré-remplir depuis une image
        </button>
        <span className="hint">ou colle la capture du tableau ici (survole ce bloc, ⌘V / Ctrl+V)</span>
      </div>
      {ocr && ocr.etat === 'lecture' && (
        <div className="mu-ocr-etat"><span className="mu-sablier" aria-hidden="true" /> Lecture de la capture…{ocr.apercu && <img src={ocr.apercu} alt="" />}</div>
      )}
      {ocr && ocr.etat === 'fait' && (
        <div className="mu-ocr-etat ok"><Icon name="check" size={13} /> {ocr.trouvees.length}/{LIGNES_MUSCLE.length} ligne{ocr.trouvees.length > 1 ? 's' : ''} pré-remplie{ocr.trouvees.length > 1 ? 's' : ''} — relis et corrige.
          {ocr.trouvees.length < LIGNES_MUSCLE.length && <> Non trouvée{LIGNES_MUSCLE.length - ocr.trouvees.length > 1 ? 's' : ''} : {libelleTrouvees(ocr.trouvees).join(', ')}.</>}</div>
      )}
      {ocr && ocr.etat === 'rien' && (
        <div className="mu-ocr-etat"><Icon name="alert" size={13} /> Aucune étiquette (Origine, Trajet, Insertion, Action, Innervation, Topographie) lue sur cette image — remplis à la main.</div>
      )}

      <div className="mu-saisie" role="group" aria-label="Tableau du muscle">
        {LIGNES_MUSCLE.map((l) => (
          // zone image de la ligne : survol (⌘V, dépôt d'un fichier) et focus de son texte (lib/collerAuSurvol.js)
          <div key={l.id} className="mu-saisie-ligne" data-zone-image={l.id} data-zone-focus={l.id}>
            <label className="mu-etiquette" htmlFor={'mu-' + l.id}>{l.label}</label>
            <div className="mu-saisie-cellule">
              <ZoneAuto id={'mu-' + l.id} className="mu-zone" value={lignes[l.id]}
                inputRef={(el) => { refs.current[l.id] = el; }}
                onChange={(v) => setLignes((s) => ({ ...s, [l.id]: v }))} placeholder="—" />
              <ChampImageMuscle compact valeur={images[l.id]} libelle={l.label} onColler={(f) => collage.colleDans(l.id, f)}
                onChange={(v) => setImages((s) => { const n = { ...s }; if (v && (v.imageId || v.fichier)) n[l.id] = v; else delete n[l.id]; return n; })} />
            </div>
          </div>
        ))}
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
        <span className="fc-raccourci" title="Entrée = retour à la ligne · Tab = ligne suivante · Échap = quitter le champ">{RACCOURCI_ENREGISTRER} pour enregistrer</span>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Annuler</button>}
        <button type="button" className="btn primary" onClick={valider} disabled={!pret || busy}><Icon name="check" size={15} /> {submitLabel}</button>
      </div>
      <MessageCollage message={collage.message} onAnnuler={collage.annuler} onFermer={collage.fermer} />
      {!pret && <div className="hint">Nom du muscle requis — une ligne vide s’affichera « — ».</div>}
    </div>
  );
}
