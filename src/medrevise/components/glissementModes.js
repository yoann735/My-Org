/* ============================================================
   MedRevise — GLISSEMENT ENTRE LES MODES DU PANNEAU (v1.4, 07/10 —
   docs/compte-rendu-panneau-lateral.md, section « v1.4 — geste fluide »).

   Tout le geste vit HORS de React : un seul jeu d'écouteurs PASSIFS sur le conteneur
   de la piste (roue pour le trackpad, pointeurs pour le doigt et le stylet), qui écrit
   `transform: translate3d(x, 0, 0)` sur la PISTE et sur l'indicateur du sélecteur — une
   seule écriture par image (requestAnimationFrame, la dernière valeur gagne). Aucun
   setState pendant le mouvement : React n'est prévenu qu'à la fin de l'aimantation
   (`onArrivee`), une seule fois. Pendant tout le geste, les rendus des stores vivants
   (transcription, niveau audio, crédits, OCR) sont différés (lib/gesteEnCours.js).

   - Axe décidé UNE fois par geste, dès 8 px cumulés : horizontal si |dx| > |dy|, sinon
     on laisse défiler (vertical) jusqu'à la fin du geste. Jamais pris en charge s'il
     commence sur une zone qui défile horizontalement, un canvas, ou avec du texte
     sélectionné dans le panneau. La souris est exclue (glisser = sélectionner).
   - Pas de transition pendant le suivi ; aimantation : transform 200 ms,
     cubic-bezier(0.2, 0, 0, 1). Un nouveau geste pendant l'aimantation la fige à sa
     position réelle et repart de là, sans attente.
   - Trackpad : la fin du geste est détectée dès le début de l'INERTIE de macOS (deltas
     qui décroissent régulièrement) ou après 120 ms sans événement. La traîne d'inertie
     est ensuite ignorée (250 ms au moins, et tant qu'elle décroît) — la cause classique
     du double changement — sauf si un geste franc repart (delta qui remonte, 24 px cumulés).
   ============================================================ */
import { debutGeste, finGeste } from '../lib/gesteEnCours.js';

const COURBE = 'cubic-bezier(0.2, 0, 0, 1)';
const DUREE = 200; // ms
const SEUIL_AXE = 8; // px cumulés avant de décider l'axe
const SILENCE = 120; // ms sans événement de roue = doigts levés
const TRAINE_MIN = 250; // ms d'inertie ignorée après un relâchement
const SEUIL_FRANC = 24; // px cumulés d'un delta qui remonte = nouveau geste

