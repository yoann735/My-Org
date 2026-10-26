// Retire le jeu de test de l'export (cours fx-*, matières mx / mx2, section sx) du profil de banc (C, ou D avec « tel ») :
// les autres bancs (séance du jour, par cours) comptent les cartes dues de TOUT le profil.
import { banc } from './commun.mjs';
const b = await banc(process.argv[2] === 'tel');
await b.ouvrirApp({ recharger: true });
const r = await b.S(`let n=0;for(const q of await S.getAll('questions'))if(/^fx-/.test(q.ficheId||'')){await S.remove('questions',q.id);n++}
  for(const f of await S.getAll('fiches'))if(/^fx-/.test(f.id))await S.remove('fiches',f.id);
  for(const id of ['mx','mx2'])await S.remove('matieres',id);await S.remove('sources','sx');await S.setMeta('seanceFC',null);return n`);
console.log('nettoyé :', r, 'cartes');
process.exit(0);
