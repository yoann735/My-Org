/* ============================================================
   MedRevise — PANNEAU « TEXTES D'ANNOTATIONS » (10/10, lib/textesAnnotations.js).

   Fichier › Exporter / Importer des textes d'annotations. Panneau flottant sans voile
   (même facture que « Mise en page ») à trois volets :
   - Exporter : page courante ou cours entier → fichier .json ou presse-papiers ;
   - Importer : fichier ou collage → seul le texte des boîtes retrouvées par id change,
     résumé après import (« 12 boîtes mises à jour, 1 id inconnu ignoré ») ;
   - Affichage : tout afficher en version IA / en version originale (page ou cours).
   Le lecteur fournit les actions (onExporter, onImporter, onBasculer) : ce composant
   n'écrit rien lui-même.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';

export function PanneauTextesAnnotations({ volet: voletInitial = 'exporter', pageCourante, nbPages, compter, onExporter, onImporter, onBasculer, onFermer }) {
  const [volet, setVolet] = useState(voletInitial);
  const [portee, setPortee] = useState('page');
  const [colle, setColle] = useState('');
  const [message, setMessage] = useState(null); // { ok, texte, details? }
  const ref = useRef(null);
  const fichierRef = useRef(null);
  useEffect(() => { setVolet(voletInitial); setMessage(null); }, [voletInitial]);
  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape') onFermer(); };
    const dehors = (e) => { if (ref.current && !ref.current.contains(e.target) && !(e.target.closest && e.target.closest('.mf'))) onFermer(); };
    window.addEventListener('keydown', touche);
    window.addEventListener('pointerdown', dehors, true);
    return () => { window.removeEventListener('keydown', touche); window.removeEventListener('pointerdown', dehors, true); };
  }, [onFermer]);

  const n = compter(portee);
  const libellePortee = portee === 'page' ? `page ${pageCourante}` : 'cours entier';
  const exporter = async (mode) => {
    const r = await onExporter(portee, mode);
    setMessage(r);
  };
  const importer = async (texte) => {
    const r = await onImporter(texte);
    setMessage(r);
    if (r && r.ok) setColle('');
  };
  const lireFichier = (f) => {
    if (!f) return;
    const lecteur = new FileReader();
    lecteur.onload = () => importer(String(lecteur.result || ''));
    lecteur.onerror = () => setMessage({ ok: false, texte: 'Fichier illisible.' });
    lecteur.readAsText(f);
  };
  const basculer = async (version) => setMessage(await onBasculer(portee, version));

  return (
    <div ref={ref} className="mep-panneau ta-panneau" role="dialog" aria-label="Textes d’annotations">
      <div className="mep-tete">
        <span className="mep-titre">Textes d’annotations</span>
        <button type="button" className="icon-btn sm" onClick={onFermer} title="Fermer (Échap)" aria-label="Fermer"><Icon name="x" size={14} /></button>
      </div>
      <div className="ta-volets" role="tablist">
        {[['exporter', 'Exporter'], ['importer', 'Importer'], ['affichage', 'Affichage']].map(([id, lbl]) => (
          <button key={id} type="button" role="tab" aria-selected={volet === id} className={'ta-volet' + (volet === id ? ' actif' : '')}
            onClick={() => { setVolet(id); setMessage(null); }}>{lbl}</button>
        ))}
      </div>
      {volet !== 'importer' && (
        <div className="mep-prereglages ta-portee" role="group" aria-label="Portée">
          {[['page', `Page ${pageCourante}`], ['cours', `Cours entier (${nbPages} p.)`]].map(([id, lbl]) => (
            <button key={id} type="button" className={'mep-pre' + (portee === id ? ' actif' : '')} aria-pressed={portee === id}
              onClick={() => { setPortee(id); setMessage(null); }}>{lbl}</button>
          ))}
        </div>
      )}
      {volet === 'exporter' && (
        <div className="ta-corps">
          <p className="ta-aide">{n.boites} boîte{n.boites > 1 ? 's' : ''} de texte · {libellePortee}. Le fichier ne contient que l’id et le texte de chaque boîte.</p>
          <div className="ta-actions">
            <button type="button" className="btn primary sm" disabled={!n.boites} onClick={() => exporter('fichier')}><Icon name="upload" size={13} /> Exporter le JSON</button>
            <button type="button" className="btn sm" disabled={!n.boites} onClick={() => exporter('copier')}><Icon name="copy" size={13} /> Copier le JSON</button>
          </div>
        </div>
      )}
      {volet === 'importer' && (
        <div className="ta-corps">
          <p className="ta-aide">Seul le texte des boîtes retrouvées par leur id change ; tout le reste reste en place. Le texte d’origine est gardé : bascule « IA / orig. » sur chaque boîte.</p>
          <textarea className="ta-colle" value={colle} onChange={(e) => setColle(e.target.value)} placeholder={'{ "boxes": [ { "id": "…", "text": "…" } ] }'} rows={6} spellCheck={false} />
          <div className="ta-actions">
            <button type="button" className="btn primary sm" disabled={!colle.trim()} onClick={() => importer(colle)}><Icon name="check" size={13} /> Importer le collage</button>
            <button type="button" className="btn sm" onClick={() => fichierRef.current && fichierRef.current.click()}><Icon name="upload" size={13} /> Choisir un fichier…</button>
            <input ref={fichierRef} type="file" accept="application/json,.json,text/plain" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; lireFichier(f); }} />
          </div>
        </div>
      )}
      {volet === 'affichage' && (
        <div className="ta-corps">
          <p className="ta-aide">{n.doubles} boîte{n.doubles > 1 ? 's' : ''} avec deux versions · {libellePortee} ({n.alt} en version IA). Rien n’est supprimé : on peut basculer à l’infini.</p>
          <div className="ta-actions">
            <button type="button" className="btn sm" disabled={!n.doubles} onClick={() => basculer('alt')}>Tout afficher en version IA</button>
            <button type="button" className="btn sm" disabled={!n.doubles} onClick={() => basculer('original')}>Tout afficher en version originale</button>
          </div>
        </div>
      )}
      {message && (
        <div className={'ta-message' + (message.ok ? ' ok' : ' erreur')} role="status">
          {message.texte}
          {message.details && <div className="ta-details">{message.details}</div>}
        </div>
      )}
    </div>
  );
}
