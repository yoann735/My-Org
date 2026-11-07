/* ============================================================
   My Org — client GitHub minimal pour la copie quotidienne de MedRevise (serveur seulement).
   Préfixe « _ » : Vercel ne le déploie pas comme une route.
   Le jeton (GITHUB_BACKUP_TOKEN) n'est JAMAIS journalisé ni renvoyé au client.

   Écrire un commit par l'API « Git Data » :
     ref heads/<branche> → commit → arbre (récursif) ; empreinte git de chaque fichier calculée
     LOCALEMENT (sha1 de « blob <taille>\0<contenu> ») : un fichier identique n'est pas renvoyé ;
     si AUCUN fichier ne change → pas de commit (idempotent) ; sinon blobs, arbre, commit, ref.
   Dépôt vide (jamais initialisé) : premier commit créé par l'API « contents » (README).
   ============================================================ */
import { createHash } from 'node:crypto';

const API = process.env.GITHUB_API_URL || 'https://api.github.com';

export const empreinteGit = (contenu) => {
  const b = Buffer.from(contenu, 'utf8');
  return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex');
};

export function clientGithub({ token, depot, branche = 'main', fetchFn = fetch }) {
  if (!token || !depot) throw Object.assign(new Error('Copie serveur non configurée (GITHUB_BACKUP_TOKEN / GITHUB_BACKUP_REPO).'), { code: 'non_configure' });
  const appel = async (methode, chemin, corps) => {
    const r = await fetchFn(`${API}/repos/${depot}${chemin}`, {
      method: methode,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'medrevise-backup', ...(corps ? { 'Content-Type': 'application/json' } : {}) },
      body: corps ? JSON.stringify(corps) : undefined,
      signal: AbortSignal.timeout(60000),
    });
    const texte = await r.text();
    let json = null; try { json = texte ? JSON.parse(texte) : null; } catch { /* non JSON */ }
    if (!r.ok) { const e = new Error(`GitHub ${methode} ${chemin.split('?')[0]} : HTTP ${r.status}${json && json.message ? ' — ' + json.message : ''}`); e.status = r.status; throw e; }
    return json;
  };

  async function tete() {
    try { const ref = await appel('GET', `/git/ref/heads/${branche}`); return ref.object.sha; } catch (e) {
      if (e.status === 404 || e.status === 409) return null; // branche absente / dépôt vide
      throw e;
    }
  }

  /** écrit `fichiers` [{ chemin, contenu }] ; `supprimer(chemin)` → vrai pour les fichiers obsolètes à retirer */
  async function commit({ fichiers, message, supprimer = () => false }) {
    let parent = await tete();
    if (!parent) {
      await appel('PUT', '/contents/README.md', { message: 'init : dépôt des copies MedRevise', content: Buffer.from('# Copies quotidiennes de MedRevise\n\nDépôt privé alimenté par /api/backup-daily. Ne pas modifier à la main.\n').toString('base64'), branch: branche });
      parent = await tete();
    }
    const c = await appel('GET', `/git/commits/${parent}`);
    const arbre = await appel('GET', `/git/trees/${c.tree.sha}?recursive=1`);
    const existants = new Map((arbre.tree || []).filter((t) => t.type === 'blob').map((t) => [t.path, t.sha]));
    const entrees = [];
    for (const f of fichiers) {
      if (existants.get(f.chemin) === empreinteGit(f.contenu)) continue; // inchangé
      const blob = await appel('POST', '/git/blobs', { content: Buffer.from(f.contenu, 'utf8').toString('base64'), encoding: 'base64' });
      entrees.push({ path: f.chemin, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const gardes = new Set(fichiers.map((f) => f.chemin));
    for (const chemin of existants.keys()) if (!gardes.has(chemin) && supprimer(chemin)) entrees.push({ path: chemin, mode: '100644', type: 'blob', sha: null });
    if (!entrees.length) return { cree: false, sha: parent, raison: 'aucun changement' };
    const nouvelArbre = await appel('POST', '/git/trees', { base_tree: c.tree.sha, tree: entrees });
    const nouveau = await appel('POST', '/git/commits', { message, tree: nouvelArbre.sha, parents: [parent] });
    await appel('PATCH', `/git/refs/heads/${branche}`, { sha: nouveau.sha });
    return { cree: true, sha: nouveau.sha, fichiersModifies: entrees.length };
  }

  /** (07/11) PREUVE D'ÉCRITURE : relit l'arbre du commit `sha` et vérifie que CHAQUE fichier y est, avec exactement
   *  le contenu voulu (empreinte git). Lève une erreur sinon — une copie n'est « réussie » qu'à cette condition. */
  async function verifier(sha, fichiers) {
    const c = await appel('GET', `/git/commits/${sha}`);
    const arbre = await appel('GET', `/git/trees/${c.tree.sha}?recursive=1`);
    const presents = new Map((arbre.tree || []).filter((t) => t.type === 'blob').map((t) => [t.path, t.sha]));
    const manquants = fichiers.filter((f) => presents.get(f.chemin) !== empreinteGit(f.contenu)).map((f) => f.chemin);
    if (manquants.length) throw new Error('écriture incomplète sur GitHub : ' + manquants.join(', '));
    return true;
  }

  /* (07/11) VERROU DU RATTRAPAGE : une étiquette git par créneau de 30 min. Créer une référence est ATOMIQUE côté
     GitHub (422 si elle existe déjà) : deux ouvertures simultanées de l'app ne lancent donc qu'une seule copie. */
  async function etiquettes(prefixe) {
    const liste = await appel('GET', `/git/matching-refs/tags/${prefixe}`);
    return (liste || []).map((r) => String(r.ref || '').replace(/^refs\/tags\//, ''));
  }
  const creerEtiquette = (nom, sha) => appel('POST', '/git/refs', { ref: `refs/tags/${nom}`, sha });
  const supprimerEtiquette = (nom) => appel('DELETE', `/git/refs/tags/${nom}`);

  /** manifest.json d'une révision (null si absent) */
  async function manifeste(ref) {
    try {
      const m = await appel('GET', `/contents/manifest.json?ref=${ref}`);
      return JSON.parse(Buffer.from(m.content, 'base64').toString('utf8'));
    } catch { return null; }
  }

  /** dernier commit de la branche + manifest.json à cette révision */
  async function dernier() {
    const sha = await tete();
    if (!sha) return null;
    const c = await appel('GET', `/commits/${sha}`);
    return { sha, date: c.commit.committer.date, message: c.commit.message, manifeste: await manifeste(sha) }; // manifeste null : dépôt tout juste initialisé
  }

  /** (31/10) LECTURE SEULE : les `n` derniers commits de la branche [{ sha, date, message, arbre }] */
  async function historique(n = 14) {
    const liste = await appel('GET', `/commits?sha=${encodeURIComponent(branche)}&per_page=${Math.min(100, n)}`);
    return (liste || []).map((c) => ({ sha: c.sha, date: c.commit.committer.date, message: c.commit.message, arbre: c.commit.tree.sha }));
  }
  /** (31/10) LECTURE SEULE : fichiers d'un arbre dont le chemin passe `filtre` [{ chemin, sha }] */
  async function fichiers(arbreSha, filtre = () => true) {
    const a = await appel('GET', `/git/trees/${arbreSha}?recursive=1`);
    return (a.tree || []).filter((t) => t.type === 'blob' && filtre(t.path)).map((t) => ({ chemin: t.path, sha: t.sha }));
  }
  /** (31/10) LECTURE SEULE : contenu texte d'un blob (jusqu'à 100 Mo, API « git blobs ») */
  async function blob(sha) {
    const b = await appel('GET', `/git/blobs/${sha}`);
    return Buffer.from(b.content || '', b.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8');
  }

  return { commit, verifier, dernier, tete, historique, fichiers, blob, etiquettes, creerEtiquette, supprimerEtiquette };
}
