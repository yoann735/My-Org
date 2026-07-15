/* ============================================================
   MedRevise — MODÈLE partagé d'un schéma d'anatomie MULTI-VUES.
   Un schéma (fiche type 'anat_schema') contient une LISTE d'images {vue}, chacune
   avec ses PROPRES coches/zones : une même région vue de face, de dos, de profil…

   Rétro-compatibilité : les schémas d'avant (une seule image via imageId/coches au
   niveau de la fiche) restent lus tels quels — `ficheImages()` fabrique une vue
   unique « Non précisée » à la volée, et la migration `anat-images-v1` matérialise
   ce tableau `images[]` en base sans jamais retirer les champs legacy (miroir de la
   1re vue), pour ne casser aucun consommateur existant.
   ============================================================ */

/** vues disponibles à chaque collage d'image (ordre = ordre d'affichage). */
export const SCHEMA_VUES = [
  { key: 'face', label: 'Face' },
  { key: 'dos', label: 'Dos' },
  { key: 'profil_g', label: 'Profil gauche' },
  { key: 'profil_d', label: 'Profil droit' },
  { key: 'sup', label: 'Supérieure' },
  { key: 'inf', label: 'Inférieure' },
  { key: 'autre', label: 'Autre' },
  { key: 'non_precisee', label: 'Non précisée' },
];

const VUE_LABELS = Object.fromEntries(SCHEMA_VUES.map((v) => [v.key, v.label]));
export const vueLabel = (key) => VUE_LABELS[key] || 'Non précisée';

/** liste normalisée des images d'une fiche (rétro-compat mono-image → 1 vue). */
export function ficheImages(fiche) {
  if (fiche && Array.isArray(fiche.images) && fiche.images.length) return fiche.images;
  if (fiche && fiche.imageId) {
    return [{ id: 'img-legacy', imageId: fiche.imageId, imageW: fiche.imageW || null, imageH: fiche.imageH || null, vue: 'non_precisee', coches: fiche.coches || [] }];
  }
  return [];
}

/** toutes les coches/zones de toutes les vues, à plat (quiz, théorie, décomptes). */
export function allCoches(fiche) {
  return ficheImages(fiche).flatMap((im) => im.coches || []);
}

/** nombre total de coches/zones du schéma (toutes vues). */
export function totalCoches(fiche) {
  return ficheImages(fiche).reduce((n, im) => n + ((im.coches || []).length), 0);
}
