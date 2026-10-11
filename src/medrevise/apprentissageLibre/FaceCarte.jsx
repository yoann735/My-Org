/* ============================================================
   MedRevise — MODE APPRENTISSAGE LIBRE : une face de carte (recto ou verso).
   AFFICHAGE SEUL, fait des mêmes briques que la séance du jour (Tex, trous, image,
   flashcard image, Molécule, tableau Muscle dont les champs se révèlent un par un) —
   aucune logique de notation ni de planification partagée.
   ============================================================ */
import { Tex } from '../components/Tex.jsx';
import { ZoneDefilante } from '../components/ZoneDefilante.jsx';
import { OcclusionView, estOcclusion } from '../components/OcclusionImage.jsx';
import { TableauMuscle, ImageGeneraleMuscle } from '../components/FlashcardMuscle.jsx';
import { ImageFlashcard, imageAuRecto, imageAuVerso } from '../components/FlashcardImage.jsx';
import { FaceMoleculeParesseuse } from '../molecule/Paresseux.jsx';
import { estMuscle } from '../lib/muscle.js';
import { estMolecule } from '../molecule/carte.js';
import { isCloze, parseCloze, highlightClozeWords } from '../lib/cloze.js';

export function FaceCarte({ carte, cote, masquable = true }) {
  const verso = cote === 'verso';
  const retenir = verso && carte.a_retenir
    ? <div className="sfc-retenir"><strong>À retenir :</strong> <Tex>{carte.a_retenir}</Tex></div> : null;

  if (estMuscle(carte)) {
    // le nom au recto ; au verso le tableau, champs masqués et révélés un par un au clic / tap
    return (
      <ZoneDefilante className={'sfc-zone sfc-muscle' + (verso ? ' long' : '')}>
        {verso ? <div className="mu-titre"><Tex>{carte.recto}</Tex></div> : <div className="sfc-recto mu-nom"><Tex>{carte.recto}</Tex></div>}
        <ImageGeneraleMuscle item={carte} face={cote} />
        {verso && <TableauMuscle item={carte} masquable={masquable} />}
        {retenir}
      </ZoneDefilante>
    );
  }

  const image = !estOcclusion(carte) && ((!verso && imageAuRecto(carte)) || (verso && imageAuVerso(carte)));
  if (estMolecule(carte)) {
    return (
      <>
        {image && <ImageFlashcard imageId={carte.imageId} maxH="min(220px, 28dvh)" className="mrm" />}
        <ZoneDefilante className="sfc-zone sfc-molecule">
          <FaceMoleculeParesseuse carte={carte} cote={cote} />
          {retenir}
        </ZoneDefilante>
      </>
    );
  }

  const cloze = isCloze(carte);
  const occ = estOcclusion(carte) ? carte.occlusion : null;
  const texte = verso
    ? (cloze ? highlightClozeWords(carte.verso, carte.cloze).map((p, i) => (p.hl ? <mark key={i} className="mrm-cloze-mark">{p.text}</mark> : <span key={i}>{p.text}</span>)) : <Tex>{carte.verso}</Tex>)
    : (cloze ? parseCloze(carte.recto, carte.cloze).map((s, i) => (s.type === 'text' ? <Tex key={i}>{s.value}</Tex> : <span key={i} className="mrm-cloze-blank" aria-hidden="true" />)) : <Tex>{carte.recto}</Tex>);
  const long = String((verso ? carte.verso : carte.recto) || '').length > 260;
  return (
    <>
      {image && <ImageFlashcard imageId={carte.imageId} maxH="min(220px, 28dvh)" className="mrm" />}
      <ZoneDefilante className={'sfc-zone' + (long ? ' long' : '')}>
        {occ && <OcclusionView occ={occ} revele={verso} maxH={260} />}
        {!verso && <div className="sfc-recto">{texte}</div>}
        {verso && !(occ && carte.versoAuto) && <div className="sfc-verso">{texte}</div>}
        {retenir}
      </ZoneDefilante>
    </>
  );
}

/** petite étiquette de type pour les listes */
export function typeDeCarte(q) {
  if (estMuscle(q)) return 'Muscle';
  if (estMolecule(q)) return 'Molécule';
  if (estOcclusion(q)) return 'Image';
  if (isCloze(q)) return 'Trous';
  return null;
}
