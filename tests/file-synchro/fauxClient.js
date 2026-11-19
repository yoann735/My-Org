// (19/11) Faux client supabase-js EN MÉMOIRE pour les tests de la file de synchro (docs/compte-rendu-74-en-attente.md).
// Reproduit ce dont la synchro a besoin, avec les comportements du VRAI serveur :
// - table medrevise_review_log : insert « on conflict (id) do nothing » (ignoreDuplicates), contrainte
//   rating NOT NULL / 1..4 tant que la migration 20261024 n'est pas appliquée (code 23514) ;
// - table medrevise_records + RPC medrevise_push (écriture conditionnelle sur updated_at) ;
// - pannes injectables : réseau (TypeError, requête jamais arrivée), « tuée après l'écriture » (le serveur a écrit
//   mais la réponse n'arrive jamais), refus de droits (RLS 42501), doublon de clé (23505) sans ignoreDuplicates.
export function creerFauxServeur({ contrainteRating = true } = {}) {
  const journal = new Map(); // id → ligne
  const records = new Map(); // store:id → ligne
  let seq = 0;
  const pannes = { reseau: false, tueeApresEcriture: 0, rls: false, doublonSansIgnore: false };
  const appels = { upsertJournal: 0, lignesInserees: 0, rpc: 0, lectures: 0 };

  const reseau = () => { const e = new TypeError('Failed to fetch'); return e; };
  function requete(table) {
    const f = { filtres: [], order: [], range: null, head: false, count: null, cols: '*' };
    const exec = async () => {
      appels.lectures++;
      if (pannes.reseau) return { data: null, error: { message: 'TypeError: Failed to fetch' } };
      let liste = table === 'medrevise_review_log' ? [...journal.values()] : [...records.values()];
      for (const [type, k, v] of f.filtres) {
        if (type === 'eq') liste = liste.filter((r) => String(r[k]) === String(v));
        if (type === 'in') liste = liste.filter((r) => v.map(String).includes(String(r[k])));
        if (type === 'gt') liste = liste.filter((r) => String(r[k]) > String(v));
      }
      for (const [k, asc] of [...f.order].reverse()) liste.sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : String(a[k]) > String(b[k]) ? 1 : 0) * (asc ? 1 : -1));
      const total = liste.length;
      if (f.range) liste = liste.slice(f.range[0], f.range[1] + 1);
      if (f.limite != null) liste = liste.slice(0, f.limite);
      const cols = f.cols.split(',');
      const data = liste.map((r) => (cols.includes('*') ? { ...r } : Object.fromEntries(cols.map((c) => [c, r[c]]))));
      return f.head ? { data: null, count: total, error: null } : { data, count: f.count ? total : null, error: null };
    };
    const q = {
      select(cols = '*', o = {}) { f.cols = cols; f.head = !!o.head; f.count = o.count || null; return q; },
      eq(k, v) { f.filtres.push(['eq', k, v]); return q; },
      in(k, v) { f.filtres.push(['in', k, v]); return q; },
      gt(k, v) { f.filtres.push(['gt', k, v]); return q; },
      order(k, o = {}) { f.order.push([k, o.ascending !== false]); return q; },
      range(a, b) { f.range = [a, b]; return q; },
      limit(n) { f.limite = n; return q; },
      then(res, rej) { return exec().then(res, rej); },
      async upsert(lignes, o = {}) {
        if (table !== 'medrevise_review_log') throw new Error('upsert non simulé sur ' + table);
        appels.upsertJournal++;
        if (pannes.reseau) return { error: { message: 'TypeError: Failed to fetch' } };
        if (pannes.rls) return { error: { code: '42501', message: 'new row violates row-level security policy for table "medrevise_review_log"' } };
        const tab = [].concat(lignes);
        if (contrainteRating && tab.some((l) => !(l.rating >= 1 && l.rating <= 4))) return { error: { code: '23514', message: 'new row for relation "medrevise_review_log" violates check constraint "medrevise_review_log_rating_check"' } };
        const ignorer = !!o.ignoreDuplicates && !pannes.doublonSansIgnore;
        if (!ignorer && tab.some((l) => journal.has(l.id))) return { error: { code: '23505', message: 'duplicate key value violates unique constraint "medrevise_review_log_pkey"' } };
        for (const l of tab) if (!journal.has(l.id)) { journal.set(l.id, { ...l, inserted_at: new Date(Date.UTC(2026, 10, 19, 12) + seq++).toISOString() }); appels.lignesInserees++; }
        if (pannes.tueeApresEcriture > 0) { pannes.tueeApresEcriture--; throw reseau(); } // écrit, mais l'app ne reçoit jamais la réponse
        return { error: null };
      },
    };
    return q;
  }
  const client = {
    from: (table) => requete(table),
    async rpc(nom, { records: lot }) {
      appels.rpc++;
      if (pannes.reseau) return { error: { message: 'TypeError: Failed to fetch' } };
      let n = 0;
      for (const r of lot) {
        const k = r.store + ':' + r.record_id, cur = records.get(k);
        if (!cur || Date.parse(r.updated_at) > Date.parse(cur.updated_at)) { records.set(k, { store: r.store, record_id: r.record_id, data: r.data, updated_at: r.updated_at, deleted: !!r.deleted }); n++; }
      }
      if (pannes.tueeApresEcriture > 0) { pannes.tueeApresEcriture--; throw reseau(); }
      return { data: n, error: null };
    },
  };
  return { client, journal, records, pannes, appels, appliquerMigration: () => { contrainteRating = false; } };
}
