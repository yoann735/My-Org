// Fenêtre « Boîte → Flashcard » du lecteur (28/10) : Échap ne la ferme plus (le brouillon reste), il quitte le champ ;
// « Annuler » ferme. Banc tests-boites-tableaux (lecteur, boîte semée) — à lancer sur le banc isolé :
//   CDP_PORT=9337 CDP_FILTRE=5302 FX=<dossier de gen-pdf.mjs> node t-boite.mjs
import { banc } from '../tests-boites-tableaux/commun.mjs';
const b = await banc();
const T = (t) => ({ type: 'text', text: t });
const P = (...c) => ({ type: 'paragraph', content: c });
await b.preparer({ annotations: [{ id: 'bf-echap', ficheId: 'f-simpl', page: 1, kind: 'libre', type: 'boite', fond: 'plein', gabarit: 'carte', taille1000: 15, bord1000: 1.5, pad1000: [10, 8], couleur: 'jaune-franc', largeurFixe: true,
  x: 0.1, y: 0.15, width: 0.45, height: 0.1, createdAt: '2026-10-28T08:00:00.000Z', content: { type: 'doc', content: [P(T('Macula densa')), P(T('Détecte le NaCl du tubule distal.'))] } }] });
await b.S(`for(const q of await S.getAll('questions'))if(q.ficheId==='f-simpl')await S.remove('questions',q.id);return 1`);
await b.ouvrirCours({});
await b.dormir(800);
const box = `document.querySelector('.note-box[data-boite="bf-echap"]')`;
await b.ev(`${box}.scrollIntoView({block:'center'});1`); await b.dormir(500);
await b.clic(await b.pos(box, false), { att: 500 });
await b.clic(await b.pos(`[...document.querySelectorAll('.mini-barre [data-option="vers-flashcard"]')].find(e=>e.offsetParent)`, false), { att: 700 });
const ouverte = () => b.ev(`!!document.querySelector('.bfc-fenetre')`);
b.ok(await ouverte(), 'fenêtre « Boîte → Flashcard » ouverte');
const recto = `document.querySelector('.bfc-fenetre [data-champ="recto"]')`;
await b.remplir(recto, 'Macula densa : rôle ?');
const cle = async () => { for (const type of ['keyDown', 'keyUp']) await b.c.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await b.dormir(300); };
await b.ev(`${recto}.focus();1`);
await cle();
const r1 = { ouverte: await ouverte(), recto: await b.ev(`${recto}.value`), actif: await b.ev(`document.activeElement.tagName`) };
b.ok(r1.ouverte && r1.recto === 'Macula densa : rôle ?' && r1.actif !== 'TEXTAREA', 'Échap dans le recto : la fenêtre reste, la saisie est gardée, le focus sort du champ', JSON.stringify(r1));
await cle(); await cle();
b.ok(await ouverte() && (await b.ev(`${recto}.value`)) === 'Macula densa : rôle ?', 'Échap répétés : la fenêtre reste');
const dehors = await b.ev(`(()=>{const r=document.querySelector('.pdfr-scroll').getBoundingClientRect();const f=document.querySelector('.bfc-fenetre').getBoundingClientRect();return [r.x+30,Math.min(r.bottom-30,f.bottom+60)]})()`);
await b.clic(dehors, { att: 500 });
b.ok(await ouverte() && (await b.ev(`${recto}.value`)) === 'Macula densa : rôle ?', 'clic dehors (page du cours) : la fenêtre reste, saisie gardée');
await b.clic(await b.pos(`[...document.querySelectorAll('.bfc-fenetre button')].find(x=>/Annuler/.test(x.textContent))`, true), { att: 500 });
b.ok(!(await ouverte()), '« Annuler » ferme la fenêtre');
b.ok((await b.S(`return (await S.getAll('questions')).filter(q=>q.ficheId==='f-simpl').length`)) === 0, 'aucune carte créée');
await b.S(`await S.remove('annotations','bf-echap').catch(()=>{});return 1`).catch(() => {});
process.exit(0);
