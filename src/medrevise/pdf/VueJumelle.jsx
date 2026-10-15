/* ============================================================
   MedRevise — « LES DEUX » : l'autre document de la fiche jumelle, À CÔTÉ du lecteur (15/10,
   docs/compte-rendu-fiche-jumelle.md).

   Le lecteur principal garde le document actif (outils, annotations) ; ce panneau montre
   l'autre — original ou fiche — en LECTURE, avec son propre calque d'annotations, ajusté à
   sa largeur. Les deux défilent ensemble PAGE À PAGE : quand le lecteur passe à la page n,
   ce panneau va à la page correspondante (même position relative dans la page), et
   inversement quand on fait défiler ce panneau. « Annoter ce côté » échange les rôles.
   Rendu virtualisé (pages proches de l'écran seulement), comme le lecteur.
   ============================================================ */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { getAll, getBlob } from '../lib/storage.js';
import { separerParType } from '../lib/annotationTypes.js';
import { openPdf } from './pdfjsSetup.js';
import { PdfPageContent } from './PdfPage.jsx';
import { GAP, EMPTY_ARRAY, useDevicePixelRatio, compareHighlights } from './pdfShared.js';

const parPage = (liste) => { const m = {}; (liste || []).forEach((a) => { (m[a.page] = m[a.page] || []).push(a); }); return m; };
const rien = () => {};

/** `cible` : { page, fraction, n } — la page à montrer (n change à chaque demande) ;
    `onDefile(page, fraction)` : l'utilisateur a fait défiler CE panneau. */
