import type { Meal } from "../api";
import { dayLabel, MEALS, MOMENT_LABEL } from "../lib";
import { useStay } from "../stay";

const key = (date: string, meal: Meal) => `${date}|${meal}`;

/** Grille jour × repas (présent sur place = présent au repas), contrôlée par `selected`. */
export default function PresenceGrid({
  selected,
  onChange,
}: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const { snap, idx } = useStay();

  const update = (keys: string[], on: boolean) => {
    const next = new Set(selected);
    keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
    onChange(next);
  };
  const dayKeys = (date: string) => snap.slots.filter((s) => s.date === date).map((s) => key(s.date, s.meal));

  return (
    <div className="presence-editor">
      <div className="presence-actions">
        <span className="muted small">
          {selected.size ? `${selected.size} repas sur ${snap.slots.length}` : "Aucune présence déclarée"}
        </span>
        <span className="spacer" />
        <button className="btn btn-small" onClick={() => onChange(new Set(snap.slots.map((s) => key(s.date, s.meal))))}>
          Tout le séjour
        </button>
        <button className="btn btn-small btn-ghost" onClick={() => onChange(new Set())}>
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
        {snap.days.map((day) => {
          const keys = dayKeys(day);
          const allOn = keys.length > 0 && keys.every((k) => selected.has(k));
          return (
            <div className="pg-row" key={day}>
              <button className={`pg-day ${allOn ? "on" : ""}`} onClick={() => update(keys, !allOn)} title="Toute la journée">
                {dayLabel(day)}
              </button>
              {MEALS.map((meal) => {
                if (!idx.hasSlot(day, meal)) return <div key={meal} className="pg-cell pg-none" />;
                const on = selected.has(key(day, meal));
                return (
                  <button
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
