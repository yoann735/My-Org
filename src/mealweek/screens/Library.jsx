/* ============================================================
   Screen — Bibliothèque de recettes
   Les 22 recettes du fichier V2, filtrables et cherchables. Ouvrir
   une recette affiche son détail en overlay (ingrédients livrés,
   étapes numérotées, nutrition par portion, temps, ustensiles).

   Les filtres portent uniquement sur des champs réellement présents
   dans les données V2 (nom, temps de préparation). Les anciens filtres
   protéine / complexité / coût / four / pizza n'ont plus de données
   correspondantes et ont donc été retirés.

   Favoris et recettes bannies restent persistés via ctx.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Meta } from '../components/primitives.jsx';
import { TopActions, ExportCsvButton, ExportIngredientsCsvButton } from './_shared.jsx';
import { RECIPES, recipeTint, tempsMinutes } from '../data/dataLayer.js';

const TIMES = { 20: '≤20 min', 25: '≤25 min', 30: '≤30 min' };

export function Library({ ctx }) {
  const [view, setView] = useState('grid');
  const [search, setSearch] = useState('');
  const [fTime, setFTime] = useState(null);
  const [fFav, setFFav] = useState(false);
  const [showBanned, setShowBanned] = useState(true);

  const filtered = RECIPES.filter((r) => {
    const q = search.trim().toLowerCase();
    if (q && !(r.nom || '').toLowerCase().includes(q)
        && !(r.ingredients_livres || []).some((i) => (i.nom || '').toLowerCase().includes(q))) return false;
    const t = tempsMinutes(r);
    if (fTime && (t == null || t > fTime)) return false;
    if (fFav && !ctx.favorites[r.id]) return false;
    if (!showBanned && ctx.banned[r.id]) return false;
    return true;
  });

  const chips = [];
  if (fTime) chips.push({ label: TIMES[fTime], clear: () => setFTime(null) });
  if (fFav) chips.push({ label: 'Favoris', clear: () => setFFav(false) });
  if (!showBanned) chips.push({ label: 'Bannies masquées', clear: () => setShowBanned(true) });

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div>
          <h1 className="serif">Recettes</h1>
          <div className="sub"><strong className="tnum" style={{ color: 'var(--text)' }}>{filtered.length}</strong> / {RECIPES.length} recettes dans votre bibliothèque</div>
        </div>
        <div className="topbar-actions">
          <div className="search" style={{ width: 240 }}>
            <Icon name="search" size={17} className="ic" />
            <input placeholder="Rechercher une recette…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="tabs desktop-only" style={{ padding: 3 }}>
            <button type="button" className={'tab' + (view === 'grid' ? ' active' : '')} style={{ padding: 8 }} onClick={() => setView('grid')}><Icon name="grid" size={16} /></button>
            <button type="button" className={'tab' + (view === 'list' ? ' active' : '')} style={{ padding: 8 }} onClick={() => setView('list')}><Icon name="list" size={16} /></button>
          </div>
          <TopActions ctx={ctx} />
        </div>
      </div>

      {/* filter bar */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="frow">
          <span className="kpi-label" style={{ marginRight: 4 }}>Temps</span>
          {Object.entries(TIMES).map(([v, l]) => (
            <button key={v} type="button" className={'fpill' + (fTime === +v ? ' on' : '')} onClick={() => setFTime(fTime === +v ? null : +v)}>{l}</button>
          ))}
          <span style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />
          <button type="button" className={'fpill' + (fFav ? ' on amber' : '')} onClick={() => setFFav(!fFav)}>
            <Icon name="star" size={13} fill={fFav} /> Favoris
          </button>
          <button type="button" className={'fpill' + (!showBanned ? ' on' : '')} onClick={() => setShowBanned(!showBanned)}>
            <Icon name="ban" size={13} /> Masquer les bannies
          </button>
        </div>
        {/* exports : portent sur TOUTE la base, pas sur le résultat filtré
            ci-dessus — d'où les libellés explicites. `frow` enveloppe déjà sur
            petit écran : les deux boutons passent l'un sous l'autre au doigt
            plutôt que de déborder. */}
        <div className="frow" style={{ paddingTop: 4, borderTop: '1px solid var(--border-2)' }}>
          <ExportCsvButton />
          <ExportIngredientsCsvButton />
        </div>
        {chips.length > 0 && (
          <div className="frow" style={{ paddingTop: 4, borderTop: '1px solid var(--border-2)' }}>
            <span className="hint" style={{ marginRight: 2 }}>Filtres actifs :</span>
            {chips.map((c, i) => (
              <span className="chip" key={i}>{c.label}<button type="button" onClick={c.clear}><Icon name="x" size={12} /></button></span>
            ))}
          </div>
        )}
      </div>

      <div className={view === 'grid' ? 'lib-grid' : ''} style={view === 'grid'
        ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 16 }
        : { display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((r) => {
          const isBanned = !!ctx.banned[r.id];
          const isFav = !!ctx.favorites[r.id];
          const props = {
            r, isBanned, isFav,
            onOpen: () => !isBanned && ctx.openRecipe(r.id),
            onBan: () => ctx.toggleBanned(r.id),
            onFav: () => ctx.toggleFavorite(r.id),
          };
          return view === 'list' ? <LibListRow key={r.id} {...props} /> : <RecipeCard key={r.id} {...props} />;
        })}
      </div>
      {filtered.length === 0 && <div className="hint" style={{ textAlign: 'center', padding: 60 }}>Aucune recette ne correspond à vos filtres.</div>}
    </div>
  );
}