export function VueJumelle({ pdfId, ns, libelle, cible, onDefile, onAnnoterIci, docCache }) {
  const [doc, setDoc] = useState(null);
  const [tailles, setTailles] = useState([]);
  const [erreur, setErreur] = useState(null);
  useEffect(() => {
    let annule = false;
    setDoc(null); setTailles([]); setErreur(null);
    (async () => {
      try {
        const deja = docCache && docCache.get(pdfId);
        let d = deja && deja.doc, sz = deja && deja.sizes;
        if (!d) {
          const blob = await getBlob(pdfId);
          if (!blob) { if (!annule) setErreur('Fichier pas encore disponible sur cet appareil.'); return; }
          d = await openPdf(await blob.arrayBuffer());
          sz = [];
          for (let i = 1; i <= d.numPages; i++) { const vp = (await d.getPage(i)).getViewport({ scale: 1 }); sz.push({ width: vp.width, height: vp.height }); }
          if (docCache) docCache.set(pdfId, { doc: d, sizes: sz });
        }
        if (!annule) { setDoc(d); setTailles(sz); }
      } catch (e) { if (!annule) setErreur('Impossible de lire ce PDF.'); }
    })();
    return () => { annule = true; };
  }, [pdfId]); // eslint-disable-line react-hooks/exhaustive-deps

  // annotations du document (lecture), relues à chaque synchro
  const [annots, setAnnots] = useState({ hs: [], ans: [] });
  useEffect(() => {
    let vivant = true;
    const relire = async () => {
      const [hs, ans] = await Promise.all([getAll('highlights'), getAll('annotations')]);
      if (vivant) setAnnots({ hs: hs.filter((h) => h.ficheId === ns && !h.convertieEnFlux).sort(compareHighlights), ans: ans.filter((a) => a.ficheId === ns && !a.convertieEnFlux) });
    };
    relire();
    window.addEventListener('medrevise:recharge', relire);
    const t = setInterval(relire, 4000); // annotations posées de l'autre côté juste avant l'échange
    return () => { vivant = false; window.removeEventListener('medrevise:recharge', relire); clearInterval(t); };
  }, [ns]);
  const types = useMemo(() => separerParType([], annots.ans), [annots]);
  const par = useMemo(() => ({
    hl: parPage(annots.hs), bloc: parPage(types.bloc), boite: parPage(types.boite), trait: parPage([...types.trait, ...types.surligneur]),
    texte: parPage(types.texte), question: parPage(types.question), image: parPage(types.image), forme: parPage(types.forme),
  }), [annots, types]);

  // échelle : ajustée à la largeur du panneau (mesure immédiate + ResizeObserver)
  const zoneRef = useRef(null);
  const [largeur, setLargeur] = useState(0);
  useLayoutEffect(() => {
    const el = zoneRef.current; if (!el) return undefined;
    const mesurer = () => setLargeur(el.clientWidth);
    mesurer();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(mesurer); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const maxL = tailles.reduce((m, s) => Math.max(m, s.width), 0);
  const scale = maxL && largeur ? Math.max(0.2, (largeur - 28) / maxL) : 1;
  const offsets = useMemo(() => { const o = []; let y = 0; tailles.forEach((s) => { o.push(y); y += (s.height + GAP) * scale; }); return { o, total: Math.max(0, y - GAP * scale) }; }, [tailles, scale]);
  const dpr = useDevicePixelRatio();

  // pages montées : celles proches de l'écran
  const [vue, setVue] = useState({ debut: 0, fin: 1 });
  const mesurerVue = () => {
    const el = zoneRef.current; if (!el || !offsets.o.length) return;
    const haut = el.scrollTop - el.clientHeight, bas = el.scrollTop + el.clientHeight * 2;
    let d = 0, f = 0;
    offsets.o.forEach((y, i) => { if (y + tailles[i].height * scale < haut) d = i + 1; if (y <= bas) f = i; });
    setVue((v) => (v.debut === d && v.fin === f ? v : { debut: d, fin: f }));
  };
  useEffect(mesurerVue, [offsets]); // eslint-disable-line react-hooks/exhaustive-deps

  // SYNCHRO : le lecteur demande une page → on y va (sauf si l'utilisateur fait défiler ICI)
  const parMoi = useRef(0); // horodatage du dernier défilement fait à la main dans ce panneau
  const parProg = useRef(0); // horodatage du dernier défilement posé par programme
  useLayoutEffect(() => {
    const el = zoneRef.current;
    if (!el || !cible || !offsets.o.length || performance.now() - parMoi.current < 400) return;
    const i = Math.max(0, Math.min(tailles.length - 1, cible.page - 1));
    parProg.current = performance.now();
    el.scrollTop = Math.max(0, offsets.o[i] + (cible.fraction || 0) * tailles[i].height * scale - 8);
    mesurerVue();
  }, [cible && cible.n, offsets]); // eslint-disable-line react-hooks/exhaustive-deps
  const raf = useRef(null);
  const auDefilement = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      mesurerVue();
      const el = zoneRef.current; if (!el || !offsets.o.length) return;
      if (performance.now() - parProg.current < 250) return; // c'est nous qui avons défilé
      parMoi.current = performance.now();
      const ligne = el.scrollTop + 8;
      let i = 0; offsets.o.forEach((y, k) => { if (y <= ligne) i = k; });
      const h = tailles[i].height * scale;
      onDefile && onDefile(i + 1, Math.max(0, Math.min(1, (ligne - offsets.o[i]) / h)));
    });
  };

  return (
    <div className="vj">
      <div className="vj-entete">
        <span className="vj-titre"><Icon name="filePdf" size={13} /> {libelle} <span className="vj-lecture">· lecture</span></span>
        {onAnnoterIci && <button type="button" className="btn ghost sm" onClick={onAnnoterIci} title="Échanger : ce document passe dans le lecteur, avec les outils">Annoter ce côté</button>}
      </div>
      <div className="vj-zone" ref={zoneRef} onScroll={auDefilement}>
        {erreur && <div className="hint" style={{ padding: 16 }}>{erreur}</div>}
        {!doc && !erreur && <div className="gen-spinner" style={{ width: 32, height: 32, margin: '40px auto' }} />}
        {doc && (
          <div className="vj-pages" style={{ height: offsets.total }}>
            {tailles.map((s, i) => {
              const n = i + 1;
              const w = s.width * scale, h = s.height * scale;
              return (
                <div key={n} className="pdfr-page vj-page" data-page={n} style={{ position: 'absolute', top: offsets.o[i], left: '50%', marginLeft: -w / 2, width: w, height: h }}>
                  {i >= vue.debut && i <= vue.fin && (
                    <PdfPageContent pdfDoc={doc} pageNum={n} scale={scale} dpr={dpr} pageHeight={h} pageWidth={w}
                      highlights={par.hl[n] || EMPTY_ARRAY} edits={par.bloc[n] || EMPTY_ARRAY} boites={par.boite[n] || EMPTY_ARRAY}
                      traits={par.trait[n] || EMPTY_ARRAY} textes={par.texte[n] || EMPTY_ARRAY} questions={par.question[n] || EMPTY_ARRAY}
                      images={par.image[n] || EMPTY_ARRAY} formes={par.forme[n] || EMPTY_ARRAY}
                      outil="main" activeEditId={null} matches={EMPTY_ARRAY} activeMatchIdx={-1}
                      onCreateHighlight={rien} onActivateEdit={rien} onCreerBoite={rien} onMajBoite={rien} onSupprimerBoite={rien} onModifierBoite={rien}
                      onCreerTrait={rien} onSupprimerTraits={rien} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
