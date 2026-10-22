// §1 TEXTE : Boîte · Texte libre · Post-it posés au clic ; les « ? » déjà posés restent affichés et manipulables ;
// Formes (une forme de « … »), Dessin › Gomme.   node t-texte.mjs [tablette]
import { banc, FICHE } from './commun.mjs';
const tablette = process.argv[2] === 'tablette';
const b = await banc();
await b.preparer({ annotations: [{ id: 'so-q', ficheId: FICHE, page: 1, kind: 'question', type: 'question', x: 0.9, y: 0.3, createdAt: '2026-10-20T08:00:00.000Z' }] });
await b.ouvrirCours({ tablette });
const page = await b.rect(`document.querySelector('.pdfr-page[data-cle="1"]')`);
const ici = (fx, fy) => [page.x + page.w * fx, page.y + page.h * fy];
const enBase = () => b.enBase();
// « ? » d'avant : affiché, sélectionnable, sa mini barre (supprimer)
b.ok(await b.ev(`!!document.querySelector('.pdfr-question[data-objet="so-q"]')`), 'un « ? » posé avant reste affiché');
await b.clic(await b.pos(`document.querySelector('.pdfr-question[data-objet="so-q"]')`, false), { att: 500 });
b.ok(JSON.stringify((await b.optionsBarre())[0]) === '["supprimer"]', '« ? » : sélectionnable, mini barre « supprimer »');
await b.T.Escape();
// Boîte
await b.outil6('ecrire'); await b.sousOutil('boite');
await b.clic(ici(0.6, 0.55), { att: 900 }); await b.ecrire('Boîte posée'); await b.T.Escape(); await b.dormir(500);
// Texte libre
await b.sousOutil('texte');
await b.clic(ici(0.6, 0.66), { att: 900 }); await b.ecrire('Texte libre posé'); await b.T.Escape(); await b.dormir(500);
// Post-it
await b.outil6('ecrire'); await b.sousOutil('postit');
await b.clic(ici(0.08, 0.6), { att: 900 }); await b.ecrire('Je n’ai pas compris'); await b.T.Escape(); await b.dormir(700);
const A = await enBase();
const boite = A.find((a) => a.kind === 'libre' && !a.postit && !a.grille), texte = A.find((a) => a.kind === 'texte'), postit = A.find((a) => a.postit);
const txt = (a) => a && JSON.stringify(a.content).match(/"text":"([^"]+)"/)?.[1];
b.ok(txt(boite) === 'Boîte posée' && txt(texte) === 'Texte libre posé' && txt(postit) === 'Je n’ai pas compris', 'Texte › Boîte, Texte libre, Post-it : posés d’un clic, on écrit tout de suite', JSON.stringify([txt(boite), txt(texte), txt(postit)]));
const pr = await b.ev(`(()=>{const e=document.querySelector('.note-box.postit');const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {w:Math.round(r.width),h:Math.round(r.height),rayon:c.borderTopLeftRadius,ombre:c.boxShadow!=='none',fond:c.backgroundColor}})()`);
b.ok(postit && postit.couleur === 'jaune-franc' && postit.fond === 'plein' && Math.abs(pr.w - pr.h) <= 3 && pr.ombre, 'post-it : carré, jaune par défaut, plein, ombre portée', JSON.stringify(pr));
await b.capRect('so-postit', `document.querySelector('.note-box.postit')`, 16);
// mini barre d'un post-it = celle d'une boîte
await b.outil6('main');
await b.clic(await b.pos(`document.querySelector('.note-box.postit')`, false), { att: 500 });
const op = (await b.optionsBarre())[0];
b.ok(JSON.stringify(op) === JSON.stringify(['taille', 'couleur-texte', 'couleur', 'fond', '|', 'gras', 'italique', 'align', '|', 'fleche', 'vers-tableau', '…', 'supprimer']), 'post-it : même mini barre qu’une boîte', JSON.stringify(op));
await b.T.Escape();
// Formes : une forme cachée derrière « … » (étoile), posée d'un clic
await b.outil6('forme');
await b.clic(await b.pos(`document.querySelector('[data-forme="plus"]')`, false), { att: 300 });
await b.clic(await b.pos(`document.querySelector('[data-forme="etoile"]')`, false), { att: 300 });
await b.clic(ici(0.8, 0.85), { att: 700 });
b.ok((await enBase()).some((a) => a.kind === 'forme' && a.forme === 'etoile'), 'Formes › « … » › Étoile : posée d’un clic');
// Dessin › Gomme efface la forme
await b.outil6('dessin'); await b.sousOutil('gomme');
const f = await b.ev(`(()=>{const e=document.querySelector('.pdfr-forme[data-forme="etoile"]');const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+2]})()`);
await b.glisser([f[0] - 40, f[1] + 30], [f[0] + 40, f[1] + 30], 12); await b.dormir(700);
b.ok(!(await enBase()).some((a) => a.kind === 'forme' && a.forme === 'etoile'), 'Dessin › Gomme efface la forme');
await b.T.Escape();
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
