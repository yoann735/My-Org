/* ============================================================
   Planning de la semaine-type — partagé par le Dashboard.
   Desktop : grille alignée (une colonne par jour du planning V2,
             du dimanche de retrait au dimanche midi suivant, puis
             une ligne MIDI et une ligne SOIR).
   Mobile  : pile verticale, un bloc par jour avec ses deux créneaux.

   Le contenu vient tel quel du fichier V2 (`weeks[S*].planning`).
   Un créneau porté par une recette est cliquable (ouvre le détail) et
   peut être RETIRÉ de la semaine : la recette disparaît alors de ses
   deux créneaux (le dîner et le déjeuner de restes du lendemain), du
   récap et de la liste de courses.
   ============================================================ */
import { Icon } from '../../shared/Icon.jsx';
import { useIsMobile } from '../../shared/hooks/useMediaQuery.js';
import { weekPlan, recipeById, recipeTint, tempsMinutes } from '../data/dataLayer.js';

function SlotCard({ text, recipeId, leftover, kcal, note, aCuisiner, macros, off, onToggle, onOpen }) {
  const r = recipeId ? recipeById(recipeId) : null;
  if (!text) return <div className="slot-empty" style={{ minHeight: 64 }}><Icon name="minus" size={16} /></div>;

  const t = r ? recipeTint(r.id) : null;
  const titre = r ? r.nom : text;
  const temps = r ? tempsMinutes(r) : null;
  const infobulle = [aCuisiner, note].filter(Boolean).join(' — ');

  return (
    <div
      className={'cal-slot' + (off ? ' off' : '')}
      onClick={() => { if (!r) return; if (off) { onToggle && onToggle(); } else { onOpen(r.id); } }}
      style={!off && t ? { background: t.bg, borderColor: 'var(--border)', boxShadow: `inset 3px 0 0 ${t.solid}` } : undefined}
      title={off ? 'Recette retirée de la semaine — cliquer pour la remettre' : (infobulle || undefined)}
    >
      {onToggle && r && (
        <button
          type="button"
          className="slot-toggle"
          aria-pressed={off}
          title={off ? 'Remettre cette recette dans la semaine' : 'Retirer cette recette de la semaine'}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
        >
          <Icon name={off ? 'plus' : 'ban'} size={13} />
        </button>
      )}
      <div className="cs-name">{titre}</div>
      <div className="cs-meta">
        {temps != null && <span className="meta tnum"><Icon name="clock" size={12} className="ic" /> {temps}</span>}
        {kcal != null && <span className="meta tnum"><Icon name="flame" size={12} className="ic" /> {kcal}</span>}
      </div>
      <div className="cs-tags">
        {off && <span className="tag-leftover">Retirée</span>}
        {!off && leftover && <span className="tag-leftover"><Icon name="refresh" size={10} /> Restes</span>}
        {!off && macros && (
          <span className="pill" style={{ height: 19, padding: '0 7px', fontSize: 9.5 }} title="Protéines / glucides / lipides par portion">
            {macros}
          </span>
        )}
      </div>
      {!off && note && (
        <div
          className="ital"
          style={{ fontSize: 10.5, lineHeight: 1.3, color: 'var(--text-3)',
                   display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {note}
        </div>
      )}
    </div>
  );
}

export function WeekCalendar({ weekKey, removed, onOpenRecipe, onToggleRecipe }) {
  const mobile = useIsMobile();
  const plan = weekPlan(weekKey, removed);
  if (!plan.days.length) return null;

  const toggler = (id) => (id && onToggleRecipe ? () => onToggleRecipe(id) : undefined);
  // une colonne par jour du planning (8 en V2), + la colonne des libellés
  const cols = { gridTemplateColumns: `52px repeat(${plan.days.length}, minmax(0, 1fr))` };

  if (mobile) {
    return (
      <div className="cal-grid cal-mobile">
        {plan.days.map((d, i) => {
          const dayOff = d.midiOff && d.soirOff;
          return (
            <div key={d.key + i} className={'cal-day-block' + (d.weekend ? ' weekend' : '') + (dayOff ? ' day-off' : '')}>
              <div className="cdb-head">
                <span className="dname">{d.full}</span>
                {d.weekend && <span className="pill amber" style={{ height: 18, fontSize: 9.5 }}>Week-end</span>}
                {d.kcal != null && <span className="dcost tnum">{d.kcal} kcal</span>}
              </div>
              <div className="cdb-slot">
                <span className="slot-label"><Icon name="sun" size={11} /> Midi</span>
                <SlotCard text={d.midi} recipeId={d.midiRecipeId} leftover={!!d.midiRecipeId}
                  off={d.midiOff} onToggle={toggler(d.midiRecipeId)} onOpen={onOpenRecipe} />
              </div>
              <div className="cdb-slot">
                <span className="slot-label"><Icon name="moon" size={11} /> Soir</span>
                <SlotCard text={d.soir} recipeId={d.soirRecipeId} kcal={d.kcal} note={d.note}
                  aCuisiner={d.aCuisiner} macros={d.macros} off={d.soirOff}
                  onToggle={toggler(d.soirRecipeId)} onOpen={onOpenRecipe} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="cal-grid" style={cols}>
      <div className="cg-corner" />
      {plan.days.map((d, i) => {
        const dayOff = d.midiOff && d.soirOff;
        return (
          <div className={'cg-head' + (d.weekend ? ' weekend' : '') + (dayOff ? ' off' : '')} key={'h' + i}>
            <span className="dname">{d.full}</span>
            {d.kcal != null && <span className="dcost tnum">{d.kcal} kcal</span>}
          </div>
        );
      })}

      <div className="cg-rowlabel"><Icon name="sun" size={12} /> Midi</div>
      {plan.days.map((d, i) => (
        <div className="cg-cell" key={'m' + i}>
          <SlotCard text={d.midi} recipeId={d.midiRecipeId} leftover={!!d.midiRecipeId}
            off={d.midiOff} onToggle={toggler(d.midiRecipeId)} onOpen={onOpenRecipe} />
        </div>
      ))}

      <div className="cg-rowlabel"><Icon name="moon" size={12} /> Soir</div>
      {plan.days.map((d, i) => (
        <div className="cg-cell" key={'s' + i}>
          <SlotCard text={d.soir} recipeId={d.soirRecipeId} kcal={d.kcal} note={d.note}
            aCuisiner={d.aCuisiner} macros={d.macros} off={d.soirOff}
            onToggle={toggler(d.soirRecipeId)} onOpen={onOpenRecipe} />
        </div>
      ))}
    </div>
  );
}
