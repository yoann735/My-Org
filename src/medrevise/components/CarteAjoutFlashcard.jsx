/* ============================================================
   MedRevise — CARTE D'AJOUT DE FLASHCARD du panneau (05/10).

   Affichée EN PLACE dans le mode Exercices › Flashcards (pas de modale), avec en
   tête un sélecteur Texte / Image. Les deux volets restent MONTÉS (l'un masqué) :
   passer de Texte à Image et revenir ne perd rien de ce qui a été saisi.

   - Texte : le formulaire flashcard existant (FlashcardForm : thème auto de la
     fiche, recto avec amorces et trous, verso, indice, à retenir) + aperçu +
     clavier (Entrée = retour à la ligne, ⌘Entrée / Ctrl+Entrée valide, Échap
     ferme, Tab recto → verso).
   - Image : déposer / coller (⌘V, Ctrl+V) / parcourir, puis
       · « Image + texte »  → même schéma qu'une flashcard texte avec image
         ({ recto, verso, imageId, imagePlace }) ;
       · « Masques à deviner » → l'éditeur d'occlusion existant, ouvert avec
         l'image (il lui faut toute la largeur de l'écran).
   Après chaque ajout, la carte reste ouverte et vide pour enchaîner ;
   « Terminer » la ferme.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { FlashcardForm, RACCOURCI_ENREGISTRER, estEnregistrer } from './AddItemForm.jsx';
import { OcclusionEditorModal } from './OcclusionImage.jsx';
import { PLACES_IMAGE } from './FlashcardImage.jsx';
import { putBlob } from '../lib/storage.js';
import { imageDuPressePapier, texteDuPressePapier, imageDuDepot, glisseDesFichiers } from '../lib/collerImage.js';

export function CarteAjoutFlashcard({ ctx, ficheId, themeDefaut = '', onAjouter, onTerminer, busy, rectoInitial = null }) {
  const [mode, setMode] = useState('texte');
  const [nb, setNb] = useState(0);
  const racine = useRef(null);
  const ajouter = async (raw) => { await onAjouter(raw); setNb((n) => n + 1); };

  return (
    <div className="pis-add card fc-carte" ref={racine} style={{ margin: '4px 0 12px' }}>
      <div className="card-body">
        <div className="fc-carte-tete">
          <div className="seg fc-carte-seg" role="tablist" aria-label="Sorte de flashcard">
            <button type="button" role="tab" aria-selected={mode === 'texte'} className={'seg-btn' + (mode === 'texte' ? ' active' : '')} onClick={() => setMode('texte')}><Icon name="edit" size={12} /> Texte</button>
            <button type="button" role="tab" aria-selected={mode === 'image'} className={'seg-btn' + (mode === 'image' ? ' active' : '')} onClick={() => setMode('image')}><Icon name="image" size={12} /> Image</button>
          </div>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn sm" onClick={onTerminer}>Terminer</button>
        </div>
        {nb > 0 && <div className="fc-carte-nb tnum">{nb} flashcard{nb > 1 ? 's' : ''} ajoutée{nb > 1 ? 's' : ''} ✓ — continue, ou « Terminer »</div>}
        <div hidden={mode !== 'texte'}>
          <FlashcardForm sansImage apercu clavier themeDefaut={themeDefaut} onAdd={ajouter} busy={busy}
            onCancel={onTerminer} submitLabel="Ajouter"
            rectoInitial={rectoInitial || ''} />
        </div>
        <div hidden={mode !== 'image'}>
          <VoletImage ctx={ctx} ficheId={ficheId} themeDefaut={themeDefaut} actif={mode === 'image'} racine={racine}
            onAjouter={ajouter} onTerminer={onTerminer} busy={busy} onMasquesCrees={() => setNb((n) => n + 1)} />
        </div>
      </div>
    </div>
  );
}

function VoletImage({ ctx, ficheId, themeDefaut, actif, racine, onAjouter, onTerminer, busy, onMasquesCrees }) {
  const [fichier, setFichier] = useState(null);
  const [apercu, setApercu] = useState(null);
  const [option, setOption] = useState('texte'); // 'texte' (image + recto/verso) | 'masques'
  const [theme, setTheme] = useState(themeDefaut);
  // même règle que FlashcardForm : le thème de la fiche, retouchable pour CETTE carte seulement
  const themeRetouche = useRef(false);
  useEffect(() => { if (!themeRetouche.current) setTheme(themeDefaut); }, [themeDefaut]);
  const [recto, setRecto] = useState('');
  const [verso, setVerso] = useState('');
  const [place, setPlace] = useState('recto');
  const [depot, setDepot] = useState(false);
  const [masques, setMasques] = useState(false);
  const [erreur, setErreur] = useState(null);
  const entree = useRef(null);
  const rectoRef = useRef(null);
  const versoRef = useRef(null);

  useEffect(() => {
    if (!fichier) { setApercu(null); return undefined; }
    const u = URL.createObjectURL(fichier); setApercu(u);
    return () => URL.revokeObjectURL(u);
  }, [fichier]);

  const prendre = (f) => {
    if (!f || !/^image\//.test(f.type || '')) { setErreur('Ce fichier n’est pas une image.'); return; }
    setErreur(null); setFichier(f);
  };

  /* ⌘V / Ctrl+V : seulement quand ce volet est affiché, et si l'on travaille dans la
     carte (focus dedans, ou nulle part). Un champ texte qui reçoit du texte garde le
     comportement normal. Phase de capture : le lecteur PDF ne pose pas l'image en plus. */
  useEffect(() => {
    if (!actif) return undefined;
    const coller = (e) => {
      if (masques) return; // l'éditeur de masques a son propre collage
      const r = racine.current;
      const a = document.activeElement;
      const focusDedans = !!(r && a && r.contains(a));
      const nullePart = !a || a === document.body || a === document.documentElement;
      if (!focusDedans && !nullePart) return;
      const f = imageDuPressePapier(e.clipboardData);
      if (!f) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && texteDuPressePapier(e.clipboardData)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      prendre(f);
    };
    window.addEventListener('paste', coller, true);
    return () => window.removeEventListener('paste', coller, true);
  }, [actif, masques, racine]);

  const pret = !!fichier && !!recto.trim() && !!verso.trim();
  const valider = async () => {
    if (!pret || busy) return;
    const imageId = await putBlob(fichier);
    // MÊME schéma qu'une flashcard texte avec image (AddItemForm.jsx#FlashcardForm)
    await onAjouter({
      type: 'flashcard', theme: theme.trim(), concept: theme.trim(), difficulte: 'intermediaire',
      recto: recto.trim(), verso: verso.trim(), indice: null, a_retenir: '', cloze: [],
      imageId, imagePlace: place,
    });
    setFichier(null); setRecto(''); setVerso(''); setTheme(themeDefaut); themeRetouche.current = false;
  };
  const clavier = (e) => {
    // l'éditeur de masques (fenêtre) est rendu DANS la carte : ses touches ne la concernent pas
    if (masques || (e.target.closest && e.target.closest('.day-pop'))) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onTerminer(); return; }
    // Entrée seule = retour à la ligne (comportement natif) ; ⌘Entrée / Ctrl+Entrée = ajouter
    if (estEnregistrer(e)) { e.preventDefault(); e.stopPropagation(); valider(); return; }
    if (e.key === 'Tab' && !e.shiftKey && e.target === rectoRef.current) { e.preventDefault(); versoRef.current && versoRef.current.focus(); return; }
    if (e.key === 'Tab' && e.shiftKey && e.target === versoRef.current) { e.preventDefault(); rectoRef.current && rectoRef.current.focus(); }
  };

  return (
    <div className="aif-champs" onKeyDown={clavier}>
      <input ref={entree} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => { prendre(e.target.files[0]); e.target.value = ''; }} />
      {!fichier ? (
        <button type="button" className={'fc-depot-zone' + (depot ? ' survol' : '')}
          onClick={() => entree.current && entree.current.click()}
          onDragOver={(e) => { if (!glisseDesFichiers(e.dataTransfer)) return; e.preventDefault(); setDepot(true); }}
          onDragLeave={() => setDepot(false)}
          onDrop={(e) => { e.preventDefault(); setDepot(false); const f = imageDuDepot(e.dataTransfer); if (f) prendre(f); }}>
          <Icon name="image" size={22} />
          <span><b>Colle une image</b> (⌘V / Ctrl+V), dépose-la ici ou <u>parcours</u></span>
        </button>
      ) : (
        <div className="fc-image-choisie">
          {apercu && <img src={apercu} alt="" />}
          <div className="fc-liens">
            <button type="button" className="linklike" onClick={() => entree.current && entree.current.click()}>Remplacer</button>
            <button type="button" className="linklike fc-retirer" onClick={() => setFichier(null)}>Retirer</button>
          </div>
        </div>
      )}
      {erreur && <div className="hint" style={{ color: 'var(--crit)' }}><Icon name="alert" size={12} /> {erreur}</div>}

      <div className="seg fc-seg" style={{ marginTop: 10 }}>
        <button type="button" className={'seg-btn' + (option === 'texte' ? ' active' : '')} onClick={() => setOption('texte')}>Image + texte</button>
        <button type="button" className={'seg-btn' + (option === 'masques' ? ' active' : '')} onClick={() => setOption('masques')}>Masques à deviner</button>
      </div>

      {option === 'texte' ? (
        <>
          <div className="imp-field">
            <label>Thème <span className="imp-opt">(optionnel)</span></label>
            <input className="imp-title" value={theme} onChange={(e) => { themeRetouche.current = true; setTheme(e.target.value); }} placeholder="ex : Anatomie du cœur" />
          </div>
          <div className="imp-field">
            <label>Recto</label>
            <textarea ref={rectoRef} className="imp-title" style={{ minHeight: 56, resize: 'vertical', fontFamily: 'inherit' }} value={recto} onChange={(e) => setRecto(e.target.value)} placeholder="Question…" />
          </div>
          <div className="imp-field">
            <label>Verso</label>
            <textarea ref={versoRef} className="imp-title" style={{ minHeight: 48, resize: 'vertical', fontFamily: 'inherit' }} value={verso} onChange={(e) => setVerso(e.target.value)} placeholder="Réponse…" />
          </div>
          <div className="fc-reglages">
            <span className="fc-reglages-titre">Image au</span>
            <div className="seg fc-seg">
              {PLACES_IMAGE.map((p) => (
                <button key={p.id} type="button" className={'seg-btn' + (place === p.id ? ' active' : '')} onClick={() => setPlace(p.id)}>{p.label}</button>
              ))}
            </div>
          </div>
          <div className="imp-actions">
            <span className="fc-raccourci" title="Entrée = retour à la ligne · Échap = annuler">{RACCOURCI_ENREGISTRER} pour enregistrer</span>
            <button type="button" className="btn ghost" onClick={onTerminer}>Annuler</button>
            <button type="button" className="btn primary" onClick={valider} disabled={!pret || busy}><Icon name="check" size={15} /> Ajouter</button>
          </div>
          {!pret && <div className="hint">Image, recto et verso requis.</div>}
        </>
      ) : (
        <>
          <div className="hint" style={{ margin: '8px 0' }}>Dessine des zones à masquer sur l’image : elles deviennent les réponses à deviner. L’éditeur s’ouvre en grand avec ton image.</div>
          <div className="imp-actions">
            <button type="button" className="btn primary" disabled={!fichier} onClick={() => setMasques(true)}><Icon name="image" size={14} /> Placer les masques</button>
          </div>
        </>
      )}

      {masques && (
        <OcclusionEditorModal ctx={ctx} ficheId={ficheId} imageInitiale={fichier}
          onClose={() => setMasques(false)}
          onSaved={() => { setFichier(null); onMasquesCrees(); }} />
      )}
    </div>
  );
}
