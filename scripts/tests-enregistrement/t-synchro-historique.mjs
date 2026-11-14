// Banc « hors ligne, échec d'envoi, conflit, garde-fou, historique » — node t-synchro-historique.mjs ordi|tablette
import { appareil, dormir, sb, FAUX_SB } from './commun.mjs';
const type = process.argv[2] || 'ordi';
const COURS = 'Glandes (test)', NS = 'f-enr';
const cloud = async (id) => { const e = await (await fetch(FAUX_SB + '/__etat')).json(); return e.rows.find((r) => r.store === 'annotations' && r.record_id === id) || null; };
let b = await appareil(type);
await b.ouvrirApp();
await b.nettoyer();
await b.attendreSynchro(30000);
b.ok(await b.ouvrirCours(COURS), 'cours de test ouvert'); await dormir(1200);

// ---------- 1. hors ligne : écrire, recharger hors ligne, tout est là, « En attente d'envoi » ; retour → envoyé
await b.horsLigne(true);
const idH = await b.nouvelleBoite(0.1, 0.5, 1);
await b.ecrire('Écrit hors ligne'); await dormir(600);
await b.echap(); await dormir(500);
await b.attendre(`document.querySelector('[data-enregistrement]')?.dataset.enregistrement === 'attente'`, 6000);
b.ok((await b.etatEnr()) === 'attente', 'hors ligne : « En attente d’envoi »', await b.etatEnr());
await b.capture(`hors-ligne-attente-${type}`);
await b.send('Page.reload'); await b.attendre(`document.readyState === 'complete'`, 20000); await dormir(2500);
await b.ouvrirApp();
const apresRech = await b.S(`return await S.getOne('annotations', ${JSON.stringify(idH)})`);
b.ok(!!apresRech && b.texte(apresRech).includes('hors ligne'), 'rechargé hors ligne : le texte est là', b.texte(apresRech));
const ob = await b.ev(`(async () => { const y = await __imp('/src/medrevise/data/sync.js'); return (await y.outboxEntries()).filter(([, v]) => v.record_id === ${JSON.stringify(idH)}).length; })()`);
b.ok(ob === 1, 'la file d’envoi (IndexedDB) a survécu au rechargement', 'entrées : ' + ob);
b.ok(!(await cloud(idH)) || !b.texte((await cloud(idH)).data).includes('hors ligne'), 'rien n’est arrivé au serveur pendant la coupure');
await b.ouvrirCours(COURS); await dormir(1500);
b.ok((await b.etatEnr()) === 'attente', 'après rechargement hors ligne : toujours « En attente d’envoi »', await b.etatEnr());
await b.horsLigne(false);
await b.attendre(`document.querySelector('[data-enregistrement]')?.dataset.enregistrement === 'envoye'`, 20000);
b.ok((await b.etatEnr()) === 'envoye', 'retour du réseau : envoi automatique, « Enregistré et envoyé »', await b.etatEnr());
b.ok(b.texte((await cloud(idH) || {}).data).includes('hors ligne'), 'le texte est au serveur');
await b.capture(`envoye-${type}`);

// ---------- 2. échec d'envoi simulé : refus du serveur, puis erreur réseau (panne 500) — jamais « envoyé »
for (const [nom, panne, retablir] of [['refus du serveur', '/__refuser?stores=annotations', '/__refuser?stores='], ['erreur réseau (serveur en panne)', '/__panne?code=503', '/__panne?code=0']]) {
  await sb(panne);
  const idE = await b.nouvelleBoite(0.1, 0.62 + (nom.startsWith('refus') ? 0 : 0.1), 1);
  await b.ecrire('Échec : ' + nom); await dormir(300); await b.echap();
  const vus = new Set();
  for (let i = 0; i < 40; i++) { vus.add(await b.etatEnr()); await dormir(150); }
  b.ok(!vus.has('envoye'), `${nom} : jamais « Enregistré et envoyé »`, [...vus].join(', '));
  b.ok((await b.etatEnr()) === 'attente', `${nom} : « En attente d’envoi »`);
  const loc = await b.S(`return await S.getOne('annotations', ${JSON.stringify(idE)})`);
  b.ok(b.texte(loc).includes('Échec'), `${nom} : rien de perdu en local`);
  if (nom.startsWith('refus')) await b.capture(`refus-serveur-${type}`);
  await sb(retablir);
  await b.ev(`(async () => { const y = await __imp('/src/medrevise/data/sync.js'); await y.flushOutbox(); return 1; })()`);
  await b.attendre(`document.querySelector('[data-enregistrement]')?.dataset.enregistrement === 'envoye'`, 20000);
  b.ok((await b.etatEnr()) === 'envoye', `${nom} réparé : envoyé`);
}

