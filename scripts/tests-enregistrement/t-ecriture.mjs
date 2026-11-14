// Banc « enregistrement continu » — ordinateur ou tablette : node t-ecriture.mjs ordi|tablette
//  1. un caractère tapé dans une boîte, onglet FERMÉ 100 ms après → le caractère est là à la réouverture ;
//  2. écrit dans IndexedDB < 300 ms après la frappe, y compris pendant une frappe continue ;
//  3. avertissement de fermeture : seulement pendant une écriture locale non terminée ;
//  4. échec d'écriture locale simulé → message d'erreur visible et persistant, effacé par l'écriture suivante.
import { appareil, dormir } from './commun.mjs';
const type = process.argv[2] || 'ordi';
const COURS = 'Glandes (test)';
let b = await appareil(type);
await b.ouvrirApp();
await b.nettoyer();
b.ok(await b.ouvrirCours(COURS), 'cours de test ouvert dans le lecteur');
await dormir(1500);

// --- 1. frappe puis fermeture de l'onglet 100 ms après
const id1 = await b.nouvelleBoite(0.1, 0.12, 1);
b.ok(!!id1, 'boîte créée par un vrai ' + (b.tactile ? 'toucher' : 'clic') + ' avec l’outil Boîte', id1);
await b.ecrire('Q');
await dormir(100);
const idOnglet = b.id;
await fetch(`http://localhost:${b.port}/json/close/${idOnglet}`, { method: 'PUT' }); // fermeture brutale de l'onglet
b.fermerWs();
await dormir(1500);
const echecs0 = b.echecs;
b = await appareil(type, { nouvelOnglet: true });
b.echecs = echecs0;
await b.charger();
const relu = await b.S(`return await S.getOne('annotations', ${JSON.stringify(id1)})`);
b.ok(!!relu && b.texte(relu).includes('Q'), 'onglet fermé 100 ms après la frappe : le caractère est là à la réouverture', relu ? JSON.stringify(b.texte(relu)) : 'boîte absente');
await b.ouvrirApp();
b.ok(await b.ouvrirCours(COURS), 'cours rouvert'); await dormir(1200);

// --- 2. délai frappe → IndexedDB, frappe continue (une lettre toutes les 60 ms pendant 1,8 s)
const id2 = await b.nouvelleBoite(0.1, 0.3, 1);
const delais = [];
let texte = '';
for (let i = 0; i < 30; i++) {
  const c = 'abcdefghijklmnopqrstuvwxyz0123'[i];
  texte += c;
  const t0 = Date.now();
  await b.ecrire(c);
  // attendre que la base contienne ce caractère (sondage serré)
  let vu = false;
  for (let k = 0; k < 60 && !vu; k++) {
    vu = await b.S(`const a = await S.getOne('annotations', ${JSON.stringify(id2)}); return !!a && JSON.stringify(a.content).includes(${JSON.stringify(texte)});`);
    if (!vu) await dormir(10);
  }
  delais.push(vu ? Date.now() - t0 : 9999);
  await dormir(Math.max(0, 60 - (Date.now() - t0)));
}
const max = Math.max(...delais), med = delais.slice().sort((x, y) => x - y)[15];
b.ok(max < 300, `frappe continue : chaque caractère est dans IndexedDB en moins de 300 ms (médiane ${med} ms, max ${max} ms, sondage compris)`);
await dormir(400);
b.ok(['appareil', 'envoye'].includes(await b.etatEnr()), 'indicateur après frappe : enregistré', await b.etatEnr());

// --- 3. avertissement de fermeture : jamais au repos, oui pendant une écriture locale non terminée
const repos = await b.ev(`(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })()`);
b.ok(repos === false, 'au repos : aucun avertissement à la fermeture');
const pendant = await b.ev(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js');
  const p = S.put('annotations', { ...(await S.getOne('annotations', ${JSON.stringify(id2)})) });
  const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); await p; return e.defaultPrevented; })()`);
b.ok(pendant === true, 'écriture locale en cours : le navigateur avertit avant de fermer');

// --- 4. échec d'écriture locale simulé (IndexedDB refuse toute écriture)
await b.ev(`(() => { window.__putOrig = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function () { throw new DOMException('quota simulé', 'QuotaExceededError'); }; return 1; })()`);
await b.ecrire(' panne');
await b.attendre(`!!document.querySelector('[data-erreur-enregistrement]')`, 4000);
const err = await b.ev(`(() => { const e = document.querySelector('[data-erreur-enregistrement]'); return e ? e.innerText : null; })()`);
b.ok(!!err && /non enregistrée/.test(err), 'écriture locale impossible : message d’erreur visible', err);
b.ok((await b.etatEnr()) === 'erreur', 'indicateur : « Erreur » (jamais « Enregistré »)');
await b.capture(`erreur-ecriture-${type}`);
await dormir(2000);
b.ok(!!(await b.ev(`!!document.querySelector('[data-erreur-enregistrement]')`)), 'le message reste affiché (persistant)');
await b.ev(`(IDBObjectStore.prototype.put = window.__putOrig, 1)`);
await b.ecrire(' réparé');
await b.attendre(`!document.querySelector('[data-erreur-enregistrement]')`, 4000);
const final = await b.S(`return await S.getOne('annotations', ${JSON.stringify(id2)})`);
b.ok(!(await b.ev(`!!document.querySelector('[data-erreur-enregistrement]')`)) && b.texte(final).includes('réparé') && b.texte(final).includes('panne'),
  'stockage rétabli : l’écriture suivante réussit, rien de perdu (texte tapé pendant la panne compris)', b.texte(final).slice(-40));
await b.echap(); await dormir(300);
await b.capture(`indicateur-${type}`);
process.exitCode = b.fin();
b.fermerWs();