function RecipeCard({ r, isBanned, isFav, onOpen, onBan, onFav }) {
  const t = recipeTint(r.id);
  const kcal = Math.round((r.nutrition_1portion || {}).kcal || 0);
  return (
    <div className="card" onClick={onOpen}
      style={{ padding: 18, cursor: isBanned ? 'default' : 'pointer', opacity: isBanned ? 0.55 : 1, position: 'relative', display: 'flex', flexDirection: 'column', gap: 11 }}>
      <span style={{ position: 'absolute', left: 0, top: 14, bottom: 14, width: 3, borderRadius: 3, background: t.solid }} />
      <div className="row spread" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, paddingLeft: 6 }}>
          <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-.01em', lineHeight: 1.2 }}>{r.nom}</div>
        </div>
        <button type="button" onClick={(e) => { e.stopPropagation(); onFav(); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: isFav ? 'var(--accent-2)' : 'var(--text-3)', padding: 2, flex: '0 0 auto' }}>
          <Icon name="star" size={18} fill={isFav} />
        </button>
      </div>
      {r.ustensiles && r.ustensiles.length > 0 && (
        <div className="row wrap" style={{ gap: 7, paddingLeft: 6 }}>
          {r.ustensiles.map((u) => (
            <span className="pill" key={u} style={{ height: 24, fontSize: 11 }}><Icon name="utensil" size={12} /> {u}</span>
          ))}
        </div>
      )}
      <div className="row wrap" style={{ gap: 14, paddingLeft: 6, paddingTop: 2 }}>
        <Meta icon="clock">{r.temps}</Meta>
        <Meta icon="flame">{kcal} kcal</Meta>
        <Meta icon="list">{(r.etapes || []).length} étapes</Meta>
      </div>
      <div style={{ position: 'absolute', bottom: 12, right: 12 }}>
        {isBanned
          ? <button type="button" className="btn" style={{ padding: '5px 11px', fontSize: 12 }} onClick={(e) => { e.stopPropagation(); onBan(); }}><Icon name="refresh" size={13} /> Réactiver</button>
          : <button type="button" className="icon-btn sm" style={{ color: 'var(--crit)' }} title="Bannir" onClick={(e) => { e.stopPropagation(); onBan(); }}><Icon name="ban" size={14} /></button>}
      </div>
      {isBanned && <span className="pill crit" style={{ position: 'absolute', top: 14, right: 14, height: 22, fontSize: 10.5 }}>Bannie</span>}
    </div>
  );
}

function LibListRow({ r, isBanned, isFav, onOpen, onBan, onFav }) {
  const t = recipeTint(r.id);
  const kcal = Math.round((r.nutrition_1portion || {}).kcal || 0);
  return (
    <div className="card" onClick={onOpen} style={{ padding: '12px 16px', cursor: isBanned ? 'default' : 'pointer', opacity: isBanned ? 0.55 : 1, display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ width: 4, height: 34, borderRadius: 3, background: t.solid, flex: '0 0 auto' }} />
      <button type="button" onClick={(e) => { e.stopPropagation(); onFav(); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: isFav ? 'var(--accent-2)' : 'var(--text-3)', padding: 0, flex: '0 0 auto' }}>
        <Icon name="star" size={17} fill={isFav} />
      </button>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14.5 }}>{r.nom} {isBanned && <span className="pill crit" style={{ height: 19, fontSize: 9.5, marginLeft: 6 }}>Bannie</span>}</div>
      </div>
      <Meta icon="clock">{r.temps}</Meta>
      <Meta icon="flame">{kcal} kcal</Meta>
      {isBanned
        ? <button type="button" className="btn" style={{ padding: '5px 11px', fontSize: 12 }} onClick={(e) => { e.stopPropagation(); onBan(); }}><Icon name="refresh" size={13} /> Réactiver</button>
        : <button type="button" className="icon-btn sm" style={{ color: 'var(--crit)' }} onClick={(e) => { e.stopPropagation(); onBan(); }} title="Bannir"><Icon name="ban" size={15} /></button>}
    </div>
  );
}
