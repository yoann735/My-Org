// Compteur de vues dans le panneau Apprendre — node t-vues.mjs <ordi|tel|tablette>   (après node seed.mjs)
// Vérifie : badge œil sur chaque carte (0 compris) = nombre de notations aux 4 boutons dans le JOURNAL LOCAL ; « Passer en
// révision » et le mode Apprentissage ne comptent pas ; +1 dès la notation en séance, sans recharger ; tris ; chaque tranche
// du filtre, seule et combinée à un filtre de cours ; planification (dueDate, FSRS) des autres cartes inchangée.
import { dispositif } from './commun.mjs';
const type = process.argv[2] || 'ordi';
const b = await dispositif(type);
const tel = type === 'tel';
await b.recharger(); await b.attendrePhase(['ajour'], 60000); await b.dormir(1500);
await b.reinitApprendre();

const TR = { '0': [0, 0], '1-2': [1, 2], '3-5': [3, 5], '6-10': [6, 10], '10+': [11, 1e9] };
const attendues = async () => { const m = {}; for (const [, card, r] of await b.journal()) if (Number.isInteger(r) && r >= 1 && r <= 4) m[card] = (m[card] || 0) + 1; return m; };
const toutes = await b.S(`return (await S.getAll('questions')).filter((q) => q.type === 'flashcard' && !q.ephemeral).map((q) => q.id);`);
const filtre = (f) => b.ev(`localStorage.setItem('medrevise.apprentissage.filtres', JSON.stringify(${JSON.stringify({ q: '', matieres: [], coursInclus: [], coursExclus: [], nouvelles: false, aApprendre: false, types: [], vues: [], ...f })})); 1`);
const tri = (t) => b.ev(`localStorage.setItem('medrevise.apprentissage.tri', JSON.stringify(${JSON.stringify(t)})); 1`);
const PETITS = ['f1', 'f2', 'f3', 'f4', 'f6']; // les cours du jeu (hors 30 « gros cours » de la mesure de vitesse)
const plan0 = await b.empreintePlanif();

// 1) les compteurs affichés = le journal (cours du jeu)
await filtre({ coursInclus: PETITS }); await b.apprendre();
let att = await attendues();
let aff = await b.vuesAffichees();
const ids = Object.keys(aff);
b.v(ids.length === 45, `45 cartes affichées (cours du jeu)`, String(ids.length));
b.v(ids.every((id) => aff[id] !== null), 'chaque carte porte l’indicateur œil (0 compris)');
const ecarts = ids.filter((id) => aff[id] !== (att[id] || 0));
b.v(!ecarts.length, 'chaque compteur = nombre de notations aux 4 boutons dans le journal', ecarts.map((id) => `${id}: ${aff[id]} ≠ ${att[id] || 0}`).join(', '));
b.v(aff['c2-retard1'] === 14 && aff['c1-rev4'] === 11 && aff['c1-retard1'] === 1, 'valeurs du jeu : 14, 11, 1');
b.v(aff['c3-rev1'] === 3, 'répétition de séance (relearn) comptée : 2 notes + 1 répétition = 3', String(aff['c3-rev1']));
b.v(aff['c3-rev2'] === 0, '« Passer en révision » (2 événements) ne compte pas : 0', String(aff['c3-rev2']));
b.v(aff['c4-rev4'] === 0, 'carte jamais révisée : 0', String(aff['c4-rev4']));
const infobulle = await b.ev(`document.querySelector('.alib2-carte[data-carte="c2-retard1"] [data-vues]').title`);
b.v(infobulle === 'Révisée 14 fois en séance', 'infobulle « Révisée 14 fois en séance »', infobulle);
b.v(await b.ev(`(() => { const c = document.querySelector('.alib2-carte[data-carte="c1-rev1"]'); return !!c.querySelector('[data-vues]') && !!c.querySelector('[data-passages]') && c.querySelector('[data-vues]') !== c.querySelector('[data-passages]'); })()`), 'œil distinct du badge « ×N » du mode Apprentissage (c1-rev1 : les deux)');
if (type === 'ordi') await b.capture('apres-ordi-1-compteurs');
if (tel) await b.capture('apres-tel-5-compteurs');

