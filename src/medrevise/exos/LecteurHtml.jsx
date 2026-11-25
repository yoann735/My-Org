/* ============================================================
   MedRevise — Exos : LECTEUR HTML intégré (25/11/2026, docs/compte-rendu-section-exos.md).

   ISOLATION. Le fichier est affiché dans une <iframe srcdoc> avec sandbox="allow-scripts allow-forms" et RIEN
   d'autre : pas d'allow-same-origin (origine opaque → aucun accès à IndexedDB, aux cookies, au localStorage de
   l'app, à Supabase ni au DOM du parent), pas d'allow-top-navigation (il ne peut pas rediriger l'app), pas
   d'allow-popups ni d'allow-modals. Aucune donnée de l'app n'est passée à l'iframe : seul le texte du fichier.
   L'app n'écoute aucun message venant de l'iframe.

   CONFORT, sans rien ouvrir : un petit script est placé en tête du document —
   - localStorage / sessionStorage : dans la zone isolée ils lèvent une erreur ; ils sont remplacés par un
     stockage EN MÉMOIRE (perdu à la fermeture), pour que le fichier ne plante pas ;
   - alert() (bloqué sans allow-modals) s'affiche en bandeau dans la page de l'exercice.
   Rien n'est enregistré : pas d'annotation, pas d'outil.
   ============================================================ */
import { useEffect, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { getBlob } from '../lib/storage.js';

export const SANDBOX = 'allow-scripts allow-forms';

const AMORCE = `<script>(function(){
  function memoire(){var d=new Map();return{getItem:function(k){k=String(k);return d.has(k)?d.get(k):null},setItem:function(k,v){d.set(String(k),String(v))},removeItem:function(k){d.delete(String(k))},clear:function(){d.clear()},key:function(i){var l=Array.from(d.keys());return i<l.length?l[i]:null},get length(){return d.size}}}
  ['localStorage','sessionStorage'].forEach(function(nom){var ok=false;try{window[nom].getItem('__');ok=true}catch(e){}if(!ok){try{Object.defineProperty(window,nom,{value:memoire(),configurable:true})}catch(e){}}});
  window.alert=function(m){try{var b=document.createElement('div');b.setAttribute('data-mr-alerte','');b.textContent=String(m);b.style.cssText='position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483647;max-width:min(560px,92vw);padding:10px 14px;border-radius:10px;background:#14181c;color:#e9eef0;font:500 14px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);border:1px solid #2b8f86';(document.body||document.documentElement).appendChild(b);setTimeout(function(){b.remove()},4000)}catch(e){}};
})();<\/script>`;

/** texte du fichier → document de l'iframe, l'amorce en tête (avant tout script du fichier) */
export function preparerSrcdoc(html) {
  const t = String(html || '');
  if (/<head[^>]*>/i.test(t)) return t.replace(/<head[^>]*>/i, (m) => m + AMORCE);
  if (/<html[^>]*>/i.test(t)) return t.replace(/<html[^>]*>/i, (m) => m + '<head>' + AMORCE + '</head>');
  return AMORCE + t;
}

export function LecteurHtml({ fichier, onRetour }) {
  const [srcdoc, setSrcdoc] = useState(null);
  const [erreur, setErreur] = useState(null);
  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const blob = await getBlob(fichier.fileId);
        if (!vivant) return;
        if (!blob) { setErreur('Fichier introuvable sur cet appareil (hors ligne ?). Il sera disponible après la prochaine synchro.'); return; }
        setSrcdoc(preparerSrcdoc(await blob.text()));
      } catch (e) { if (vivant) setErreur('Lecture du fichier impossible.'); }
    })();
    return () => { vivant = false; };
  }, [fichier.fileId]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) onRetour(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onRetour]);
  return (
    <div className="exo-html fadein" data-lecteur="html">
      <div className="exo-html-barre">
        <button type="button" className="icon-btn" onClick={onRetour} title="Retour à la notion (Échap)" aria-label="Retour à la notion"><Icon name="chevL" size={18} /></button>
        <div className="exo-html-titre" title={fichier.nomFichier || fichier.nom}><Icon name="fileHtml" size={15} /> <span>{fichier.nom}</span></div>
      </div>
      <div className="exo-html-zone">
        {erreur ? <div className="exo-vide"><Icon name="alert" size={22} /><div>{erreur}</div></div>
          : srcdoc == null ? <div className="exo-vide"><div className="hint">Chargement…</div></div>
          : <iframe className="exo-html-frame" title={fichier.nom} sandbox={SANDBOX} srcDoc={srcdoc} referrerPolicy="no-referrer" allow="" />}
      </div>
    </div>
  );
}
