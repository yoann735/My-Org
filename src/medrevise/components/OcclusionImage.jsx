/* ============================================================
   MedRevise — FLASHCARD IMAGE (occlusion d'image).

   RÉUTILISE l'occlusion de l'ANATOMIE, sans la réinventer :
   - l'ÉDITEUR est `SchemaEditor` (pages/ImportAnatomieVisuel.jsx), tel quel :
     coller / glisser / choisir une image, zoom, formes, étiquettes, couleurs ;
   - le FORMAT est celui des schémas annotés : des « coches » en coordonnées
     relatives (0..1), normalisées par `cleanCoche` (lib/import.js) ;
   - le RENDU des zones est `ZonesLayer`, le même que l'éditeur et le quiz.

   CONVENTION (une seule règle, affichée dans l'éditeur) :
   - une ZONE dessinée (rectangle, ellipse, polygone, pinceau) = un MASQUE à
     deviner. Recto : opaque, marqué « ? ». Verso : contour + sa réponse (le texte
     de la zone, facultatif) ;
   - une ÉTIQUETTE (outil « Coche ») = un TEXTE posé sur l'image, visible des
     deux côtés.

   STOCKAGE : une flashcard ORDINAIRE (type 'flashcard', recto/verso) qui porte en
   plus `occlusion = { imageId, imageW, imageH, coches }`. Elle suit donc la
   méthode des J, la synchro (l'image part par l'outbox des fichiers, repérée par
   son `imageId`), la sauvegarde et l'édition exactement comme les autres.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Modal, ConfirmModal } from './ui.jsx';
import { SchemaEditor, ZonesLayer, centroidOf } from '../pages/ImportAnatomieVisuel.jsx';
import { blobURL, putBlob } from '../lib/storage.js';
import { cleanCoche, appendItemsToFiche } from '../lib/import.js';
import { toInternalItem } from '../lib/adapter.js';

export const RECTO_DEFAUT = 'Que cachent les masques ?';
const COULEUR_MASQUE = '#8B6FE8';

/** une flashcard est-elle une flashcard image ? */
export const estOcclusion = (item) => !!(item && item.occlusion && item.occlusion.imageId);

/** URL d'objet d'un blob, libérée au démontage / au changement d'image. */
function useBlobUrl(imageId) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let on = true; let cree = null;
    setUrl(null);
    if (imageId) blobURL(imageId).then((u) => { if (on) { cree = u; setUrl(u); } else if (u) URL.revokeObjectURL(u); });
    return () => { on = false; if (cree) URL.revokeObjectURL(cree); };
  }, [imageId]);
  return url;
}

/* ---------------------------------------------------------------- RENDU */
/**
 * L'image et ses encarts, recto (`revele=false` : masques opaques) ou verso
 * (`revele=true` : masques en contour + réponses). `maxH` borne la hauteur (px).
 */
