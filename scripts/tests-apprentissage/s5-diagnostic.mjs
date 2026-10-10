// Export de diagnostic : bouton réel (Réglages → Synchronisation sur l'ordinateur, accueil sur le téléphone),
// téléchargement intercepté sans écrire sur le disque, JSON validé, AUCUNE écriture (IndexedDB, cloud).
import { appareil, faux } from './banc.mjs';
import { writeFileSync } from 'node:fs';
import { capture } from './commun.mjs';
let echecs = 0; const ok = (c, m, d = '') => { console.log((c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : '')); if (!c) echecs++; };
const empreintes = [];
for (const [port, nom] of [[9335, 'ordi'], [9336, 'tel']]) {
  const X = await appareil(port);
  await X.synchro(); await X.dormir(3500); // à jour du cloud avant l'export
  if (await X.ev(`!!document.querySelector('.sfc')`)) { await X.ev(`document.querySelector('.sfc-quitter').click(), true`); await X.dormir(800); }
  if (nom === 'ordi') { await X.ev(`(() => { const el = [...document.querySelectorAll('.sb-item, button')].find((b) => /^Réglages/.test((b.getAttribute('title') || '').trim())); el && el.click(); return !!el; })()`); }
  await X.attendre(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Exporter un diagnostic'))`);
  await X.ev(`(() => { const el = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Exporter un diagnostic')); el.scrollIntoView({ block: 'center' }); })()`);
  await X.dormir(400);
  await capture(X, `${nom}-7-bouton-diagnostic`);
  // photographie avant : toutes les cartes (updatedAt) + séance + journal du faux cloud
  const photo = () => X.ev(`(async () => { const st = ${X.mod('storage.js')}; const q = await st.getAll('questions'); const s = await st.getMeta('seanceFC'); return JSON.stringify([q.map((x) => x.id + x.updatedAt).sort(), s]); })()`);
  const cloudEtat = async () => JSON.stringify((await faux()).rows.map((r) => r.store + r.record_id + r.updated_at + r.deleted).sort());
  const p0 = await photo(); const c0 = await cloudEtat();
  await X.ev(`(() => { window.__diag = null; const orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__diag = { nom: this.download, href: this.href }; return; } return orig.call(this); }; return true; })()`);
  await X.clic('Exporter un diagnostic');
  await X.attendre(`!!window.__diag`, 20000);
  const { nom: fichier, texte } = await X.ev(`(async () => ({ nom: window.__diag.nom, texte: await (await fetch(window.__diag.href)).text() }))()`);
  await X.dormir(600);
  const message = await X.texte('.diag-export');
  const d = JSON.parse(texte);
  empreintes.push(d.cloud.empreinteCloud);
  writeFileSync(`${process.env.CAPTURES || '/tmp'}/${fichier}`, texte);
  const nbCartes = await X.ev(`(async () => (await ${X.mod('storage.js')}.getAll('questions')).length)()`);
  const seance = await X.ev(`(async () => await ${X.mod('storage.js')}.getMeta('seanceFC'))()`);
  ok(d.schema === 'medrevise-diagnostic/1' && /^medrevise-diagnostic-localhost-5199-\d{4}-\d\d-\d\d-\d\dh\d\d\.json$/.test(fichier), `[${nom}] fichier ${fichier}`);
  ok(d.cartes.length === nbCartes && d.cartes.every((c) => 'learnState' in c && 'learningStreak' in c && 'dueDate' in c && 'updatedAt' in c), `[${nom}] toutes les cartes avec leurs champs d’état`, `${d.cartes.length} / ${nbCartes}`);
  ok(JSON.stringify(d.seanceEnregistree) === JSON.stringify(seance ?? null), `[${nom}] séance en cours incluse (meta.seanceFC)`, seance ? `${seance.file.length} à apprendre` : 'aucune');
  ok(d.cloud.statut === 'ajour' && /^[0-9a-f]{12}$/.test(d.cloud.empreinteCloud), `[${nom}] empreinte cloud`, `${d.cloud.statut} ${d.cloud.empreinteCloud}`);
  ok(d.appareil.fuseau === 'Europe/Paris' && d.appareil.jour && d.appareil.maintenant && d.appareil.decalageMinutes === 120, `[${nom}] date / heure / fuseau de l’appareil`, `${d.appareil.heureLocale} ${d.appareil.fuseau}`);
  ok(Number.isFinite(d.planDuJour.compteurs.aApprendre) && d.planDuJour.enCours.length + d.planDuJour.nouvelles.length === d.planDuJour.compteurs.aApprendre, `[${nom}] plan du jour (ids + compteurs)`, JSON.stringify(d.planDuJour.compteurs));
  const p1 = await photo(); const c1 = await cloudEtat();
  ok(p0 === p1, `[${nom}] aucune écriture IndexedDB (cartes, séance)`);
  ok(c0 === c1, `[${nom}] aucune écriture cloud pendant l’export (lignes du cloud identiques avant / après)`);
  console.log(`   message affiché : ${message}`);
  await capture(X, `${nom}-8-diagnostic-exporte`);
  ok(X.erreurs.length === 0, `[${nom}] aucune erreur console`, X.erreurs.join(' / ').slice(0, 300));
  X.fermer();
}
ok(empreintes[0] === empreintes[1], 'même empreinte cloud sur les deux appareils à jour', empreintes.join(' = '));
process.exit(echecs ? 1 : 0);
