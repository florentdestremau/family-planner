import { useEffect, useState } from "react";
import type { Meal, Person } from "../api";
import { dayLabel, MEALS, MOMENT_LABEL, presenceKey } from "../lib";
import { useStay } from "../stay";

/** Grille jour × repas pour déclarer la présence d'une personne (présent = mange sur place). */
export default function PresenceEditor({ person }: { person: Person }) {
  const { snap, idx, call } = useStay();
  const fromServer = () => new Set(snap.slots.filter((s) => idx.isPresent(person.id, s.date, s.meal)).map((s) => presenceKey(person.id, s.date, s.meal)));
  const [selected, setSelected] = useState(fromServer);

  // Resynchronise si les données serveur changent (autre appareil, organisateur…).
  useEffect(() => setSelected(fromServer()), [snap.presences, person.id]);

  function save(next: Set<string>) {
    setSelected(next);
    const slots = snap.slots.filter((s) => next.has(presenceKey(person.id, s.date, s.meal)));
    void call("PUT", `/persons/${person.id}/presences`, { slots: slots.map(({ date, meal }) => ({ date, meal })) });
  }

  const toggle = (date: string, meal: Meal) => {
    const key = presenceKey(person.id, date, meal);
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    save(next);
  };

  const daySlots = (date: string) => snap.slots.filter((s) => s.date === date);
  const toggleDay = (date: string) => {
    const keys = daySlots(date).map((s) => presenceKey(person.id, s.date, s.meal));
    const allOn = keys.every((k) => selected.has(k));
    const next = new Set(selected);
    keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
    save(next);
  };
  const setAll = (on: boolean) =>
    save(new Set(on ? snap.slots.map((s) => presenceKey(person.id, s.date, s.meal)) : []));

  const total = selected.size;

  return (
    <div className="presence-editor">
      <div className="presence-actions">
        <span className="muted small">
          {total ? `${total} repas sur ${snap.slots.length}` : "Aucune présence déclarée"}
        </span>
        <span className="spacer" />
        <button className="btn btn-small" onClick={() => setAll(true)}>
          Tout le séjour
        </button>
        <button className="btn btn-small btn-ghost" onClick={() => setAll(false)}>
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
          const slots = daySlots(day);
          const allOn = slots.length > 0 && slots.every((s) => selected.has(presenceKey(person.id, s.date, s.meal)));
          return (
            <div className="pg-row" key={day}>
              <button className={`pg-day ${allOn ? "on" : ""}`} onClick={() => toggleDay(day)} title="Toute la journée">
                {dayLabel(day)}
              </button>
              {MEALS.map((meal) =>
                idx.hasSlot(day, meal) ? (
                  <button
                    key={meal}
                    className={`pg-cell ${selected.has(presenceKey(person.id, day, meal)) ? "on" : ""}`}
                    onClick={() => toggle(day, meal)}
                    aria-pressed={selected.has(presenceKey(person.id, day, meal))}
                    aria-label={`${dayLabel(day)} ${MOMENT_LABEL[meal]}`}
                  >
                    {selected.has(presenceKey(person.id, day, meal)) ? "✓" : ""}
                  </button>
                ) : (
                  <div key={meal} className="pg-cell pg-none" />
                ),
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
