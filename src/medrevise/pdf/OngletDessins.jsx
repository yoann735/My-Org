/* ============================================================
   MedRevise — onglet « Dessins » du panneau du lecteur (02/10).
   Mécanique : docs/mecanique-dessin-mobile.md §5.

   Les dessins envoyés du téléphone vers CETTE fiche, le plus récent en haut.
   - GLISSER une vignette sur une page du PDF → une image collée ordinaire
     (déplaçable, redimensionnable, annulable, exportée), posée au point de dépôt ;
   - « Poser » : la même chose au centre de la page affichée ;
   - « Retirer » : retire le dessin de CETTE liste (une image déjà posée reste).
   Le type de glisser est maison (TYPE_GLISSER) : rien d'autre ne le reconnaît.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { blobURL } from '../lib/storage.js';
import { IconeOutil } from './IconesOutils.jsx';
import { couleurHex } from './pdfShared.js';

export const TYPE_GLISSER = 'application/x-medrevise-dessin';

function quand(iso) {
  if (!iso) return '';
  const d = new Date(iso), maint = new Date();
  const h = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === maint.toDateString() ? `Aujourd’hui, ${h}` : `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}, ${h}`;
}

/** vignette : l'image peut arriver après l'entrée (téléphone hors ligne) → on
    réessaie à chaque nouvel essai demandé par le parent (`essai`). */
function Vignette({ dessin, essai }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let vivant = true;
    if (url) return undefined;
    blobURL(dessin.blobId).then((x) => { if (vivant) setUrl(x); else if (x) URL.revokeObjectURL(x); }).catch(() => {});
    return () => { vivant = false; };
  }, [dessin.blobId, essai]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  if (!url) return <div className="od-attente"><Icon name="clock" size={14} /> Image en route…</div>;
  // les zones de texte ne sont pas dans le PNG (elles deviennent des textes libres
  // éditables à la pose) : la vignette les superpose pour montrer le dessin complet
  const textes = dessin.textes || [];
  const H = dessin.largeur && dessin.hauteur ? (1000 * dessin.hauteur) / dessin.largeur : 1000;
  return (
    <span className="od-pile">
      <img className="od-img" src={url} alt="Dessin envoyé du téléphone" draggable={false} />
      {textes.length > 0 && (
        <svg className="od-textes" viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {textes.map((t, i) => (
            <text key={i} x={t.x * 1000} y={t.y * H} fontSize={t.taille * 1000} fill={couleurHex(t.couleur, '#1F1F24')} fontWeight="500" dominantBaseline="hanging"
              fontFamily='system-ui, -apple-system, "Segoe UI", sans-serif' style={{ whiteSpace: 'pre' }}>
              {String(t.texte).split('\n').map((l, j) => <tspan key={j} x={t.x * 1000} dy={j ? t.taille * 1000 * 1.25 : 0}>{l || ' '}</tspan>)}
            </text>
          ))}
        </svg>
      )}
    </span>
  );
}

