/* ============================================================
   MedRevise — IMAGES D'UNE CARTE MUSCLE (10/10 soir, modèle dans lib/muscle.js).

   - ImageMuscle : vignette dans une ligne du tableau (ou image générale du muscle) ; un
     toucher l'agrandit (VisionneuseImage) — jamais il ne retourne la carte ni ne révèle
     une autre ligne (propagation arrêtée).
   - VisionneuseImage : l'image en grand ; « Texte » affiche le texte reconnu (OCR existant,
     ocr/ocrImage.js, mis en cache par image) en calque SÉLECTIONNABLE, « Copier le texte » ;
     les mots masqués (« Masquer des mots ») sont couverts jusqu'à « Révéler ».
   - ChampImageMuscle : dans le formulaire — ajouter (parcourir, coller, glisser), remplacer,
     retirer, « Masquer des mots » (components/MasquerMots.jsx, la même fenêtre que pour une
     flashcard image). Le fichier n'est écrit (putBlob) qu'à l'enregistrement de la carte.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { blobURL } from '../lib/storage.js';
import { ocrImage } from '../ocr/ocrImage.js';
import { MasquerMots } from './MasquerMots.jsx';
import '../../styles/muscle-images.css';

/** URL objet d'un blob enregistré, ou d'un fichier pas encore enregistré */
export function useUrlImage(imageId, fichier = null) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let vivant = true, u = null;
    if (fichier) { u = URL.createObjectURL(fichier); setUrl(u); }
    else if (imageId) blobURL(imageId).then((x) => { u = x; if (vivant) setUrl(x); else if (x) URL.revokeObjectURL(x); });
    else setUrl(null);
    return () => { vivant = false; if (u) URL.revokeObjectURL(u); };
  }, [imageId, fichier]);
  return url;
}

const stop = (e) => e.stopPropagation();

/** masques (zones en fractions de l'image) posés sur l'image */
function Masques({ masques, caches }) {
  if (!masques || !masques.length || !caches) return null;
  return masques.map((m) => {
    const r = (m.zone && m.zone.rect) || m.rect;
    if (!r) return null;
    return <span key={m.id} className="mui-masque" style={{ left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' }} />;
  });
}

/** vignette (ou image générale) — un toucher l'agrandit */
export function ImageMuscle({ imageId, fichier = null, masques = null, titre = 'Image', grande = false, className = '' }) {
  const url = useUrlImage(imageId, fichier);
  const [ouverte, setOuverte] = useState(false);
  if (!imageId && !fichier) return null;
  return (
    <>
      <span role="button" tabIndex={0} className={'mui-vignette' + (grande ? ' grande' : '') + (className ? ' ' + className : '')}
        title={`${titre} — toucher pour agrandir (texte reconnu)`} aria-label={`${titre} — agrandir`}
        onPointerDown={stop} onMouseDown={stop}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOuverte(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setOuverte(true); } }}>
        {url ? <img src={url} alt="" draggable={false} /> : <span className="mui-ph"><Icon name="image" size={18} /></span>}
        <Masques masques={masques} caches />
        <span className="mui-ocr-ic" aria-hidden="true" title="Texte reconnu">T</span>
      </span>
      {ouverte && url && <VisionneuseImage imageId={imageId} url={url} masques={masques} titre={titre} onFermer={() => setOuverte(false)} />}
    </>
  );
}

