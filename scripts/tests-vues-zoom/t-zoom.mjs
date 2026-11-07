// Agrandissement des images pendant les révisions — node t-zoom.mjs <ordi|tel|tablette>
// Séance du jour (les cartes sans image sont reportées sur CE banc pour arriver aux cartes image) puis session Apprentissage.
// Vérifie : toucher l'image = visionneuse, carte NI retournée NI notée ; toucher hors image = retournement ; double-tap,
// pincement (tactile), molette/clavier (ordinateur), glissé vers le bas, croix, fond, Échap ; masques dans l'état affiché.
import { dispositif } from './commun.mjs';
const type = process.argv[2] || 'ordi';
const b = await dispositif(type);
await b.recharger(); await b.attendrePhase(['ajour'], 60000); await b.dormir(1200);
await b.S(`const q = await S.getAll('questions'); await S.putMany('questions', q.filter((x) => x.type === 'flashcard' && !x.id.startsWith('img-') && x.dueDate !== '2099-01-01').map((x) => ({ ...x, dueDate: '2099-01-01', nouvelle: false }))); return 1;`);
await b.recharger(); await b.attendrePhase(['ajour'], 60000); await b.dormir(1200);

const nbJournal = async () => (await b.journal()).length;
const etat = () => b.ev(`(() => { const c = document.querySelector('.sfc-carte[data-carte]'); return c ? { id: c.dataset.carte, verso: !!c.querySelector('.sfc-verso, .occ-reponse, .mu-titre, [data-cote="verso"]') || /:v$/.test(c.getAttribute('data-k') || ''), vz: !!document.querySelector('.vz-fond'), zoom: +((document.querySelector('.vz-fond') || {}).dataset || {}).zoom || null, notes: !!document.querySelector('[data-note]') } : { id: null, vz: !!document.querySelector('.vz-fond') }; })()`);
const centre = (sel) => b.rect(sel);
const ouvrirSur = async (sel, quoi) => {
  const avant = await etat(); const j0 = await nbJournal();
  const r = await centre(sel);
  if (!b.v(!!r, `${quoi} : image cliquable présente`)) return null;
  await b.point(r.cx, r.cy, 450);
  const apres = await etat();
  b.v(apres.vz, `${quoi} : toucher l'image ouvre la visionneuse`);
  b.v(apres.id === avant.id && apres.verso === avant.verso, `${quoi} : la carte ne se retourne pas`, `${JSON.stringify(avant)} → ${JSON.stringify(apres)}`);
  b.v((await nbJournal()) === j0, `${quoi} : aucune notation`);
  return avant;
};
const fermeAvec = async (comment, quoi) => {
  const avant = await etat();
  if (comment === 'croix') await b.toucher(`document.querySelector('[data-vz="fermer"]')`, 400);
  else if (comment === 'echap') await b.touche('Escape');
  else if (comment === 'fond') { const r = await b.rect(`document.querySelector('.vz-scene')`); await b.point(r.x + 12, r.y + r.h - 14, 500); }
  else if (comment === 'glisse') { const r = await b.rect(`document.querySelector('[data-vz="contenu"]')`); await b.glisser(r.cx, r.cy, r.cx, r.cy + 260, 12); await b.dormir(300); }
  const apres = await etat();
  b.v(!apres.vz, `${quoi} : fermeture (${comment})`);
  b.v(apres.id === avant.id && apres.verso === avant.verso, `${quoi} : même carte, même face après fermeture (${comment})`);
};
const gestes = async (quoi) => {
  const r = await b.rect(`document.querySelector('[data-vz="contenu"]')`);
  await b.double(r.cx, r.cy, 450);
  let z = (await etat()).zoom;
  b.v(z > 2.3 && z < 2.7, `${quoi} : double-${b.tactile ? 'tap' : 'clic'} zoome (×${z})`);
  // déplacement quand on est zoomé
  const t0 = await b.ev(`document.querySelector('[data-vz="contenu"]').style.transform`);
  await b.glisser(r.cx, r.cy, r.cx - 80, r.cy - 40, 8);
  const t1 = await b.ev(`document.querySelector('[data-vz="contenu"]').style.transform`);
  b.v(t0 !== t1 && (await etat()).vz, `${quoi} : déplacement de l'image zoomée (visionneuse toujours ouverte)`);
  await b.double(r.cx, r.cy, 450);
  z = (await etat()).zoom;
  b.v(z === 1, `${quoi} : second double-${b.tactile ? 'tap' : 'clic'} revient à ×1`);
  if (b.tactile) {
    await b.pincer(r.cx, r.cy, 80, 320, 10);
    z = (await etat()).zoom;
    b.v(z > 2.5, `${quoi} : pincement zoome (×${z})`);
    await b.pincer(r.cx, r.cy, 80, 3000, 10);
    z = (await etat()).zoom;
    b.v(z === 5, `${quoi} : zoom borné à ×5 (×${z})`);
    await b.double(r.cx, r.cy, 450);
  } else {
    await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: r.cx, y: r.cy, deltaX: 0, deltaY: -400 }); await b.dormir(300);
    z = (await etat()).zoom; b.v(z > 1.5, `${quoi} : molette zoome (×${z})`);
    await b.touche('0'); z = (await etat()).zoom; b.v(z === 1, `${quoi} : touche 0 revient à ×1`);
    await b.touche('+'); z = (await etat()).zoom; b.v(z > 1.4, `${quoi} : touche + zoome (×${z})`);
    await b.touche('0');
    // raccourcis de la séance neutralisés tant que la visionneuse est ouverte
    const j0 = await nbJournal(); const e0 = await etat();
    for (const k of [' ', 'Enter', '1', '2', '3', '4']) await b.touche(k);
    const e1 = await etat();
    b.v(e1.vz && e1.id === e0.id && e1.verso === e0.verso && (await nbJournal()) === j0, `${quoi} : Espace, Entrée, 1-4 sans effet sur la carte quand la visionneuse est ouverte`);
  }
};

