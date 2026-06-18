/* ============================================================
   Screen — Bibliothèque (40 recettes filtrables)
   Filters: protéine, temps, complexité, coût, four, pizza + search.
   Favorites & banned recipes persisted via ctx.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { ProteinBadge, ComplexityPill, Meta } from '../components/primitives.jsx';
import { TopActions } from './_shared.jsx';
import { RECIPES, PROT, proteinClass, recipeProtein } from '../data/dataLayer.js';

const TIMES = { 20: '≤20 min', 25: '≤25 min', 30: '≤30 min' };
const COSTS = ['Économique', 'Moyen', 'Moyen-élevé'];

export function Library({ ctx }) {
  const [view, setView] = useState('grid');
  const [search, setSearch] = useState('');
  const [fProt, setFProt] = useState([]);
  const [fTime, setFTime] = useState(null);
  const [fCplx, setFCplx] = useState([]);
  const [fCost, setFCost] = useState([]);
  const [fOven, setFOven] = useState(false);
  const [fPizza, setFPizza] = useState(false);
  const [showBanned, setShowBanned] = useState(true);

  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const filtered = RECIPES.filter((r) => {
    const q = search.trim().toLowerCase();
    if (q && !((r.nom || '').toLowerCase().includes(q) || (r.tagline || '').toLowerCase().includes(q))) return false;
    if (fProt.length && !fProt.includes(proteinClass(r.proteine))) return false;
    if (fTime && r.temps_min > fTime) return false;
    if (fCplx.length && !fCplx.includes(r.complexite)) return false;
    if (fCost.length && !fCost.includes(r.cout)) return false;
    if (fOven && !r.four) return false;
    if (fPizza && !r.pizza) return false;
    if (!showBanned && ctx.banned[r.id]) return false;
    return true;
  });

  const chips = [];
  fProt.forEach((p) => chips.push({ label: PROT[p].label, clear: () => toggle(fProt, setFProt, p) }));
  if (fTime) chips.push({ label: TIMES[fTime], clear: () => setFTime(null) });
  fCplx.forEach((c) => chips.push({ label: c, clear: () => toggle(fCplx, setFCplx, c) }));
  fCost.forEach((c) => chips.push({ label: c, clear: () => toggle(fCost, setFCost, c) }));
  if (fOven) chips.push({ label: 'Four', clear: () => setFOven(false) });
  if (fPizza) chips.push({ label: 'Pizza WE', clear: () => setFPizza(false) });

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
          <span className="kpi-label" style={{ marginRight: 4 }}>Protéine</span>
          {Object.entries(PROT).map(([k, p]) => (
            <button key={k} type="button" className={'fpill' + (fProt.includes(k) ? ' on' : '')} onClick={() => toggle(fProt, setFProt, k)}>
              <span className={'dot ' + p.cls} style={fProt.includes(k) ? { background: '#fff' } : null} /> {p.label}
            </button>
          ))}
          <span style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />
          {Object.entries(TIMES).map(([v, l]) => (
            <button key={v} type="button" className={'fpill' + (fTime === +v ? ' on' : '')} onClick={() => setFTime(fTime === +v ? null : +v)}>{l}</button>
          ))}
        </div>
        <div className="frow">
          <span className="kpi-label" style={{ marginRight: 4 }}>Complexité</span>
          {['Facile', 'Intermédiaire', 'Difficile'].map((c) => (
            <button key={c} type="button" className={'fpill' + (fCplx.includes(c) ? ' on' : '')} onClick={() => toggle(fCplx, setFCplx, c)}>{c}</button>
          ))}
          <span style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />
          {COSTS.map((c) => (
            <button key={c} type="button" className={'fpill' + (fCost.includes(c) ? ' on' : '')} onClick={() => toggle(fCost, setFCost, c)}>{c}</button>
          ))}
          <span style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />
          <button type="button" className={'fpill' + (fOven ? ' on amber' : '')} onClick={() => setFOven(!fOven)}><Icon name="fire" size={13} fill={fOven} /> Four</button>
          <button type="button" className={'fpill' + (fPizza ? ' on amber' : '')} onClick={() => setFPizza(!fPizza)}><Icon name="pizza" size={13} /> Pizza WE</button>
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
  const p = recipeProtein(r);
  return (
    <div className="card" onClick={onOpen}
      style={{ padding: 18, cursor: isBanned ? 'default' : 'pointer', opacity: isBanned ? 0.55 : 1, position: 'relative', display: 'flex', flexDirection: 'column', gap: 11 }}>
      <span style={{ position: 'absolute', left: 0, top: 14, bottom: 14, width: 3, borderRadius: 3, background: `var(--p-${p.cls})` }} />
      <div className="row spread" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, paddingLeft: 6 }}>
          <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-.01em', lineHeight: 1.2 }}>{r.nom}</div>
          {r.tagline && r.tagline !== r.nom && <div className="ital muted" style={{ fontSize: 13, marginTop: 3 }}>{r.tagline}</div>}
        </div>
        <button type="button" onClick={(e) => { e.stopPropagation(); onFav(); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: isFav ? 'var(--accent-2)' : 'var(--text-3)', padding: 2, flex: '0 0 auto' }}>
          <Icon name="star" size={18} fill={isFav} />
        </button>
      </div>
      <div className="row wrap" style={{ gap: 7, paddingLeft: 6 }}>
        <ProteinBadge recipe={r} />
        <ComplexityPill level={r.complexite} />
        {r.four && <span className="pill amber" style={{ height: 24, fontSize: 11 }}><Icon name="fire" size={12} fill /> Four</span>}
        {r.pizza && <span className="pill amber" style={{ height: 24, fontSize: 11 }}><Icon name="pizza" size={12} /> Pizza</span>}
      </div>
      <div className="row wrap" style={{ gap: 14, paddingLeft: 6, paddingTop: 2 }}>
        <Meta icon="clock">{r.temps_min} min</Meta>
        <Meta icon="flame">{r.nutrition_1portion?.kcal} kcal</Meta>
        <Meta icon="euro">{r.cout}</Meta>
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
  const p = recipeProtein(r);
  return (
    <div className="card" onClick={onOpen} style={{ padding: '12px 16px', cursor: isBanned ? 'default' : 'pointer', opacity: isBanned ? 0.55 : 1, display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ width: 4, height: 34, borderRadius: 3, background: `var(--p-${p.cls})`, flex: '0 0 auto' }} />
      <button type="button" onClick={(e) => { e.stopPropagation(); onFav(); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: isFav ? 'var(--accent-2)' : 'var(--text-3)', padding: 0, flex: '0 0 auto' }}>
        <Icon name="star" size={17} fill={isFav} />
      </button>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14.5 }}>{r.nom} {isBanned && <span className="pill crit" style={{ height: 19, fontSize: 9.5, marginLeft: 6 }}>Bannie</span>}</div>
        {r.tagline && r.tagline !== r.nom && <div className="ital muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.tagline}</div>}
      </div>
      <ProteinBadge recipe={r} />
      <ComplexityPill level={r.complexite} />
      <Meta icon="clock">{r.temps_min}min</Meta>
      <Meta icon="euro">{r.cout}</Meta>
      {isBanned
        ? <button type="button" className="btn" style={{ padding: '5px 11px', fontSize: 12 }} onClick={(e) => { e.stopPropagation(); onBan(); }}><Icon name="refresh" size={13} /> Réactiver</button>
        : <button type="button" className="icon-btn sm" style={{ color: 'var(--crit)' }} onClick={(e) => { e.stopPropagation(); onBan(); }} title="Bannir"><Icon name="ban" size={15} /></button>}
    </div>
  );
}
