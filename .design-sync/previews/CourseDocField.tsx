/* CourseDocField — champ de rattachement du document d'un cours (PDF ou fiche
   HTML), avec zone de dépôt. Deux états : vide (on dépose ou on parcourt) et
   rempli (nom du fichier, icône selon le type, bouton Retirer). */
import { CourseDocField } from 'mealweek';

const pdf = new File(['%PDF-1.4'], 'anatomie-membre-superieur.pdf', { type: 'application/pdf' });
const html = new File(['<h1>Cours</h1>'], 'plexus-brachial.html', { type: 'text/html' });

export const Vide = () => (
  <div style={{ width: 460 }}>
    <CourseDocField file={null} onFile={() => {}} />
  </div>
);

export const AvecUnPdf = () => (
  <div style={{ width: 460 }}>
    <CourseDocField file={pdf} onFile={() => {}} />
  </div>
);

export const AvecUneFicheHtml = () => (
  <div style={{ width: 460 }}>
    <CourseDocField file={html} onFile={() => {}} />
  </div>
);

export const LibelleEtAidePersonnalises = () => (
  <div style={{ width: 460 }}>
    <CourseDocField
      file={null}
      onFile={() => {}}
      label="Support du chapitre"
      hint="Le PDF sert de source aux surlignages ; la fiche HTML sert à l'export."
    />
  </div>
);