/** l'image en grand, avec le texte reconnu sélectionnable */
export function VisionneuseImage({ imageId, url, masques = null, titre = 'Image', onFermer }) {
  const [texte, setTexte] = useState(false);
  const [ocr, setOcr] = useState(null); // null (lecture) | { mots } | { erreur }
  const [revele, setRevele] = useState(false);
  const [copie, setCopie] = useState(false);
  const cadre = useRef(null);
  const [hauteur, setHauteur] = useState(0);
  useEffect(() => {
    let vivant = true;
    ocrImage(imageId ? { blobId: imageId } : { src: url }).then((r) => { if (vivant) setOcr({ mots: ((r && r.mots) || []).filter((m) => m.t && m.w > 0 && m.h > 0) }); })
      .catch(() => { if (vivant) setOcr({ erreur: true, mots: [] }); });
    return () => { vivant = false; };
  }, [imageId, url]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onFermer(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onFermer]);
  useEffect(() => {
    const el = cadre.current;
    if (!el) return undefined;
    const mesurer = () => setHauteur(el.clientHeight);
    mesurer();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(mesurer); ro.observe(el);
    return () => ro.disconnect();
  }, [url]);
  const mots = (ocr && ocr.mots) || [];
  const copier = async () => {
    const lignes = new Map();
    mots.forEach((m) => { if (!lignes.has(m.line)) lignes.set(m.line, []); lignes.get(m.line).push(m.t); });
    try { await navigator.clipboard.writeText([...lignes.values()].map((l) => l.join(' ')).join('\n')); setCopie(true); setTimeout(() => setCopie(false), 1600); } catch (e) { /* refus */ }
  };
  const caches = !!(masques && masques.length) && !revele;
  return createPortal(
    <div className="mui-visionneuse" role="dialog" aria-label={titre} onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onFermer(); }}
      onPointerDown={stop} onMouseDown={stop}>
      <div className="mui-v-barre">
        <b className="mui-v-titre">{titre}</b>
        <span style={{ flex: 1 }} />
        <button type="button" className={'btn sm' + (texte ? ' primary' : '')} aria-pressed={texte} onClick={() => setTexte((v) => !v)}
          disabled={!mots.length} title={ocr ? (mots.length ? 'Afficher le texte reconnu (sélectionnable)' : 'Aucun texte reconnu') : 'Lecture du texte…'}>
          <Icon name="search" size={13} /> {ocr ? (mots.length ? 'Texte' : 'Aucun texte') : 'Lecture…'}
        </button>
        {mots.length > 0 && <button type="button" className="btn sm" onClick={copier}><Icon name="copy" size={13} /> {copie ? 'Copié ✓' : 'Copier le texte'}</button>}
        {masques && masques.length > 0 && <button type="button" className="btn sm" onClick={() => setRevele((v) => !v)}>{revele ? 'Remasquer' : `Révéler (${masques.length})`}</button>}
        <button type="button" className="icon-btn sm" onClick={onFermer} aria-label="Fermer" title="Fermer (Échap)"><Icon name="x" size={15} /></button>
      </div>
      <div className="mui-v-zone" onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
        <div ref={cadre} className={'mui-v-cadre' + (texte ? ' texte' : '')}>
          <img src={url} alt="" draggable={false} />
          <Masques masques={masques} caches={caches} />
          {texte && (
            <div className="mui-v-mots">
              {mots.map((m, i) => (
                <span key={i} style={{ left: m.x * 100 + '%', top: m.y * 100 + '%', width: m.w * 100 + '%', height: m.h * 100 + '%', fontSize: Math.max(6, m.h * hauteur * 0.82) + 'px' }}>{m.t + ' '}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** champ du formulaire : { imageId, fichier, masques } — vide : { imageId: null, fichier: null } */
export function ChampImageMuscle({ valeur, onChange, libelle = 'Image', compact = false }) {
  const { imageId, fichier, masques } = valeur || {};
  const url = useUrlImage(imageId, fichier);
  const input = useRef(null);
  const [masquer, setMasquer] = useState(null); // { url, w, h }
  const [survol, setSurvol] = useState(false);
  const choisir = (f) => { if (f && /^image\//.test(f.type || '')) onChange({ imageId: null, fichier: f, masques: null }); };
  const deposer = {
    onDragOver: (e) => { if (![...(e.dataTransfer.types || [])].includes('Files')) return; e.preventDefault(); e.stopPropagation(); setSurvol(true); },
    onDragLeave: () => setSurvol(false),
    onDrop: (e) => { const f = [...(e.dataTransfer.files || [])].find((x) => /^image\//.test(x.type)); if (!f) return; e.preventDefault(); e.stopPropagation(); setSurvol(false); choisir(f); },
  };
  const ouvrirMasquer = async () => {
    if (!url) return;
    let w = 4, h = 3;
    try { const im = new Image(); im.src = url; await im.decode(); w = im.naturalWidth; h = im.naturalHeight; } catch (e) { /* proportions par défaut */ }
    setMasquer({ url, w, h });
  };
  return (
    <div className={'mui-champ' + (compact ? ' compact' : '') + (survol ? ' survol' : '')} {...deposer}>
      <input ref={input} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { choisir(e.target.files[0]); e.target.value = ''; }} />
      {!imageId && !fichier ? (
        <button type="button" className="mui-ajout" onClick={() => input.current && input.current.click()} title={`${libelle} : parcourir, ou coller (⌘V) / glisser une image ici`}>
          <Icon name="image" size={13} /> {compact ? 'Image' : `Ajouter ${libelle.toLowerCase()}`}
        </button>
      ) : (
        <div className="mui-choisie">
          <ImageMuscle imageId={imageId} fichier={fichier} masques={masques} titre={libelle} />
          <div className="mui-liens">
            <button type="button" className="linklike" onClick={ouvrirMasquer} title="L’OCR lit l’image : touche les mots à cacher">
              Masquer des mots{masques && masques.length ? ` (${masques.length})` : ''}
            </button>
            {masques && masques.length > 0 && <button type="button" className="linklike" onClick={() => onChange({ imageId, fichier, masques: null })}>Ôter les masques</button>}
            <button type="button" className="linklike" onClick={() => input.current && input.current.click()}>Remplacer</button>
            <button type="button" className="linklike fc-retirer" onClick={() => onChange({ imageId: null, fichier: null, masques: null })}>Retirer</button>
          </div>
        </div>
      )}
      {masquer && (
        <MasquerMots image={masquer} onFermer={() => setMasquer(null)}
          onAjouter={(nouveaux) => { onChange({ imageId, fichier, masques: [...(masques || []), ...nouveaux] }); setMasquer(null); }} />
      )}
    </div>
  );
}
