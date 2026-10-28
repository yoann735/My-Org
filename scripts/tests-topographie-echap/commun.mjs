// Banc « Échap n'annule plus / ligne Topographie » (28/10, docs/compte-rendu-flashcards.md). Même banc que
// tests-par-cours-elements : Vite :5302 SANS Supabase + Chrome headless isolés C (9337, ordinateur) / D (9338, téléphone),
// profils neufs : jamais le vrai cloud. Jeu : tests-par-cours-elements/seed.mjs (cours f1…f5, témoin Muscle d'avant).
import { banc as bancPC, COURS } from '../tests-par-cours-elements/commun.mjs';
export { COURS };
export async function banc(tel = false, W, H) {
  const b = await bancPC(tel, W, H);
  b.cle = async (key, code, kc, modifiers = 0) => {
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: kc, modifiers });
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: kc, modifiers });
    await b.dormir(250);
  };
  b.echap = () => b.cle('Escape', 'Escape', 27);
  b.form = () => b.ev(`!!document.querySelector('.fc-carte')`);
  b.actif = () => b.ev(`(()=>{const a=document.activeElement;return a?(a.tagName+(a.id?'#'+a.id:'')+(a.dataset&&a.dataset.champ?'['+a.dataset.champ+']':'')+(a.getAttribute('aria-label')?'{'+a.getAttribute('aria-label')+'}':'')):''})()`);
  b.focusEcrire = async (js, texte) => { await b.toucher(js, 200); await b.ev(`(()=>{const e=${js};e.focus();return 1})()`); await b.send('Input.insertText', { text: texte }); await b.dormir(250); };
  b.sorte = (s) => b.toucher(`document.querySelector('.fc-carte [data-sorte="${s}"]')`, 900);
  return b;
}
