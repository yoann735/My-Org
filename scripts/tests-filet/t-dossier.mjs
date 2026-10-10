// Filet de sécurité — DOSSIER LOCAL (File System Access) dans Chrome. Le sélecteur de dossier natif ne
// s'automatise pas en headless : la poignée utilisée est celle d'un dossier de l'OPFS (même API
// FileSystemDirectoryHandle : getDirectoryHandle, createWritable, queryPermission…), posée là où
// « Choisir le dossier des fichiers » range la sienne. Vérifie : copie (fichiers « <cours>/<fichier> »
// + données/YYYY-MM-DD), incrémental, 8 exports gardés, permission expirée (ligne discrète +
// « Autoriser »), navigateur sans l'API (section masquée).
// Usage : node t-dossier.mjs <dossier-captures>
import { appareil, ok, bilan } from '../tests-collage/outils.mjs';

const captures = process.argv[2] || '/tmp/filet';
const ouvert = `!!(document.querySelector('[data-app="medrevise"]') || document.querySelector('.sfa'))`;
async function ouvrirReglages(A) {
  await A.send('Page.reload'); await A.dormir(2500);
  if (!(await A.ev(ouvert))) await A.clic(await A.pos(`[...document.querySelectorAll('.hub-card')].find((c) => c.textContent.includes('MedRevise'))`));
  await A.attendre(ouvert, 30000); await A.dormir(4000);
  await A.ev(`(() => { const el = [...document.querySelectorAll('.sb-item')].find((b) => (b.getAttribute('title') || '').startsWith('Réglages')); el && el.click(); return 1; })()`);
  await A.attendre(`!!document.querySelector('[data-testid=carte-sauvegardes]')`); await A.dormir(800);
}
const lister = (A) => A.ev(`(async () => { const r = await navigator.storage.getDirectory(); const d = await r.getDirectoryHandle('sauvegarde-test'); const out = [];
  const tour = async (h, p) => { for await (const [n, x] of h.entries()) { if (x.kind === 'directory') await tour(x, p + n + '/'); else out.push(p + n); } }; await tour(d, ''); return out.sort(); })()`);

let A = await appareil(9335, { captures });
await ouvrirReglages(A);
// dossier de test (OPFS) + 9 vieux exports factices pour vérifier qu'on n'en garde que 8
await A.ev(`(async () => { const r = await navigator.storage.getDirectory(); try { await r.removeEntry('sauvegarde-test', { recursive: true }); } catch (e) {}
  const d = await r.getDirectoryHandle('sauvegarde-test', { create: true }); const don = await d.getDirectoryHandle('données', { create: true });
  for (let i = 1; i <= 9; i++) { const x = await don.getDirectoryHandle('2026-09-0' + i, { create: true }); const f = await x.getFileHandle('manifest.json', { create: true }); const w = await f.createWritable(); await w.write('{}'); await w.close(); }
  const s = ${A.st}; await s.setMeta('dossier.poignee', d); await s.setMeta('dossier.derniereCopie', null); return 1; })()`);
await ouvrirReglages(A);
// à l'ouverture, dossier autorisé et aucune copie depuis une semaine → copie automatique en tâche de fond
await A.attendre(`/dernière copie/.test(document.querySelector('[data-testid=statut-dossier]').textContent)`, 300000).catch(() => {});
await A.ev(`(() => { const el = [...document.querySelectorAll('.sb-item')].find((b) => (b.getAttribute('title') || '').startsWith('Accueil')); el && el.click(); return 1; })()`); await A.dormir(500);
await A.ev(`(() => { const el = [...document.querySelectorAll('.sb-item')].find((b) => (b.getAttribute('title') || '').startsWith('Réglages')); el && el.click(); return 1; })()`); await A.dormir(1200);
const statut0 = await A.ev(`document.querySelector('[data-testid=statut-dossier]').textContent`);
const auto = await A.ev(`(async () => await ${A.st}.getMeta('dossier.derniereCopie'))()`);
ok(auto && auto.nouveaux > 0 && /Dossier « sauvegarde-test » · dernière copie aujourd’hui/.test(statut0), 'à l’ouverture : copie AUTOMATIQUE du dossier (aucune copie depuis une semaine), sans clic', `${statut0} · ${auto && auto.nouveaux} nouveaux`);
// 1. première copie
await A.clic(await A.pos(`[...document.querySelectorAll('[data-testid=carte-sauvegardes] button')].find((b) => /Copier maintenant/.test(b.textContent))`));
await A.attendre(`/Copie faite|interrompue/.test((document.querySelector('[data-testid=carte-sauvegardes] .filet-ligne:nth-child(3) .filet-retour') || document.querySelector('[data-testid=statut-dossier]').parentElement.querySelector('.filet-retour') || {}).textContent || '')`, 300000);
const retour1 = await A.ev(`document.querySelector('[data-testid=statut-dossier]').parentElement.querySelector('.filet-retour').textContent`);
const f1 = await lister(A);
const jour = await A.ev(`new Date().toLocaleDateString('fr-CA')`);
const pdf = f1.filter((p) => /\.pdf$/i.test(p) && !p.startsWith('données/'));
const exports = [...new Set(f1.filter((p) => p.startsWith('données/')).map((p) => p.split('/')[1]))];
ok(/Copie faite : \d+ nouveau/.test(retour1) && pdf.length > 0, '« Copier maintenant » : PDF / images présents sous « <cours>/<fichier> »', `${retour1} · ex. ${pdf.slice(0, 2).join(' · ')}`);
ok(f1.includes(`données/${jour}/manifest.json`) && f1.includes(`données/${jour}/data/records.jsonl`), `export des données dans données/${jour}/`, f1.filter((p) => p.startsWith('données/' + jour)).join(', '));
ok(exports.length === 8 && !exports.includes('2026-09-01') && exports.includes(jour), '8 exports de données gardés (le plus ancien retiré, rien d’autre supprimé)', exports.join(' '));
await A.capture('07-dossier-copie');
// 2. incrémental
await A.clic(await A.pos(`[...document.querySelectorAll('[data-testid=carte-sauvegardes] button')].find((b) => /Copier maintenant/.test(b.textContent))`));
await A.dormir(1500);
await A.attendre(`/Copie faite/.test(document.querySelector('[data-testid=statut-dossier]').parentElement.querySelector('.filet-retour').textContent) && !/Lecture|Fichiers :|Export/.test(document.querySelector('[data-testid=statut-dossier]').parentElement.querySelector('.filet-retour').textContent)`, 300000);
const retour2 = await A.ev(`document.querySelector('[data-testid=statut-dossier]').parentElement.querySelector('.filet-retour').textContent`);
ok(/Copie faite : 0 nouveau\(x\), 0 mis à jour, \d+ inchangé/.test(retour2), 'seconde copie : incrémentale (0 nouveau, tout inchangé)', retour2);
// 2 bis. un fichier modifié au cloud (empreinte différente de celle de l'index) → réécrit, compté « mis à jour »
await A.ev(`(async () => { const r = await navigator.storage.getDirectory(); const d = await r.getDirectoryHandle('sauvegarde-test'); const h = await d.getFileHandle('.medrevise-index.json');
  const idx = JSON.parse(await (await h.getFile()).text()); const k = Object.keys(idx)[0]; idx[k].empreinte = 'ancienne-version'; const w = await h.createWritable(); await w.write(JSON.stringify(idx)); await w.close(); return k; })()`);
