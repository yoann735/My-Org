/* ============================================================
   MedRevise — ARCHIVE .ZIP MINIMALE (10/10 soir, export spécial IA).

   Fichiers « stockés » (sans compression : PNG et PDF sont déjà compressés), noms en
   UTF-8. Aucune dépendance : en-têtes locaux + répertoire central + fin de répertoire
   (APPNOTE 4.3), CRC-32 standard. Assez pour quelques dizaines de fichiers.
   ============================================================ */
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(octets) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < octets.length; i++) c = TABLE[(c ^ octets[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** @param {{ nom: string, donnees: Uint8Array | string }[]} fichiers @returns {Blob} application/zip */
export function creerZip(fichiers) {
  const enc = new TextEncoder();
  const morceaux = [], central = [];
  let decalage = 0;
  const d = new Date();
  const heure = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of fichiers) {
    const nom = enc.encode(f.nom);
    const data = typeof f.donnees === 'string' ? enc.encode(f.donnees) : f.donnees;
    const crc = crc32(data);
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); loc.setUint16(8, 0, true);
    loc.setUint16(10, heure, true); loc.setUint16(12, date, true); loc.setUint32(14, crc, true);
    loc.setUint32(18, data.length, true); loc.setUint32(22, data.length, true); loc.setUint16(26, nom.length, true); loc.setUint16(28, 0, true);
    morceaux.push(new Uint8Array(loc.buffer), nom, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
    cen.setUint16(12, heure, true); cen.setUint16(14, date, true); cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true); cen.setUint16(28, nom.length, true);
    cen.setUint32(42, decalage, true);
    central.push(new Uint8Array(cen.buffer), nom);
    decalage += 30 + nom.length + data.length;
  }
  const tailleCentral = central.reduce((n, x) => n + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, fichiers.length, true); fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentral, true); fin.setUint32(16, decalage, true);
  return new Blob([...morceaux, ...central, new Uint8Array(fin.buffer)], { type: 'application/zip' });
}
