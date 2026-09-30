/* ============================================================
   MedRevise — ATELIER « Voir le cours » : la branche HTML du lecteur.

   Ce n'est PAS un lecteur de PDF. C'est un produit différent, qui vivait dans
   le même fichier : une <iframe> de cours HTML (le gabarit), éditable en place,
   avec auto-sauvegarde du blob, et la sidebar d'items à côté. Il ne partageait
   avec le lecteur PDF que le bouton « Retour » et l'allure de sa barre d'outils
   — d'où la sensation de « plusieurs lecteurs » : il y en avait bien deux, dans
   un seul fichier de 1900 lignes.

   Extrait tel quel à l'étape 4 du refactor : corps recopiés à l'identique.
   Deux écarts seulement, sans effet visible :
   - l'état et les effets du cours HTML ne sont plus montés quand on regarde un
     PDF (ils étaient déclarés avant le `return` de la branche PDF, donc
     exécutés pour rien — tous gardés par `if (!fiche.htmlId) return`) ;
   - les modales d'items ont leur propre état ici plutôt que partagé avec la
     branche PDF : les deux branches ne coexistent jamais à l'écran.

   MÊME LECTEUR QUE LE PDF (nuit du 30/09). La fiche HTML s'ouvre désormais
   dans le MÊME cadre : même barre d'outils (PdfToolbar), même panneau de droite
   (CourseItemsSidebar : QCM / Flashcard / Exercice / Feynman + « Notions »),
   même bascule mobile, mêmes actions dans le menu ⋯.
   Les outils de la barre agissent sur le cours À TRAVERS SES PROPRES BOUTONS
   (le gabarit garde son script dans une IIFE, rien n'est exposé) :
     - Surligneur → clic sur `.swatch[data-hl=couleur]` du gabarit, avec la
       sélection faite dans l'iframe : c'est EXACTEMENT le chemin de ses propres
       pastilles (instantané d'annulation, restauration si ça échoue). Le
       gabarit recolore un passage déjà surligné au lieu d'empiler : pas de
       ré-accentuation, comme sur le PDF ;
     - Annuler / Rétablir → `#bUndo` / `#bRedo` du gabarit.
   Chaque bouton est détecté avant usage : une fiche d'une version plus ancienne
   du gabarit qui n'en aurait pas garde simplement l'outil grisé — rien ne casse.
   Boîte de texte, crayon et gomme restent propres au PDF : ils dessinent en
   coordonnées de PAGE, et une fiche HTML n'a pas de pages.
   L'auto-sauvegarde (MutationObserver → blob) est INCHANGÉE.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop, Modal, ConfirmModal } from '../components/ui.jsx';
import { PdfToolbar } from './PdfToolbar.jsx';
import { COLORS, COLOR_HEX, COLOR_TAG, RACCOURCI } from './pdfShared.js';
import { AddItemModal } from '../components/AddItemForm.jsx';
import { AllPromptsModal } from '../components/CoursePromptsMenu.jsx';
import { getBlob, putBlob, putBlobAt } from '../lib/storage.js';
import { PasteJsonForm } from '../components/AddItemForm.jsx';
import { CourseItemsSidebar } from '../components/CourseItemsSidebar.jsx';
import { buildCourseExport } from '../lib/courseExport.js';
import { serializeCourseHtml } from '../lib/courseHtmlSave.js';

export function CourseHtmlView({ ctx, fiche, ficheId, canAddItem, embedded, close, onVoirPdf, onRattacher = null }) {
  const { db } = ctx;
  const [mobileView, setMobileView] = useState('course');
  const [showImportItems, setShowImportItems] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  const [htmlUrl, setHtmlUrl] = useState(null);
  const [htmlLoadError, setHtmlLoadError] = useState(null);
  // CRITIQUE (auto-save, voir plus bas) : quand l'auto-save écrit un NOUVEL id de
  // blob (1ère écriture d'une session d'édition) et met à jour fiche.htmlId, CET
  // effet se redéclenche puisqu'il dépend de fiche.htmlId — sans garde-fou, il
  // rechargerait l'iframe depuis le blob qu'on vient tout juste d'écrire, ce qui
  // PERDRAIT l'édition en cours (nouveau document, historique undo/redo remis à
  // zéro). `autosavedHtmlIdRef` retient le DERNIER id que NOUS avons écrit : si
  // fiche.htmlId correspond déjà, on ne touche à rien (l'iframe affiche déjà la
  // bonne version) — un changement externe réel (Remplacer le fichier HTML,
  // réconciliation multi-appareil) a toujours un id DIFFÉRENT et recharge normalement.
  const autosavedHtmlIdRef = useRef(null);
  // ref sur l'iframe "Voir le cours" — lue par l'auto-save ET par "Tout exporter"
  // (blob: URL + sandbox="allow-same-origin" la rend same-origin avec le parent,
  // donc accessible sans postMessage).
  const courseIframeRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    let objUrl = null;
    if (!fiche || !fiche.htmlId) { setHtmlUrl(null); setHtmlLoadError(null); return; }
    if (fiche.htmlId === autosavedHtmlIdRef.current) return; // notre propre écriture — iframe déjà à jour
    setHtmlUrl(null); setHtmlLoadError(null);
    (async () => {
      const blob = await getBlob(fiche.htmlId);
      if (cancelled) return;
      if (!blob) { setHtmlLoadError(navigator.onLine === false ? 'hors-ligne' : 'introuvable'); return; }
      objUrl = URL.createObjectURL(blob);
      setHtmlUrl(objUrl);
    })();
    return () => { cancelled = true; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [fiche && fiche.htmlId]);

  // ---- auto-save du cours HTML (surlignage, édition de texte, images, undo/redo…) ----
  // Détecte TOUTE modification du DOM de l'iframe (MutationObserver sur #doc, posé au
  // chargement — voir onCourseIframeLoad), debounce ~800ms, sérialise (même logique que
  // le bouton "Enregistrer" du gabarit, voir lib/courseHtmlSave.js) et écrit :
  // - 1er tick d'une session d'édition : putBlob (nouvel id) + ctx.setFicheHtml (outbox
  //   durable, fiche.htmlId à jour pour la synchro/les autres appareils) ;
  // - ticks suivants de la MÊME session : putBlobAt sur ce même id (pas de nouvel id,
  //   donc fiche.htmlId ne change plus → l'effet ci-dessus ne recharge pas l'iframe).
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved
  const sessionBlobIdRef = useRef(null);
  const saveTimerRef = useRef(null);
  const observerRef = useRef(null);

  /* ---- ÉTAT DU COURS VU DE L'EXTÉRIEUR : notions (mark.hl) + boutons du gabarit ----
     relu au chargement de l'iframe et à chaque mutation (même observateur que
     l'auto-sauvegarde, débouncé à part — la lecture est gratuite, l'écriture non). */
  const [marques, setMarques] = useState([]);
  const [gabarit, setGabarit] = useState({ surligneur: false, annuler: false, retablir: false, peutAnnuler: false, peutRetablir: false });
  const lectureTimerRef = useRef(null);
  const idoc = () => courseIframeRef.current && courseIframeRef.current.contentDocument;
  const lireCours = () => {
    const d = idoc();
    const docEl = d && d.getElementById('doc');
    if (!docEl) { setMarques([]); return; }
    setMarques([...docEl.querySelectorAll('mark.hl')].map((m, i) => ({ i, el: m, couleur: m.dataset.hl || 'jaune', texte: (m.textContent || '').replace(/\s+/g, ' ').trim() }))
      .filter((m) => m.texte));
    const u = d.getElementById('bUndo'), r = d.getElementById('bRedo');
    setGabarit({ surligneur: !!d.querySelector('.swatch[data-hl]'), annuler: !!u, retablir: !!r,
      peutAnnuler: !!u && !u.disabled, peutRetablir: !!r && !r.disabled });
  };
  const planifierLecture = () => { clearTimeout(lectureTimerRef.current); lectureTimerRef.current = setTimeout(lireCours, 150); };
  const performCourseSave = async () => {
    const idoc = courseIframeRef.current && courseIframeRef.current.contentDocument;
    if (!idoc) return;
    setSaveStatus('saving');
    const html = serializeCourseHtml(idoc);
    const blob = new Blob([html], { type: 'text/html' });
    if (sessionBlobIdRef.current) {
      await putBlobAt(sessionBlobIdRef.current, blob);
    } else {
      const id = await putBlob(blob);
      sessionBlobIdRef.current = id;
      autosavedHtmlIdRef.current = id;
      await ctx.setFicheHtml(ficheId, id, fiche.htmlName);
    }
    setSaveStatus('saved');
  };
  const scheduleCourseSave = () => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { performCourseSave(); }, 800);
  };
  const onCourseIframeLoad = () => {
    const idoc = courseIframeRef.current && courseIframeRef.current.contentDocument;
    const target = idoc && idoc.getElementById('doc');
    if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null; }
    if (!target) return;
    // attributeFilter volontairement restreint : exclut `contenteditable` (bascule
    // Lecture/Édition sur #doc lui-même, purement transitoire — serializeCourseHtml
    // le normalise de toute façon à l'enregistrement) pour ne pas déclencher un
    // autosave à chaque simple bascule de mode, sans contenu réellement changé.
    const observer = new MutationObserver(() => { scheduleCourseSave(); planifierLecture(); });
    observer.observe(target, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'data-hl'] });
    observerRef.current = observer;
    lireCours();
    brancherOutils(idoc);
  };
  useEffect(() => () => {
    clearTimeout(saveTimerRef.current);
    clearTimeout(lectureTimerRef.current);
    if (observerRef.current) observerRef.current.disconnect();
  }, []);

  /* ---- OUTILS DE LA BARRE COMMUNE, appliqués au cours HTML ---- */
  const [outil, setOutil] = useState('main');
  const [couleurActive, setCouleurActive] = useState('jaune');
  const outilRef = useRef(outil); outilRef.current = outil;
  const couleurRef = useRef(couleurActive); couleurRef.current = couleurActive;
  // surligner = cliquer la pastille du gabarit : même chemin que ses propres boutons
  const surlignerSelection = (d, couleur) => {
    const sel = d && d.getSelection && d.getSelection();
    const docEl = d && d.getElementById('doc');
    if (!sel || sel.isCollapsed || !docEl || !docEl.contains(sel.anchorNode)) return false;
    const sw = d.querySelector(`.swatch[data-hl="${couleur}"]`);
    if (!sw) return false;
    // Déjà entièrement surligné dans cette couleur : on ne fait RIEN. Le gabarit,
    // lui, empilerait un instantané d'annulation identique — le premier Annuler
    // semblerait alors ne rien faire. Même règle que sur le PDF.
    if (dejaSurligne(d, sel.getRangeAt(0), couleur)) { try { sel.removeAllRanges(); } catch (e) { /* ignore */ } return false; }
    sw.click();
    try { sel.removeAllRanges(); } catch (e) { /* ignore */ }
    return true;
  };
  const dejaSurligne = (d, range, couleur) => {
    const racine = range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer;
    const w = d.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
    let n = racine.nodeType === 3 ? racine : w.nextNode();
    let vu = false;
    for (; n; n = w.nextNode()) {
      if (!range.intersectsNode(n) || !n.nodeValue.trim()) continue;
      vu = true;
      const m = n.parentNode && n.parentNode.closest ? n.parentNode.closest('mark.hl') : null;
      if (!m || m.dataset.hl !== couleur) return false;
    }
    return vu;
  };
  /* Les commandes du gabarit que la barre commune remplace (pastilles, Annuler,
     Rétablir, Copier pour un prompt) sont MASQUÉES, pas supprimées : on continue
     de les cliquer en coulisse. Feuille « adoptée » (adoptedStyleSheets) : elle ne
     fait pas partie du DOM, donc n'entre JAMAIS dans le HTML sauvegardé. Ce que la
     barre commune n'a pas (Mode lecture, G, I, Titre, Image, Enregistrer) reste. */
  const CSS_CADRE = `.bar .grp:has(.swatch), .bar .grp:has(#bUndo), .bar .sep, #bCopyTxt { display: none !important; }
    mark.hl { cursor: pointer; }
    ::selection { background: rgba(124, 77, 255, .65); color: inherit; }`;
  const brancherOutils = (d) => {
    if (!d || d.__medreviseOutils) return;
    d.__medreviseOutils = true;
    try {
      const w = d.defaultView;
      if (w && w.CSSStyleSheet && 'adoptedStyleSheets' in d) {
        const f = new w.CSSStyleSheet(); f.replaceSync(CSS_CADRE);
        d.adoptedStyleSheets = [...d.adoptedStyleSheets, f];
      }
    } catch (e) { /* navigateur sans feuilles adoptées : le gabarit garde sa barre complète */ }
    // Surligneur actif : relâcher une sélection dans le cours la surligne aussitôt
    d.addEventListener('mouseup', () => {
      if (outilRef.current !== 'surligneur') return;
      setTimeout(() => surlignerSelection(d, couleurRef.current), 0); // après la fin de la sélection native
    });
    // Sélection : un clic sur un surlignage ouvre la MÊME bulle que sur le PDF
    d.addEventListener('click', (ev) => {
      const m = ev.target && ev.target.closest ? ev.target.closest('mark.hl') : null;
      const sel = d.getSelection();
      if (!m || outilRef.current !== 'main' || (sel && !sel.isCollapsed)) { setBulle(null); return; }
      const fr = courseIframeRef.current.getBoundingClientRect();
      setBulle({ mark: m, couleur: m.dataset.hl || 'jaune', x: fr.left + ev.clientX, y: fr.top + ev.clientY });
    });
    d.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') setBulle(null); });
  };
  /* BULLE d'un surlignage du cours : sa couleur, ou le supprimer — via les pastilles
     du gabarit (couleur ou « off »), appliquées à tout le passage surligné. */
  const [bulle, setBulle] = useState(null);
  const agirSurMarque = (couleur) => {
    const b = bulle; setBulle(null);
    const d = idoc();
    if (!b || !d || !b.mark.isConnected) return;
    const r = d.createRange(); r.selectNodeContents(b.mark);
    const sel = d.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    const sw = d.querySelector(`.swatch[data-hl="${couleur}"]`);
    if (sw) sw.click();
    try { sel.removeAllRanges(); } catch (e) { /* ignore */ }
    planifierLecture();
  };
  useEffect(() => {
    if (!bulle) return undefined;
    const onDown = (e) => { if (!(e.target.closest && e.target.closest('.hl-picker'))) setBulle(null); };
    const onKey = (e) => { if (e.key === 'Escape') setBulle(null); };
    window.addEventListener('pointerdown', onDown); window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [bulle]);
  const choisirOutil = (id) => {
    // comme sur le PDF (et dans Word) : du texte sélectionné + Surligneur → surligné
    if (id === 'surligneur') surlignerSelection(idoc(), couleurActive);
    setOutil(id);
  };
  const cliquerGabarit = (sel) => { const d = idoc(); const b = d && d.getElementById(sel); if (b && !b.disabled) b.click(); planifierLecture(); };
  const hist = {
    annuler: () => cliquerGabarit('bUndo'), retablir: () => cliquerGabarit('bRedo'),
    peutAnnuler: gabarit.peutAnnuler, peutRetablir: gabarit.peutRetablir,
    libelleAnnuler: 'dernière modification du cours', libelleRetablir: 'dernière modification annulée',
  };
  const [panelOpen, setPanelOpen] = useState(true);
  const [detacher, setDetacher] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [promptsOuverts, setPromptsOuverts] = useState(false);
  const [notionsCopiees, setNotionsCopiees] = useState(false);
  // « Copier les notions » = le bouton « Copier pour un prompt » du gabarit (même format
  // que le PDF, qui en est la copie — voir lib/pdfCourseText.js)
  const copierNotions = () => {
    const d = idoc(); const b = d && d.getElementById('bCopyTxt');
    if (!b) return;
    b.click();
    setNotionsCopiees(true); setTimeout(() => setNotionsCopiees(false), 2200);
  };
  const allerA = (m) => { try { m.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* ignore */ } };

  // "Tout exporter" (atelier "Voir le cours", branche HTML) : cours + surlignages
  // + cartes manuelles en un seul JSON (contrat medrevise_cours_export v1, voir
  // lib/courseExport.js), copié dans le presse-papier pour un prompt externe.
  const [courseExportOk, setCourseExportOk] = useState(false);
  const exportAllCourse = async () => {
    const idoc = courseIframeRef.current && courseIframeRef.current.contentDocument;
    const docEl = idoc && idoc.getElementById('doc');
    if (!docEl) return;
    const matiereNom = (db.matieres.find((m) => m.id === fiche.matiereId) || {}).nom || '';
    const cartes = db.questions.filter((q) => q.ficheId === ficheId && (q.type === 'qcm' || q.type === 'flashcard'));
    const payload = buildCourseExport({ fiche, matiereNom, docEl, cartes });
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCourseExportOk(true);
      setTimeout(() => setCourseExportOk(false), 2200);
    } catch (e) { /* ignore */ }
  };
  const notionsHtml = (
    <div className="pis-notions">
      {gabarit.surligneur && (
        <button className="btn sm" onClick={copierNotions} disabled={!htmlUrl} style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }}
          title="Cours en texte structuré, passages surlignés en [PRIORITAIRE] — le bouton « Copier pour un prompt » du gabarit">
          <Icon name={notionsCopiees ? 'check' : 'copy'} size={13} /> {notionsCopiees ? 'Cours copié' : 'Copier les notions'}
        </button>
      )}
      <div className="hl-legend">
        {COLORS.map((c) => <span key={c.id}><i style={{ background: c.hex }} />{COLOR_TAG[c.id] || c.short}</span>)}
      </div>
      {marques.length === 0 && <div className="hint">Prends le Surligneur et sélectionne du texte dans le cours : il est surligné.</div>}
      {marques.map((m) => (
        <div className="hl-entry" key={m.i} onClick={() => allerA(m)}>
          <span className="hl-dot" style={{ background: COLOR_HEX[m.couleur] || COLOR_HEX.jaune }} />
          <div>
            {COLOR_TAG[m.couleur] && <div className="hl-entry-page"><span className="hl-entry-tag">{COLOR_TAG[m.couleur]}</span></div>}
            <div className="hl-entry-txt">« {m.texte.length > 140 ? m.texte.slice(0, 140) + '…' : m.texte} »</div>
          </div>
        </div>
      ))}
    </div>
  );

  const actionsDocument = [
    canAddItem && { label: courseExportOk ? 'Copié ✓' : 'Tout exporter (JSON)', icon: 'copy', onClick: exportAllCourse },
    canAddItem && { label: 'Ajouter un item', icon: 'plus', onClick: () => setShowAddItem(true) },
    canAddItem && { label: 'Importer des items', icon: 'upload', onClick: () => { setImportedCount(0); setShowImportItems(true); } },
    canAddItem && { label: 'Prompts (théorie et exercices)', icon: 'layers', onClick: () => setPromptsOuverts(true) },
    !!fiche.pdfId && { label: 'Voir le PDF', icon: 'filePdf', onClick: () => onVoirPdf() },
    // retire le LIEN vers le fichier (la fiche et ses cartes restent) — confirmation
    canAddItem && { label: 'Détacher le cours HTML…', icon: 'x', onClick: () => setDetacher(true) },
  ];

  // indicateur discret d'auto-save — voir performCourseSave/scheduleCourseSave
  const statut = saveStatus !== 'idle' ? (
    <span className="hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 6 }}>
      {saveStatus === 'saving'
        ? <><span className="spinner-sm" /> Enregistrement…</>
        : <><Icon name="check" size={13} style={{ color: 'var(--ok)' }} /> Enregistré</>}
    </span>
  ) : null;

  return (
    <div className={embedded ? 'fadein' : 'screen scroll fadein'}>
      {!embedded && (
        <div className="topbar">
          <div><h1 className="serif">{fiche.titre}</h1><div className="sub">Fiche HTML</div></div>
          <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
        </div>
      )}

      <PdfToolbar
        onClose={close} statut={statut}
        sansPages sansRecherche
        outilsDisponibles={gabarit.surligneur ? ['main', 'surligneur'] : ['main']}
        outil={outil} setOutil={choisirOutil}
        couleurActive={couleurActive} setCouleurActive={setCouleurActive}
        hist={hist}
        search="" setSearch={() => {}} matches={[]} activeMatch={0} searching={false}
        onPrecedent={() => {}} onSuivant={() => {}} onFermerRecherche={() => {}}
        panelOpen={panelOpen} setPanelOpen={setPanelOpen} nbNotions={marques.length}
        actionsDocument={actionsDocument}
      />
      {/* FICHIER ABSENT (ni sur cet appareil, ni au cloud) : on dit lequel, et on
          propose de le rattacher sur place — l'app reste utilisable (cartes, panneau). */}
      {htmlLoadError && (
        <div className="err-mini" style={{ marginBottom: 12 }}>
          <div className="em-ic crit"><Icon name="alert" size={16} /></div>
          <div className="em-body">
            <div className="em-title">{htmlLoadError === 'hors-ligne'
              ? 'Cours HTML pas encore sur cet appareil — tu es hors ligne. Il s’ouvrira dès le retour du réseau.'
              : 'Le cours HTML de cette fiche n’est ni sur cet appareil ni au cloud.'}</div>
            {htmlLoadError !== 'hors-ligne' && (
              <div className="em-sub">{fiche.htmlName ? `Fichier attendu : ${fiche.htmlName}. ` : ''}Si tu as encore le fichier d’origine, rattache-le : tes cartes et tes surlignages ne bougent pas.</div>
            )}
          </div>
          {htmlLoadError !== 'hors-ligne' && onRattacher && (
            <label className="btn sm primary" style={{ cursor: 'pointer', flex: '0 0 auto' }}>
              <Icon name="upload" size={13} /> Rattacher le fichier…
              <input type="file" accept="text/html,.html,.htm" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) onRattacher(f); }} />
            </label>
          )}
        </div>
      )}

      {/* fenêtre étroite : les deux panneaux restent MONTÉS en permanence (l'iframe
          ne recharge jamais au toggle) — seule la visibilité change en CSS via cet
          attribut, voir @media (max-width: 900px) dans etudes.css. */}
      <div className="pdfr-mobile-toggle seg">
        <button type="button" className={'seg-btn' + (mobileView === 'course' ? ' active' : '')} onClick={() => setMobileView('course')}><Icon name="fileHtml" size={13} /> Cours</button>
        <button type="button" className={'seg-btn' + (mobileView === 'items' ? ' active' : '')} onClick={() => { setMobileView('items'); setPanelOpen(true); }}><Icon name="cards" size={13} /> Panneau</button>
      </div>

      <div className="pdfr-workshop" data-mobile-view={mobileView}>
        <div className="pdfr-html-wrap pdfr-workshop-course">
          {!htmlUrl && !htmlLoadError && <div className="gen-spinner" style={{ width: 40, height: 40, margin: '60px auto' }} />}
          {htmlUrl && (
            // allow-scripts : les fiches contiennent leur propre bouton lecture/édition
            // (JS interne) — sans ce token, sandbox="allow-same-origin" seul désactive
            // TOUT script (y compris les onclick inline), rendant ce bouton inerte au
            // clic. Le contenu est intégralement local et auto-généré par l'utilisateur
            // (aucune requête réseau, aucun contenu tiers) : risque borné et accepté.
            <iframe ref={courseIframeRef} src={htmlUrl} title={fiche.titre} sandbox="allow-same-origin allow-scripts" className="pdfr-html-frame" onLoad={onCourseIframeLoad} />
          )}
        </div>
        {/* PANNEAU DE DROITE — le MÊME que sur une fiche PDF */}
        <CourseItemsSidebar ctx={ctx} ficheId={canAddItem ? ficheId : null}
          ongletsEnPlus={[{ id: 'notions', label: 'Notions', icon: 'edit', n: marques.length, contenu: notionsHtml }]}
          ongletInitial={canAddItem ? null : 'notions'}
          replie={!panelOpen} onReplier={(v) => setPanelOpen(!v)} />
      </div>

      {showImportItems && (
        <Modal title="Importer des items" onClose={() => setShowImportItems(false)} width="min(640px, 94vw)">
          <div className="hint" style={{ marginBottom: 12 }}>
            Colle ici le JSON produit par un des 4 prompts de complétion (« Voir les prompts ») —
            les nouvelles cartes (QCM, flashcards, Feynman) sont ajoutées à cette fiche, sans doublon.
          </div>
          <PasteJsonForm ctx={ctx} ficheId={ficheId} done={importedCount} setDone={setImportedCount} />
        </Modal>
      )}
      {showAddItem && canAddItem && (
        <AddItemModal ctx={ctx} ficheId={ficheId} ficheTitre={fiche.titre} onClose={() => setShowAddItem(false)} />
      )}
      {promptsOuverts && <AllPromptsModal ctx={ctx} onClose={() => setPromptsOuverts(false)} />}
      {detacher && (
        <ConfirmModal title="Détacher le cours HTML ?"
          body={`La fiche « ${fiche.titre} » et toutes ses cartes restent. Seul le lien vers le fichier${fiche.htmlName ? ` « ${fiche.htmlName} »` : ''} est retiré ; tu pourras rattacher un fichier plus tard.`}
          confirmLabel="Détacher"
          onConfirm={async () => { setDetacher(false); await ctx.setFicheHtml(ficheId, null); }}
          onCancel={() => setDetacher(false)} />
      )}

      {bulle && createPortal(
        <div className="hl-picker hl-bulle" style={{ left: Math.min(bulle.x, window.innerWidth - 280), top: Math.min(bulle.y + 10, window.innerHeight - 60) }}>
          {COLORS.map((c) => (
            <button key={c.id} type="button" className="hl-swatch-col" title={c.label} onClick={() => agirSurMarque(c.id)}>
              <span className={'hl-swatch' + (bulle.couleur === c.id ? ' selected' : '')} style={{ background: c.hex }} />
            </button>
          ))}
          <span className="hl-picker-sep" />
          <button type="button" className="hl-delete" onClick={() => agirSurMarque('off')}
            title={`Supprimer ce surlignage (annulable par ${RACCOURCI}Z)`}>
            <Icon name="trash" size={13} /> Supprimer
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
