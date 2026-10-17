// Accueil, ordinateur 1 440 px : bascule Mes J ↔ École, semaine École, couleurs stables,
// cours en cours / prochain cours, fuseau et changement d'heure du 25/10, rappel du jeudi.
import { ouvrir, identiques, hp, forcerServeur } from './commun-edt.mjs';

await hp('/__version?v=1'); await forcerServeur();
const LUNDI_0900 = '2026-10-19T07:00:00Z'; // lundi 19/10 09:00 à Bruxelles (CEST)
let b = await ouvrir({ date: LUNDI_0900 });
await b.reinit({ mode: 'j' }); await b.recharger(); await b.accueil();

// ---- 1. « Mes J » : le calendrier des J ne bouge pas d'un pixel
const serie = `document.querySelector('.today-cta')`;
const clipSerie = await b.rect(serie);
const grilleJ = async (n) => { await b.png(n, '.wcal-grid:not(.edt-grille)'); await b.capture(n + '-serie', { x: clipSerie.x, y: clipSerie.y, width: clipSerie.w, height: clipSerie.h }); };
await grilleJ('edt-j-avant');
b.ok(await b.ev(`document.querySelector('.edt-seg .seg-btn.active').innerText==='Mes J'`), 'mode par défaut : « Mes J »');
await b.mode('ecole'); await b.dormir(1200);
b.ok(await b.ev(`!!document.querySelector('.edt-grille') && !document.querySelector('.wcal-grid:not(.edt-grille)')`), 'École : la grille École remplace celle des J');
await b.mode('j'); await b.dormir(900);
await grilleJ('edt-j-apres');
b.ok(identiques('../cap/edt-j-avant.png', '../cap/edt-j-apres.png'), 'Mes J → École → Mes J : grille des J identique au pixel');
b.ok(identiques('../cap/edt-j-avant-serie.png', '../cap/edt-j-apres-serie.png'), 'séance du jour identique au pixel');
await b.png('edt-switch-j', '.edt-tete', 6);

// ---- 2. École mémorisé
await b.mode('ecole'); await b.dormir(800);
await b.recharger(); await b.accueil(); await b.dormir(800);
b.ok(await b.ev(`document.querySelector('.edt-seg .seg-btn.active').innerText==='École' && !!document.querySelector('.edt-grille')`), 'choix « École » mémorisé après rechargement');

// ---- 3. la semaine
const c = await b.cartes();
const jour = (n) => c.filter((x) => (x.jour || '').startsWith(n));
b.ok(jour('lundi').map((x) => x.h.slice(0, 11)).join(' | ') === '08:30–10:30 | 10:45–12:45 | 13:45–15:45', 'lundi : cours sur deux créneaux + cours Teams', jour('lundi').map((x) => x.h).join(' | '));
b.ok(jour('lundi')[2].l.trim() === 'Teams' && jour('lundi')[2].p === 'M. Dupont', 'cours Teams : « Teams » à la place de la salle');
b.ok(jour('mardi').length === 2 && /annule/.test(jour('mardi')[1].cls) && /Annulé/.test(jour('mardi')[1].h), 'mardi : cours annulé barré, badge « Annulé »');
b.ok(/pratique/.test(jour('mardi')[0].l), 'mardi : cours pratique signalé');
b.ok(jour('jeudi').length === 1 && jour('jeudi')[0].h.startsWith('13:45–15:45') && /B07/.test(jour('jeudi')[0].l), 'jeudi : cours modifié (13:45, B07) à la place de 10:45 B04');
b.ok(jour('samedi').length === 0 && jour('dimanche').length === 0, 'week-end vide');
b.ok(jour('lundi')[0].p === 'Mme Leyh' && /C02/.test(jour('lundi')[0].l) && /Montignies/.test(jour('lundi')[0].l), 'carte : prof, salle, campus');
const st = await b.ev(`(()=>{const e=document.querySelector('.edt-cours');const s=getComputedStyle(e);return {bl:s.borderLeftWidth+' '+s.borderLeftStyle,bc:s.borderLeftColor,bg:s.backgroundColor,c:e.style.getPropertyValue('--edt-c')}})()`);
b.ok(st.bl === '3px solid' && /(, 0\.12\)|\/ 0\.12\))$/.test(st.bg), 'couleur en bordure gauche (3 px) + fond teinté à 12 %', JSON.stringify(st));

// ---- 4. en tête : cours en cours, liseré pulsant
const a = await b.avant();
b.ok(a && a.txt === 'En cours · jusqu’à 10:30 · Anatomie descriptive et palpatoire · Mme Leyh · C02 · Montignies', 'en tête : cours en cours', a && a.txt);
const pouls = await b.ev(`(()=>{const e=document.querySelector('.edt-cours.en-cours');return e?[getComputedStyle(e,'::before').animationName, getComputedStyle(e,'::before').animationDuration, document.querySelectorAll('.edt-cours.en-cours').length]:null})()`);
b.ok(pouls && pouls[0] === 'edt-pouls' && pouls[2] === 1, 'un seul cours en cours, liseré pulsant', JSON.stringify(pouls));
await b.png('edt-ecole-semaine', '.edt-carte');

