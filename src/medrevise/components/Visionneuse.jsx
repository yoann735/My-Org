/* ============================================================
   MedRevise — VISIONNEUSE D'IMAGE PLEIN ÉCRAN (07/11, docs/compte-rendu-compteur-vues-et-zoom-image.md).
   LE SEUL visualiseur d'image des cartes : image d'une flashcard (recto / verso), image à masques (dans l'état
   affiché : masques visibles s'ils le sont), image d'une carte Muscle (components/ImagesMuscle.jsx, qui y ajoute ses
   outils « Texte » / « Copier le texte »). Tous les écrans de révision (séance, mode Apprentissage, aperçus) passent ici.
   - fond noir, image centrée ; zoom au pincement, double-tap / double-clic (×2,5, jusqu'à ×5), molette, + / − / 0 ;
     déplacement au doigt (ou à la souris) quand on est zoomé ;
   - fermeture : croix en haut à droite, glissé vers le bas, Échap, tap sur le fond ; ouverture / fermeture ~120 ms ;
   - ISOLÉE de la carte : aucun événement (clic, toucher, clavier) ne remonte à la carte qui l'a ouverte — elle ne se
     retourne pas, rien n'est noté. Ouverte, seuls Échap et le zoom agissent ; fermée, les raccourcis reviennent.
   `useAgrandir({ actif, titre, rendu })` : les props à poser sur l'image cliquable + la visionneuse à afficher.
   ============================================================ */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import '../../styles/visionneuse.css';

const ZOOM_MAX = 5;
const ZOOM_DOUBLE = 2.5;
const DUREE = 120;
const stop = (e) => e.stopPropagation();

/** visionneuse ouverte en ce moment ? (pour les écrans qui écoutent le clavier en phase de capture) */
export const visionneuseOuverte = () => typeof document !== 'undefined' && !!document.querySelector('.vz-fond');