// 2) tris (dans chaque cours)
for (const [t, sens] of [['vues-asc', 1], ['vues-desc', -1]]) {
  await tri(t); await b.apprendre();
  aff = await b.vuesAffichees();
  const parCours = await b.ev(`[...document.querySelectorAll('.alib2-cours')].map((c) => [...c.querySelectorAll('.alib2-carte')].map((x) => +x.querySelector('[data-vues]').dataset.vues))`);
  const ok = parCours.every((l) => l.every((v, i) => i === 0 || sens * (v - l[i - 1]) >= 0));
  b.v(ok && parCours.length >= 5, `tri ${t === 'vues-asc' ? '« Moins vues → plus vues »' : '« Plus vues → moins vues »'} dans chaque cours`, JSON.stringify(parCours[0]));
}
if (!tel) {
  const menu = await b.ev(`(() => { document.querySelector('[data-puce="tri"]').click(); return 1; })()`); await b.dormir(300);
  const libelles = await b.ev(`[...document.querySelectorAll('[data-choix="tri"] [data-tri]')].map((x) => x.textContent.trim())`);
  b.v(libelles.join(' | ') === 'Ordre du cours | Moins passées d’abord | Moins vues → plus vues | Plus vues → moins vues', 'menu Tri : les 4 choix (« Moins passées d’abord » conservé)', libelles.join(' | '));
  if (type === 'ordi') await b.capture('apres-ordi-2-menu-tri');
  await b.touche('Escape');
}
await tri('');

// 3) chaque tranche du filtre : seule (compteur de cartes, tous cours) et combinée à un cours (ids exacts)
att = await attendues();
for (const tr of Object.keys(TR)) {
  const dans = (id) => { const n = att[id] || 0; return n >= TR[tr][0] && n <= TR[tr][1]; };
  await filtre({ vues: [tr] }); await b.apprendre();
  const n = await b.compteur();
  b.v(n === toutes.filter(dans).length, `tranche ${tr} seule : ${n} cartes`, `attendu ${toutes.filter(dans).length}`);
  await filtre({ vues: [tr], coursInclus: ['f1'] }); await b.apprendre();
  const vus = (await b.idsAffiches()).sort();
  const voulu = toutes.filter((id) => id.startsWith('c1-') && dans(id)).sort();
  b.v(JSON.stringify(vus) === JSON.stringify(voulu), `tranche ${tr} + cours « Cours 1 — Rein » : les bonnes cartes`, `${vus.join(',')} / ${voulu.join(',')}`);
}
await filtre({ vues: ['0', '10+'], coursInclus: ['f1', 'f2'] }); await b.apprendre();
const multi = (await b.idsAffiches()).sort();
const multiVoulu = toutes.filter((id) => /^c[12]-/.test(id) && (!(att[id]) || att[id] > 10)).sort();
b.v(JSON.stringify(multi) === JSON.stringify(multiVoulu), 'deux tranches à la fois (0 et >10) + deux cours', multi.join(','));
// le filtre se règle aussi à la main (puces, même style que les autres filtres — pas de case native)
await filtre({ coursInclus: PETITS }); await b.apprendre();
if (tel) {
  await b.toucher(`document.querySelector('[data-puce="filtres"]')`, 600);
  await b.toucher(`document.querySelector('.alib2-feuille [data-tranche="3-5"]')`, 300);
  await b.capture('apres-tel-6-filtre-vues');
  await b.toucher(`document.querySelector('.alib2-fpied .btn')`, 600);
} else {
  await b.toucher(`document.querySelector('[data-puce="vues"]')`, 300);
  b.v(await b.ev(`!document.querySelector('[data-choix="vues"] input[type=checkbox]')`), 'filtre Vues : puces, pas de cases à cocher natives');
  await b.toucher(`document.querySelector('[data-choix="vues"] [data-tranche="3-5"]')`, 300);
  if (type === 'ordi') await b.capture('apres-ordi-3-filtre-vues');
  await b.touche('Escape');
}
const t35 = (await b.idsAffiches()).sort();
b.v(t35.length > 0 && t35.every((id) => (att[id] || 0) >= 3 && (att[id] || 0) <= 5), 'puce « 3–5 » touchée : seulement des cartes vues 3 à 5 fois', t35.join(','));
await filtre({ coursInclus: PETITS });

