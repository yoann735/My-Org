// Captures AVANT / APRÈS (02/11) : couche de texte visible sur « Le corps virtuel » (PDF réel, p. 41), au repos puis après
// deux pincements enchaînés ; glisser au surligneur de l'encre du « c » à l'encre du « l ».
// CDP_PORT=9337 CDP_FILTRE=5302 FX=<dossier> node avant.mjs avant|apres
import { banc } from './commun.mjs';
const tag = process.argv[2] || 'avant';
const b = await banc(1440, 900);
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
const P = { id: 'f-al', titre: 'Anthropo', fichier: 'anthropo.pdf', page: 41, texte: 'Le corps virtuel' };
await b.preparer(P);
await b.coucheVisible(true); await b.dormir(300);
await b.capture(`${tag}-couche-repos`, 41, P.texte);
console.log('repos : écart de largeur max', await b.ecartLargeurs(41), '%');
await b.coucheVisible(false);
// pincement 1 (zoom posé), puis 2e pincement ouvert pendant que la page se redessine et que la couche se reconstruit
// (le 2e revient à l'écart de départ : zoom inchangé, donc aucune reconstruction de la couche après coup)
await b.pincer(720, 450, 1.25); await b.dormir(60);
await b.pincer(720, 450, 1.7, { tenir: 1800, pas: 6, retour: true }); await b.dormir(2500);
await b.centrer(41, P.texte);
console.log('après deux pincements : écart de largeur max', await b.ecartLargeurs(41), '%');
await b.coucheVisible(true); await b.dormir(300);
await b.capture(`${tag}-couche-pincement`, 41, P.texte);
await b.coucheVisible(false);
const e = await b.encre(41, P.texte, 'corps virtuel');
await b.outil('Surligneur'); await b.dormir(300);
await b.glisser([e.debut + 1, e.y], [e.fin - 1, e.y]);
console.log('surligné', JSON.stringify(await b.surlignages('f-al')));
await b.outil('Sélection').catch(() => {}); await b.ev(`getSelection().removeAllRanges(); 1`); await b.dormir(500);
await b.capture(`${tag}-surlignage-pincement`, 41, P.texte);
process.exit(0);
