// 8) GLISSER-DÉPOSER dans la feuille « Nouvelle notion » (ordinateur) : vrais glisser-déposer de fichiers du disque
//    via CDP Input.dispatchDragEvent (comme depuis le Finder). Zone « Fiche PDF » : 1er PDF → fiche ; un HTML y est
//    refusé ; zone « Exercices » : HTML + PDF ajoutés ; ailleurs dans la feuille → exercices ; la zone s'illumine.
//    node t-glisser.mjs
import { appareil, gestes, fixtures, dormir } from './commun.mjs';
const f = await fixtures();
const b = await appareil('ordi');
const g = gestes(b);
await b.ouvrirApp(); await b.attendreSynchro();
await b.N(`for (const n of await N.lireNotions()) if (/^Notion glissée/.test(n.nom)) await S.remove('exo_notion', n.id); return 1`); await dormir(400);
b.ok(await g.allerExos(), 'page Exos');
b.ok(await g.nouvelle(), 'feuille « Nouvelle notion »');
await g.remplir({ nom: 'Notion glissée' });

const glisser = async (cible, fichiers, { lacher = true } = {}) => {
  const r = await b.rect(cible);
  const data = { items: [], files: fichiers, dragOperationsMask: 1 };
  await b.send('Input.dispatchDragEvent', { type: 'dragEnter', x: r.cx, y: r.cy, data });
  await b.send('Input.dispatchDragEvent', { type: 'dragOver', x: r.cx, y: r.cy, data });
  await dormir(200);
  const actif = await b.ev(`[...document.querySelectorAll('.exo-depot.actif')].map((e) => e.dataset.depot).join(',')`);
  if (lacher) await b.send('Input.dispatchDragEvent', { type: 'drop', x: r.cx, y: r.cy, data });
  await dormir(400);
  return actif;
};
const zone = (z) => `document.querySelector('[data-depot="${z}"]')`;
const url = () => b.ev('location.href');
const avant = await url();

// un HTML sur la zone fiche : refusé
await glisser(zone('fiche'), [f('QCM-acido-basique.html')]);
b.ok(/La fiche doit être un PDF/.test(await b.ev(`(document.querySelector('.exo-erreur') || {}).innerText || ''`)), 'zone Fiche : un HTML est refusé (message)');
// PDF sur la zone fiche (avec surbrillance pendant le survol)
const surFiche = await glisser(zone('fiche'), [f('Fiche-acido-basique.pdf')]);
b.ok(surFiche === 'fiche', 'zone Fiche : s’illumine pendant le survol', surFiche);
b.ok(await b.ev(`!!document.querySelector('[data-depot="fiche"] [data-fichier-ligne]') && document.querySelector('[data-depot="fiche"] .exo-f-nom').innerText.includes('Fiche acido basique')`), 'zone Fiche : le PDF déposé devient la fiche');
b.ok(!(await b.ev(`document.querySelector('.exo-erreur')`)), 'message d’erreur effacé');
// HTML + PDF sur la zone exercices
const surExos = await glisser(zone('exos'), [f('QCM-acido-basique.html'), f('Exos-gaz-du-sang.pdf')]);
await b.capture('glisser-feuille');
b.ok(surExos === 'exos', 'zone Exercices : s’illumine pendant le survol', surExos);
b.ok((await g.lignes()).join('|') === '1. QCM acido basique · nouveau|2. Exos gaz du sang · nouveau', 'zone Exercices : HTML et PDF ajoutés dans l’ordre', (await g.lignes()).join(' | '));
// lâché ailleurs dans la feuille (sur le champ Nom) → exercices
await glisser(`document.querySelector('input[aria-label="Nom de la notion"]')`, [f('Exos-goldman.html')]);
b.ok((await g.lignes()).length === 3 && (await g.lignes())[2].includes('Exos goldman'), 'lâché ailleurs dans la feuille : ajouté aux exercices');
b.ok(await b.ev(`document.querySelectorAll('.exo-depot.actif').length === 0`), 'plus de surbrillance après le dépôt');
b.ok((await url()) === avant, 'le navigateur n’ouvre jamais le fichier déposé (pas de navigation)');
// survol puis sortie sans lâcher : la surbrillance s'éteint
await glisser(zone('exos'), [f('Exos-nernst.pdf')], { lacher: false });
const r0 = await b.rect(`document.querySelector('.exo-feuille-pied')`);
await b.send('Input.dispatchDragEvent', { type: 'dragOver', x: r0.cx, y: r0.cy, data: { items: [], files: [f('Exos-nernst.pdf')], dragOperationsMask: 1 } });
await b.send('Input.dispatchDragEvent', { type: 'dragCancel', x: r0.cx, y: r0.cy, data: { items: [], files: [], dragOperationsMask: 1 } });
await dormir(300);
b.ok(await b.ev(`document.querySelectorAll('.exo-depot.actif').length === 0`) && (await g.lignes()).length === 3, 'survol puis sortie sans lâcher : rien n’est ajouté, la zone s’éteint');

b.ok(await g.valider(), 'créer la notion');
const n = (await g.notions()).find((x) => x.nom === 'Notion glissée');
b.ok(n && n.fiche && n.fiche.type === 'pdf' && n.exercices.map((x) => x.type).join(',') === 'html,pdf,html', 'notion enregistrée : 1 fiche PDF + 3 exercices (HTML, PDF, HTML)', n && JSON.stringify({ fiche: n.fiche && n.fiche.nom, exos: n.exercices.map((x) => x.nom) }));
await b.capture('glisser-notion');
// nettoyage du banc (notion de test, enregistrée par ce script)
await b.N(`for (const n of await N.lireNotions()) if (/^Notion glissée/.test(n.nom)) await S.remove('exo_notion', n.id); return 1`);
await b.synchro();
process.exitCode = b.fin();
b.fermerWs();
