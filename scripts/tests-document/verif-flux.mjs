// verifFlux(ev) → { pages, blocsParPage, violations[], images, doublons } — conformité du moteur paginé
export const SCRIPT_VERIF = `(()=>{
  const flux=document.querySelector('.ProseMirror.pt-flux');if(!flux)return JSON.stringify({erreur:'pas de flux'});
  const ech=flux.getBoundingClientRect().width/flux.offsetWidth;
  const cadre=document.querySelector('.pt-flux-cadre').getBoundingClientRect();
  const H=842,G=18,M=56;
  const pageDe=(y)=>Math.floor((y-cadre.top)/ech/(H+G));
  const zone=(k)=>({haut:cadre.top+(k*(H+G)+M)*ech,bas:cadre.top+(k*(H+G)+H-M)*ech});
  const violations=[];const parPage={};const imgs=[];
  const blocs=[...flux.children].filter(e=>!e.classList.contains('pt-saut'));
  blocs.forEach((b,i)=>{
    const nom=b.classList.contains('pti')?'IMG':b.tagName;
    if(nom==='IMG'){const bl=b.querySelector('img');if(bl)imgs.push(bl.getAttribute('src'))}
    // morceaux à vérifier : les LIGNES d'un paragraphe / d'une liste, le bloc entier sinon
    let morceaux=[];
    if(['P','H1','H2','H3'].includes(b.tagName)){const r=document.createRange();const w=document.createTreeWalker(b,NodeFilter.SHOW_TEXT);let t;while((t=w.nextNode())){if(!t.length||t.parentElement.closest('.pt-saut-ligne'))continue;r.selectNodeContents(t);for(const q of r.getClientRects())if(q.height)morceaux.push({top:q.top,bottom:q.bottom})}}
    else if(['UL','OL','BLOCKQUOTE'].includes(b.tagName)){morceaux=[...b.children].filter(c=>!c.classList.contains('pt-saut-ligne')).map(c=>{const q=c.getBoundingClientRect();return{top:q.top,bottom:q.bottom}})}
    else {const q=(b.querySelector('.pti-cadre')||b).getBoundingClientRect();morceaux=[{top:q.top,bottom:q.bottom}]}
    if(!morceaux.length){const q=b.getBoundingClientRect();if(q.height>2)morceaux=[{top:q.top,bottom:q.bottom}]}
    morceaux.forEach(m=>{const k=pageDe(m.top+0.5);const z=zone(k);if(m.bottom>z.bas+1.5||m.top<z.haut-1.5)violations.push({bloc:i,nom,page:k+1,depasse:Math.round(Math.max(m.bottom-z.bas,z.haut-m.top)/ech)})});
    const k=morceaux.length?pageDe(morceaux[0].top+0.5):-1;(parPage[k+1]=parPage[k+1]||[]).push(nom==='IMG'?'IMG':nom[0]);
  });
  const nb=Number(([...document.querySelectorAll('span,div')].find(e=>e.children.length===0&&/^\\d+\\s*\\/\\s*\\d+$/.test((e.innerText||'').trim()))||{innerText:'0/0'}).innerText.split('/')[1]);
  return JSON.stringify({pages:nb,blocsParPage:Object.fromEntries(Object.entries(parPage).map(([k,v])=>[k,v.join('')])),violations,images:imgs.length,doublons:imgs.length-new Set(imgs).size});
})()`;
export const resumeVerif = (v) => `${v.pages} pages | ${v.images} images${v.doublons ? ' (DOUBLONS ' + v.doublons + ')' : ''} | ${v.violations.length ? '❌ ' + v.violations.length + ' débordement(s) : ' + JSON.stringify(v.violations.slice(0, 3)) : '✅ rien ne déborde'} | ` + Object.entries(v.blocsParPage).map(([k, s]) => `p${k}:${s}`).join(' ');
