/* ============================================================
   MedRevise — PANNEAU « EXPORT SPÉCIAL IA » (10/10 soir, pdf/exportIA.js).

   Fichier › « Export spécial IA… » : page courante ou cours entier.
   - Aperçu : le visuel exactement tel qu'il sera exporté (repères compris), page par page ;
   - Télécharger (.zip) : annotations.json + LISEZMOI.txt + visuel.pdf + page-XX.png ;
   - Copier le JSON ; Copier l'image (une page) — à coller directement dans un chat.
   Même facture que les autres panneaux du lecteur (« Mise en page », « Textes d'annotations »).
   Le panneau n'écrit rien : le lecteur fournit `preparer(portee)` et `jsonDe(portee)`.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { zipExportIA } from './exportIA.js';

export function PanneauExportIA({ pageCourante, nbPages, compter, preparer, jsonDe, onFermer }) {
  const [portee, setPortee] = useState('page');
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [apercu, setApercu] = useState(null); // { pngs: [{ nom, url }], etiquettes, nb }
  const ref = useRef(null);
  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape') { if (apercu) fermerApercu(); else onFermer(); } };
    const dehors = (e) => { if (!apercu && ref.current && !ref.current.contains(e.target) && !(e.target.closest && e.target.closest('.mf, .eia-apercu'))) onFermer(); };
    window.addEventListener('keydown', touche);
    window.addEventListener('pointerdown', dehors, true);
    return () => { window.removeEventListener('keydown', touche); window.removeEventListener('pointerdown', dehors, true); };
  });
  const fermerApercu = () => { if (apercu) apercu.pngs.forEach((p) => URL.revokeObjectURL(p.url)); setApercu(null); };
  const n = compter(portee);
  const executer = async (f) => {
    if (occupe) return;
    setOccupe(true); setMessage(null);
    try { setMessage(await f()); } catch (e) { setMessage({ ok: false, texte: 'L’export a échoué : ' + ((e && e.message) || 'erreur inconnue') + '. Rien n’a été modifié.' }); }
    setOccupe(false);
  };
  const telecharger = (blob, nom) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  const actions = {
    apercu: () => executer(async () => {
      const e = await preparer(portee);
      setApercu({ ...e, pngs: e.pngs.map((p) => ({ ...p, url: URL.createObjectURL(p.blob) })) });
      return null;
    }),
    zip: () => executer(async () => {
      const e = await preparer(portee);
      telecharger(await zipExportIA(e), e.base + '.zip');
      return { ok: true, texte: `${e.base}.zip : ${e.nb} boîte${e.nb > 1 ? 's' : ''}, ${e.pngs.length} page${e.pngs.length > 1 ? 's' : ''}.` };
    }),
    json: () => executer(async () => {
      const j = jsonDe(portee);
      await navigator.clipboard.writeText(JSON.stringify(j, null, 2));
      return { ok: true, texte: `JSON copié : ${j.boxes.length} boîte${j.boxes.length > 1 ? 's' : ''}.` };
    }),
    image: () => executer(async () => {
      // promesse passée au presse-papiers tout de suite : le geste de l'utilisateur reste valable
      const prete = preparer('page').then((e) => e.pngs[0].blob);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': prete })]);
      return { ok: true, texte: `Image de la page ${pageCourante} copiée (2× la taille de page).` };
    }),
  };

  return (
    <>
      <div ref={ref} className="mep-panneau ta-panneau eia-panneau" role="dialog" aria-label="Export spécial IA">
        <div className="mep-tete">
          <span className="mep-titre">Export spécial IA</span>
          <button type="button" className="icon-btn sm" onClick={onFermer} title="Fermer (Échap)" aria-label="Fermer"><Icon name="x" size={14} /></button>
        </div>
        <div className="mep-prereglages ta-portee" role="group" aria-label="Portée">
          {[['page', `Page ${pageCourante}`], ['cours', `Cours entier (${nbPages} p.)`]].map(([id, lbl]) => (
            <button key={id} type="button" className={'mep-pre' + (portee === id ? ' actif' : '')} aria-pressed={portee === id}
              onClick={() => { setPortee(id); setMessage(null); }}>{lbl}</button>
          ))}
        </div>
        <div className="ta-corps">
          <p className="ta-aide">{n} boîte{n > 1 ? 's' : ''}. Le visuel montre la page et toutes ses annotations ; chaque boîte y porte son repère (ex. #k3f), aussi écrit dans le JSON. L’IA rend le même JSON, textes corrigés ; réimport par Fichier › Importer des textes d’annotations.</p>
          <div className="ta-actions">
            <button type="button" className="btn sm" disabled={occupe || !n} onClick={actions.apercu}><Icon name="search" size={13} /> Aperçu</button>
            <button type="button" className="btn primary sm" disabled={occupe || !n} onClick={actions.zip}><Icon name="upload" size={13} /> Télécharger (.zip)</button>
          </div>
          <div className="ta-actions">
            <button type="button" className="btn sm" disabled={occupe || !n} onClick={actions.json}><Icon name="copy" size={13} /> Copier le JSON</button>
            {portee === 'page' && <button type="button" className="btn sm" disabled={occupe || !n} onClick={actions.image}><Icon name="image" size={13} /> Copier l’image</button>}
          </div>
          {occupe && <p className="ta-aide">Préparation du visuel…</p>}
        </div>
        {message && <div className={'ta-message' + (message.ok ? ' ok' : ' erreur')} role="status">{message.texte}</div>}
      </div>
      {apercu && createPortal(
        <div className="eia-apercu" role="dialog" aria-label="Aperçu de l’export spécial IA">
          <div className="eia-tete">
            <span className="mep-titre">Aperçu — {apercu.nb} boîte{apercu.nb > 1 ? 's' : ''}, {apercu.pngs.length} page{apercu.pngs.length > 1 ? 's' : ''}</span>
            <span className="eia-legende">Vérifie que chaque repère est dans sa boîte, jamais sur l’image du cours.</span>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn primary sm" onClick={() => { fermerApercu(); actions.zip(); }}><Icon name="upload" size={13} /> Télécharger (.zip)</button>
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
