import { useEffect, useState } from "react";
import type { Slot } from "../../api";
import { DietSummary } from "../../components/Diets";
import { countLabel, dayLabel, MOMENT_LABEL } from "../../lib";
import { useStay } from "../../stay";

export default function AdminMenus() {
  const { snap } = useStay();
  return (
    <div className="stack">
      <p className="hint">Un plat par ligne. Les menus s'enregistrent automatiquement quand vous quittez le champ.</p>
      <section className="card">
        <h2>🥗 Régimes et allergies du séjour</h2>
        {snap.persons.some((p) => p.diets.length || p.diet_note) ? (
          <DietSummary persons={snap.persons} expanded />
        ) : (
          <p className="hint">Aucun régime ni allergie déclaré pour l'instant : chaque foyer les indique depuis sa page « Moi ».</p>
        )}
      </section>
      {snap.days.map((day) => (
        <section key={day} className="card">
          <h2>{dayLabel(day, true)}</h2>
          <div className="meal-grid">
            {snap.slots
              .filter((s) => s.date === day)
              .map((s) => (
                <MenuEditor key={s.meal} slot={s} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MenuEditor({ slot }: { slot: Slot }) {
  const { idx, call } = useStay();
  const menu = idx.menuBySlot.get(`${slot.date}|${slot.meal}`);
  const [dishes, setDishes] = useState(menu?.dishes ?? "");
  const [notes, setNotes] = useState(menu?.notes ?? "");
  useEffect(() => {
    setDishes(menu?.dishes ?? "");
    setNotes(menu?.notes ?? "");
  }, [menu?.dishes, menu?.notes]);

  const save = () => {
    if (dishes.trim() === (menu?.dishes ?? "") && notes.trim() === (menu?.notes ?? "")) return;
    void call("PUT", "/menus", { ...slot, dishes, notes }, { admin: true });
  };

  return (
    <article className="meal">
      <header className="meal-head">
        <h3>{MOMENT_LABEL[slot.meal]}</h3>
        <span className="muted small">{countLabel(idx.mealCount(slot.date, slot.meal))}</span>
      </header>
      <DietSummary persons={idx.presentAt(slot.date, slot.meal)} />
      <textarea rows={4} placeholder={"Salade de tomates\nLasagnes\nFruits"} value={dishes} onChange={(e) => setDishes(e.target.value)} onBlur={save} />
      <input placeholder="Notes (qui apporte quoi, variante…)" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={save} />
    </article>
  );
}
