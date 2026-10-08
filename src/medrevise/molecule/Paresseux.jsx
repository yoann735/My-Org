/* MedRevise — cartes Molécule : points d'entrée CHARGÉS À LA DEMANDE (08/10). Tant qu'aucune carte
   Molécule n'est affichée, ni OpenChemLib ni l'éditeur ni la bibliothèque ne sont téléchargés. */
import { lazy, Suspense } from 'react';

const Face = lazy(() => import('./RevisionMolecule.jsx'));
const Vue = lazy(() => import('./RevisionMolecule.jsx').then((m) => ({ default: m.VueMolecule })));
const Formulaire = lazy(() => import('./FormulaireMolecule.jsx'));
const attente = <span className="mol-attente-ligne"><span className="mu-sablier" /> Chargement…</span>;

export const FaceMoleculeParesseuse = (p) => <Suspense fallback={attente}><Face {...p} /></Suspense>;
export const VueMoleculeParesseuse = (p) => <Suspense fallback={attente}><Vue {...p} /></Suspense>;
export const FormulaireMoleculeParesseux = (p) => <Suspense fallback={attente}><Formulaire {...p} /></Suspense>;
