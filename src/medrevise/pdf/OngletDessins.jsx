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
import { useEffect, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { blobURL } from '../lib/storage.js';
import { IconeOutil } from './IconesOutils.jsx';

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
  return url
    ? <img className="od-img" src={url} alt="Dessin envoyé du téléphone" draggable={false} />
    : <div className="od-attente"><Icon name="clock" size={14} /> Image en route…</div>;
}

export function OngletDessins({ dessins, posesBlobIds, essai, onPoser, onRetirer, pdfPret }) {
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
            }}
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
