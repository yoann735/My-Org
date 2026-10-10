/* ============================================================
   MedRevise — LECTURE SEULE de tout le cloud MedRevise (filet de sécurité, 11/10/2026).
   Utilisée par la copie quotidienne (serveur, api/_lib/sauvegarde.js) et par la copie dans le
   dossier local (client, sauvegarde/dossierLocal.js). Uniquement des GET PostgREST et l'appel de
   LISTE du Storage (POST /object/list, qui ne lit que des métadonnées) — aucune écriture.
   - medrevise_records : pagination complète, ordre stable (store, record_id), tombstones compris ;
   - medrevise_review_log : idem (table absente tant que le SQL n'est pas appliqué → { absente: true }) ;
   - bucket medrevise-blobs : nom, taille, empreinte (eTag), type, date — SANS télécharger les fichiers.
   ============================================================ */
const PAGE = 1000;
const MAX_PAGES = 500;
const BUCKET = 'medrevise-blobs';

const estAbsente = (status, texte) => status === 404 || /PGRST205|42P01|does not exist|schema cache/i.test(texte || '');

/** GET paginé d'une table ; `ordre` = colonnes PostgREST */
async function lireTable({ url, cle, fetchFn }, table, ordre) {
  const H = { apikey: cle, Authorization: 'Bearer ' + cle };
  const tout = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const r = await fetchFn(`${url}/rest/v1/${table}?select=*&order=${ordre}&offset=${p * PAGE}&limit=${PAGE}`, { headers: H });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (estAbsente(r.status, t)) return { lignes: [], absente: true };
      throw new Error(`lecture ${table} : HTTP ${r.status}`);
    }
    const lot = await r.json();
    tout.push(...lot);
    if (lot.length < PAGE) return { lignes: tout, absente: false };
  }
  throw new Error(`lecture ${table} : trop de pages`);
}

/** liste récursive du bucket (métadonnées seulement) */
async function listerBucket({ url, cle, fetchFn }) {
  const H = { apikey: cle, Authorization: 'Bearer ' + cle, 'Content-Type': 'application/json' };
  const out = [];
  const lister = async (prefixe) => {
    for (let off = 0; ; off += PAGE) {
      const r = await fetchFn(`${url}/storage/v1/object/list/${BUCKET}`, { method: 'POST', headers: H, body: JSON.stringify({ prefix: prefixe, limit: PAGE, offset: off, sortBy: { column: 'name', order: 'asc' } }) });
      if (!r.ok) throw new Error(`liste du bucket : HTTP ${r.status}`);
      const lot = await r.json();
      for (const o of lot || []) {
        const nom = prefixe ? `${prefixe}/${o.name}` : o.name;
        if (o.id == null && !o.metadata) { await lister(nom); continue; } // dossier
        const m = o.metadata || {};
        out.push({ nom, taille: m.size ?? m.contentLength ?? null, empreinte: m.eTag ? String(m.eTag).replace(/"/g, '') : null, type: m.mimetype || null, maj: o.updated_at || m.lastModified || null });
      }
      if (!lot || lot.length < PAGE) return;
    }
  };
  await lister('');
  return out;
}

/** tout le cloud MedRevise, en lecture seule */
export async function lireCloud({ url, cle, fetchFn = fetch }) {
  if (!url || !cle) throw new Error('Supabase non configuré (URL ou clé absente)');
  const ctx = { url: url.replace(/\/+$/, ''), cle, fetchFn };
  const rec = await lireTable(ctx, 'medrevise_records', 'store.asc,record_id.asc');
  const jr = await lireTable(ctx, 'medrevise_review_log', 'id.asc');
  const fichiers = await listerBucket(ctx);
  return { records: rec.lignes, journal: jr.lignes, journalAbsent: jr.absente, fichiersBucket: fichiers };
}
