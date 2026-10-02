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
export function MenuDessins({ dessins, posesBlobIds, essai, onPoser, onRetirer, pdfPret, boutonRef = null, pulse = 0 }) {
  const [ouvert, setOuvert] = useState(null); // { x, y } sous le bouton
  const [glisse, setGlisse] = useState(false);
  const btnInterne = useRef(null), menuRef = useRef(null);
  const btnRef = boutonRef || btnInterne;
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
      <button ref={btnRef} key={'pulse' + pulse} type="button" className={'ptb-outil ptb-dessins' + (ouvert ? ' actif' : '') + (pulse ? ' pulse' : '')}
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

/* ============================================================
   ARRIVÉE D'UN DESSIN (02/10 nuit) — sans aucun clic : dès que le sondage voit un
   dessin nouveau pour CETTE fiche, une carte en verre arrive sous la barre (ressort
   doux, la vignette se dévoile), avec « Poser » et la vignette elle-même glissable
   vers la page. Ignorée, elle s'en va au bout de 8 s (pause au survol) en
   S'ENVOLANT dans le bouton Dessins : on voit où le dessin est rangé.
   ============================================================ */
export function ArriveeDessin({ dessin, autres = 0, cible, onPoser, onFermer, pdfPret }) {
  const [phase, setPhase] = useState('entree'); // entree | la | envol | sortie
  const [vol, setVol] = useState(null);
  const carteRef = useRef(null), survol = useRef(false), minuteur = useRef(null);
  const partir = (versBouton) => {
    clearTimeout(minuteur.current);
    if (versBouton && cible && cible.current && carteRef.current) {
      const a = carteRef.current.getBoundingClientRect(), b = cible.current.getBoundingClientRect();
      setVol({ x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2) });
      setPhase('envol');
    } else setPhase('sortie');
    setTimeout(onFermer, versBouton ? 520 : 260);
  };
  const armer = () => { clearTimeout(minuteur.current); minuteur.current = setTimeout(() => { if (!survol.current) partir(true); else armer(); }, 8000); };
  useEffect(() => { const t = setTimeout(() => setPhase('la'), 20); armer(); return () => { clearTimeout(t); clearTimeout(minuteur.current); }; }, [dessin.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = (() => {
    const b = cible && cible.current ? cible.current.getBoundingClientRect() : null;
    const W = 320;
    return b ? { left: Math.max(12, Math.min(b.left + b.width / 2 - W / 2, window.innerWidth - W - 12)), top: b.bottom + 12 } : { right: 24, top: 120 };
  })();
  return createPortal(
    <div ref={carteRef} className={'ad ad-' + phase} role="status" aria-live="polite" style={{ ...pos, ...(vol ? { '--vx': `${vol.x}px`, '--vy': `${vol.y}px` } : {}) }}
      onMouseEnter={() => { survol.current = true; }} onMouseLeave={() => { survol.current = false; }}>
      <div className="ad-tete">
        <span className="ad-ic"><IconeOutil nom="dessins" size={15} /></span>
        <div className="ad-titres">
          <b>Nouveau dessin{autres > 0 ? ` (+${autres})` : ''}</b>
          <small>Depuis ton téléphone · à l’instant</small>
        </div>
        <button type="button" className="ad-x" onClick={() => partir(true)} title="Ranger dans Dessins"><Icon name="x" size={13} /></button>
      </div>
      <div className="ad-vignette" draggable={pdfPret}
        onDragStart={(e) => { e.dataTransfer.setData(TYPE_GLISSER, dessin.id); e.dataTransfer.effectAllowed = 'copy'; const img = e.currentTarget.querySelector('img'); if (img) e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2); }}
        onDragEnd={(e) => { if (e.dataTransfer.dropEffect !== 'none') partir(false); }}
        title={pdfPret ? 'Glisser sur une page du PDF' : ''}>
        <Vignette dessin={dessin} essai={0} />
      </div>
      <div className="ad-actions">
        <button type="button" className="ad-sec" onClick={() => partir(true)}>Plus tard</button>
        <button type="button" className="ad-pri" disabled={!pdfPret} onClick={() => { partir(false); onPoser(dessin); }}>Poser sur la page</button>
      </div>
    </div>,
    document.body,
  );
}
