/* ============================================================
   Screen — Méthode (V3)
   Page de consultation, en lecture seule, de ce que le classeur porte
   en plus des recettes et des semaines :
   - le modèle de la semaine et les règles de génération (onglet
     « Méthode ») ;
   - la vue d'ensemble des 9 semaines (onglet « Sommaire ») ;
   - le catalogue permutable des plats week-end et pizzas (onglet
     « Options week-end »), avec les semaines qui utilisent chaque
     produit.
   Rien n'est recalculé ici : tout vient du JSON généré par l'import.
   ============================================================ */
import { Icon } from '../../shared/Icon.jsx';
import { Card } from '../components/primitives.jsx';
import { TopActions } from './_shared.jsx';
import {
  META, METHODE, OPTIONS_WEEKEND, WEEK_KEYS, weekRaw, recipeById, weeksUsingOption, money, fmtNum,
} from '../data/dataLayer.js';

export function Methode({ ctx }) {
  const plats = OPTIONS_WEEKEND.filter((o) => o.categorie !== 'pizza');
  const pizzas = OPTIONS_WEEKEND.filter((o) => o.categorie === 'pizza');

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div style={{ minWidth: 0 }}>
          <h1 className="serif">Méthode</h1>
          <div className="sub">{META.titre || META.description}</div>
        </div>
        <div className="topbar-actions">
          <TopActions ctx={ctx} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {META.modele && (
          <Card title="Modèle de la semaine" icon="calendar">
            <p style={{ margin: 0, lineHeight: 1.6, fontSize: 14 }}>{META.modele}</p>
          </Card>
        )}

        <Card title={`Les ${WEEK_KEYS.length} semaines`} icon="list">
          <div style={{ overflowX: 'auto' }}>
            <table className="nut-table methode-table">
              <thead>
                <tr>
                  <th>Semaine</th>
                  <th style={{ textAlign: 'left' }}>Recettes (lun → ven)</th>
                  <th style={{ textAlign: 'left' }}>Week-end</th>
                  <th>Total</th>
                  <th>Marge</th>
                  <th>Gâchis</th>
                  <th>Stock</th>
                  <th>kcal moy.</th>
                </tr>
              </thead>
              <tbody>
                {WEEK_KEYS.map((k) => {
                  const wk = weekRaw(k);
                  const c = wk.couts || {};
                  const n = wk.nutrition_moyenne || {};
                  return (
                    <tr key={k}>
                      <td>{k}</td>
                      <td style={{ textAlign: 'left' }}>
                        {(wk.recettes_semaine || []).map((id) => {
                          const r = recipeById(id);
                          return (
                            <button key={id} type="button" className="pill" title={r ? r.nom : id}
                              style={{ height: 22, fontSize: 11, marginRight: 4, cursor: 'pointer' }}
                              onClick={() => ctx.openRecipe(id)}>
                              {r ? r.num : id}
                            </button>
                          );
                        })}
                      </td>
                      <td style={{ textAlign: 'left', fontSize: 12 }}>
                        {wk.plat_weekend && <div>{wk.plat_weekend.produit}</div>}
                        {wk.pizza && <div className="muted"><Icon name="pizza" size={11} /> {wk.pizza.produit}</div>}
                      </td>
                      <td className="val">{money(c.total)}</td>
                      <td style={{ color: c.marge < 0 ? 'var(--crit)' : 'var(--ok)', fontWeight: 600 }}>{money(c.marge)}</td>
                      <td>{money(c.gachis)}</td>
                      <td>{money(c.stock)}</td>
                      <td>{n.kcal != null ? n.kcal : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="hint" style={{ marginTop: 10 }}>
            Marge calculée sur un budget de {weekRaw(WEEK_KEYS[0])?.budget_max || 55} € (midi + soir). Cliquez un numéro pour ouvrir la recette.
          </div>
        </Card>

        {METHODE.length > 0 && (
          <Card title="Règles de génération" icon="info">
            <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {METHODE.map((p, i) => (
                <li key={i} style={{ lineHeight: 1.6, fontSize: 13.5 }}>{p}</li>
              ))}
            </ol>
          </Card>
        )}

        {OPTIONS_WEEKEND.length > 0 && (
          <Card title="Options week-end (catalogue permutable)" icon="snow">
            <CatalogueTable titre="Plats cuisinés surgelés" items={plats} />
            <div style={{ height: 14 }} />
            <CatalogueTable titre="Pizzas" items={pizzas} />
            <div className="hint" style={{ marginTop: 10 }}>
              À permuter librement, tant que la semaine reste dans le budget.
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function CatalogueTable({ titre, items }) {
  if (!items.length) return null;
  return (
    <div style={{ overflowX: 'auto' }}>
      <div className="kpi-label" style={{ marginBottom: 8 }}>{titre}</div>
      <table className="nut-table methode-table">
        <thead>
          <tr>
            <th>Produit</th>
            <th>Poids</th>
            <th>Prix</th>
            <th>Prix / kg</th>
            <th>Repas</th>
            <th>Prix / repas</th>
            <th>Semaines</th>
          </tr>
        </thead>
        <tbody>
          {items.map((o) => {
            const sem = weeksUsingOption(o.id);
            return (
              <tr key={o.id}>
                <td>{o.produit}</td>
                <td>{fmtNum(o.poids_g)} g</td>
                <td className="val">{money(o.prix)}</td>
                <td>{money(o.prix_kg)}</td>
                <td>{o.repas_couverts}</td>
                <td>{money(o.prix_repas)}</td>
                <td>{sem.length ? sem.join(', ') : <span className="muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
