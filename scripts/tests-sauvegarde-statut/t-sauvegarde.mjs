// Banc SAUVEGARDE (07/11) : rattrapage à l'ouverture de l'app + Réglages › Sauvegardes, ordinateur / tablette / téléphone.
// Faux GitHub (:54398) et faux Supabase (:54399) — jamais le vrai dépôt. Voir commun.mjs pour l'installation.
//  1. dernière copie réussie il y a 3 jours → à l'ouverture, UNE copie de rattrapage ; 5 ouvertures de suite → toujours une seule
//  2. copie récente (2 h) → l'ouverture ne fait rien (aucune copie, aucun verrou)
//  3. échec (Supabase injoignable pendant le rattrapage) → avertissement « plus de 48 h » + raison, sur ordinateur et tablette ;
//     bandeau « Pas de copie depuis 3 jours » sur le téléphone ; les ouvertures suivantes n'insistent pas (30 min)
import { dispositif, poste, etatGh, FAUX_GH, FAUX_SB } from './commun.mjs';

const H = 3600000;
const iso = (ms) => new Date(ms).toISOString();
const jour = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Brussels' });
const copiesDuJour = async () => (await etatGh()).commits.filter((c) => c.message === `backup ${jour}`).length;
const attendreGh = async (cond, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const e = await etatGh(); if (cond(e)) return e; await new Promise((r) => setTimeout(r, 300)); } return etatGh(); };
const texte = (b, sel) => b.ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).innerText || null`);

await poste(FAUX_SB, '/__panne?code=');
// ---------- 1. rattrapage d'une copie manquée
const p1 = await poste(FAUX_GH, `/__preparer?derniere=${iso(Date.now() - 72 * H)}`);
const A = await dispositif('ordi');
A.v(p1.ok && p1.commits.length === 2, 'faux dépôt : une copie réussie il y a 3 jours', JSON.stringify(p1.commits.map((c) => c[0])));
await A.recharger(); await A.attendrePhase(['ajour', 'echec', 'horsligne'], 60000);
const e1 = await attendreGh((e) => e.commits.some((c) => c.message === `backup ${jour}`));
A.v(await copiesDuJour() === 1 && e1.etiquettes.length === 1, `ouverture n° 1 : rattrapage lancé une fois → commit « backup ${jour} », 1 verrou`, JSON.stringify(e1.commits.slice(0, 3).map((c) => c.message)));
for (let i = 2; i <= 6; i++) { await A.recharger(); await A.dormir(2500); }
await A.dormir(3000);
const e1b = await etatGh();
A.v(await copiesDuJour() === 1 && e1b.etiquettes.length === 1 && e1b.commits.length === e1.commits.length, '5 ouvertures de plus : AUCUNE autre copie (toujours 1 commit du jour, 1 verrou)', `${e1b.commits.length} commits`);
await A.reglages(); await A.voirSauvegardes();
await A.attendre(`!/Lecture de l’état/.test(document.querySelector('[data-testid=statut-copie]').innerText)`, 15000);
const s1 = await texte(A, '[data-testid=statut-copie]');
A.v(/Dernière sauvegarde réussie : aujourd’hui \d\d:\d\d/.test(s1) && !(await texte(A, '[data-testid=alerte-copie]')), 'Réglages › Sauvegardes : date de la dernière sauvegarde réussie (aujourd’hui), aucun avertissement', s1);
await A.capture('apres-sauvegardes-ordi-ok');

// ---------- 2. copie récente : rien
await poste(FAUX_GH, `/__preparer?derniere=${iso(Date.now() - 2 * H)}`);
const n2 = (await etatGh()).commits.length;
await A.recharger(); await A.dormir(6000);
const e2 = await etatGh();
A.v(e2.commits.length === n2 && e2.etiquettes.length === 0, 'copie récente (2 h) : l’ouverture ne lance rien (aucun commit, aucun verrou)', `${e2.commits.length} commits, ${e2.etiquettes.length} verrou(s)`);

// ---------- 3. échec du rattrapage
await poste(FAUX_GH, `/__preparer?derniere=${iso(Date.now() - 72 * H)}`);
await poste(FAUX_SB, '/__panne?code=503');
await A.recharger();
const e3 = await attendreGh((e) => e.commits[0] && e.commits[0].message.startsWith('backup-echec'), 40000);
A.v(e3.commits[0].message === `backup-echec ${jour}` && e3.commits.filter((c) => c.message === `backup ${jour}`).length === 0, 'Supabase injoignable : la copie échoue, l’échec est noté dans le manifest (commit « backup-echec »), aucune « réussite »', e3.commits[0].message);
await poste(FAUX_SB, '/__panne?code=');
await A.recharger(); await A.reglages(); await A.voirSauvegardes();
await A.attendre(`!!document.querySelector('[data-testid=alerte-copie]')`, 15000);
const al = await texte(A, '[data-testid=alerte-copie]');
A.v(/Aucune sauvegarde réussie depuis plus de 48 h \(3 jours\) — dernier échec aujourd’hui \d\d:\d\d : lecture Supabase impossible/.test(al), 'ordinateur : avertissement « plus de 48 h » + raison du dernier échec en une ligne', al);
await A.capture('apres-sauvegardes-ordi-echec');
const nEchec = (await etatGh()).commits.length;

const C = await dispositif('tablette');
await C.recharger(); await C.reglages(); await C.voirSauvegardes();
await C.attendre(`!!document.querySelector('[data-testid=alerte-copie]')`, 15000);
const alC = await texte(C, '[data-testid=alerte-copie]');
C.v(alC === al, 'tablette (tactile) : même avertissement et même raison', alC);
await C.capture('apres-sauvegardes-tablette-echec');
const B = await dispositif('tel');
await B.recharger(); await B.dormir(4000);
const bandeau = await texte(B, '.filet-bandeau, [data-filet-bandeau]') || await B.ev(`[...document.querySelectorAll('div')].map((d) => d.innerText).find((t) => /Pas de copie depuis/.test(t || '')) || null`);
B.v(/Pas de copie depuis 3 jours/.test(bandeau || ''), 'téléphone : bandeau « Pas de copie depuis 3 jours »', bandeau);
await B.capture('apres-sauvegardes-tel-echec');
const e3b = await etatGh();
A.v(e3b.commits.length === nEchec, 'ouvertures sur la tablette et le téléphone dans la même demi-heure : aucune nouvelle tentative', `${e3b.commits.length} commits`);

for (const x of [A, C, B]) { const errs = x.erreurs.filter((e) => !/validateDOMNesting|Failed to load resource|503/.test(e)); x.v(errs.length === 0, `${x.nom} : aucune erreur console`, errs.join(' | ').slice(0, 300)); }
const echecs = A.echecs + C.echecs + B.echecs;
console.log(echecs ? `❌ ${echecs} échec(s)` : '✅ tout est vert');
process.exit(0);
