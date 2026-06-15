/* ============================================================
   Screen — Liste de courses
   Fresh ingredients aggregated by Chronodrive category, with the
   Chronodrive name + link (not the raw HelloFresh name), price,
   substitute, and a "j'ai déjà" toggle (persisted). Personal items
   pre-filled (skyr ×2 + bananes). Live total vs 60€, weekend lever.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../components/Icon.jsx';
import { Check, WeekNav } from '../components/primitives.jsx';
import { TopActions, WeekendToggle } from './_shared.jsx';
import {
  weekShopping, groupShoppingByCategory, weekPlan, chronodriveLink,
  BUDGET_TARGET, money,
} from '../data/dataLayer.js';

export function Shopping({ ctx }) {
  const { weekKey, includeWeekend, weeklyBudget } = ctx;
  const plan = weekPlan(weekKey);
  const rows = weekShopping(weekKey, includeWeekend);
  const groups = groupShoppingByCategory(rows);

  const isChecked = (name) => !!ctx.shoppingChecked[`${weekKey}::${name}`];
  const toggle = (name) => ctx.toggleShopItem(`${weekKey}::${name}`);

  const recipeTotal = rows.filter((r) => !isChecked(r.name)).reduce((a, r) => a + r.price, 0);
  const persoTotal = ctx.perso.filter((p) => !p.checked).reduce((a, p) => a + (p.total || 0), 0);
  const grand = recipeTotal + persoTotal;
  const over = grand > weeklyBudget;
  const toBuy = rows.filter((r) => !isChecked(r.name)).length;

  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const addPerso = () => {
    if (!newName.trim()) return;
    ctx.addPerso({ nom: newName.trim(), total: parseFloat(newPrice.replace(',', '.')) || 0, qty: 1 });
    setNewName(''); setNewPrice('');
  };

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
            {!includeWeekend && <strong style={{ color: 'var(--accent-2)' }}> · week-end masqué</strong>}
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
        <span className="hint">Masquer le week-end retire les recettes de Sam &amp; Dim et recalcule le budget.</span>
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
            {ctx.perso.map((p) => (
              <div className={'sl-row perso' + (p.checked ? ' have' : '')} key={p.id}>
                <Check on={p.checked} onChange={() => ctx.togglePerso(p.id)} />
                <div className="sl-name">
                  <div className="nm">{p.nom}{p.fixe && <span className="pill" style={{ height: 18, fontSize: 9.5 }}>Fixe</span>}</div>
                  {p.qty ? <div className="rc">× {p.qty}</div> : null}
                </div>
                <div className="sl-price">{money(p.total || 0)}</div>
                <div className="sl-act">
                  {!p.fixe && (
                    <button type="button" className="cd-ic" style={{ border: 'none', background: 'transparent', color: 'var(--text-3)' }} onClick={() => ctx.delPerso(p.id)} title="Supprimer">
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
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
