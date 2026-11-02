// Captures AVANT / APRÈS (02/11) : couche de texte visible sur « Le corps virtuel » (PDF réel, p. 41), au repos puis après
// deux pincements enchaînés ; glisser au surligneur de l'encre du « c » à l'encre du « l ».
// CDP_PORT=9337 CDP_FILTRE=5302 FX=<dossier> node avant.mjs avant|apres
import { banc } from './commun.mjs';
const tag = process.argv[2] || 'avant';
const CIBLES = {
  corps: { id: 'f-al', titre: 'Anthropo', fichier: 'anthropo.pdf', page: 41, texte: 'Le corps virtuel', passage: 'corps virtuel', nom: '' },
  exemple: { id: 'f-al-deonto', titre: 'Deonto', fichier: 'deonto.pdf', page: 3, texte: 'Possible pour donner un exemple positif', passage: 'exemple positif', nom: '-exemple' },
};
const C = CIBLES[process.argv[3] || 'corps'];
const b = await banc(1440, 900);
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
const P = C;
await b.preparer(P);
await b.coucheVisible(true); await b.dormir(300);
await b.capture(`${tag}${C.nom}-couche-repos`, P.page, P.texte);
console.log('repos : écart de largeur max', await b.ecartLargeurs(P.page), '%');
await b.coucheVisible(false);
// pincement 1 (zoom posé), puis 2e pincement ouvert pendant que la page se redessine et que la couche se reconstruit
// (le 2e revient à l'écart de départ : zoom inchangé, donc aucune reconstruction de la couche après coup)
await b.pincer(720, 450, 1.25); await b.dormir(60);
await b.pincer(720, 450, 1.7, { tenir: 1800, pas: 6, retour: true }); await b.dormir(2500);
await b.centrer(P.page, P.texte);
console.log('après deux pincements : écart de largeur max', await b.ecartLargeurs(P.page), '%');
await b.coucheVisible(true); await b.dormir(300);
await b.capture(`${tag}${C.nom}-couche-pincement`, P.page, P.texte);
await b.coucheVisible(false);
const e = await b.pointsPdf(P.id, P.page, P.passage);
await b.surligneur();
const sous = await b.ev(`(() => { const x = document.elementFromPoint(${e.debut + 1.5}, ${e.y}); return x ? x.tagName + '.' + (typeof x.className === 'string' ? x.className : '') + ' «' + (x.textContent || '').slice(0, 20) + '»' : 'rien'; })()`);
console.log('glisser', JSON.stringify(e), '— sous le départ :', sous);
await b.glisser([e.debut + 1.5, e.y], [e.fin - 1.5, e.y]); await b.dormir(1000);
console.log('surligné', JSON.stringify(await b.surlignages(P.id)));
await b.outil('Sélection').catch(() => {}); await b.ev(`getSelection().removeAllRanges(); 1`); await b.dormir(500);
await b.capture(`${tag}${C.nom}-surlignage-pincement`, P.page, P.texte);
process.exit(0);