// ---------------- SÉANCE ----------------
if (type === 'tel') await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1500);
else {
  await b.ev(`(() => { const x = [...document.querySelectorAll('.sb-item')].find((e) => /^Réviser/.test(e.title || e.innerText || '')); x && x.click(); return 1; })()`); await b.dormir(1200);
  await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1500);
}
await b.ev(`(() => { const a = document.querySelector('.bf-astuce'); a && a.remove(); return 1; })()`);
const vus = new Set();
for (let tour = 0; tour < 8; tour++) {
  const e = await etat();
  if (!e.id || vus.has(e.id)) break;
  vus.add(e.id);
  const q = e.id;
  // marque la face visible (SeanceFC remonte la carte à chaque retournement : la clé React se lit dans le DOM)
  await b.ev(`(() => { const c = document.querySelector('.sfc-carte[data-carte]'); return 1; })()`);
  console.log('— carte', q);
  const imgRecto = `document.querySelector('.sfc-carte [data-agrandir], .sfc-carte .zim-vignette')`;
  if (await b.ev(`!!(${imgRecto})`)) {
    await ouvrirSur(imgRecto, `${q} recto`);
    if (q === 'img-recto') { if (type === 'tel') await b.capture('apres-tel-1-visionneuse-recto'); await gestes(`${q} recto`); if (type === 'tel') { await b.pincer(195, 420, 80, 300, 10); await b.capture('apres-tel-2-zoom-pincement'); await b.double(195, 420, 400); } }
    if (q === 'img-occ') b.v(await b.ev(`document.querySelectorAll('.vz-fond .occ-q').length === 2 && !document.querySelector('.vz-fond .occ-reponse')`), `${q} recto : la visionneuse montre les 2 masques opaques, rien de révélé`);
    if (q === 'img-muscle') b.v(await b.ev(`!!document.querySelector('.vz-fond .mui-v-cadre img')`), `${q} : image Muscle dans la même visionneuse`);
    await fermeAvec(q === 'img-recto' ? (b.tactile ? 'glisse' : 'echap') : q === 'img-occ' ? 'fond' : 'croix', `${q} recto`);
  }
  // toucher HORS image : retournement
  const hors = await b.rect(`document.querySelector('.sfc-carte .sfc-recto, .sfc-carte .sfc-indication')`);
  await b.point(hors.cx, hors.cy, 500);
  const v = await etat();
  b.v(!v.vz && (v.notes || type === 'x'), `${q} : toucher hors de l'image retourne la carte (boutons de note affichés)`);
  const imgVerso = `document.querySelector('.sfc-carte [data-agrandir]')`;
  if (await b.ev(`!!(${imgVerso})`)) {
    await ouvrirSur(imgVerso, `${q} verso`);
    if (q === 'img-occ') b.v(await b.ev(`!document.querySelector('.vz-fond .occ-q') && document.querySelectorAll('.vz-fond .occ-reponse').length === 2`), `${q} verso : la visionneuse montre l'état du verso (réponses), identique à la carte`);
    if (type === 'tel' && q === 'img-verso') await b.capture('apres-tel-3-visionneuse-verso');
    await fermeAvec(b.tactile ? 'glisse' : 'echap', `${q} verso`);
    b.v((await etat()).notes, `${q} verso : toujours au verso, boutons de note intacts`);
  }
  // noter « Correct » pour passer à la suivante (seule notation volontaire)
  const j0 = await nbJournal();
  await b.toucher(`document.querySelector('[data-note="3"]')`, 1200);
  b.v((await nbJournal()) === j0 + 1, `${q} : une seule entrée de journal pour la notation volontaire`);
}
b.v(['img-recto', 'img-verso', 'img-deux', 'img-occ', 'img-muscle'].every((x) => vus.has(x)), 'les 5 cartes image vues en séance', [...vus].join(', '));

// ---------------- MODE APPRENTISSAGE ----------------
await b.ev(`(() => { const q = document.querySelector('.sfc-quitter'); q && q.click(); const t = [...document.querySelectorAll('.sfc-btn')].find((x) => /Terminer/.test(x.textContent)); t && t.click(); return 1; })()`); await b.dormir(800);
await b.reinitApprendre();
await b.ev(`localStorage.setItem('medrevise.apprentissage.filtres', JSON.stringify({ q: '', matieres: [], coursInclus: ['f6'], coursExclus: [], nouvelles: false, aApprendre: false, types: [], vues: [] })); 1`);
await b.apprendre();
const jA = await nbJournal();
await b.toucher(`document.querySelector('.alib-lancer')`, 900);
for (let i = 0; i < 5; i++) {
  const e = await etat(); if (!e.id) break;
  const img = `document.querySelector('.sfc-carte [data-agrandir], .sfc-carte .zim-vignette')`;
  if (await b.ev(`!!(${img})`)) { await ouvrirSur(img, `Apprentissage ${e.id}`); await fermeAvec(b.tactile ? 'glisse' : 'echap', `Apprentissage ${e.id}`); }
  if (type === 'tel' && e.id === 'img-recto') await b.capture('apres-tel-4-apprentissage');
  await b.ev(`(() => { const s = document.querySelector('.alib-skip'); s && !s.disabled && s.click(); return 1; })()`); await b.dormir(500);
}
b.v((await nbJournal()) === jA, 'mode Apprentissage : le journal n’a pas bougé');
await b.ev(`(() => { const q = document.querySelector('.sfc-quitter'); q && q.click(); return 1; })()`); await b.dormir(500);
process.exit(b.fin() ? 1 : 0);
