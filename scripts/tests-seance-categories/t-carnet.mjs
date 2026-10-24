// (24/10) CARNET D'ERREURS EN RÉVISION, MENU MINIMAL — sur la copie des vraies données (profil isolé, sans cloud).
// Téléphone : feuille du bas ≤ 35 % de la hauteur, sans défilement, puces sur 2 lignes au plus, un tap = entrée créée
// et feuille fermée ; « Ajouter une note » replié puis note jointe. Ordinateur : popover compact sous l'icône.
// Usage : node t-carnet.mjs [W H]
import { banc } from './commun.mjs';
const W = +(process.argv[2] || 390), H = +(process.argv[3] || 844);
const tel = W < 760;
const b = await banc(W, H);
await b.ouvrirApp();
if (!tel) await b.reviser(); else await b.attendre(`!!document.querySelector('[data-sfa="lanceur"]')`, 20000);
await b.toucher(`document.querySelector('[data-raccourci="revisionsJ"]')`);
await b.maximum('retard', 5);
await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1200);
await b.attendre(`!!document.querySelector('.sfc-carte')`, 15000);
const AUJ = await b.ev(`(async () => ${b.mod('sm2.js')}.todayISO())()`);
const seance = await b.ev(`(async () => (await ${b.mod('storage.js')}.getMeta('seanceFC')))()`);
const carte = (id) => b.S(`return await S.getOne('questions', ${JSON.stringify(id)})`);
const ouvrir = async () => {
  await b.toucher(`document.querySelector('[data-sn="carnet"]')`, 500);
  return b.ev(`(() => { const m = document.querySelector('[data-carnet="menu"]'); if (!m) return null; const box = m.closest('.sn-feuille, .cn-pop'); const r = box.getBoundingClientRect();
    const tops = [...new Set([...m.querySelectorAll('.cn-puce')].map((x) => Math.round(x.getBoundingClientRect().top)))];
    const ic = document.querySelector('[data-sn="carnet"]').getBoundingClientRect();
    return { h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), defile: box.scrollHeight > box.clientHeight + 1, lignes: tops.length, puces: m.querySelectorAll('.cn-puce').length,
      noteRepliee: !!m.querySelector('[data-carnet="note"]') && !m.querySelector('[data-carnet="champ-note"]'), icBas: Math.round(ic.bottom), icDroite: Math.round(ic.right) }; })()`);
};
// carte 1 : un tap
const id1 = seance.cartes[0];
await b.toucher(`document.querySelector('.sfc-carte')`, 600);
let m = await ouvrir();
if (tel) b.ok(m && m.h <= H * 0.35 && !m.defile, `téléphone : feuille du bas ${m && m.h} px ≤ 35 % de ${H} px (${Math.round(H * 0.35)} px), sans défilement`);
else b.ok(m && m.top >= m.icBas && m.top - m.icBas <= 10 && m.h <= 200, `ordinateur : popover compact sous l’icône (${m && m.w}×${m && m.h} px, ${m && m.top - m.icBas} px sous l’icône)`);
b.ok(m && m.lignes <= 2 && m.noteRepliee, `pré-réponses en puces sur ${m && m.lignes} ligne(s) (${m && m.puces} puces), « Ajouter une note » replié`);
await b.capture('sc-carnet' + (tel ? '-mobile' : ''));
const choisie = await b.ev(`document.querySelector('.cn-puce[data-pre="confusion"]').title`);
await b.toucher(`document.querySelector('.cn-puce[data-pre="confusion"]')`, 900);
let c = await carte(id1);
const ferme = await b.ev(`!document.querySelector('[data-carnet="menu"]')`);
b.ok(ferme && c.carnetAt === AUJ && c.carnetType === choisie && c.carnetRaison === choisie, `un tap → entrée créée (« ${choisie} ») et menu fermé`, `carnetAt ${c.carnetAt}`);
b.ok(await b.ev(`/Ajouté au carnet/.test((document.querySelector('.sn-toast') || {}).textContent || '')`), 'toast « Ajouté au carnet · Modifier »');
// la carte reste celle affichée, sa note des J n'a pas bougé
const avantNote = c.dueDate;
// note facultative sur la même carte
m = await ouvrir();
await b.toucher(`document.querySelector('[data-carnet="note"]')`, 400);
await b.ev(`(() => { const t = document.querySelector('[data-carnet="champ-note"]'); const P = HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(P, 'value').set.call(t, 'confondu avec le nerf radial'); t.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
const h2 = await b.ev(`(() => { const box = document.querySelector('[data-carnet="menu"]').closest('.sn-feuille, .cn-pop'); return { h: Math.round(box.getBoundingClientRect().height), defile: box.scrollHeight > box.clientHeight + 1 }; })()`);
if (tel) b.ok(h2.h <= H * 0.35 && !h2.defile, `note dépliée : feuille ${h2.h} px, toujours ≤ 35 % et sans défilement`);
await b.capture('sc-carnet-note' + (tel ? '-mobile' : ''));
await b.toucher(`document.querySelector('.cn-puce[data-pre="oubli"]')`, 900);
c = await carte(id1);
b.ok(c.carnetType === await b.ev(`'Oubli d’un élément'`) && c.carnetRaison === 'confondu avec le nerf radial' && c.dueDate === avantNote, 'note facultative jointe à l’entrée (type = la puce touchée) ; la date des J de la carte inchangée');
// liée à la carte affichée : on note, la carte suivante a son propre menu
await b.dormir(4800); // le toast (4,5 s) couvre le bas de l'écran au téléphone
await b.toucher(`document.querySelector('.sfc-bas [data-note="3"]')`, 1200);
const id2 = (await b.ev(`(async () => (await ${b.mod('storage.js')}.getMeta('seanceFC')))()`)).cartes[1];
await b.toucher(`document.querySelector('.sfc-carte')`, 600);
b.ok(await b.ev(`document.querySelector('[data-actions-carte]').dataset.actionsCarte`) === id2, 'carte suivante : le menu du carnet est lié à la carte affichée');
await b.toucher(`document.querySelector('.sfc-quitter')`, 900);
b.ok(b.erreurs.length === 0, 'aucune erreur JS', b.erreurs.slice(0, 3).join(' | '));
process.exit(0);