await A.clic(await A.pos(`[...document.querySelectorAll('[data-testid=carte-sauvegardes] button')].find((b) => /Copier maintenant/.test(b.textContent))`));
await A.dormir(1500);
await A.attendre(`/Copie faite/.test(document.querySelector('[data-testid=statut-dossier]').parentElement.querySelector('.filet-retour').textContent) && !/Lecture|Fichiers :|Export/.test(document.querySelector('[data-testid=statut-dossier]').parentElement.querySelector('.filet-retour').textContent)`, 300000);
const retour3 = await A.ev(`document.querySelector('[data-testid=statut-dossier]').parentElement.querySelector('.filet-retour').textContent`);
ok(/0 nouveau\(x\), 1 mis à jour/.test(retour3), 'fichier modifié au cloud → réécrit (1 mis à jour), rien supprimé', retour3);
// 3. copie automatique à l'ouverture : au plus une fois par semaine → rien de neuf à cette ouverture
const derniere = await A.ev(`(async () => (await ${A.st}.getMeta('dossier.derniereCopie')).le)()`);
await ouvrirReglages(A);
await A.dormir(3000);
ok(derniere === await A.ev(`(async () => (await ${A.st}.getMeta('dossier.derniereCopie')).le)()`), 'à l’ouverture suivante (moins d’une semaine) : aucune nouvelle copie');
// 4. permission expirée → ligne discrète « Autoriser… », puis accès rétabli
A.fermer();
const liste = await (await fetch('http://localhost:9335/json')).json();
for (const t of liste.filter((x) => x.type === 'page')) await fetch(`http://localhost:9335/json/close/${t.id}`);
await fetch('http://localhost:9335/json/new?http://localhost:5199/', { method: 'PUT' }); await new Promise((r) => setTimeout(r, 2500));
A = await appareil(9335, { captures });
await A.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { let ok = false; const P = FileSystemDirectoryHandle.prototype; P.queryPermission = async function () { return ok ? 'granted' : 'prompt'; }; P.requestPermission = async function () { ok = true; return 'granted'; }; })();` });
await ouvrirReglages(A);
const autoriser = await A.ev(`(document.querySelector('.filet-autoriser') || {}).textContent || ''`);
const copierDesactive = await A.ev(`[...document.querySelectorAll('[data-testid=carte-sauvegardes] button')].find((b) => /Copier maintenant/.test(b.textContent)).disabled`);
ok(/Autoriser l’accès au dossier de sauvegarde/.test(autoriser) && copierDesactive, 'permission expirée : ligne discrète « Autoriser l’accès au dossier de sauvegarde » (aucune fenêtre)', autoriser);
await A.capture('08-dossier-permission');
await A.clic(await A.pos(`document.querySelector('.filet-autoriser button')`)); await A.dormir(1200);
ok(!(await A.ev(`!!document.querySelector('.filet-autoriser')`)), '« Autoriser » → accès rétabli, la ligne disparaît');
A.fermer();
// 5. navigateur sans File System Access → section masquée
const l2 = await (await fetch('http://localhost:9335/json')).json();
for (const t of l2.filter((x) => x.type === 'page')) await fetch(`http://localhost:9335/json/close/${t.id}`);
await fetch('http://localhost:9335/json/new?http://localhost:5199/', { method: 'PUT' }); await new Promise((r) => setTimeout(r, 2500));
A = await appareil(9335, { captures });
await A.send('Page.addScriptToEvaluateOnNewDocument', { source: `delete window.showDirectoryPicker;` });
await ouvrirReglages(A);
ok(!(await A.ev(`!!document.querySelector('[data-testid=statut-dossier]')`)) && await A.ev(`!!document.querySelector('[data-testid=statut-copie]')`), 'sans l’API (ex. Safari iOS) : section du dossier masquée, la copie serveur reste affichée');
ok(A.erreurs.length === 0, 'aucune erreur JavaScript', A.erreurs.join(' | ').slice(0, 300));
A.fermer();
process.exit(bilan() ? 1 : 0);
