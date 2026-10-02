/* ============================================================
   MedRevise — DESSIN DEPUIS LE TÉLÉPHONE (02/10). Mécanique complète :
   docs/mecanique-dessin-mobile.md.

   Deux petites choses voyagent par le cloud existant (stores syncables, outbox,
   RPC conditionnelle) — aucune liaison directe entre appareils :
   - la LIAISON : `liaison/ficheActive` = la fiche ouverte sur l'ordi ;
   - les DESSINS : une entrée `dessins/<id>` par dessin envoyé, dont l'image (PNG)
     suit le canal des blobs. L'entrée n'est écrite qu'APRÈS confirmation de
     l'envoi du blob, pour que l'ordi ne voie jamais une entrée sans image.
   ============================================================ */
import { useEffect, useRef } from 'react';
import { getOne, getAll, put, remove, putBlob, genId, synchroCiblee } from './storage.js';
import { flushBlobOutbox, blobOutboxEntries, flushOutbox } from '../data/sync.js';
import { SYNC_ENABLED } from '../data/supabaseClient.js';

export const SYNCHRO_ACTIVE = SYNC_ENABLED;
const ID_LIAISON = 'ficheActive';

/* ---------- liaison : la fiche ouverte sur l'ordi ---------- */

/** L'ordi publie la fiche qu'il ouvre (ouverte: true) ou qu'il ferme (ouverte: false,
    la fiche reste connue : « dernière fiche ouverte »). N'écrit que si ça change. */
/* Les publications sont mises EN FILE : un démontage suivi d'un remontage immédiat
   du lecteur (changement de disposition, double montage du mode dev) lançait trois
   écritures qui se croisaient — la dernière à finir n'était pas la dernière demandée
   (constaté : fiche ouverte mais `ouverte: false` au cloud). En file, chacune relit
   l'état laissé par la précédente. */
let filePublication = Promise.resolve();
export function publierFicheActive(etat) {
  filePublication = filePublication.then(() => publierMaintenant(etat), () => publierMaintenant(etat));
  return filePublication;
}
async function publierMaintenant({ ficheId, titre, ouverte }) {
  if (!ficheId) return;
  try {
    const avant = await getOne('liaison', ID_LIAISON);
    if (avant && avant.ficheId === ficheId && avant.ouverte === !!ouverte && avant.titre === (titre || null)) return;
    if (!ouverte && avant && avant.ficheId !== ficheId) return; // une autre fiche a pris la main entre-temps
    await put('liaison', { id: ID_LIAISON, ficheId, titre: titre || null, ouverte: !!ouverte, appareil: 'ordi', depuis: new Date().toISOString() });
  } catch (e) { /* stockage indisponible : la liaison n'est qu'un confort */ }
}

/** La fiche active connue localement (après synchroCiblee('liaison')). */
export async function lireFicheActive() {
  try { return (await getOne('liaison', ID_LIAISON)) || null; } catch (e) { return null; }
}

/* ---------- dessins ---------- */

/** Dessins d'une fiche, le plus récent d'abord. */
export async function dessinsDeFiche(ficheId) {
  try {
    return ((await getAll('dessins')) || []).filter((d) => d && d.ficheId === ficheId)
      .sort((a, b) => String(b.envoyeLe || '').localeCompare(String(a.envoyeLe || '')));
  } catch (e) { return []; }
}

/** retire UN dessin de la liste (tombstone de cet enregistrement seulement) ; une
    image déjà posée sur le PDF garde sa propre annotation, le blob n'est pas supprimé. */
export const retirerDessin = (d) => remove('dessins', d.id);

/**
 * Envoie un dessin (PNG) vers une fiche. ORDRE : blob écrit et envoyé d'abord ;
 * l'entrée `dessins` n'est écrite qu'ensuite. Hors ligne : tout est écrit
 * localement et les deux outbox existantes enverront au retour du réseau.
 * @returns {Promise<{ dessin, statut: 'envoye'|'attente'|'local' }>}
 */
export async function envoyerDessin(png, { ficheId, titre, largeur, hauteur, textes = [] }) {
  const blobId = await putBlob(png);
  let statut = 'local';
  if (SYNC_ENABLED) {
    await flushBlobOutbox();
    const restant = (await blobOutboxEntries()).some((e) => e && e.id === blobId);
    statut = restant ? 'attente' : 'envoye';
  }
  const dessin = {
    id: genId('ds'), ficheId, blobId, largeur, hauteur, titre: titre || null,
    // zones de texte (02/10 soir) : PAS dans le PNG — reposées sur l'ordi en textes libres
    // éditables. Positions et tailles en fractions de l'image : [{ texte, x, y, taille, largeur, couleur }]
    ...(textes && textes.length ? { textes } : {}),
    envoyeLe: new Date().toISOString(), appareil: 'mobile', createdAt: new Date().toISOString(),
  };
  await put('dessins', dessin);
  // l'ordi le guette : on n'attend pas le regroupement des envois (~800 ms), on pousse
  if (statut === 'envoye') { try { await flushOutbox(); } catch (e) { /* l'outbox réessaiera */ } }
  return { dessin, statut };
}

/* ---------- sondage du cloud ---------- */

/**
 * Sonde un store ciblé (synchroCiblee) au montage, au retour sur l'onglet, et
 * toutes les `ms` tant que la page est VISIBLE. `apres(changes)` est appelé après
 * chaque lecture (même sans changement : l'appelant relit son état local).
 */
export function useSondage(store, apres, { ms = 10000, actif = true } = {}) {
  const apresRef = useRef(apres); apresRef.current = apres;
  useEffect(() => {
    if (!actif) return undefined;
    let arrete = false, enCours = false;
    const tour = async () => {
      if (arrete || enCours || document.visibilityState === 'hidden') return;
      enCours = true;
      let r = { ok: false, changes: 0 };
      try { if (SYNC_ENABLED) r = await synchroCiblee(store); } catch (e) { /* hors ligne : au prochain tour */ }
      enCours = false;
      if (!arrete) apresRef.current(r);
    };
    tour();
    const t = setInterval(tour, ms);
    const vis = () => { if (document.visibilityState === 'visible') tour(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('medrevise:recharge', tour);
    return () => { arrete = true; clearInterval(t); document.removeEventListener('visibilitychange', vis); window.removeEventListener('medrevise:recharge', tour); };
  }, [store, ms, actif]);
}
