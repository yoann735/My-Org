/* ============================================================
   Screen — Liste de courses
   Exactement les lignes de courses de la SEMAINE-TYPE RETENUE, telles
   que fournies par les données V2 : produit Chronodrive, rayon,
   nombre de paquets, contenu et prix relevé. Rien n'est recalculé.

   Retirer une recette de la semaine (depuis l'Accueil) retire ses
   lignes d'ici — prudemment : une ligne partagée avec une recette
   encore au planning, ou qu'on n'a pas pu rattacher avec certitude,
   est conservée et signalée « à vérifier » (voir dataLayer).

   Cases « déjà en stock » / « ajouté au panier » persistées, et
   articles perso libres.
   ============================================================ */
import { useState, useRef, useEffect } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Check, WeekNav, Stepper } from '../components/primitives.jsx';
import { TopActions, ResetRemovedButton } from './_shared.jsx';
import {
  weekShopping, groupShoppingByCategory, weekBudget, chronodriveLink, money, fmtNum,
} from '../data/dataLayer.js';

export function Shopping({ ctx }) {
  const { weekKey, removedInWeek, weeklyBudget } = ctx;
  const rows = weekShopping(weekKey, removedInWeek);
  const groups = groupShoppingByCategory(rows);

  const isChecked = (name) => !!ctx.shoppingChecked[`${weekKey}::${name}`];
  const toggle = (name) => ctx.toggleShopItem(`${weekKey}::${name}`);
  // LOT 4 — "Ajouté au panier" (indépendant de "Déjà en stock")
  const isCarted = (name) => !!(ctx.cart && ctx.cart[`${weekKey}::${name}`]);
  const toggleCart = (name) => ctx.toggleCartItem(`${weekKey}::${name}`);

  // same single source of truth as the Dashboard (net budget)
  const { recipesTotal: recipeTotal, persoTotal, total: grand } = weekBudget(weekKey, removedInWeek, ctx.shoppingChecked, ctx.perso);
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
            <span style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: 24 }}>— Semaine {(weekKey || '').replace(/\D/g, '') || '—'}</span>
          </h1>
          <div className="sub">
            {toBuy} produit(s) à acheter · retrait chez <strong style={{ color: 'var(--text)' }}>{ctx.store || 'Chronodrive'}</strong>
            {ctx.removedCount > 0 && <strong style={{ color: 'var(--accent-2)' }}> · {ctx.removedCount} recette{ctx.removedCount > 1 ? 's' : ''} retirée{ctx.removedCount > 1 ? 's' : ''}</strong>}
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
        <ResetRemovedButton ctx={ctx} />
        <span className="hint">Retirez une recette depuis l'<button type="button" className="linklike" onClick={() => ctx.go('dashboard')}>Accueil</button> : ses produits disparaissent d'ici.</span>
      </div>

      <div className="shop-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(290px,1fr)', gap: 24, alignItems: 'start' }}>
        {/* recipe ingredients */}
        <div>
          <h2 className="serif" style={{ fontSize: 20, margin: '0 0 12px' }}>Courses de la semaine</h2>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="sl-row head">
              <span>Ingrédient (nom Chronodrive)</span>
              <span>Utilisation</span>
              <span style={{ textAlign: 'right' }}>Paquets</span>
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
                    const carted = isCarted(r.name);
                    return (
                      <div className={'sl-row' + (checked ? ' have' : '') + (carted ? ' carted' : '')} key={r.name}>
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
                            {carted && <span className="cart-badge"><Icon name="cart" size={9} /> Panier</span>}
                            {r.aVerifier && !checked && (
                              <span className="tip subst-ic" style={{ color: 'var(--accent-2)' }}>
                                <Icon name="alert" size={11} />
                                <span className="tip-body">Produit non rattaché à une recette : vérifiez s'il vous sert encore après le retrait.</span>
                              </span>
                            )}
                          </div>
                          {r.besoinValue != null && (
                            <div className="rc">Besoin {fmtNum(r.besoinValue)} {r.besoinUnit}</div>
                          )}
                        </div>
                        <UsageCell row={r} />
                        <div className="sl-qty">{r.packDisplay || r.formatLabel || '—'}</div>
                        <div className="sl-price">{money(r.price)}</div>
                        <div className="sl-act">
                          {!checked && (
                            <a className="cd-ic" href={chronodriveLink(r)} target="_blank" rel="noopener noreferrer" title="Voir sur Chronodrive">
                              <Icon name="ext" size={14} />
                            </a>
                          )}
                          <button type="button" className={'cart-btn' + (carted ? ' on' : '')} onClick={() => toggleCart(r.name)} title={carted ? 'Retirer du panier' : 'Ajouté au panier'} aria-pressed={carted}>
                            <Icon name="cart" size={15} />
                          </button>
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
            {rows.length === 0 && <div className="card-body hint">Aucun produit pour cette semaine.</div>}
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

/* ============================================================
   Cellule « Utilisation » + popover (survol desktop / tap mobile).
   Liste les recettes de la semaine encore au planning qui utilisent ce
   produit, avec la quantité PAR PORTION telle qu'elle figure dans la
   recette. Le besoin de la semaine, le nombre de paquets et le prix
   viennent directement des données de la semaine — rien n'est recalculé.
   ============================================================ */
function UsageCell({ row }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const uses = row.uses || [];
  const count = row.count != null ? row.count : uses.length;

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('touchstart', onDoc); };
  }, [open]);

  if (!count) {
    // produit du placard, surgelé du week-end, ou ligne non rattachée
    return <div className="sl-use" />;
  }

  return (
    <div
      className="sl-use"
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button type="button" className="use-chip" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="list" size={11} /> <span className="n">{count}</span> recette{count > 1 ? 's' : ''}
      </button>
      {open && (
        <div className="use-pop" onClick={(e) => e.stopPropagation()}>
          <div className="use-pop-head">Utilisé dans {count} recette{count > 1 ? 's' : ''} · par portion</div>
          <ul className="use-pop-list">
            {uses.map((u, i) => (
              <li key={u.id + '-' + i}>
                <span className="up-r">{u.id} – {u.nom}</span>
                <span className="up-q">{u.qty}</span>
              </li>
            ))}
          </ul>
          {row.besoinValue != null && (
            <div className="use-pop-total">
              <span>Besoin de la semaine</span>
              <strong>{fmtNum(row.besoinValue)} {row.besoinUnit}</strong>
            </div>
          )}
          {row.packDisplay && (
            <div className="use-pop-total" style={{ borderTop: 'none', marginTop: 2, paddingTop: 0 }}>
              <span>À acheter</span>
              <strong style={{ color: 'var(--text)' }}>{row.packDisplay} · {money(row.price)}</strong>
            </div>
          )}
          {row.reste > 0 && (
            <div className="use-pop-detail">Reste après la semaine : {fmtNum(row.reste)} {row.besoinUnit}</div>
          )}
        </div>
      )}
    </div>
  );
}
