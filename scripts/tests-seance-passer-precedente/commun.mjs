// Banc « séance : Passer / Précédente + formulaire de flashcard unique » (20/11/2026,
// docs/compte-rendu-seance-passer-precedente-et-formulaire-fc.md). DONNÉES DE TEST UNIQUEMENT, jamais le vrai cloud.
//   Vite :5314 (VITE_SUPABASE_URL=http://localhost:54399) + faux Supabase :54399 (scripts/faux-supabase.mjs, JOURNAL=1,
//   contrainte rating active = comme la vraie table tant que la migration 20261024 n'est pas appliquée) ;
//   Chrome headless aux profils NEUFS : 9345 ordinateur 1440×900 (souris), 9346 téléphone 390×844 (tactile),
//   9347 tablette iPad 820×1180 (tactile). Outils CDP repris du banc du mode file d'attente (horloge simulée dans la page).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appareil as appareilFA, ajouterJours, dormir } from '../tests-file-attente/commun.mjs';

export { ajouterJours, dormir };
export const BASE = 'http://localhost:5314';
export const DOSSIER_IMG = fileURLToPath(new URL('../../docs/img/seance-passer-precedente/', import.meta.url));
fs.mkdirSync(DOSSIER_IMG, { recursive: true });

export async function appareil(type) {
  const b = await appareilFA(type, BASE);
  b.capture = async (nom) => { const s = await b.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(DOSSIER_IMG + nom + '-' + type + '.png', Buffer.from(s.result.data, 'base64')); };
  b.touche = async (key, code = key, vk = 0) => {
    for (const t of ['keyDown', 'keyUp']) await b.send('Input.dispatchKeyEvent', { type: t, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await dormir(450);
  };
  /** instantané : toutes les cartes (JSON), le journal (ids + entrées), la séance */
  b.instantane = () => b.ev(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js'); const J = await __imp('/src/medrevise/journal/journal.js');
    const q = {}; for (const c of await S.getAll('questions')) q[c.id] = c;
    const j = (await J.toutLeJournal()).sort((a, b) => (a.reviewed_at + a.id < b.reviewed_at + b.id ? -1 : 1));
    return { cartes: q, journal: j, seance: await S.getMeta('seanceFC') }; })()`);
  b.seance = () => b.ev(`(async () => (await (await __imp('/src/medrevise/lib/storage.js')).getMeta('seanceFC')))()`);
  // compteur de vues : passe complète sur le journal local avec LA fonction de l'app (lib/vuesCartes.js compterVues)
  b.vues = (id) => b.ev(`(async () => { const V = await __imp('/src/medrevise/lib/vuesCartes.js'); const J = await __imp('/src/medrevise/journal/journal.js'); return V.compterVues(await J.toutLeJournal()).get(${JSON.stringify(id)}) || 0; })()`);
  b.prog = () => b.ev(`(document.querySelector('.sfc-prog') || {}).textContent || ''`);
  b.carteAffichee = () => b.ev(`(document.querySelector('.sfc-carte[data-carte]') || { dataset: {} }).dataset.carte || null`);
  b.retourner = () => b.clic(`document.querySelector('.sfc-carte')`, 450);
  b.noterBouton = (n) => b.clic(`document.querySelector('.sfc-notes [data-note="${n}"]')`, 1200);
  b.nav = (quoi) => b.clic(`document.querySelector('.sfc-nav [data-nav="${quoi}"], .sfc-fin-actions [data-nav="${quoi}"]')`, 700);
  return b;
}

/** cartes de test, dates relatives au jour J */
export function jeu(J) {
  const H = [{ date: ajouterJours(J, -9), qualite: 5 }];
  const rev = (id, due, f) => ({ id, type: 'flashcard', ficheId: f, theme: 'Test', recto: `Question ${id} ?`, verso: `Réponse ${id}`, intervalDays: 4, dueDate: due, j0Date: ajouterJours(J, -20), nouvelle: false, historique: H, missed: 0, capped: false, termine: false });
  return [
    rev('ret-1', ajouterJours(J, -3), 'fa-f1'), rev('ret-2', ajouterJours(J, -2), 'fa-f2'),
    rev('rev-1', J, 'fa-f1'), rev('rev-2', J, 'fa-f2'), rev('rev-3', J, 'fa-f3'), rev('rev-4', J, 'fa-f1'),
    { id: 'nv-1', type: 'flashcard', ficheId: 'fa-f1', theme: 'Test', recto: 'Nouvelle 1 ?', verso: 'R1', historique: [], nouvelle: true, intervalDays: 1, dueDate: ajouterJours(J, -1), j0Date: ajouterJours(J, -1) },
    { id: 'nv-2', type: 'flashcard', ficheId: 'fa-f2', theme: 'Test', recto: 'Nouvelle 2 ?', verso: 'R2', historique: [], nouvelle: true, intervalDays: 1, dueDate: ajouterJours(J, -1), j0Date: ajouterJours(J, -1) },
  ];
}
