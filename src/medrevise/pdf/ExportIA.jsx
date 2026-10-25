/* ============================================================
   MedRevise — PANNEAU « EXPORT SPÉCIAL IA » (10/10 soir ; PDF unique le 11/10, pdf/exportIA.js).

   Fichier › « Export spécial IA… » : page courante ou cours entier.
   - Télécharger (PDF + JSON) : `<cours>-export-ia.pdf` (une page par page de cours, image de la
     page annotée avec ses repères + couche texte invisible), annotations.json et LISEZMOI.txt ;
   - PNG par page (.zip) : annotations.json + LISEZMOI.txt + page-XX.png ;
   - Aperçu : le visuel exactement tel qu'il sera exporté, page par page ;
   - Copier le JSON ; Copier l'image (une page) — à coller directement dans un chat.
   Génération page par page : barre de progression et « Annuler », l'interface ne fige pas.
   Le panneau n'écrit rien : le lecteur fournit `preparer(portee)` (source, pdf/exportIA.js) et `jsonDe(portee)`.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { ChoixPages } from './ChoixPages.jsx';
import { pdfIA, pngsIA, zipPngsIA, lisezmoiIA, ExportAnnule, DPI_REPLI } from './exportIA.js';

const mo = (o) => (o / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo';
const ko = (o) => Math.round(o / 1024).toLocaleString('fr-FR') + ' Ko';

/* `extras` (15/10) : [{ label, icon, title, onClick }] — « Copier les notions », « Cours complet
   (JSON) », « Prompts » : des sorties pour une IA qui étaient des entrées à part du menu Fichier */
