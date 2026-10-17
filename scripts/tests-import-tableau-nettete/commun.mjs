// Banc du chantier du 17/10 soir (import JSON · glissement · carte Tableau · netteté · icônes de révision) —
// Vite :5199 SANS Supabase + Chrome headless 9333, base LOCALE seulement.
import { banc as bancBF } from '../tests-bibliotheque-fichier/commun.mjs';
export async function banc(W = 1440, H = 900, opts = {}) {
  const b = await bancBF(W, H, opts);
  // panneau du cours ouvert › mode Exercices › sous-onglet Flashcards
  b.panneauFlashcards = async () => {
    await b.ev(`(()=>{const x=[...document.querySelectorAll('.pm-seg-btn')].find(e=>e.innerText.startsWith('Exercices'));x&&x.click();return 1})()`); await b.dormir(500);
    await b.ev(`(()=>{const x=[...document.querySelectorAll('.pis button')].filter(e=>e.offsetParent).find(e=>e.innerText.trim().startsWith('Flashcards'));x&&x.click();return 1})()`); await b.dormir(500);
  };
  // pose une valeur dans un champ contrôlé par React (input / textarea)
  b.remplir = (sel, v) => b.ev(`(()=>{const t=${sel};if(!t)return false;const P=t.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(P,'value').set.call(t,${JSON.stringify(v)});t.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  // collage (presse-papiers) d'un texte sur un élément
  b.coller = (sel, texte) => b.ev(`(()=>{const el=${sel};const dt=new DataTransfer();dt.setData('text/plain',${JSON.stringify(texte)});el.focus();el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));return true})()`);
  return b;
}