// ---------- 3. conflit entre deux onglets : aucune version perdue, la non retenue est dans l'historique
const idC = await b.nouvelleBoite(0.1, 0.85, 1);
await b.ecrire('Version de départ'); await dormir(400); await b.echap(); await dormir(600);
const b2 = await appareil(type, { nouvelOnglet: true });
await b2.ouvrirApp();
// onglet 2 : écrit sa version (écriture directe, comme une édition dans cet onglet)
await b2.S(`const a = await S.getOne('annotations', ${JSON.stringify(idC)}); const d = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] }); await S.put('annotations', { ...a, content: d('Version de l’onglet 2') }); return 1;`);
// onglet 1 : réécrit la boîte depuis SON écran (périmé) — la version de l'onglet 2 ne doit pas être perdue
await b.ev(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js'); const a = await S.getOne('annotations', ${JSON.stringify(idC)}); const d = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] }); await S.put('annotations', { ...a, content: d('Version de l’onglet 1') }); return 1; })()`);
await dormir(800);
const vers = await b.ev(`(async () => { const H = await __imp('/src/medrevise/lib/historiqueDoc.js'); return (await H.listerVersions(${JSON.stringify(NS)})).map((v) => ({ raison: v.raison, textes: v.contenu.annotations.filter((a) => a.id === ${JSON.stringify(idC)}).map((a) => JSON.stringify(a.content)) })); })()`);
const gardee = vers.find((v) => /autre onglet/.test(v.raison) && v.textes.some((t) => t.includes('onglet 2')));
b.ok(!!gardee, 'conflit entre deux onglets : la version non retenue (onglet 2) est dans l’historique', gardee ? gardee.raison : JSON.stringify(vers.map((v) => v.raison)));
b2.fermerWs();
await fetch(`http://localhost:${b.port}/json/close/${b2.id}`, { method: 'PUT' });

// ---------- 4. garde-fou : annotation disparue sans suppression enregistrée → alerte à l'ouverture
await b.fermerCours(); await dormir(800);
await b.ouvrirCours(COURS); await dormir(1500); // référence prise à cette ouverture
await b.fermerCours(); await dormir(800);
const victime = 'an-seed-4';
const avantTexte = b.texte(await b.S(`return await S.getOne('annotations', '${victime}')`));
await b.ev(`(async () => { const k = await __imp('/node_modules/.vite/deps/idb-keyval.js'); await k.del('${victime}', k.createStore('medrevise-annotations', 'v1')); return 1; })()`);
await b.ouvrirCours(COURS);
await b.attendre(`!!document.querySelector('[data-disparues]')`, 8000);
const alerte = await b.ev(`(() => { const e = document.querySelector('[data-disparues]'); return e ? e.innerText : null; })()`);
b.ok(!!alerte && /1 boîte a disparu de ce document/.test(alerte), 'disparition simulée : alerte « 1 boîte a disparu de ce document » à l’ouverture', alerte && alerte.slice(0, 90));
b.ok(!(await b.S(`return !!(await S.getOne('annotations', '${victime}'))`)), 'rien n’est restauré automatiquement');
await b.capture(`alerte-disparition-${type}`);

// ---------- 5. historique : « Récupérer les boîtes manquantes » n'ajoute que les absentes
const empreinteAutres = () => b.S(`return JSON.stringify((await S.getAll('annotations')).filter((a) => a.ficheId === '${NS}' && a.id !== '${victime}').map((a) => [a.id, JSON.stringify(a.content), a.x, a.y]).sort())`);
const autresAvant = await empreinteAutres();
await b.clic(`[...document.querySelectorAll('[data-disparues] button')].find((x) => /historique/i.test(x.innerText))`, 1200);
b.ok(await b.attendre(`!!document.querySelector('[data-historique]')`, 5000), 'bouton « Voir l’historique » : fenêtre Historique ouverte');
await b.attendre(`!!document.querySelector('.hv-recherche.fait, .hv-recherche.erreur')`, 30000);
const recherche = await b.ev(`(document.querySelector('.hv-recherche') || {}).innerText || ''`);
const nbVersions = await b.ev(`document.querySelectorAll('.hv-version').length`);
const retrouvee = await b.ev(`[...document.querySelectorAll('.hv-raison')].some((x) => /Retrouvée dans la sauvegarde du/.test(x.innerText))`);
b.ok(retrouvee, 'copie quotidienne (faux GitHub) ajoutée à l’historique : « Retrouvée dans la sauvegarde du … »', recherche);
b.ok(nbVersions >= 3, `liste des versions par date et heure (${nbVersions})`);
const choisie = await b.ev(`(() => { const a = document.querySelector('.hv-version.actif'); return a ? a.innerText.replace(/\\n/g, ' · ') : null; })()`);
b.ok(/absent/.test(choisie || ''), 'la version de référence est présélectionnée et signale l’élément absent', choisie);
b.ok(await b.ev(`!!document.querySelector('.hv-page .hv-boite.absent')`), 'aperçu de la page : la boîte absente est cerclée (lecture seule)');
await b.capture(`historique-${type}`);
await b.clic(`document.querySelector('[data-action="recuperer"]')`, 1500);
await b.attendre(`/récupéré/.test((document.querySelector('.hv-message') || {}).innerText || '')`, 6000);
const recup = await b.S(`return await S.getOne('annotations', '${victime}')`);
b.ok(!!recup && b.texte(recup) === avantTexte, 'boîte manquante récupérée avec son texte', b.texte(recup).slice(0, 50));
b.ok((await empreinteAutres()) === autresAvant, 'aucune autre boîte modifiée par la récupération');
await b.capture(`historique-apres-recuperation-${type}`);

// ---------- 6. « Restaurer cette version » est annulable
await b.ev(`(() => { const x = document.querySelector('.modal-close, [aria-label="Fermer"]'); x && x.click(); return 1; })()`); await b.echap(); await dormir(500);
const avantModif = await b.S(`return JSON.stringify((await S.getAll('annotations')).filter((a) => a.ficheId === '${NS}').map((a) => [a.id, JSON.stringify(a.content)]).sort())`);
await b.S(`const a = await S.getOne('annotations', 'an-seed-0'); const d = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] }); await S.put('annotations', { ...a, content: d('Texte modifié après coup') }); return 1;`);
await b.ev(`(async () => { const H = await __imp('/src/medrevise/lib/historiqueDoc.js'); await H.garderVersion('${NS}', 'Test : après modification', { force: true }); return 1; })()`);
await b.clic(`document.querySelector('[data-enregistrement]')`, 1200); // l'indicateur ouvre l'historique
await b.attendre(`!!document.querySelector('[data-historique]')`, 5000);
// la version d'avant la modification : la plus récente dont la boîte an-seed-0 n'a pas le texte modifié
const idx = await b.ev(`(async () => { const H = await __imp('/src/medrevise/lib/historiqueDoc.js'); const vs = await H.listerVersions('${NS}'); const v = vs.find((x) => !x.source && x.contenu.annotations.some((a) => a.id === 'an-seed-0' && !JSON.stringify(a.content).includes('modifié après'))); return v ? v.id : null; })()`);
await b.clic(`document.querySelector('[data-version="${idx}"]')`, 600);
await b.clic(`document.querySelector('[data-action="restaurer"]')`, 400);
await b.clic(`document.querySelector('[data-action="confirmer-restauration"]')`, 1500);
await b.attendre(`/restaurée/.test((document.querySelector('.hv-message') || {}).innerText || '')`, 8000);
const apresRest = await b.S(`return await S.getOne('annotations', 'an-seed-0')`);
b.ok(!b.texte(apresRest).includes('modifié après'), 'restauration : le texte d’avant est revenu', b.texte(apresRest).slice(0, 40));
const avantRest = await b.ev(`(async () => { const H = await __imp('/src/medrevise/lib/historiqueDoc.js'); const v = (await H.listerVersions('${NS}')).find((x) => x.raison === 'Avant restauration'); return v ? v.id : null; })()`);
b.ok(!!avantRest, 'la version actuelle a d’abord été gardée (« Avant restauration »)');
await b.clic(`document.querySelector('[data-version="${avantRest}"]')`, 600);
await b.clic(`document.querySelector('[data-action="restaurer"]')`, 400);
await b.clic(`document.querySelector('[data-action="confirmer-restauration"]')`, 1500);
await b.attendre(`/restaurée/.test((document.querySelector('.hv-message') || {}).innerText || '')`, 8000);
const annule = await b.S(`return await S.getOne('annotations', 'an-seed-0')`);
b.ok(b.texte(annule).includes('modifié après'), 'restaurer « Avant restauration » annule la restauration', b.texte(annule).slice(0, 40));
await b.echap(); await dormir(400);
// remise en état du jeu de test
await b.S(`const a = await S.getOne('annotations', 'an-seed-0'); const d = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] }); await S.put('annotations', { ...a, content: d('Boîte de test 0 : glande exocrine, acinus, canal excréteur') }); return 1;`);
process.exitCode = b.fin();
b.fermerWs();
