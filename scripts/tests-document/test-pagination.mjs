import { paginer } from '../../src/medrevise/documents/lib/pagination.js';
const geo = { haut: (k) => 56 + k * (842 + 18), zone: 730 };
const ok = (c, m) => console.log((c ? '✅' : '❌') + ' ' + m);
const para = (n, lh = 20) => ({ h: n * lh, coupes: Array.from({ length: n - 1 }, (_, i) => ({ y: (i + 1) * lh, pos: 1000 + i })) });
// 1. tout tient
let r = paginer([{ h: 100 }, { h: 200 }], geo); ok(r.nbPages === 1 && !r.espaceurs.length, 'deux blocs tiennent sur une page');
// 2. image qui ne tient pas → page suivante entière
r = paginer([{ h: 600 }, { h: 300, type: 'image' }], geo); ok(r.pages[1] === 1 && r.espaceurs[0].h === 730 - 600 + 112 + 18, 'image renvoyée entière, espaceur = reste + marges + écart');
// 3. paragraphe coupé entre deux lignes, 2 lignes min de chaque côté
r = paginer([{ h: 690 }, para(10)], geo); // reste 40 px = 2 lignes
ok(r.espaceurs.length === 1 && r.espaceurs[0].pos === 1001, 'paragraphe de 10 lignes : 2 en bas, 8 en haut de la page suivante');
r = paginer([{ h: 710 }, para(10)], geo); // reste 20 px = 1 ligne → orpheline interdite
ok(r.espaceurs[0].pos === null && r.pages[1] === 1, 'orpheline : 1 seule ligne possible → le paragraphe passe entier');
r = paginer([{ h: 730 - 9 * 20 }, para(10)], geo); // 9 lignes tiennent, 1 seule renvoyée → veuve
ok(r.espaceurs[0].pos === 1007, 'veuve : on renvoie 2 lignes au lieu d’1');
// 4. titre gardé avec le suivant
r = paginer([{ h: 680 }, { h: 30, garderAvecSuivant: true }, para(5)], geo);
ok(r.pages[1] === 1, 'titre en bas de page sans place pour 2 lignes du suivant → page suivante');
// 5. saut de page
r = paginer([{ h: 50 }, { h: 0, saut: true }, { h: 50 }], geo); ok(r.pages[2] === 1 && r.nbPages === 2, 'saut de page');
// 6. paragraphe plus long que 2 pages
r = paginer([para(80)], geo); ok(r.nbPages === 3 && r.espaceurs.length === 2, 'paragraphe de 80 lignes sur 3 pages');
// 7. déterministe
ok(JSON.stringify(paginer([{ h: 600 }, para(12), { h: 400 }], geo)) === JSON.stringify(paginer([{ h: 600 }, para(12), { h: 400 }], geo)), 'déterministe');
// 8. aucun bloc ne dépasse le bas d'une page (simulation)
const blocs = [{ h: 300 }, para(30), { h: 500, type: 'image' }, { h: 40, garderAvecSuivant: true }, para(6), { h: 720 }, para(3)];
r = paginer(blocs, geo);
let y = 56, ok8 = true;
blocs.forEach((b, i) => {
  r.espaceurs.filter((e) => e.bloc === i && e.pos === null).forEach((e) => { y += e.h; });
  const inl = r.espaceurs.filter((e) => e.bloc === i && e.pos !== null);
  const cuts = (b.coupes || []);
  let deb = y, yb = 0;
  const bornes = [0, ...cuts.map((c) => c.y), b.h];
  for (let l = 0; l < bornes.length - 1; l++) {
    const e = inl.find((s) => cuts[l - 1] && s.pos === cuts[l - 1].pos);
    if (e) y += e.h;
    const top = y + bornes[l], bot = y + bornes[l + 1];
    const pg = Math.floor((top - 56 + 1) / 860);
    if (bot > 56 + pg * 860 + 730 + 0.5) ok8 = false;
  }
  y += b.h;
});
ok(ok8, 'aucune ligne ni bloc ne dépasse le bas de sa page');
// 9. reprise incrémentale = calcul complet
import { pointDeReprise } from '../../src/medrevise/documents/lib/pagination.js';
const doc1 = [{ h: 300 }, para(30), { h: 500 }, { h: 40, garderAvecSuivant: true }, para(6), { h: 720 }, para(3), { h: 200 }, para(20)];
const r1 = paginer(doc1, geo);
const doc2 = doc1.map((b, i) => (i === 7 ? { h: 260 } : b)); // le bloc 7 grandit
const rep = pointDeReprise(r1, 7);
const inc = paginer(doc2, geo, rep), full = paginer(doc2, geo);
ok(rep && JSON.stringify(inc) === JSON.stringify(full), `reprise incrémentale au bloc ${rep && rep.bloc} (page ${rep && rep.page + 1}) = calcul complet`);
// 12. paragraphe de 2 ou 3 lignes en bas de page : jamais coupé (2 lignes minimum de chaque côté)
{
  const geoP = { haut: (k) => 56 + k * (842 + 18), zone: 730 };
  for (const n of [2, 3]) {
    const r = paginer([{ h: 730 - 20 * (n - 1) - 5 }, para(n)], geoP);
    ok(r.espaceurs.length === 1 && r.espaceurs[0].bloc === 1 && r.espaceurs[0].pos === null && r.pages[1] === 1, `paragraphe de ${n} lignes avec la place pour ${n - 1} : passe ENTIER à la page suivante`);
  }
  const r4 = paginer([{ h: 705 }, para(4)], geoP);
  ok(r4.espaceurs.length === 1 && r4.espaceurs[0].bloc === 1 && r4.espaceurs[0].pos === null, 'paragraphe de 4 lignes, 1 seule ligne tient en bas : entier à la page suivante (pas d’orpheline)');
  const r4b = paginer([{ h: 690 }, para(4)], geoP);
  ok(r4b.espaceurs.length === 1 && r4b.espaceurs[0].pos !== null, 'paragraphe de 4 lignes avec la place pour 2 : coupé 2 + 2');
}
