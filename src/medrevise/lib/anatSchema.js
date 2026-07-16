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

import { useEffect, useState } from 'react';

/* Vues d'une image de schéma. Le terme MÉDICAL (`med`) est le libellé principal ET
   la valeur qui fait foi (stockée sur l'image via `key`). `common` (terme courant) et
   `def` (définition brève) ne servent qu'à l'AIDE affichée — jamais stockés.
   Les CLÉS sont inchangées vs la version précédente (face, dos, profil_g, profil_d,
   sup, inf, …) → aucune migration : les images déjà enregistrées restent valides. */
export const SCHEMA_VUES = [
  { key: 'face', med: 'Antérieure', common: 'vue de face', def: 'de devant' },
  { key: 'dos', med: 'Postérieure', common: 'vue de dos', def: 'de derrière' },
  { key: 'profil_d', med: 'Latérale droite', common: 'profil droit', def: 'côté droit' },
  { key: 'profil_g', med: 'Latérale gauche', common: 'profil gauche', def: 'côté gauche' },
  { key: 'mediale', med: 'Médiale', common: '', def: 'du côté intérieur, vers l\'axe du corps' },
  { key: 'sup', med: 'Supérieure', common: 'vue de dessus', def: '' },
  { key: 'inf', med: 'Inférieure', common: 'vue de dessous', def: '' },
  { key: 'proximale', med: 'Proximale', common: '', def: 'vers la racine du membre' },
  { key: 'distale', med: 'Distale', common: '', def: 'vers l\'extrémité du membre' },
  { key: 'autre', med: 'Autre', common: '', def: '' },
  { key: 'non_precisee', med: 'Non précisée', common: '', def: '' },
];

const VUE_BY_KEY = Object.fromEntries(SCHEMA_VUES.map((v) => [v.key, v]));

/** libellé d'une vue : terme médical seul, ou avec l'aide (terme courant + définition). */
export function vueLabel(key, aide = false) {
  const v = VUE_BY_KEY[key] || VUE_BY_KEY.non_precisee;
  if (!aide) return v.med;
  const help = [v.common, v.def].filter(Boolean).join(' — ');
  return help ? `${v.med} (${help})` : v.med;
}

/* ---- switch « Aide » GLOBAL (mémorisé), partagé entre tous les composants qui
   affichent des vues (import ET révision). localStorage + petit bus d'abonnés pour
   que le basculement se reflète partout immédiatement. Défaut : activé. ---- */
const AIDE_KEY = 'medrevise.vueAide';
const _readAide = () => { try { const v = localStorage.getItem(AIDE_KEY); return v == null ? true : JSON.parse(v); } catch (e) { return true; } };
let _aide = _readAide();
const _subs = new Set();

export function useVueAide() {
  const [aide, setLocal] = useState(_aide);
  useEffect(() => { const fn = (v) => setLocal(v); _subs.add(fn); setLocal(_aide); return () => { _subs.delete(fn); }; }, []);
  const setAide = (v) => {
    _aide = !!v;
    try { localStorage.setItem(AIDE_KEY, JSON.stringify(_aide)); } catch (e) { /* ignore */ }
    _subs.forEach((fn) => fn(_aide));
  };
  return [aide, setAide];
}

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