// ---- 5. couleurs stables (3 actualisations + 3 rechargements)
const couleurs = async () => Object.fromEntries((await b.cartes()).map((x) => [x.t, x.c]));
const ref = await couleurs();
b.ok(new Set(Object.values(ref)).size >= 5, 'cours distincts → couleurs distinctes', JSON.stringify(ref));
for (let i = 0; i < 3; i++) { await b.clic(await b.pos(`document.querySelector('.edt-actualiser')`, false), { att: 1500 }); }
const apresActu = await couleurs();
for (let i = 0; i < 3; i++) { await b.recharger(); await b.accueil(); await b.dormir(900); }
const apresRech = await couleurs();
b.ok(JSON.stringify(ref) === JSON.stringify(apresActu) && JSON.stringify(ref) === JSON.stringify(apresRech), 'couleurs identiques après 3 actualisations et 3 rechargements');
const reg = await b.S(`const r=await S.getEdtReglages();return r?Object.values(r.cours).map(c=>c.titre+':'+c.teinte).join(' | '):null`);
b.ok(reg && reg.split(' | ').length === 7, 'réglages : 7 cours enregistrés avec leur teinte fixe', reg);

// ---- 6. navigation et changement d'heure du 25/10
const clicNav = async (t) => { await b.clic(await b.pos(`document.querySelector('.edt-nav .weeknav button[title=${JSON.stringify(t)}]')`, false), { att: 500 }); };
await clicNav('Semaine suivante');
let c2 = await b.cartes();
b.ok(await b.ev(`document.querySelector('.edt-nav .wk').innerText`) === 'Semaine prochaine', 'semaine suivante');
b.ok(c2.find((x) => x.jour.startsWith('lundi')).h.startsWith('08:30') && c2.find((x) => x.jour.startsWith('jeudi')).h.startsWith('10:45–12:45'), 'après le 25/10 : lundi 08:30 (UTC 07:30) et jeudi 10:45 (série) justes', c2.map((x) => x.jour.split(' ')[0] + ' ' + x.h.slice(0, 11)).join(', '));
await clicNav('Semaine précédente'); await clicNav('Semaine précédente');
c2 = await b.cartes();
b.ok(c2.find((x) => x.jour.startsWith('jeudi')).h.startsWith('10:45–12:45') && c2.find((x) => x.jour.startsWith('lundi')).h.startsWith('08:30'), 'semaine passée (12/10) : mêmes heures avant le changement d’heure');
await b.clic(await b.bouton("Aujourd'hui"), { att: 500 });
b.ok(await b.ev(`document.querySelector('.edt-nav .wk').innerText`) === 'Cette semaine', '« Aujourd’hui » revient à la semaine en cours');
b.ok(b.erreurs.length === 0, '0 erreur console', b.erreurs.join(' | '));
b.c.fermer();

// ---- 7. fuseau de l'appareil sans effet (New York, Tokyo)
for (const tz of ['America/New_York', 'Asia/Tokyo']) {
  b = await ouvrir({ date: LUNDI_0900, tz });
  const cc = await b.cartes();
  const av = await b.avant();
  b.ok(cc.filter((x) => x.jour.startsWith('lundi')).map((x) => x.h.slice(0, 11)).join(',') === '08:30–10:30,10:45–12:45,13:45–15:45' && /^En cours · jusqu’à 10:30/.test(av.txt), `appareil en ${tz} : heures et jours de Bruxelles`, av && av.txt);
  b.c.fermer();
}

// ---- 8. prochain cours
b = await ouvrir({ date: '2026-10-19T06:05:00Z' });
let av = await b.avant();
b.ok(av && av.txt === 'Dans 25 min · Anatomie descriptive et palpatoire · Mme Leyh · C02 · Montignies' && !/en-cours/.test(av.cls), 'prochain cours : « Dans 25 min · … »', av && av.txt);
b.ok(await b.ev(`document.querySelectorAll('.edt-cours.en-cours').length`) === 0, 'aucun liseré avant le début');
b.c.fermer();
b = await ouvrir({ date: '2026-10-20T11:00:00Z' }); // mardi 13:00 : biochimie (13:45) annulée
av = await b.avant();
b.ok(av && /Psychologie de la santé/.test(av.txt) && /^Demain 08:30/.test(av.txt), 'un cours annulé n’est jamais « le prochain »', av && av.txt);
b.c.fermer();

// ---- 9. rappel du jeudi 16 h (mode École seulement)
const rappel = (bb) => bb.ev(`!!document.querySelector('.edt-ligne.rappel')`);
b = await ouvrir({ date: '2026-10-22T13:30:00Z' });
b.ok(await rappel(b), 'jeudi 15:30 : rappel « Horaires définitifs à partir du jeudi 16 h » affiché');
await b.mode('j'); await b.dormir(600);
b.ok(!(await rappel(b)), 'mode Mes J : pas de rappel');
await b.mode('ecole'); await b.dormir(400);
b.c.fermer();
b = await ouvrir({ date: '2026-10-22T14:05:00Z' });
b.ok(!(await rappel(b)), 'jeudi 16:05 : rappel masqué');
b.c.fermer();
b = await ouvrir({ date: '2026-10-24T09:00:00Z' });
b.ok(!(await rappel(b)), 'samedi : rappel masqué');
b.c.fermer();