export function OcclusionView({ occ, revele = false, maxH = 340, onClickImage }) {
  const url = useBlobUrl(occ && occ.imageId);
  if (!occ || !occ.imageId) return null;
  const w = occ.imageW || 4, h = occ.imageH || 3;
  const coches = occ.coches || [];
  const masques = coches.filter((c) => c.kind === 'zone' && c.zone);
  const textes = coches.filter((c) => c.kind !== 'zone' && (c.texte || '').trim());
  const zones = masques.map((c) => (revele
    ? { ...c, zone: { ...c.zone, fill: null, stroke: c.couleur || COULEUR_MASQUE, strokeOpacity: 1, strokeWidth: 2.4 } }
    : { ...c, zone: { ...c.zone, fill: c.couleur || COULEUR_MASQUE, fillOpacity: 1, stroke: '#2b2250', strokeOpacity: 0.55, strokeWidth: 1.2 } }));
  // largeur telle que la hauteur ne dépasse pas maxH, sans jamais déborder du conteneur
  const largeurMax = Math.round((maxH * w) / h);
  return (
    <div className="occ-view" style={{ width: '100%', maxWidth: largeurMax, aspectRatio: `${w} / ${h}` }} onClick={onClickImage}>
      {url ? <img src={url} alt="" draggable={false} /> : <div className="occ-ph"><Icon name="image" size={26} /></div>}
      <ZonesLayer coches={zones} />
      <svg className="occ-traits" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {textes.filter((c) => c.boite && c.ancre).map((c) => (
          <line key={c.id} x1={c.ancre.x * 100} y1={c.ancre.y * 100} x2={c.boite.x * 100} y2={c.boite.y * 100}
            stroke={c.couleur || '#1b1b2b'} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {textes.map((c) => {
        const p = c.boite || c.ancre || { x: 0.5, y: 0.5 };
        return <span key={c.id} className="occ-texte" style={{ left: p.x * 100 + '%', top: p.y * 100 + '%', borderColor: c.couleur || 'rgba(0,0,0,.35)' }}>{c.texte}</span>;
      })}
      {masques.map((c, i) => {
        const p = centroidOf(c);
        if (!revele) return <span key={c.id} className="occ-q" style={{ left: p.x * 100 + '%', top: p.y * 100 + '%' }}>{masques.length > 1 ? `?${i + 1}` : '?'}</span>;
        return (c.texte || '').trim()
          ? <span key={c.id} className="occ-reponse" style={{ left: p.x * 100 + '%', top: p.y * 100 + '%', borderColor: c.couleur || COULEUR_MASQUE }}>{c.texte}</span>
          : null;
      })}
    </div>
  );
}

/* ------------------------------------------------------------- ÉDITION */
/**
 * Fenêtre de création / modification d'une flashcard image. `initial` = la carte
 * existante (modification) ; absente = création dans `ficheId`.
 * Coller (Cmd/Ctrl+V), glisser ou choisir une image ; dessiner les masques ; poser
 * des textes ; question et réponse facultatives.
 */
export function OcclusionEditorModal({ ctx, ficheId, initial = null, onClose, onSaved }) {
  const occ0 = initial && initial.occlusion;
  const [image, setImageState] = useState(null); // { url, w, h, blobId, newFile }
  const [coches, setCoches] = useState(() => (occ0 && occ0.coches) || []);
  const [theme, setTheme] = useState((initial && initial.theme) || '');
  const [recto, setRecto] = useState((initial && initial.recto) || RECTO_DEFAUT);
  const [verso, setVerso] = useState(() => (initial && initial.verso && !initial.versoAuto ? initial.verso : ''));
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState(null);
  const urls = useRef(new Set());
  useEffect(() => () => { urls.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } }); }, []);

  // modification : l'image existante, rechargée depuis le store (local puis cloud)
  useEffect(() => {
    let on = true;
    if (occ0 && occ0.imageId) {
      blobURL(occ0.imageId).then((u) => {
        if (!on) { if (u) URL.revokeObjectURL(u); return; }
        if (u) { urls.current.add(u); setImageState({ url: u, w: occ0.imageW, h: occ0.imageH, blobId: occ0.imageId, newFile: null }); }
        else setErreur("L'image de cette carte n'est ni sur cet appareil ni au cloud : choisis-la à nouveau pour continuer.");
      });
    }
    return () => { on = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const choisirImage = (file) => {
    if (!file || !file.type || !file.type.startsWith('image/')) { setErreur('Ce fichier n’est pas une image.'); return; }
    setErreur(null);
    const url = URL.createObjectURL(file);
    urls.current.add(url);
    const probe = new Image();
    probe.onload = () => setImageState({ url, w: probe.naturalWidth, h: probe.naturalHeight, blobId: null, newFile: file });
    probe.onerror = () => setErreur('Image illisible.');
    probe.src = url;
  };

  // COLLER une capture d'écran (Cmd/Ctrl+V) : n'importe où dans la fenêtre, sauf
  // pendant qu'on tape dans un champ (on y colle alors du texte, normalement).
  useEffect(() => {
    const onPaste = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (const it of items) {
        if (it.type && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) { e.preventDefault(); choisirImage(f); return; } }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* NE RIEN PERDRE : Échap, la croix ou un clic à côté fermaient la fenêtre sans
     prévenir — or on tape souvent Échap dans un éditeur (annuler un polygone,
     désélectionner). S'il y a du travail non enregistré, on demande d'abord. */
  const [confirmerFermeture, setConfirmerFermeture] = useState(false);
  const empreinte0 = useRef(null);
  const empreinte = JSON.stringify({ img: image && (image.blobId || image.url), coches, theme, recto, verso });
  if (empreinte0.current == null && (!occ0 || image)) empreinte0.current = empreinte;
  const modifie = empreinte0.current != null && empreinte !== empreinte0.current;
  const demanderFermeture = () => { if (modifie && !occupe) setConfirmerFermeture(true); else onClose(); };

  const nbMasques = coches.filter((c) => c.kind === 'zone').length;
  const nbTextes = coches.filter((c) => c.kind !== 'zone').length;
  const pret = !!image && nbMasques > 0 && !occupe;

  const enregistrer = async () => {
    if (!pret) return;
    setOccupe(true); setErreur(null);
    try {
      const imageId = image.newFile ? await putBlob(image.newFile) : image.blobId;
      const propres = coches.map((c, i) => cleanCoche(c, i));
      const reponses = propres.filter((c) => c.kind === 'zone' && c.texte).map((c) => c.texte);
      const versoAuto = !verso.trim();
      const raw = {
        type: 'flashcard', theme: theme.trim(), difficulte: (initial && initial.difficulte) || 'intermediaire',
        recto: recto.trim() || RECTO_DEFAUT,
        // le verso textuel est facultatif : sinon, les réponses des masques (ou un repli)
        verso: verso.trim() || (reponses.length ? reponses.join(' · ') : 'Voir l’image'),
        versoAuto,
        indice: (initial && initial.indice) || null, a_retenir: (initial && initial.a_retenir) || '',
        occlusion: { imageId, imageW: image.w, imageH: image.h, coches: propres },
      };
      if (initial) {
        const maj = toInternalItem({ ...initial, ...raw }); // garde l'état méthode des J (intervalle, historique…)
        if (!maj) throw new Error('carte invalide');
        await ctx.saveQuestion(maj);
      } else {
        await appendItemsToFiche({ ficheId, items: [raw] });
        await ctx.reload();
      }
      if (onSaved) onSaved();
      onClose();
    } catch (e) {
      setErreur("L'enregistrement a échoué — rien n'a été modifié. " + ((e && e.message) || ''));
    } finally { setOccupe(false); }
  };

  return (
    <Modal title={initial ? 'Modifier la flashcard image' : 'Nouvelle flashcard image'} onClose={confirmerFermeture ? () => {} : demanderFermeture} width="min(1180px, 96vw)">
      <div className="occ-aide">
        <span><b>1.</b> Colle une capture (<kbd>⌘V</kbd>), glisse ou choisis une image.</span>
        <span><b>2.</b> <span className="occ-puce masque" /> Dessine une <b>zone</b> (Rectangle, Ellipse, Pinceau…) = un <b>masque à deviner</b> — écris sa réponse dans son texte.</span>
        <span><b>3.</b> <span className="occ-puce texte" /> Outil <b>Coche</b> : clique un endroit = un <b>texte</b> visible sur l’image.</span>
      </div>

      <SchemaEditor image={image} setImage={choisirImage} coches={coches} setCoches={setCoches} sansExport variante="flashcard" />

      <div className="occ-champs">
        <div className="imp-field">
          <label>Question (recto)</label>
          <input className="imp-title" value={recto} onChange={(e) => setRecto(e.target.value)} placeholder={RECTO_DEFAUT} />
        </div>
        <div className="imp-field">
          <label>Réponse écrite <span className="imp-opt">(facultatif — sinon, les réponses des masques)</span></label>
          <input className="imp-title" value={verso} onChange={(e) => setVerso(e.target.value)} placeholder="ex : les 4 cavités cardiaques" />
        </div>
        <div className="imp-field">
          <label>Thème <span className="imp-opt">(facultatif)</span></label>
          <input className="imp-title" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="ex : Anatomie du cœur" />
        </div>
      </div>

      {erreur && <div className="hint" style={{ color: 'var(--crit)', marginTop: 8 }}><Icon name="alert" size={12} /> {erreur}</div>}
      {/* pied COLLANT : compteur + actions toujours visibles, même image très haute */}
      <div className="imp-actions occ-pied" style={{ alignItems: 'center' }}>
        <span className="hint" style={{ marginRight: 'auto' }}>
          {!image ? 'Ajoute d’abord une image.' : nbMasques === 0 ? 'Dessine au moins un masque (une zone).' : `${nbMasques} masque${nbMasques > 1 ? 's' : ''}${nbTextes ? ` · ${nbTextes} texte${nbTextes > 1 ? 's' : ''}` : ''}`}
        </span>
        <button type="button" className="btn ghost" onClick={demanderFermeture}>Annuler</button>
        <button type="button" className="btn primary" onClick={enregistrer} disabled={!pret}>
          <Icon name="check" size={15} /> {occupe ? 'Enregistrement…' : initial ? 'Enregistrer' : 'Créer la flashcard'}
        </button>
      </div>
      {confirmerFermeture && (
        <ConfirmModal title="Fermer sans enregistrer ?"
          body="L'image, les masques et les textes posés depuis l'ouverture de cette fenêtre seront perdus."
          confirmLabel="Fermer sans enregistrer" danger
          onConfirm={() => { setConfirmerFermeture(false); onClose(); }}
          onCancel={() => setConfirmerFermeture(false)} />
      )}
    </Modal>
  );
}
