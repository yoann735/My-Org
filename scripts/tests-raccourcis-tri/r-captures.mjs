// captures du compte rendu : arbre en ordre manuel (panneau)
import { ouvrir } from './commun.mjs';
const b = await ouvrir({ ecran: 'aucun' });
await b.ev(`localStorage.setItem('medrevise.biblio.tri','manuel');1`);
await b.recharger(); await b.allerA('Bibliothèque'); await b.dormir(1200);
await b.png('bt-arbre-manuel', '.lib-master-body');
b.c.fermer();
