// Banc « Export complet des flashcards » (26/10, docs/compte-rendu-export-flashcards.md). Vite :5302 SANS Supabase
// (VITE_SUPABASE_URL vide) + Chrome headless isolés C (9337, ordinateur) et D (9338, téléphone), profils de banc :
// jamais le vrai cloud, aucune écriture Supabase possible.
import fs from 'node:fs';
import { banc as bancPC } from '../tests-par-cours-elements/commun.mjs';
export const SP = process.env.SP || '/private/tmp/claude-501/-Users-yoannlmr/168123cc-d41d-4868-874d-3b56f68602ac/scratchpad';
export const SORTIE = SP + '/export-fc';
export const COURS = { tous: 'Export — tous les types', cible: 'Cours cible (ré-import)', cible2: 'Cours cible 2 (avec progression)', gros: 'Export 300 cartes illustrées' };
export const MATIERE = 'Anatomie export';
export async function banc(tel = false) {
  const b = await bancPC(tel);
  fs.mkdirSync(SORTIE, { recursive: true });
  b.v = (c, m, d = '') => { if (!b.ok(c, m, d)) b.echecs = (b.echecs || 0) + 1; return c; };
  // ouvrir un cours depuis la Bibliothèque (même logique que tests-a-apprendre/commun.mjs)
  b.bibliotheque = async () => {
    if (await b.ev(`document.body.innerText.includes('Choisis ton espace')`)) { await b.ev(`[...document.querySelectorAll('.hub-card')].find(x=>/^\\s*MedRevise/i.test(x.innerText))?.click();1`); await b.dormir(1500); }
    await b.ev(`(()=>{const x=[...document.querySelectorAll('.sb-item, .sidebar [role=button], .sidebar button, .sidebar a')].find(e=>/Biblioth/.test(e.innerText||e.title||''));x&&x.click();return 1})()`); await b.dormir(1200);
    await b.ev(`(()=>{const r=[...document.querySelectorAll('button')].find(x=>(x.title||'')==='Revenir à la liste'||x.getAttribute('aria-label')==='Retour');r&&r.click();return 1})()`); await b.dormir(800);
  };
  b.ouvrirCours = async (titre) => {
    await b.bibliotheque();
    const pos = await b.ev(`(()=>{const l=[...document.querySelectorAll('.lt-fiche')].find(e=>e.innerText.trim().startsWith(${JSON.stringify(titre)}));if(!l)return null;l.scrollIntoView({block:'center'});const r=l.getBoundingClientRect();return [r.x+Math.min(60,r.width/3),r.y+r.height/2]})()`);
    if (pos) for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x: pos[0], y: pos[1], button: 'left', clickCount: 1 });
    await b.dormir(2500);
    await b.ev(`(()=>{const m=[...document.querySelectorAll('.pm-seg-btn')].find(x=>/Exercices/.test(x.title));m&&m.click();return 1})()`); await b.dormir(700);
    await b.ev(`(()=>{const t=[...document.querySelectorAll('.pm-sous-btn')].find(x=>/Flashcards/.test(x.textContent));t&&t.click();return 1})()`); await b.dormir(900);
    return b.ev(`document.querySelectorAll('.pis-item.fcl-carte').length`);
  };
  // le .zip du dernier export (window.__dernierExportFC.blob), écrit sur le disque ; rend { chemin, nom, octets, … }
  b.recupererZip = async (fichier) => {
    const r = await b.ev(`(async()=>{const e=window.__dernierExportFC;if(!e)return null;const a=new Uint8Array(await e.blob.arrayBuffer());let s='';for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode.apply(null,a.subarray(i,i+0x8000));return {nom:e.nom,octets:e.octets,cartes:e.cartes,images:e.images,manquantes:e.manquantes,b64:btoa(s)}})()`);
    if (!r) return null;
    const chemin = SORTIE + '/' + (fichier || r.nom);
    fs.writeFileSync(chemin, Buffer.from(r.b64, 'base64'));
    delete r.b64;
    return { ...r, chemin };
  };
  // lance l'export dans la fenêtre ouverte et attend la fin
  b.lancerExport = async () => {
    await b.ev(`window.__dernierExportFC=null;1`);
    await b.toucher(`document.querySelector('[data-export-flashcards] [data-act="exporter-fc"]')`, 300);
    await b.attendre(`!!document.querySelector('[data-export-flashcards] [data-fait]') || !!document.querySelector('[data-export-flashcards] .fj-erreur')`, 120000);
    return b.ev(`(document.querySelector('[data-export-flashcards] [data-fait]')||{}).textContent||(document.querySelector('[data-export-flashcards] .fj-erreur')||{}).textContent`);
  };
  b.fermerFenetre = () => b.ev(`(()=>{const x=document.querySelector('.day-pop-head button[aria-label="Fermer"], .day-pop-head .cd-ic, .day-pop-head button');x&&x.click();return 1})()`);
  // dépose un fichier dans l'<input type=file> de l'import (vrai chemin disque, DOM.setFileInputFiles)
  b.deposer = async (sel, chemin) => {
    const o = await b.send('Runtime.evaluate', { expression: sel });
    await b.send('DOM.enable');
    await b.send('DOM.setFileInputFiles', { files: [chemin], objectId: o.result.objectId });
  };
  // empreinte de toutes les cartes (export = lecture seule)
  b.empreinteCartes = () => b.S(`const q=(await S.getAll('questions')).sort((a,b)=>a.id<b.id?-1:1);const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(q)));return {n:q.length,h:[...new Uint8Array(d)].slice(0,8).map(v=>v.toString(16).padStart(2,'0')).join('')}`);
  b.fin = () => { const errs = b.erreurs.filter((e) => !/validateDOMNesting/.test(e)); b.v(errs.length === 0, 'aucune erreur console', errs.join(' | ').slice(0, 300)); console.log(b.echecs ? `❌ ${b.echecs} échec(s)` : '✅ tout est vert'); process.exit(0); };
  return b;
}
