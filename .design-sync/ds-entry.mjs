/* ============================================================
   Entrée du design system — POUR LA SYNCHRO CLAUDE DESIGN UNIQUEMENT.

   Ce dépôt est une application (package privé, sans `exports` ni build de
   bibliothèque) : il n'a donc pas d'entrée publiée à donner au convertisseur.
   Ce fichier en tient lieu — il déclare la SURFACE du design system, c'est-à-dire
   les composants présentationnels réutilisables, et rien d'autre.

   Sans lui, le convertisseur synthétise une entrée à partir de TOUS les .jsx de
   src/ : pages, écrans de session, lecteur PDF, éditeur TipTap… soit l'application
   entière, ses dépendances lourdes et des collisions de noms entre modules.

   Volontairement ABSENTS (ils lisent l'état de l'app via `ctx`/`db` et ne
   s'affichent pas seuls) : StudySidebar, DestPicker.

   Aucun code applicatif n'est modifié par ce fichier : il ne fait que ré-exporter.
   ============================================================ */
/* Les FEUILLES DE STYLE font partie de la surface du design system, au même titre
   que les composants — et c'est par l'entrée qu'elles y entrent : le convertisseur
   construit `_ds_bundle.css` à partir de ce que l'entrée importe, et `styles.css`
   (la seule chose que reçoivent les maquettes rendues) l'importe à son tour.

   ORDRE SIGNIFICATIF, identique à src/main.jsx : design.css pose les tokens et les
   primitives (.btn/.card/.pill), etudes.css les surcharge pour MedRevise (.today-cta,
   .lib-fiche, .tree-*, .revbar…). Inverser les deux casse la cascade.

   Volontairement absents : index.css (directives Tailwind — aucun composant du
   design system n'utilise d'utilitaire Tailwind, préréglage désactivé de toute façon),
   documents.css et medrevise-mobile.css (écrans hors de cette surface). */
import '../src/styles/design.css';
import '../src/styles/etudes.css';

// Icon vit dans le design system PARTAGÉ (src/shared/), pas dans ui.jsx.
export { Icon } from '../src/shared/Icon.jsx';

export {
  // primitives
  Card,
  Switch,
  TypeChip,
  CatBadge,
  JBadge,
  Breadcrumb,
  SplitHandle,
  // en-tête / navigation
  EdTop,
  BellButton,
  // étiquettes
  EtiquetteDot,
  EtiquetteIconButton,
  EtiquetteQuickSet,
  // surfaces modales
  Modal,
  ConfirmModal,
  DateActionModal,
  ContextMenu,
  // méthode des J / suivi
  SessionTrendChart,
  SessionTrendCard,
  TodaySeriesCard,
  OverdueBox,
  // arborescence de cours
  DossierRow,
  DossierAddButton,
  CourseDocField,
  // glisser-déposer de fiches
  FicheDndProvider,
  DraggableFiche,
  DropSlot,
} from '../src/medrevise/components/ui.jsx';
