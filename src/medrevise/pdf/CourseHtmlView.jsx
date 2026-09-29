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
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop, Modal } from '../components/ui.jsx';
import { getBlob, putBlob, putBlobAt } from '../lib/storage.js';
import { PasteJsonForm } from '../components/AddItemForm.jsx';
import { CourseItemsSidebar } from '../components/CourseItemsSidebar.jsx';
import { CoursePromptsButton } from '../components/CoursePromptsMenu.jsx';
import { buildCourseExport } from '../lib/courseExport.js';
import { serializeCourseHtml } from '../lib/courseHtmlSave.js';

export function CourseHtmlView({ ctx, fiche, ficheId, canAddItem, embedded, close, onVoirPdf }) {
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
      if (!blob) { setHtmlLoadError('Fichier HTML introuvable.'); return; }
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
    const observer = new MutationObserver(scheduleCourseSave);
    observer.observe(target, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'data-hl'] });
    observerRef.current = observer;
  };
  useEffect(() => () => {
    clearTimeout(saveTimerRef.current);
    if (observerRef.current) observerRef.current.disconnect();
  }, []);

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
    // atelier "Voir le cours" : cours (iframe) + sidebar d'items persistante côte
    // à côte — remplace l'ancien bouton "Ajouter un item" en modale (qui masquait
    // le cours) par CourseItemsSidebar, intégrée, jamais superposée. `canAddItem`
    // (vraie fiche db.fiches, pas un docProp générique) régit aussi l'affichage
    // de la sidebar : elle n'a de sens que pour une fiche réelle avec des items.
    return (
      <div className={embedded ? 'fadein' : 'screen scroll fadein'}>
        {!embedded && (
          <div className="topbar">
            <div><h1 className="serif">{fiche.titre}</h1><div className="sub">Fiche HTML</div></div>
            <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
          </div>
        )}
        <div className="pdfr-toolbar">
          <button className="btn ghost sm" onClick={close}><Icon name="chevL" size={14} /> Retour</button>
          {!!fiche.pdfId && (
            <button className="btn ghost sm" onClick={() => onVoirPdf()}><Icon name="filePdf" size={13} /> Voir le PDF</button>
          )}
          {/* indicateur discret d'auto-save — voir performCourseSave/scheduleCourseSave */}
          {saveStatus !== 'idle' && (
            <span className="hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {saveStatus === 'saving'
                ? <><span className="spinner-sm" /> Enregistrement…</>
                : <><Icon name="check" size={13} style={{ color: 'var(--ok)' }} /> Enregistré</>}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {canAddItem && (
            <button className="btn sm" onClick={exportAllCourse} disabled={!htmlUrl} title="Cours + surlignages + cartes déjà créées, en un JSON prêt pour un prompt externe">
              <Icon name={courseExportOk ? 'check' : 'copy'} size={13} /> {courseExportOk ? 'Copié ✓' : 'Tout exporter'}
            </button>
          )}
          {canAddItem && <CoursePromptsButton ctx={ctx} />}
          {canAddItem && <CoursePromptsButton ctx={ctx} kind="pratique" />}
          {canAddItem && (
            <button className="btn ghost sm" onClick={() => { setImportedCount(0); setShowImportItems(true); }} title="Coller le JSON produit par un prompt de complétion — ajoute les nouvelles cartes à cette fiche">
              <Icon name="upload" size={13} /> Importer des items
            </button>
          )}
        </div>
        {htmlLoadError && <div className="err-mini" style={{ marginBottom: 12 }}><div className="em-ic crit"><Icon name="alert" size={16} /></div><div className="em-body"><div className="em-title">{htmlLoadError}</div></div></div>}

        {canAddItem && (
          // fenêtre étroite : les deux panneaux restent MONTÉS en permanence (l'iframe
          // ne recharge jamais au toggle) — seule la visibilité change en CSS via cet
          // attribut, voir @media (max-width: 900px) dans etudes.css.
          <div className="pdfr-mobile-toggle seg">
            <button type="button" className={'seg-btn' + (mobileView === 'course' ? ' active' : '')} onClick={() => setMobileView('course')}><Icon name="fileHtml" size={13} /> Cours</button>
            <button type="button" className={'seg-btn' + (mobileView === 'items' ? ' active' : '')} onClick={() => setMobileView('items')}><Icon name="cards" size={13} /> Items</button>
          </div>
        )}

        <div className={'pdfr-workshop' + (canAddItem ? '' : ' single')} data-mobile-view={mobileView}>
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
          {canAddItem && <CourseItemsSidebar ctx={ctx} ficheId={ficheId} />}
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
      </div>
    );
}
