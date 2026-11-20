/* ============================================================
   MedRevise — « Enregistrer en PNG » d'un dessin (20/11,
   docs/compte-rendu-export-png-et-retour-transcription.md) : échelle, nom du fichier,
   et remise du fichier (feuille de partage sur iPhone/iPad, téléchargement ailleurs).
   Le rendu lui-même est celui de l'envoi vers un cours (EcranDessin.jsx#svgVersPng).
   ============================================================ */
/* « Enregistrer en PNG » (20/11) : MÊME rendu que l'envoi vers un cours (svgExport → svgVersPng),
   seule l'échelle change — ×3 tant que le canvas le permet (plafonds Safari iOS : 16,7 Mpx, côté ≤ 8 192). */
export const ECHELLE_PNG = 3, COTE_MAX_PNG = 8192, PIXELS_MAX_PNG = 16777216;
export const echellePng = (w, h) => Math.min(ECHELLE_PNG, COTE_MAX_PNG / Math.max(w, h), Math.sqrt(PIXELS_MAX_PNG / (w * h)));

/** nom du fichier : dessin-<cours>-<AAAA-MM-JJ>.png (cours = la fiche choisie dans la feuille). */
export function nomFichierPng(titre, d = new Date()) {
  const cours = String(titre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'sans-cours';
  const p = (n) => String(n).padStart(2, '0');
  return `dessin-${cours}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.png`;
}

/* iPhone / iPad (et téléphone tactile) : feuille de partage du système (« Enregistrer l'image »,
   Messages, AirDrop…) ; ordinateur (Mac compris) : téléchargement. Même règle que
   lib/backupExport.js : Safari macOS expose aussi navigator.share, on ne l'y utilise pas. */
export function partageImagePrefere() {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return true;
  return /Android/.test(ua) && navigator.maxTouchPoints > 0;
}
function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nom; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000); // Safari lit l'URL après le click()
}
/** remet le PNG : 'partage' | 'annule' | 'geste' (activation perdue : un toucher de plus) | 'telechargement'. */
export async function remettrePng(blob, nom) {
  if (partageImagePrefere()) {
    const file = new File([blob], nom, { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: nom }); return 'partage'; } catch (e) {
        if (e && e.name === 'AbortError') return 'annule';
        if (e && e.name === 'NotAllowedError') return 'geste';
      }
    }
  }
  telecharger(blob, nom);
  return 'telechargement';
}