export function OngletDessins({ dessins, posesBlobIds, essai, onPoser, onRetirer, pdfPret, onGlisse = () => {} }) {
  const [aRetirer, setARetirer] = useState(null);
  if (!dessins.length) {
    return (
      <div className="od-vide">
        <IconeOutil nom="crayon" size={22} />
        <div className="od-vide-titre">Aucun dessin pour cette fiche</div>
        <div>Sur ton téléphone : MedRevise → <b>Dessin</b>, puis <b>Exporter</b>. Le dessin arrive ici en quelques secondes ; glisse-le ensuite sur la page.</div>
      </div>
    );
  }
  return (
    <div className="od">
      <div className="od-aide">Glisse un dessin sur une page du PDF pour le poser.</div>
      {dessins.map((d) => {
        const pose = posesBlobIds.has(d.blobId);
        return (
          <div key={d.id} className="od-carte" draggable={pdfPret}
            onDragStart={(e) => {
              e.dataTransfer.setData(TYPE_GLISSER, d.id);
              e.dataTransfer.effectAllowed = 'copy';
              const img = e.currentTarget.querySelector('img');
              if (img) e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
              // pas de changement du DOM DANS dragstart (Chrome annulerait le glisser)
              setTimeout(() => onGlisse(true), 0);
            }}
            onDragEnd={() => onGlisse(false)}
            title={pdfPret ? 'Glisser sur une page du PDF pour poser ce dessin' : ''}>
            <div className="od-vignette"><Vignette dessin={d} essai={essai} /></div>
            <div className="od-pied">
              <span className="od-date">{quand(d.envoyeLe)}</span>
              {!pose ? <span className="od-nouveau">Nouveau</span> : <span className="od-pose">Posé</span>}
              <span style={{ flex: 1 }} />
              {aRetirer === d.id ? (
                <>
                  <button type="button" className="btn ghost sm" onClick={() => setARetirer(null)}>Garder</button>
                  <button type="button" className="btn sm danger" onClick={() => { setARetirer(null); onRetirer(d); }}>Retirer</button>
                </>
              ) : (
                <>
                  <button type="button" className="btn sm" disabled={!pdfPret} onClick={() => onPoser(d)} title="Poser au centre de la page affichée">Poser</button>
                  <button type="button" className="icon-btn sm" onClick={() => setARetirer(d.id)} title="Retirer de cette liste (une image déjà posée reste sur la page)"><Icon name="trash" size={13} /></button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   MENU « DESSINS » de la barre du lecteur (02/10 soir) — remplace l'onglet du panneau
   de droite (les dessins n'ont rien à faire avec les notions). Un bouton près des
   outils ; un clic déroule la liste de TOUS les dessins reçus, avec ascenseur.
   Pendant un glisser, le menu devient transparent aux clics : on peut déposer sur la
   partie de la page qu'il recouvre. Il se referme au dépôt, à Échap, au clic dehors.
   ============================================================ */
export function MenuDessins({ dessins, posesBlobIds, essai, onPoser, onRetirer, pdfPret }) {
  const [ouvert, setOuvert] = useState(null); // { x, y } sous le bouton
  const [glisse, setGlisse] = useState(false);
  const btnRef = useRef(null), menuRef = useRef(null);
  const nouveaux = dessins.filter((d) => !posesBlobIds.has(d.blobId)).length;
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      setOuvert(null);
    };
    const touche = (e) => { if (e.key === 'Escape') setOuvert(null); };
    window.addEventListener('pointerdown', dehors);
    window.addEventListener('keydown', touche);
    return () => { window.removeEventListener('pointerdown', dehors); window.removeEventListener('keydown', touche); };
  }, [ouvert]);
  const ouvrir = () => {
    const r = btnRef.current.getBoundingClientRect();
    setOuvert({ x: Math.max(8, Math.min(r.left + r.width / 2 - 170, window.innerWidth - 348)), y: r.bottom + 8 });
  };
  return (
    <>
      <button ref={btnRef} type="button" className={'ptb-outil ptb-dessins' + (ouvert ? ' actif' : '')}
        title="Dessins reçus du téléphone — les glisser sur une page du PDF"
        onClick={() => (ouvert ? setOuvert(null) : ouvrir())}>
        <IconeOutil nom="dessins" size={16} /><span className="ptb-outil-lbl">Dessins</span>
        {nouveaux > 0 && <span className="ptb-pastille-n">{nouveaux}</span>}
      </button>
      {ouvert && createPortal(
        <div ref={menuRef} className={'md-menu' + (glisse ? ' en-glisse' : '')} style={{ left: ouvert.x, top: ouvert.y }} role="dialog" aria-label="Dessins reçus">
          <div className="md-menu-tete">
            <IconeOutil nom="dessins" size={15} />
            <span>Dessins reçus</span>
            <span className="md-menu-n">{dessins.length}</span>
            <span style={{ flex: 1 }} />
            <button type="button" className="icon-btn sm" onClick={() => setOuvert(null)} title="Fermer (Échap)"><Icon name="x" size={13} /></button>
          </div>
          <div className="md-menu-liste scroll">
            <OngletDessins dessins={dessins} posesBlobIds={posesBlobIds} essai={essai} pdfPret={pdfPret}
              onPoser={(d) => { setOuvert(null); onPoser(d); }} onRetirer={onRetirer}
              onGlisse={(v) => { setGlisse(v); if (!v) setOuvert(null); }} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
