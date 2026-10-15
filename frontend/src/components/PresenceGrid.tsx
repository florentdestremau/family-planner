import type { Meal } from "../api";
import { dayLabel, followMeals, MEALS, MOMENT_LABEL, nightKey } from "../lib";
import { useStay } from "../stay";

const key = (date: string, meal: Meal) => `${date}|${meal}`;

/**
 * Grille jour × repas, plus la nuit du jour (de J à J+1), contrôlée par `selected`. Cocher ou
 * décocher un repas met à jour les nuits sans ambiguïté (followMeals) ; une nuit se coche aussi à
 * part (arrivée après le dîner, nuit passée ailleurs).
 */
export default function PresenceGrid({
  selected,
  onChange,
}: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const { snap, idx } = useStay();
  const hasNight = new Set(snap.nights);
  const meals = [...selected].filter((k) => !k.endsWith("|night")).length;
  const nights = selected.size - meals;

  const update = (keys: string[], on: boolean) => {
    const next = new Set(selected);
    for (const k of keys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    onChange(followMeals(snap.nights, selected, next));
  };
  /** Une nuit se coche ou se décoche seule, sans toucher aux repas. */
  const toggleNight = (day: string) => {
    const next = new Set(selected);
    if (!next.delete(nightKey(day))) next.add(nightKey(day));
    onChange(next);
  };
  const dayKeys = (date: string) => [
    ...snap.slots.filter((s) => s.date === date).map((s) => key(s.date, s.meal)),
    ...(hasNight.has(date) ? [nightKey(date)] : []),
  ];
  const everything = () => new Set(snap.days.flatMap(dayKeys));

  return (
    <div className="presence-editor">
      <div className="presence-actions">
        <span className="muted small">
          {selected.size > 0
            ? `${meals} repas sur ${snap.slots.length}${snap.nights.length > 0 ? ` · ${nights} nuit${nights > 1 ? "s" : ""} sur ${snap.nights.length}` : ""}`
            : "Aucune présence déclarée"}
        </span>
        <span className="spacer" />
        <button type="button" className="btn btn-small" onClick={() => onChange(everything())}>
          Tout le séjour
        </button>
        <button type="button" className="btn btn-small btn-ghost" onClick={() => onChange(new Set())}>
          Aucun
        </button>
      </div>
      <div className="presence-grid">
        <div className="pg-head" />
        {MEALS.map((m) => (
          <div key={m} className="pg-head">
            {MOMENT_LABEL[m]}
          </div>
        ))}
        <div className="pg-head">Nuit</div>
        {snap.days.map((day) => {
          const keys = dayKeys(day);
          const allOn = keys.length > 0 && keys.every((k) => selected.has(k));
          const nightOn = selected.has(nightKey(day));
          return (
            <div className="pg-row" key={day}>
              <button type="button" className={`pg-day ${allOn ? "on" : ""}`} onClick={() => update(keys, !allOn)} title="Toute la journée et la nuit">
                {dayLabel(day)}
              </button>
              {MEALS.map((meal) => {
                if (!idx.hasSlot(day, meal)) return <div key={meal} className="pg-cell pg-none" />;
                const on = selected.has(key(day, meal));
                return (
                  <button
                    type="button"
                    key={meal}
                    className={`pg-cell ${on ? "on" : ""}`}
                    onClick={() => update([key(day, meal)], !on)}
                    aria-pressed={on}
                    aria-label={`${dayLabel(day)} ${MOMENT_LABEL[meal]}`}
                  >
                    {on ? "✓" : ""}
                  </button>
                );
              })}
              {hasNight.has(day) ? (
                <button
                  type="button"
                  className={`pg-cell pg-night ${nightOn ? "on" : ""}`}
                  onClick={() => toggleNight(day)}
                  aria-pressed={nightOn}
                  aria-label={`Nuit du ${dayLabel(day)}`}
                  title="Dort sur place cette nuit-là"
                >
                  {nightOn ? "🌙" : ""}
                </button>
              ) : (
                <div className="pg-cell pg-none" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