export function creerGlissement({ corps, piste, indicateur, nbModes, index, onArrivee, reduit = () => false }) {
  let n = nbModes;
  let pos = index; // position affichée (index fractionnaire)
  let raf = null, aEcrire = null;
  let anim = null; // { cible, minuteur }
  let largeur = corps.clientWidth || 360;
  // geste en cours
  let etat = 'repos'; // repos | decide | suivi | vertical | traine
  let base = 0, offset = 0, traces = [];
  let sx = 0, sy = 0; // cumul avant la décision d'axe
  let dernierT = -1e9, dernierAbs = 0, pic = 0, decroit = 0, finTraine = 0, franc = 0;
  let pointeur = null; // { id, x, y }
  let provisoire = null; // position de départ d'un suivi PROVISOIRE (axe pas encore décidé)
  let minuteurSilence = null;

  const borne = (p) => Math.max(0, Math.min(n - 1, p));
  const peindre = (p) => {
    piste.style.transform = `translate3d(${(-p * 100).toFixed(3)}%, 0, 0)`;
    if (indicateur) indicateur.style.transform = `translate3d(${(borne(p) * 100).toFixed(3)}%, 0, 0)`;
  };
  /* UNE écriture par image, dans requestAnimationFrame : la dernière valeur gagne. (Une
     écriture immédiate dans le gestionnaire a été essayée : même délai visible, mais des
     images « partielles » — le compositeur n'attend plus le fil principal ; voir v1.4.) */
  const ecrire = (p) => {
    pos = p; aEcrire = p;
    if (raf == null) raf = requestAnimationFrame(() => { raf = null; if (aEcrire != null) { peindre(aEcrire); aEcrire = null; } });
  };
  const transition = (on) => {
    const t = on ? `transform ${DUREE}ms ${COURBE}` : 'none';
    piste.style.transition = t;
    if (indicateur) indicateur.style.transition = t;
  };

  /* ---- aimantation ---- */
  /* fin de l'aimantation : le travail de React (mode actif, `inert`, focus, rendus différés)
     part dans SA PROPRE tâche, après l'image qui termine le mouvement — jamais dans elle.
     Si un nouveau geste a commencé entre-temps, rien : sa propre fin s'en chargera. */
  let arrivee = null;
  const finir = (cible) => {
    if (!anim) return;
    clearTimeout(anim.minuteur);
    piste.removeEventListener('transitionend', anim.fin);
    anim = null;
    transition(false);
    pos = cible;
    clearTimeout(arrivee);
    requestAnimationFrame(() => {
      arrivee = setTimeout(() => {
        arrivee = null;
        if (etat === 'suivi' || anim || provisoire != null) return;
        onArrivee(cible);
        finGeste(); // rendus différés : rattrapés en une fois, après le mouvement
      }, 0);
    });
  };
  const aimanter = (cible) => {
    if (raf != null) { cancelAnimationFrame(raf); raf = null; aEcrire = null; }
    if (anim) { clearTimeout(anim.minuteur); piste.removeEventListener('transitionend', anim.fin); anim = null; }
    debutGeste();
    if (reduit() || Math.abs(cible - pos) < 0.002) { transition(false); peindre(cible); pos = cible; anim = { minuteur: null, fin: () => {} }; finir(cible); return; }
    transition(true);
    peindre(cible);
    pos = cible;
    const fin = (e) => { if (e.target === piste && e.propertyName === 'transform') finir(cible); };
    anim = { cible, fin, minuteur: setTimeout(() => finir(cible), DUREE + 60) };
    piste.addEventListener('transitionend', fin);
  };
  /* geste pendant l'aimantation : on fige la piste là où elle EST, et on repart de là */
  const figer = () => {
    if (!anim) return;
    clearTimeout(anim.minuteur);
    piste.removeEventListener('transitionend', anim.fin);
    anim = null;
    const m = getComputedStyle(piste).transform; // matrix(1, 0, 0, 1, tx, 0)
    const tx = m && m !== 'none' ? parseFloat(m.split(',')[4]) : -pos * largeur;
    transition(false);
    pos = largeur ? -tx / largeur : pos;
    peindre(pos);
  };

  /* ---- suivi ---- */
  /* bornes du suivi : jamais plus d'un mode d'écart avec le départ du geste, élastique
     au-delà (et aux deux extrémités de la piste) */
  const elastique = (p) => {
    const max = 56 / largeur;
    const bas = Math.max(0, Math.floor(base + 1e-4) - 1), haut = Math.min(n - 1, Math.ceil(base - 1e-4) + 1);
    if (p < bas) return bas - Math.min(max, (bas - p) * 0.3);
    if (p > haut) return haut + Math.min(max, (p - haut) * 0.3);
    return p;
  };
  const commencer = (decalage, t) => {
    debutGeste();
    if (provisoire == null) { figer(); largeur = corps.clientWidth || largeur; base = pos; } else base = provisoire; // lu UNE fois par geste
    provisoire = null;
    etat = 'suivi'; offset = decalage; traces = [{ t, off: offset }]; pic = 0; decroit = 0;
    ecrire(elastique(base - offset / largeur));
  };
  /* PREMIER MOUVEMENT SANS ATTENDRE LES 8 PX : tant que l'axe n'est pas décidé, un début
     nettement horizontal (|dx| ≥ 2 px et > 2 × |dy|) déplace déjà la piste, à titre
     provisoire — visible à l'image suivante. Décidé vertical : elle revient d'où elle était. */
  const suivreProvisoire = (ox, oy) => {
    if (Math.abs(ox) < 2 || Math.abs(ox) <= 2 * Math.abs(oy)) return;
    if (provisoire == null) { debutGeste(); figer(); largeur = corps.clientWidth || largeur; provisoire = pos; }
    ecrire(elastique(provisoire - ox / largeur));
  };
  const annulerProvisoire = () => {
    if (provisoire == null) return;
    ecrire(provisoire); provisoire = null;
    if (!anim) finGeste();
  };
  const suivre = (d, t) => {
    offset += d;
    traces.push({ t, off: offset });
    while (traces.length > 2 && t - traces[0].t > 100) traces.shift();
    ecrire(elastique(base - offset / largeur));
  };
  const relacher = (t) => {
    if (etat !== 'suivi') return;
    etat = 'repos';
    const a = traces[0], z = traces[traces.length - 1];
    const v = a && z && z.t > a.t ? (z.off - a.off) / (z.t - a.t) : 0; // px/ms, positif = vers la gauche du contenu… (doigt vers la droite)
    const p = pos;
    let cible = Math.round(p);
    if (Math.abs(v) > 0.45 && Math.abs(offset) > 24 && Math.sign(v) === Math.sign(offset)) {
      cible = offset < 0 ? Math.floor(p + 1e-4) + 1 : Math.ceil(p - 1e-4) - 1;
    }
    cible = Math.max(Math.floor(base + 1e-4) - 1, Math.min(Math.ceil(base - 1e-4) + 1, cible)); // jamais plus d'un mode d'écart
    aimanter(borne(cible));
    finTraine = t + TRAINE_MIN;
  };

  /* ---- exclusions au début d'un geste ---- */
  const defileHorizontalement = (el) => {
    for (let x = el; x && x !== corps; x = x.parentElement) {
      if (x.tagName === 'CANVAS') return true;
      if (x.scrollWidth > x.clientWidth + 1) {
        const ox = getComputedStyle(x).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
    }
    return false;
  };
  const texteSelectionne = () => {
    const sel = window.getSelection && window.getSelection();
    return !!(sel && !sel.isCollapsed && corps.contains(sel.anchorNode));
  };

  /* ---- roue (trackpad) ---- */
  const onRoue = (e) => {
    const r = roue(e);
    // geste pris en charge (suivi, ou traîne d'inertie ignorée) : c'est la page qui le gère
    if (r !== false && (etat === 'suivi' || etat === 'traine' || provisoire != null) && e.cancelable) e.preventDefault();
  };
  const roue = (e) => {
    const t = e.timeStamp, dx = e.deltaX, dy = e.deltaY;
    const ax = Math.abs(dx), ecart = t - dernierT;
    const prec = dernierAbs;
    dernierT = t; dernierAbs = ax;
    if (etat === 'traine') {
      // un delta qui REMONTE nettement, cumulé au-delà du seuil = des doigts reposés
      if (ax > 3 && ax > prec * 1.5) franc += -dx;
      else if (ax <= prec) franc = 0;
      if (Math.abs(franc) > SEUIL_FRANC) { const f = franc; franc = 0; commencer(f, t); return; }
      if (t < finTraine || (ecart < 60 && ax <= prec * 1.15 + 0.5)) return; // traîne d'inertie : ignorée
      etat = 'repos';
    }
    if (etat === 'vertical') { if (ecart < 90) return; etat = 'repos'; }
    if (etat === 'suivi') {
      clearTimeout(minuteurSilence);
      // des doigts reposés pendant l'inertie (delta qui REMONTE après une décroissance) :
      // ce geste-ci se termine, un nouveau part tout de suite de la position actuelle
      if (decroit >= 2 && ax >= 4 && ax > prec * 1.5) {
        relacher(t); etat = 'repos'; commencer(-dx, t);
        minuteurSilence = setTimeout(() => relacher(performance.now()), SILENCE);
        return;
      }
      // début d'inertie : deltas qui décroissent régulièrement (≥ 3 de suite, −8 %) → doigts levés
      if (ax >= pic) { pic = ax; decroit = 0; } else if (ax <= prec * 0.92 && ecart < 50) decroit += 1; else if (ax > prec) decroit = 0;
      suivre(-dx, t);
      if (pic >= 8 && decroit >= 3) { relacher(t); etat = 'traine'; franc = 0; return; }
      minuteurSilence = setTimeout(() => relacher(performance.now()), SILENCE);
      return;
    }
    if (etat === 'repos' || ecart > 90) {
      if (defileHorizontalement(e.target) || texteSelectionne()) { etat = 'vertical'; return; }
      etat = 'decide'; sx = 0; sy = 0;
    }
    if (etat === 'decide') {
      sx += dx; sy += dy;
      clearTimeout(minuteurSilence);
      if (Math.hypot(sx, sy) < SEUIL_AXE) {
        suivreProvisoire(-sx, -sy);
        // geste minuscule qui s'arrête là : la piste revient
        minuteurSilence = setTimeout(() => { if (etat === 'decide') { etat = 'repos'; annulerProvisoire(); } }, SILENCE);
        return;
      }
      if (Math.abs(sx) > Math.abs(sy)) {
        commencer(-sx, t);
        minuteurSilence = setTimeout(() => relacher(performance.now()), SILENCE);
      } else { etat = 'vertical'; annulerProvisoire(); }
    }
  };

  /* ---- pointeurs (doigt, stylet) ---- */
  const onDown = (e) => {
    if (e.pointerType === 'mouse' || pointeur) return;
    if (defileHorizontalement(e.target) || texteSelectionne()) return;
    pointeur = { id: e.pointerId, x: e.clientX, y: e.clientY, axe: null };
  };
  const onMove = (e) => {
    const p = pointeur;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (p.axe === null) {
      if (Math.hypot(dx, dy) < SEUIL_AXE) { suivreProvisoire(dx, dy); return; }
      p.axe = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (p.axe === 'x') commencer(dx, e.timeStamp); // les 8 premiers px sont appliqués d'emblée
      else annulerProvisoire();
      p.dernier = e.clientX;
      return;
    }
    if (p.axe === 'x' && etat === 'suivi') suivre(e.clientX - p.dernier, e.timeStamp);
    p.dernier = e.clientX;
  };
  const onUp = (e) => {
    const p = pointeur;
    if (!p || p.id !== e.pointerId) return;
    pointeur = null;
    if (p.axe === 'x') relacher(e.timeStamp);
    else annulerProvisoire();
  };

  const opts = { passive: true };
  /* roue NON passive : seule façon d'appeler preventDefault() quand on prend le geste en
     charge ; un défilement vertical n'est jamais retenu (on ne l'empêche pas). */
  const optsRoue = { passive: false };
  corps.addEventListener('wheel', onRoue, optsRoue);
  corps.addEventListener('pointerdown', onDown, opts);
  window.addEventListener('pointermove', onMove, opts);
  window.addEventListener('pointerup', onUp, opts);
  window.addEventListener('pointercancel', onUp, opts);
  peindre(pos);

  return {
    /** Aller à un mode (clic sur un segment, demande extérieure) — animé. */
    allerA(k) { etat = 'repos'; figer(); aimanter(borne(k)); },
    /** Placer sans animation (montage, changement du nombre de modes). */
    placer(k, nb = n) { n = nb; if (anim) return; pos = borne(k); peindre(pos); },
    enMouvement: () => etat === 'suivi' || !!anim,
    detacher() {
      clearTimeout(minuteurSilence); clearTimeout(arrivee);
      if (anim) { clearTimeout(anim.minuteur); piste.removeEventListener('transitionend', anim.fin); anim = null; }
      if (raf != null) cancelAnimationFrame(raf);
      corps.removeEventListener('wheel', onRoue, optsRoue);
      corps.removeEventListener('pointerdown', onDown, opts);
      window.removeEventListener('pointermove', onMove, opts);
      window.removeEventListener('pointerup', onUp, opts);
      window.removeEventListener('pointercancel', onUp, opts);
      finGeste();
    },
  };
}