export function Visionneuse({ titre = 'Image', onFermer, outils = null, gestes = true, children }) {
  const [vue, setVueBrut] = useState({ s: 1, x: 0, y: 0 });
  const [anim, setAnim] = useState(false);
  const [sortie, setSortie] = useState(false);
  const [descente, setDescente] = useState(0);
  const fond = useRef(null), scene = useRef(null), contenu = useRef(null);
  const vueRef = useRef(vue);
  const pts = useRef(new Map());
  const geste = useRef(null);
  const dernierTap = useRef(null);
  const fermee = useRef(false);
  const gestesRef = useRef(gestes); gestesRef.current = gestes;

  const borner = useCallback(({ s, x, y }) => {
    const z = Math.min(ZOOM_MAX, Math.max(1, s));
    const el = contenu.current, sc = scene.current;
    if (!el || !sc) return { s: z, x, y };
    const mx = Math.max(0, (el.offsetWidth * z - sc.clientWidth) / 2 + 24), my = Math.max(0, (el.offsetHeight * z - sc.clientHeight) / 2 + 24);
    return z <= 1.001 ? { s: 1, x: 0, y: 0 } : { s: z, x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
  }, []);
  const poser = useCallback((v, animer = false) => { vueRef.current = v; setAnim(animer); setVueBrut(v); }, []);
  /** zoom vers `s1` autour du point (px, py) exprimé depuis le centre de la scène */
  const zoomer = useCallback((s1, px = 0, py = 0, animer = true) => {
    const v = vueRef.current; const z = Math.min(ZOOM_MAX, Math.max(1, s1)); const k = z / v.s;
    poser(borner({ s: z, x: px - (px - v.x) * k, y: py - (py - v.y) * k }), animer);
  }, [borner, poser]);
  const depuisCentre = (cx, cy) => { const r = scene.current.getBoundingClientRect(); return [cx - (r.left + r.width / 2), cy - (r.top + r.height / 2)]; };

  const fermer = useCallback(() => {
    if (fermee.current) return; fermee.current = true;
    setSortie(true); setTimeout(() => onFermer && onFermer(), DUREE);
  }, [onFermer]);

  // clavier : TOUT est arrêté en phase de capture (les raccourcis de la séance ne voient rien) ; Échap ferme, + − 0 zooment
  useEffect(() => {
    const avant = document.activeElement;
    if (fond.current) fond.current.focus({ preventScroll: true });
    const k = (e) => {
      e.stopPropagation();
      const dedans = fond.current && fond.current.contains(e.target);
      if (e.type === 'keyup') { if (!dedans) e.preventDefault(); return; }
      if (e.key === 'Escape') { e.preventDefault(); fermer(); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomer(vueRef.current.s * 1.5); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomer(vueRef.current.s / 1.5); }
      else if (e.key === '0') { e.preventDefault(); poser({ s: 1, x: 0, y: 0 }, true); }
      else if (e.key === 'Tab') { /* le focus reste libre */ }
      else if (!(dedans && (e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('button'))) e.preventDefault();
    };
    const pasDeZoomPage = (e) => e.preventDefault(); // Safari iOS : pas de zoom de la page sous la visionneuse
    window.addEventListener('keydown', k, true); window.addEventListener('keyup', k, true);
    document.addEventListener('gesturestart', pasDeZoomPage);
    return () => {
      window.removeEventListener('keydown', k, true); window.removeEventListener('keyup', k, true);
      document.removeEventListener('gesturestart', pasDeZoomPage);
      if (avant && avant.focus && document.contains(avant)) { try { avant.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    };
  }, [fermer, zoomer, poser]);

  // molette / pincement du trackpad (non passif : on empêche le défilement de la page)
  useEffect(() => {
    const el = scene.current;
    if (!el) return undefined;
    const roue = (e) => {
      if (!gestesRef.current) return;
      e.preventDefault();
      const [px, py] = depuisCentre(e.clientX, e.clientY);
      zoomer(vueRef.current.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)), px, py, false);
    };
    el.addEventListener('wheel', roue, { passive: false });
    return () => el.removeEventListener('wheel', roue);
  }, [zoomer]);

  // un redimensionnement (rotation du téléphone) : la vue reste dans ses bornes
  useLayoutEffect(() => {
    const r = () => poser(borner(vueRef.current));
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, [borner, poser]);

  const surContenu = (t) => !!(contenu.current && t && contenu.current.contains(t));

  const bas = (e) => {
    if (e.button != null && e.button > 0) return;
    if (!gestes) { geste.current = { type: 'clic', cible: e.target, x0: e.clientX, y0: e.clientY, t0: Date.now() }; return; }
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 1) {
      geste.current = { type: 'un', cible: e.target, x0: e.clientX, y0: e.clientY, t0: Date.now(), v0: vueRef.current, bouge: false };
    } else if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      const [mx, my] = depuisCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
      geste.current = { type: 'pince', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx, my, v0: vueRef.current };
      setDescente(0);
    }
  };
  const bouge = (e) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = geste.current;
    if (!g) return;
    if (g.type === 'pince' && pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()];
      const [mx, my] = depuisCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
      const s1 = Math.min(ZOOM_MAX, Math.max(1, (g.v0.s * Math.hypot(a.x - b.x, a.y - b.y)) / g.d0));
      const k = s1 / g.v0.s;
      poser({ s: s1, x: mx - (g.mx - g.v0.x) * k, y: my - (g.my - g.v0.y) * k });
      return;
    }
    if (g.type !== 'un') return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.bouge && Math.hypot(dx, dy) > 6) g.bouge = true;
    if (!g.bouge) return;
    if (g.v0.s > 1.001) poser(borner({ s: g.v0.s, x: g.v0.x + dx, y: g.v0.y + dy }));
    else if (dy > 0 && Math.abs(dy) > Math.abs(dx)) { g.descend = true; setDescente(dy); }
    else if (g.descend) setDescente(Math.max(0, dy));
  };
  const haut = (e) => {
    const g = geste.current;
    if (g && g.type === 'clic') { // gestes coupés (texte sélectionnable) : seul le tap sur le fond ferme
      geste.current = null;
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 8 && !surContenu(g.cible)) fermer();
      return;
    }
    if (!pts.current.has(e.pointerId)) return;
    pts.current.delete(e.pointerId);
    if (!g) return;
    if (g.type === 'pince') {
      if (pts.current.size === 1) { // il reste un doigt : il déplace
        const [p] = [...pts.current.values()];
        geste.current = { type: 'un', cible: null, x0: p.x, y0: p.y, t0: 0, v0: vueRef.current, bouge: true };
      } else if (pts.current.size === 0) { geste.current = null; poser(borner(vueRef.current), true); }
      return;
    }
    if (pts.current.size) return;
    geste.current = null;
    if (g.descend) {
      if (descente > 90) { setDescente(Math.max(descente, 120)); fermer(); } else { setAnim(true); setDescente(0); }
      return;
    }
    if (g.bouge || Date.now() - g.t0 > 400) return;
    // un TAP : double (zoom) ou simple (fond → ferme)
    const t = Date.now(), d = dernierTap.current;
    if (d && t - d.t < 320 && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 30) {
      dernierTap.current = null;
      const [px, py] = depuisCentre(e.clientX, e.clientY);
      if (vueRef.current.s > 1.05) poser({ s: 1, x: 0, y: 0 }, true); else zoomer(ZOOM_DOUBLE, px, py, true);
      return;
    }
    dernierTap.current = { t, x: e.clientX, y: e.clientY };
    if (!surContenu(g.cible) && vueRef.current.s <= 1.001) fermer();
  };
  const annule = (e) => { pts.current.delete(e.pointerId); if (!pts.current.size) { geste.current = null; poser(borner(vueRef.current), true); if (descente) { setAnim(true); setDescente(0); } } };

  const opacite = descente ? Math.max(0.25, 1 - descente / 400) : 1;
  return createPortal(
    <div ref={fond} className={'vz-fond' + (sortie ? ' sortie' : '')} role="dialog" aria-modal="true" aria-label={titre} tabIndex={-1} data-visionneuse=""
      data-zoom={Math.round(vue.s * 100) / 100}
      style={{ '--vz-fond-opacite': opacite }}
      // AUCUN événement ne remonte (le portail est rendu DANS la carte côté React : sans cet arrêt, un clic la retournerait)
      onClick={stop} onDoubleClick={stop} onPointerDown={stop} onPointerUp={stop} onMouseDown={stop} onMouseUp={stop}
      onTouchStart={stop} onTouchEnd={stop} onKeyDown={stop} onKeyUp={stop} onContextMenu={stop}>
      <div className="vz-barre">
        <span className="vz-titre">{titre}</span>
        <span style={{ flex: 1 }} />
        {outils}
        <button type="button" className="vz-fermer" onClick={fermer} aria-label="Fermer l’image" title="Fermer (Échap)" data-vz="fermer"><Icon name="x" size={20} /></button>
      </div>
      <div ref={scene} className={'vz-scene' + (gestes ? '' : ' sans-gestes')}
        onPointerDown={bas} onPointerMove={bouge} onPointerUp={haut} onPointerCancel={annule}>
        <div ref={contenu} className={'vz-contenu' + (anim ? ' anim' : '')} data-vz="contenu"
          style={{ transform: `translate3d(${vue.x}px, ${vue.y + descente}px, 0) scale(${vue.s})` }}
          onTransitionEnd={() => setAnim(false)}>
          {children}
        </div>
      </div>
      {gestes && <div className="vz-aide" aria-hidden="true">{vue.s > 1.001 ? `×${(Math.round(vue.s * 10) / 10).toString().replace('.', ',')}` : ''}</div>}
    </div>,
    document.body,
  );
}

/**
 * Rend une image cliquable : un clic / tap l'ouvre en grand SANS que l'événement atteigne la carte (pas de retournement,
 * pas de révélation). `rendu()` : ce que la visionneuse montre (appelé à l'ouverture). → [props à poser, élément]
 */
export function useAgrandir({ actif = true, titre = 'Image', rendu }) {
  const [ouvert, setOuvert] = useState(false);
  if (!actif) return [{}, null];
  const ouvrir = (e) => { e.stopPropagation(); e.preventDefault(); setOuvert(true); };
  const props = {
    role: 'button', tabIndex: 0, title: 'Agrandir l’image', 'aria-label': `${titre} — agrandir`, 'data-agrandir': '',
    onClick: ouvrir, onPointerDown: stop, onMouseDown: stop, onPointerUp: stop, onMouseUp: stop, onTouchStart: stop, onTouchEnd: stop,
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') ouvrir(e); },
    onKeyUp: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); } },
  };
  const element = ouvert ? <Visionneuse titre={titre} onFermer={() => setOuvert(false)}>{rendu()}</Visionneuse> : null;
  return [props, element];
}
