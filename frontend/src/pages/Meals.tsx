import { Chip } from "../components/ui";
import { countLabel, dayLabel, MOMENT_LABEL } from "../lib";
import { useStay } from "../stay";

export default function Meals() {
  const { snap, idx, me } = useStay();
  return (
    <div className="stack">
      <h1 className="page-title">Repas</h1>
      {snap.days.map((day) => (
        <section key={day} className="card">
          <h2>{dayLabel(day, true)}</h2>
          <div className="meal-grid">
            {snap.slots
              .filter((s) => s.date === day)
              .map((s) => {
                const menu = idx.menuBySlot.get(`${s.date}|${s.meal}`);
                const count = idx.mealCount(s.date, s.meal);
                const chores = snap.chore_types
                  .map((c) => ({ chore: c, people: idx.occurrences.get(`${c.id}|${s.date}|${s.meal}`) ?? [] }))
                  .filter((x) => x.people.length);
                const dishes = menu?.dishes.split("\n").filter((d) => d.trim()) ?? [];
                return (
                  <article key={s.meal} className="meal">
                    <header className="meal-head">
                      <h3>{MOMENT_LABEL[s.meal]}</h3>
                      <span className="covers" title="Couverts">
                        🍽 {count.total}
                      </span>
                    </header>
                    <div className="muted small">{countLabel(count)}</div>
                    {dishes.length ? (
                      <ul className="dishes">
                        {dishes.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted small">Menu à définir</p>
                    )}
                    {menu?.notes && <p className="small note">{menu.notes}</p>}
                    {chores.map(({ chore, people }) => (
                      <div key={chore.id} className="meal-chore">
                        <span className="small muted">{chore.name}</span>
                        <div className="chips">
                          {people.map((id) => (
                            <Chip key={id} person={idx.personById.get(id)} highlight={id === me?.id} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </article>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
