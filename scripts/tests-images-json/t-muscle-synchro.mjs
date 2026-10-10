// Partie C : la carte Muscle avec images arrive sur le 2ᵉ appareil (CDP_PORT=9336, CDP_FILTRE=5300)
import { banc } from './commun-doc.mjs';
const B = await banc();
const { ev, ok, clic, dormir } = B;
await ev(`window.dispatchEvent(new Event('online')),1`); await dormir(5000);
const q = await B.S(`const q=(await S.getAll('questions')).find(q=>q.muscle&&q.recto.includes('images'));if(!q)return null;const ids=[...Object.values(q.muscle.images).map(v=>v.imageId),q.muscle.imageGenerale.imageId];const bl=await Promise.all(ids.map(i=>S.getBlob(i)));return {images:q.muscle.images,gen:q.muscle.imageGenerale,blobs:bl.map(b=>b?b.size:0)}`);
ok(!!q && q.images.origine.masques.length === 2 && q.blobs.every((n) => n > 0), '2ᵉ appareil : carte reçue avec ses 3 images (blobs rapatriés) et ses masques', JSON.stringify(q && { blobs: q.blobs, gen: q.gen }));
// affichage : panneau du cours, vignettes chargées
await clic(await B.pos(`[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Flashcards'))`, false), { att: 1500 });
await dormir(1500);
const vues = await ev(`[...document.querySelectorAll('.pis .mui-vignette img, [class*=pis] .mui-vignette img')].map(i=>i.naturalWidth)`);
ok(vues.length === 3 && vues.every((w) => w > 0), '2ᵉ appareil : image générale + 2 vignettes affichées dans le panneau', JSON.stringify(vues));
await B.capture('muscle-appareil2');
ok(!B.erreurs.length, 'aucune exception JS', B.erreurs.join(' | '));
B.c.fermer();
