/* ============================================================
   MedRevise — LECTURE d'un .zip (17/10, import de flashcards : un JSON + ses images jointes).
   Lecteur minimal, sans dépendance : répertoire central, entrées « stockées » (0) ou « deflate » (8),
   décompressées par DecompressionStream('deflate-raw') du navigateur. Pas de zip64, pas de
   chiffrement (refusés avec un message clair). Pendant de lib/zipSimple.js (qui, lui, écrit).
   ============================================================ */
const u16 = (v, o) => v.getUint16(o, true);
const u32 = (v, o) => v.getUint32(o, true);

/** @returns {Promise<Map<string, Blob>>} nom (chemin dans le zip) → contenu ; les dossiers sont ignorés */
export async function lireZip(blob) {
  const buf = await blob.arrayBuffer();
  const v = new DataView(buf);
  // fin du répertoire central : signature 0x06054b50, cherchée depuis la fin (commentaire ≤ 64 Ko)
  let fin = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 22 - 65535); i--) if (u32(v, i) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error('Fichier .zip illisible (répertoire central introuvable).');
  const n = u16(v, fin + 10);
  let p = u32(v, fin + 16);
  const dec = new TextDecoder();
  const out = new Map();
  for (let k = 0; k < n; k++) {
    if (u32(v, p) !== 0x02014b50) throw new Error('Fichier .zip abîmé (entrée du répertoire central).');
    const drapeaux = u16(v, p + 8), methode = u16(v, p + 10);
    const taille = u32(v, p + 20), lNom = u16(v, p + 28), lExtra = u16(v, p + 30), lCom = u16(v, p + 32);
    const local = u32(v, p + 42);
    const nom = dec.decode(new Uint8Array(buf, p + 46, lNom));
    p += 46 + lNom + lExtra + lCom;
    if (nom.endsWith('/')) continue;
    if (drapeaux & 1) throw new Error(`« ${nom} » est chiffré dans le .zip : non pris en charge.`);
    const debut = local + 30 + u16(v, local + 26) + u16(v, local + 28);
    const brut = new Uint8Array(buf, debut, taille);
    let donnees;
    if (methode === 0) donnees = new Blob([brut]);
    else if (methode === 8) donnees = await new Response(new Blob([brut]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    else throw new Error(`« ${nom} » : compression ${methode} non prise en charge.`);
    out.set(nom, donnees);
  }
  return out;
}

/** type MIME d'une image d'après son nom */
export function typeImage(nom) {
  const ext = String(nom).toLowerCase().split('.').pop();
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif' }[ext] || null;
}