export function PanneauExportIA({ pageCourante, nbPages, compter, preparer, jsonDe, onFermer, extras = [], coursId = null }) {
  // (25/10, docs/compte-rendu-boites-tableaux.md §4) la portée = les pages choisies (pdf/ChoixPages.jsx), comme tous les exports
  const [portee, setPortee] = useState([Math.max(0, pageCourante - 1)]);
  const [erreurPages, setErreurPages] = useState(null);
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [progres, setProgres] = useState(null); // { etape, fait, total }
  const [apercu, setApercu] = useState(null); // { pngs: [{ nom, url }], nb }
  const ref = useRef(null);
  const annulation = useRef(null);
  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape') { if (apercu) fermerApercu(); else if (!occupe) onFermer(); } };
    const dehors = (e) => { if (!apercu && !occupe && ref.current && !ref.current.contains(e.target) && !(e.target.closest && e.target.closest('.mf, .eia-apercu, .day-pop-scrim'))) onFermer(); };
    window.addEventListener('keydown', touche);
    window.addEventListener('pointerdown', dehors, true);
    return () => { window.removeEventListener('keydown', touche); window.removeEventListener('pointerdown', dehors, true); };
  });
  useEffect(() => () => { if (annulation.current) annulation.current.abort(); }, []); // panneau fermé : génération arrêtée
  const fermerApercu = () => { if (apercu) apercu.pngs.forEach((p) => URL.revokeObjectURL(p.url)); setApercu(null); };
  const n = portee ? compter(portee) : 0;
  const unePage = !!portee && portee.length === 1;
  const executer = async (f) => {
    if (occupe) return;
    const ctrl = new AbortController();
    annulation.current = ctrl;
    setOccupe(true); setMessage(null); setProgres({ etape: 'Préparation des annotations…', fait: 0, total: 0 });
    try { setMessage(await f(ctrl.signal)); } catch (e) {
      setMessage(e instanceof ExportAnnule || ctrl.signal.aborted ? { ok: false, texte: 'Export annulé : aucun fichier téléchargé.' }
        : { ok: false, texte: 'L’export a échoué : ' + ((e && e.message) || 'erreur inconnue') + '. Rien n’a été modifié.' });
    }
    annulation.current = null;
    setOccupe(false); setProgres(null);
  };
  const suivre = (etape) => (fait, total) => setProgres({ etape, fait, total });
  const telecharger = (blob, nom) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const actions = {
    apercu: () => executer(async (signal) => {
      const s = await preparer(portee);
      const pngs = await pngsIA(s, { signal, onProgres: suivre('Aperçu') });
      setApercu({ nb: s.nb, pngs: pngs.map((p) => ({ ...p, url: URL.createObjectURL(p.blob) })) });
      return null;
    }),
    pdf: () => executer(async (signal) => {
      const s = await preparer(portee);
      if (signal.aborted) throw new ExportAnnule();
      const r = await pdfIA(s, { signal, onProgres: suivre('Pages du PDF') });
      const nomPdf = s.base + '.pdf';
      // PDF + annotations.json + LISEZMOI.txt, ensemble (trois téléchargements du même clic)
      telecharger(new Blob([r.octets], { type: 'application/pdf' }), nomPdf);
      await pause(250);
      telecharger(new Blob([JSON.stringify(s.json, null, 2)], { type: 'application/json' }), 'annotations.json');
      await pause(250);
      telecharger(new Blob([lisezmoiIA(nomPdf)], { type: 'text/plain;charset=utf-8' }), 'LISEZMOI.txt');
      const moy = r.poidsPages.reduce((a, b) => a + b, 0) / Math.max(1, r.poidsPages.length);
      const repli = r.dpi === DPI_REPLI ? ` Plus de 40 Mo à 150 dpi : refait à ${DPI_REPLI} dpi.`
        : r.pagesRepli.length ? ` Page${r.pagesRepli.length > 1 ? 's' : ''} ${r.pagesRepli.join(', ')} : plus de 1 Mo à 150 dpi, refaite${r.pagesRepli.length > 1 ? 's' : ''} à ${DPI_REPLI} dpi.` : '';
      return { ok: true, texte: `${nomPdf} : ${r.nbPages} page${r.nbPages > 1 ? 's' : ''}, ${mo(r.octets.length)} (≈ ${ko(moy)} par page, ${r.pagesRepli.length === r.nbPages ? DPI_REPLI : r.dpi} dpi) · annotations.json : ${s.nb} boîte${s.nb > 1 ? 's' : ''} · LISEZMOI.txt.${repli}`, poids: r.octets.length, dpi: r.dpi };
    }),
    png: () => executer(async (signal) => {
      const s = await preparer(portee);
      const pngs = await pngsIA(s, { signal, onProgres: suivre('Images PNG') });
      telecharger(await zipPngsIA(s, pngs), s.base + '-png.zip');
      return { ok: true, texte: `${s.base}-png.zip : ${pngs.length} PNG (2× la taille de page), annotations.json, LISEZMOI.txt.` };
    }),
    json: () => executer(async () => {
      const j = jsonDe(portee);
      await navigator.clipboard.writeText(JSON.stringify(j, null, 2));
      return { ok: true, texte: `JSON copié : ${j.boxes.length} boîte${j.boxes.length > 1 ? 's' : ''}.` };
    }),
    image: () => executer(async () => {
      // promesse passée au presse-papiers tout de suite : le geste de l'utilisateur reste valable
      const prete = preparer(portee).then((s) => pngsIA(s)).then((p) => p[0].blob);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': prete })]);
      return { ok: true, texte: `Image de la page ${portee[0] + 1} copiée (2× la taille de page).` };
    }),
  };
  const pct = progres && progres.total ? Math.round((100 * progres.fait) / progres.total) : 0;

  return (
    <>
      <div ref={ref} className="mep-panneau ta-panneau eia-panneau" role="dialog" aria-label="Export spécial IA">
        <div className="mep-tete">
          <span className="mep-titre">Export spécial IA</span>
          <button type="button" className="icon-btn sm" onClick={onFermer} title="Fermer (Échap)" aria-label="Fermer"><Icon name="x" size={14} /></button>
        </div>
        <div className="eia-pages-choix">
          <ChoixPages coursId={coursId} nbPages={nbPages} pageCourante={pageCourante} desactive={occupe}
            onPages={(p, err) => { setPortee(p); setErreurPages(err); setMessage(null); }} />
        </div>
        <div className="ta-corps">
          <p className="ta-aide">{n} boîte{n > 1 ? 's' : ''}. Le PDF montre chaque page avec toutes ses annotations ; chaque boîte y porte son repère (ex. #k3f), aussi écrit dans le JSON et, invisible, dans le texte du PDF. L’IA rend le même JSON, textes corrigés ; réimport par Fichier › Importer des textes d’annotations.</p>
          <div className="ta-actions">
            <button type="button" className="btn primary sm" disabled={occupe || !n || !portee} onClick={actions.pdf} title="Le PDF (une page par page de cours, repères visibles + texte invisible), annotations.json et LISEZMOI.txt"><Icon name="upload" size={13} /> Télécharger (PDF + JSON)</button>
            <button type="button" className="btn sm" disabled={occupe || !n || !portee} onClick={actions.png} title="Un PNG par page (2× la taille de page), avec annotations.json, dans un .zip"><Icon name="image" size={13} /> PNG par page</button>
          </div>
          <div className="ta-actions">
            <button type="button" className="btn sm" disabled={occupe || !n || !portee} onClick={actions.apercu}><Icon name="search" size={13} /> Aperçu</button>
            <button type="button" className="btn sm" disabled={occupe || !n || !portee} onClick={actions.json}><Icon name="copy" size={13} /> Copier le JSON</button>
            {unePage && <button type="button" className="btn sm" disabled={occupe || !n || !portee} onClick={actions.image}><Icon name="image" size={13} /> Copier l’image</button>}
          </div>
          {progres && (
            <div className="eia-progres" role="progressbar" aria-valuemin={0} aria-valuemax={progres.total || 1} aria-valuenow={progres.fait} aria-label="Progression de l’export">
              <div className="eia-progres-ligne">
                <span>{progres.total ? `${progres.etape} : ${progres.fait} / ${progres.total}` : progres.etape}</span>
                <button type="button" className="btn ghost sm" onClick={() => annulation.current && annulation.current.abort()}>Annuler</button>
              </div>
              <div className="eia-barre"><span style={{ width: (progres.total ? pct : 4) + '%' }} /></div>
            </div>
          )}
        </div>
        {message && <div className={'ta-message' + (message.ok ? ' ok' : ' erreur')} role="status">{message.texte}</div>}
        {extras.filter(Boolean).length > 0 && (
          <div className="ta-corps eia-extras">
            <p className="ta-aide">Aussi pour une IA, sur tout le cours :</p>
            <div className="ta-actions">
              {extras.filter(Boolean).map((x) => (
                <button key={x.label} type="button" className="btn sm" disabled={occupe} onClick={x.onClick} title={x.title}><Icon name={x.icon || 'copy'} size={13} /> {x.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      {apercu && createPortal(
        <div className="eia-apercu" role="dialog" aria-label="Aperçu de l’export spécial IA">
          <div className="eia-tete">
            <span className="mep-titre">Aperçu — {apercu.nb} boîte{apercu.nb > 1 ? 's' : ''}, {apercu.pngs.length} page{apercu.pngs.length > 1 ? 's' : ''}</span>
            <span className="eia-legende">Vérifie que chaque repère est dans sa boîte, jamais sur l’image du cours.</span>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn primary sm" onClick={() => { fermerApercu(); actions.pdf(); }}><Icon name="upload" size={13} /> Télécharger (PDF + JSON)</button>
            <button type="button" className="icon-btn sm" onClick={fermerApercu} title="Fermer (Échap)" aria-label="Fermer l’aperçu"><Icon name="x" size={14} /></button>
          </div>
          <div className="eia-pages">
            {apercu.pngs.map((p) => (
              <figure key={p.nom} className="eia-page">
                <img src={p.url} alt={`Page ${p.numero} avec repères`} />
                <figcaption>{p.nom}</figcaption>
              </figure>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
