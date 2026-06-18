/* ============================================================
   Screen — Liste de courses
   Fresh ingredients aggregated by Chronodrive category, with the
   Chronodrive name + link (not the raw HelloFresh name), price,
   substitute, and a "j'ai déjà" toggle (persisted). Personal items
   pre-filled (skyr ×2 + bananes). Live total vs 60€, weekend lever.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Check, WeekNav, Stepper } from '../components/primitives.jsx';
import { TopActions, WeekendToggle, ResetSlotsButton } from './_shared.jsx';
import {
  weekShopping, groupShoppingByCategory, weekBudget, chronodriveLink, money,
} from '../data/dataLayer.js';

export function Shopping({ ctx }) {
  const { weekKey, slotsOff, weeklyBudget } = ctx;
  const rows = weekShopping(weekKey, slotsOff);
  const groups = groupShoppingByCategory(rows);

  const isChecked = (name) => !!ctx.shoppingChecked[`${weekKey}::${name}`];
  const toggle = (name) => ctx.toggleShopItem(`${weekKey}::${name}`);

  // same single source of truth as the Dashboard (net budget)
  const { recipesTotal: recipeTotal, persoTotal, total: grand } = weekBudget(weekKey, slotsOff, ctx.shoppingChecked, ctx.perso);
  const over = grand > weeklyBudget;
  const toBuy = rows.filter((r) => !isChecked(r.name)).length;

  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const addPerso = () => {
    if (!newName.trim()) return;
    const unitPrice = parseFloat(newPrice.replace(',', '.')) || 0;
    ctx.addPerso({ nom: newName.trim(), unitPrice, mult: 1, total: unitPrice });
    setNewName(''); setNewPrice('');
  };

  // legacy-safe accessors for a perso article's multiplier / unit price
  const persoMult = (p) => p.mult ?? p.qty ?? 1;
  const persoUnit = (p) => (p.unitPrice != null ? p.unitPrice : (persoMult(p) ? (p.total || 0) / persoMult(p) : (p.total || 0)));

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div style={{ minWidth: 0 }}>
          <h1 className="serif">
            Courses{' '}
            <span style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: 24 }}>— Semaine {weekKey.replace('S', '')}</span>
          </h1>
          <div className="sub">
            {toBuy} ingrédient(s) à acheter · retrait chez <strong style={{ color: 'var(--text)' }}>{ctx.store || 'Chronodrive'}</strong>
            {ctx.disabledCount > 0 && <strong style={{ color: 'var(--accent-2)' }}> · {ctx.disabledCount} repas désactivé{ctx.disabledCount > 1 ? 's' : ''}</strong>}
          </div>
        </div>
        <div className="topbar-actions">
          <WeekNav weekKey={weekKey} onPrev={ctx.prevWeek} onNext={ctx.nextWeek} />
          <a className="btn primary" href="https://www.chronodrive.com" target="_blank" rel="noopener noreferrer">
            <Icon name="cart" size={16} /> Chronodrive <Icon name="ext" size={14} />
          </a>
          <TopActions ctx={ctx} />
        </div>
      </div>

      <div className="row wrap" style={{ marginBottom: 16, gap: 10 }}>
        <WeekendToggle ctx={ctx} />
        <ResetSlotsButton ctx={ctx} />
        <span className="hint">Désactivez des repas dans le <button type="button" className="linklike" onClick={() => ctx.go('planning')}>Planning</button> : seuls les ingrédients encore nécessaires restent ici.</span>
      </div>

      <div className="shop-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(290px,1fr)', gap: 24, alignItems: 'start' }}>
        {/* recipe ingredients */}
        <div>
          <h2 className="serif" style={{ fontSize: 20, margin: '0 0 12px' }}>Pour vos recettes</h2>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="sl-row head">
              <span>Ingrédient (nom Chronodrive)</span>
              <span style={{ textAlign: 'right' }}>Format</span>
              <span style={{ textAlign: 'right' }}>Prix</span>
              <span style={{ textAlign: 'right' }}>Action</span>
            </div>
            {groups.map((g) => {
              const remaining = g.items.filter((r) => !isChecked(r.name)).length;
              const sorted = [...g.items].sort((a, b) => (isChecked(a.name) === isChecked(b.name) ? 0 : isChecked(a.name) ? 1 : -1));
              return (
                <div key={g.categorie}>
                  <div className="sl-cat">
                    <span className="ic-wrap">{g.emoji}</span>
                    <span className="ct">{g.label}</span>
                    <span className="cn">{remaining}/{g.items.length}</span>
                  </div>
                  {sorted.map((r) => {
                    const checked = isChecked(r.name);
                    return (
                      <div className={'sl-row' + (checked ? ' have' : '')} key={r.name}>
                        <div className="sl-name">
                          <div className="nm">
                            {r.nomChronodrive}
                            {r.substitut && !checked && (
                              <span className="tip subst-ic">
                                <Icon name="refresh" size={11} />
                                <span className="tip-body">Substitut : {r.substitut}</span>
                              </span>
                            )}
                            {r.verdict && r.verdict.includes('Reste') && !checked && (
                              <span className="pill amber" style={{ height: 18, fontSize: 9.5 }}>♻️ Reste</span>
                            )}
                          </div>
                          <div className="rc">{r.recipes.slice(0, 2).join(' · ')}{r.recipes.length > 2 ? ` +${r.recipes.length - 2}` : ''}</div>
                        </div>
                        <div className="sl-qty">{r.format || '—'}</div>
                        <div className="sl-price">{money(r.price)}</div>
                        <div className="sl-act">
                          {!checked && (
                            <a className="cd-ic" href={chronodriveLink(r)} target="_blank" rel="noopener noreferrer" title="Voir sur Chronodrive">
                              <Icon name="ext" size={14} />
                            </a>
                          )}
                          <button type="button" className={'stock-btn' + (checked ? ' on' : '')} onClick={() => toggle(r.name)}>
                            <Icon name={checked ? 'check' : 'home'} size={14} /> {checked ? 'Déjà en stock' : "J'ai déjà"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {rows.length === 0 && <div className="card-body hint">Aucun ingrédient frais pour cette sélection.</div>}
          </div>
        </div>

        {/* perso */}
        <div>
          <h2 className="serif" style={{ fontSize: 20, margin: '0 0 12px' }}>Vos articles perso</h2>
          <div className="card" style={{ overflow: 'hidden' }}>
            {ctx.perso.map((p) => {
              const mult = persoMult(p);
              const unit = persoUnit(p);
              return (
                <div className={'perso-row' + (p.checked ? ' have' : '')} key={p.id}>
                  <Check on={p.checked} onChange={() => ctx.togglePerso(p.id)} />
                  <div className="pr-name">{p.nom}</div>
                  <Stepper value={mult} min={1} max={99} suffix="×" onChange={(v) => ctx.updatePerso(p.id, { mult: v })} />
                  <div className="pr-unit">
                    <input
                      className="qty-input" type="text" inputMode="decimal" aria-label={'Prix unitaire de ' + p.nom}
                      defaultValue={unit ? String(Math.round(unit * 100) / 100).replace('.', ',') : ''}
                      key={p.id + ':' + unit}
                      onBlur={(e) => ctx.updatePerso(p.id, { unitPrice: parseFloat(e.target.value.replace(',', '.')) || 0 })}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                    />
                    <span className="pr-unit-suffix">€/u</span>
                  </div>
                  <div className="pr-total tnum">{money(mult * unit)}</div>
                  <button type="button" className="cd-ic pr-del" onClick={() => ctx.delPerso(p.id)} title="Supprimer cet article">
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              );
            })}
            {/* quick add */}
            <div className="sl-row perso" style={{ gap: 10 }}>
              <span className="kpi-ic" style={{ width: 22, height: 22, background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="plus" size={14} /></span>
              <input className="qty-input" style={{ border: 'none', background: 'transparent', padding: '6px 0' }}
                placeholder="Ajouter un article…" value={newName}
                onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPerso()} />
              <input className="qty-input" style={{ width: 60, textAlign: 'right' }} placeholder="€" value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPerso()} />
              <button type="button" className="cd-ic" style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }} onClick={addPerso}><Icon name="plus" size={15} /></button>
            </div>
          </div>
        </div>
      </div>

      {/* summary */}
      <div className="shop-summary">
        <div className="ss-total-wrap">
          <div className="kpi-label">Total estimé</div>
          <div className="ss-total">{money(grand)}</div>
        </div>
        <div className="ss-div" />
        <div className="ss-break">
          <div className="b"><span className="bl">Recettes</span><span className="bv">{money(recipeTotal)}</span></div>
          <div className="b"><span className="bl">Perso</span><span className="bv">{money(persoTotal)}</span></div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span className={'pill ' + (over ? 'crit' : 'ok')} style={{ height: 32, fontSize: 13 }}>
            <Icon name={over ? 'alert' : 'check'} size={14} />
            {over ? `${money(grand - weeklyBudget)} au-dessus du budget` : `${money(weeklyBudget - grand)} sous le budget de ${weeklyBudget}€`}
          </span>
        </div>
      </div>
    </div>
  );
}
