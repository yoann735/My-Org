// Outils des tests de surlignage (10/10)
export function outilsSurl(B) {
  const { c, ev, dormir } = B;
  const couleur = async (nom) => { await ev(`(()=>{const b=[...document.querySelectorAll('[class*=rangee] button')].find(x=>(x.title||'').startsWith(${JSON.stringify(nom)}));b&&b.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));b&&b.click();return !!b})()`); await dormir(250); };
  const outil = async (prefixe) => { await ev(`(()=>{const b=document.querySelector('button.ptb-outil[title^="${prefixe}"]');if(b&&!b.classList.contains('actif'))b.click();return 1})()`); await dormir(300); };
  // coordonnées écran du début / de la fin d'une sous-chaîne dans un conteneur (couche texte d'une page, flux…)
  const coords = (racine, texte, debutMot, finMot) => ev(`(()=>{const R=${racine};const w=document.createTreeWalker(R,NodeFilter.SHOW_TEXT);const ns=[];let tout='';let n;while((n=w.nextNode())){ns.push([n,tout.length]);tout+=n.nodeValue}
const i=tout.indexOf(${JSON.stringify(texte)});if(i<0)return null;const s=tout.indexOf(${JSON.stringify(debutMot)},i),e=tout.indexOf(${JSON.stringify(finMot)},s)+${JSON.stringify(finMot)}.length;
const loc=(k)=>{let best=ns[0];for(const x of ns){if(x[1]<=k)best=x;else break}return [best[0],k-best[1]]};
const [n1,o1]=loc(s),[n2,o2]=loc(e-1);n1.parentElement.scrollIntoView({block:'center'});
const r1=document.createRange();r1.setStart(n1,o1);r1.setEnd(n1,o1+1);const r2=document.createRange();r2.setStart(n2,o2);r2.setEnd(n2,o2+1);const a=r1.getBoundingClientRect(),b=r2.getBoundingClientRect();return [a.left+1,a.top+a.height/2,b.right-1,b.top+b.height/2]})()`);
  const glisser = async (p) => {
    if (!p) throw new Error('texte introuvable');
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1] });
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p[0], y: p[1], button: 'left', clickCount: 1, buttons: 1 });
    for (let i = 1; i <= 10; i++) { await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0] + (p[2] - p[0]) * i / 10, y: p[1] + (p[3] - p[1]) * i / 10, button: 'left', buttons: 1 }); await dormir(30); }
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p[2], y: p[3], button: 'left', clickCount: 1 });
    await dormir(700);
  };
  return { couleur, outil, coords, glisser };
}
