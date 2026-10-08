/* ============================================================
   MedRevise — TRANSCRIPTION EN DIRECT : texte brut / Markdown d'une session.
   Lignes horodatées « [mm:ss] » depuis le début du cours enregistré ; les notes
   personnelles s'intercalent à leur instant, préfixées « NOTE — ».
   ============================================================ */

export function mmss(s) {
  const t = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

/** Durée en clair : « 42 min », « 1 h 05 », « 35 s ». */
export function dureeLisible(s) {
  const t = Math.max(0, Math.round(s || 0));
  if (t < 60) return `${t} s`;
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

/** Segments et notes, triés par instant (une note se place après le segment commencé avant elle). */
export function lignesSession(session, interim = null) {
  const segs = (session && session.segments) || [];
  const notes = ((session && session.notes) || []).map((n) => ({ ...n, note: true, t0: n.t }));
  const out = [];
  let j = 0;
  const notesTriees = [...notes].sort((a, b) => a.t0 - b.t0);
  for (const s of segs) {
    while (j < notesTriees.length && notesTriees[j].t0 < s.t0) out.push(notesTriees[j++]);
    out.push(s);
  }
  if (interim) {
    while (j < notesTriees.length && notesTriees[j].t0 < interim.t0) out.push(notesTriees[j++]);
    out.push({ ...interim, status: 'interim' });
  }
  while (j < notesTriees.length) out.push(notesTriees[j++]);
  return out;
}

/* INTERVENANTS (diarisation, 08/10) : `speaker` (0, 1, 2…) sur chaque segment d'une session
   `diarize` ; noms donnés par l'étudiant dans `session.intervenants` ({ 0: 'Prof' }). */
export const avecIntervenants = (session) => !!(session && session.diarize && (session.segments || []).some((s) => s.speaker != null));
export const nomIntervenant = (session, n) => ((session && session.intervenants && String(session.intervenants[n] || '').trim()) || `Intervenant ${Number(n) + 1}`);
export function intervenantsDe(session) {
  const n = new Map();
  for (const s of (session && session.segments) || []) if (s.speaker != null && s.status !== 'gap') n.set(s.speaker, (n.get(s.speaker) || 0) + 1);
  return [...n.entries()].sort((a, b) => a[0] - b[0]).map(([speaker, lignes]) => ({ speaker, lignes }));
}
/** lignes gardées par un filtre d'intervenants (Set) ; notes et coupures restent */
export const passeFiltre = (l, filtre) => !filtre || l.note || l.status === 'gap' || l.speaker == null || filtre.has(l.speaker);

export function texteSession(session, { horodatage = true, filtre = null } = {}) {
  const noms = avecIntervenants(session);
  return lignesSession(session).filter((l) => (l.status !== 'gap' || l.perte) && passeFiltre(l, filtre)).map((l) => {
    const h = horodatage ? `[${mmss(l.t0)}] ` : '';
    if (l.note) return `${h}NOTE — ${l.text || ''}`.trimEnd();
    if (l.status === 'gap') return `${h}[${l.text}]`;
    const qui = noms && l.speaker != null ? `${nomIntervenant(session, l.speaker)} : ` : '';
    return `${h}${qui}${l.status === 'uncertain' ? '(incertain) ' : ''}${l.text}`;
  }).join('\n');
}

export function markdownSession(session, titre, { filtre = null } = {}) {
  const noms = avecIntervenants(session);
  const d = session.startedAt ? new Date(session.startedAt) : new Date();
  const tete = `# ${titre || 'Transcript'}\n\n_${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · ${dureeLisible(session.durationS)}_\n\n`;
  const corps = lignesSession(session).filter((l) => (l.status !== 'gap' || l.perte) && passeFiltre(l, filtre)).map((l) => {
    if (l.note) return `> **Note ${mmss(l.t0)}** — ${l.text || ''}`;
    if (l.status === 'gap') return `_[${mmss(l.t0)}] ${l.text}_`;
    const qui = noms && l.speaker != null ? `**${nomIntervenant(session, l.speaker)}** : ` : '';
    return `**${mmss(l.t0)}** ${qui}${l.status === 'uncertain' ? '_(incertain)_ ' : ''}${l.text}`;
  }).join('\n\n');
  return tete + corps + '\n';
}

export function telecharger(nom, contenu, type) {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = nom;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function nomFichier(titre, session, ext) {
  const d = (session.startedAt || new Date().toISOString()).slice(0, 10);
  const base = String(titre || 'transcript').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'transcript';
  return `${base}-${d}.${ext}`;
}

export async function copierTexte(texte) {
  try { await navigator.clipboard.writeText(texte); return true; } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = texte; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    return ok;
  }
}