// 4) notation en séance → +1 immédiatement (sans recharger)
const avantVues = await attendues();
if (tel) { await b.ev(`(() => { const r = document.querySelector('.alib-mobile .alib-mtete .mrm-icon-btn'); r && r.click(); return 1; })()`); await b.dormir(500); await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1500); }
else { await b.ev(`(() => { const x = [...document.querySelectorAll('.sb-item')].find((e) => /^Réviser/.test(e.title || e.innerText || '')); x && x.click(); return 1; })()`); await b.dormir(1000); await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1500); }
await b.ev(`(() => { const a = document.querySelector('.bf-astuce'); a && a.remove(); return 1; })()`);
const notee = await b.ev(`document.querySelector('.sfc-carte[data-carte]').dataset.carte`);
await b.toucher(`document.querySelector('.sfc-carte')`, 500);
await b.toucher(`document.querySelector('[data-note="3"]')`, 1200);
await b.ev(`(() => { const q = document.querySelector('.sfc-quitter'); q && q.click(); return 1; })()`); await b.dormir(600);
const rechargements0 = await b.ev(`performance.getEntriesByType('navigation').length + ':' + Math.round(performance.timeOrigin)`);
await b.apprendre();
aff = await b.vuesAffichees();
b.v(aff[notee] === (avantVues[notee] || 0) + 1, `notée « Correct » en séance (${notee}) : ${avantVues[notee] || 0} → ${aff[notee]} sans recharger`);
b.v(rechargements0 === await b.ev(`performance.getEntriesByType('navigation').length + ':' + Math.round(performance.timeOrigin)`), 'aucun rechargement de la page');
const plan1 = await b.empreintePlanif();
const diff = plan0.split('\n').filter((l, i) => l !== plan1.split('\n')[i]).map((l) => l.split('|')[0]);
b.v(diff.length === 1 && diff[0] === notee, 'planification : seule la carte notée a changé (dueDate, FSRS des autres identiques)', diff.join(','));

// 5) mode Apprentissage : « Su » deux fois (×N +1), compteur de vues inchangé
const cible = 'c4-rev4';
const passages0 = await b.passagesBase();
const vues0 = (await b.vuesAffichees())[cible];
await filtre({ coursInclus: ['f4'], q: 'Cours 4 · ' + cible }); await b.apprendre();
await b.toucher(`document.querySelector('.alib-lancer')`, 900);
for (let i = 0; i < 2; i++) { await b.toucher(`document.querySelector('.sfc-carte')`, 400); await b.toucher(`document.querySelector('.alib-su')`, 600); }
await b.ev(`(() => { const t = [...document.querySelectorAll('.sfc-btn')].find((x) => /Terminer/.test(x.textContent)); t && t.click(); const q = document.querySelector('.sfc-quitter'); q && q.click(); return 1; })()`); await b.dormir(800);
await filtre({ coursInclus: PETITS }); await b.apprendre();
const passages1 = await b.passagesBase();
b.v((passages1[cible] || 0) === (passages0[cible] || 0) + 1, `mode Apprentissage : ×N de ${cible} +1 (${passages0[cible] || 0} → ${passages1[cible] || 0})`);
b.v((await b.vuesAffichees())[cible] === vues0, `mode Apprentissage : compteur de vues de ${cible} inchangé (${vues0})`);
const plan2 = await b.empreintePlanif();
b.v(plan2 === plan1, 'mode Apprentissage : planification inchangée');
process.exit(b.fin() ? 1 : 0);
