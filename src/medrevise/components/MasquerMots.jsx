/* ============================================================
   MedRevise — « MASQUER DES MOTS » d'une flashcard image (08/10,
   docs/compte-rendu-flashcards-molecules.md).

   L'OCR existant (ocr/ocrImage.js : Tesseract.js de l'app, dans son Web Worker) lit
   l'image ; chaque mot reconnu devient une case à toucher. Les mots choisis deviennent
   des MASQUES (zones rectangulaires de l'occlusion, même format que celles qu'on
   dessine) dont la réponse est le mot lui-même. Des mots voisins sur la même ligne,
   choisis ensemble, forment UN masque (« Grand glutéal »).
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { ocrImage } from '../ocr/ocrImage.js';

const COULEUR = '#8B6FE8';
const genId = () => 'c' + Math.random().toString(36).slice(2, 10);

/** mots choisis → masques (coches de zone), les voisins d'une même ligne fusionnés */
export function masquesDepuisMots(mots, choisis) {
  const parLigne = new Map();
  mots.forEach((m, i) => { if (!choisis.has(i)) return; if (!parLigne.has(m.line)) parLigne.set(m.line, []); parLigne.get(m.line).push(m); });
  const out = [];
  for (const l of parLigne.values()) {
    l.sort((a, b) => a.x - b.x);
    let g = [l[0]];
    const pousser = () => {
      const x0 = Math.min(...g.map((m) => m.x)), y0 = Math.min(...g.map((m) => m.y));
      const x1 = Math.max(...g.map((m) => m.x + m.w)), y1 = Math.max(...g.map((m) => m.y + m.h));
      const px = 0.004, py = 0.006; // un peu de marge : le mot ne dépasse jamais du masque
      const rect = { x: Math.max(0, x0 - px), y: Math.max(0, y0 - py), w: Math.min(1, x1 - x0 + 2 * px), h: Math.min(1, y1 - y0 + 2 * py) };
      const ctr = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
      // mêmes champs qu'une zone dessinée dans l'éditeur (pages/ImportAnatomieVisuel.jsx#addZone)
      out.push({
        id: genId(), kind: 'zone', texte: g.map((m) => m.t).join(' '), couleur: COULEUR,
        zone: { shape: 'rect', rect, fill: COULEUR, fillOpacity: 0.25, stroke: COULEUR, strokeOpacity: 1, strokeWidth: 2 },
        boite: { x: ctr.x, y: Math.max(0, ctr.y - 0.02) }, ancre: ctr,
      });
    };
    for (let k = 1; k < l.length; k++) {
      const prec = g[g.length - 1], m = l[k];
      if (m.x - (prec.x + prec.w) < Math.max(prec.h, m.h) * 1.2) g.push(m); else { pousser(); g = [m]; }
    }
    pousser();
  }
  return out;
}

/** Fenêtre de choix des mots. `image` = { url, w, h } ; onAjouter(coches) */
export function MasquerMots({ image, onAjouter, onFermer }) {
  const [etat, setEtat] = useState('lecture'); // lecture | pret | rien | erreur
  const [mots, setMots] = useState([]);
  const [choisis, setChoisis] = useState(() => new Set());
  useEffect(() => {
    let vivant = true;
    ocrImage({ src: image.url }).then((r) => {
      if (!vivant) return;
      const m = ((r && r.mots) || []).filter((x) => x.t && x.w > 0 && x.h > 0);
      setMots(m); setEtat(m.length ? 'pret' : 'rien');
    }).catch(() => { if (vivant) setEtat('erreur'); });
    return () => { vivant = false; };
  }, [image.url]);
  const basculer = (i) => setChoisis((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const nbMasques = useMemo(() => masquesDepuisMots(mots, choisis).length, [mots, choisis]);
  return (
    <div className="mm" role="dialog" aria-label="Masquer des mots">
      <div className="mm-tete">
        <b>Masquer des mots</b>
        <span className="hint">{etat === 'lecture' ? 'Lecture de l’image…' : etat === 'pret' ? 'Touche les mots à cacher — des mots voisins forment un seul masque.' : etat === 'rien' ? 'Aucun mot reconnu sur cette image.' : 'La lecture a échoué — dessine les masques à la main.'}</span>
        <span style={{ flex: 1 }} />
        {etat === 'pret' && <button type="button" className="linklike" onClick={() => setChoisis(choisis.size === mots.length ? new Set() : new Set(mots.map((_, i) => i)))}>{choisis.size === mots.length ? 'Aucun' : 'Tous'}</button>}
      </div>
      <div className="mm-image" style={{ aspectRatio: `${image.w || 4} / ${image.h || 3}` }}>
        <img src={image.url} alt="" draggable={false} />
        {etat === 'lecture' && <div className="mm-lecture"><span className="mu-sablier" /></div>}
        {mots.map((m, i) => (
          <button key={i} type="button" className={'mm-mot' + (choisis.has(i) ? ' choisi' : '')} title={m.t} aria-pressed={choisis.has(i)}
            style={{ left: m.x * 100 + '%', top: m.y * 100 + '%', width: m.w * 100 + '%', height: m.h * 100 + '%' }}
            onClick={() => basculer(i)} />
        ))}
      </div>
      <div className="imp-actions">
        <span className="hint" style={{ marginRight: 'auto' }}>{choisis.size ? `${choisis.size} mot${choisis.size > 1 ? 's' : ''} → ${nbMasques} masque${nbMasques > 1 ? 's' : ''}` : ''}</span>
        <button type="button" className="btn ghost" onClick={onFermer}>Annuler</button>
        <button type="button" className="btn primary" disabled={!choisis.size} onClick={() => onAjouter(masquesDepuisMots(mots, choisis))}>
          <Icon name="check" size={14} /> Masquer
        </button>
      </div>
    </div>
  );
}
