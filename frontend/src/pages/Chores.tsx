import { useState } from "react";
import { Chip, Empty } from "../components/ui";
import { dayLabel, MOMENT_LABEL, MOMENTS, sortedMoments } from "../lib";
import { useStay } from "../stay";

export default function Chores() {
  const { snap, idx, me } = useStay();
  const [view, setView] = useState<"day" | "person">("day");

  if (!snap.chore_assignments.length) return <Empty>Le tirage au sort des corvées n'a pas encore eu lieu.</Empty>;

  const workers = snap.persons.filter((p) => snap.chore_assignments.some((a) => a.person_id === p.id));

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title">Corvées</h1>
        <div className="segmented">
          <button className={view === "day" ? "on" : ""} onClick={() => setView("day")}>
            Par jour
          </button>
          <button className={view === "person" ? "on" : ""} onClick={() => setView("person")}>
            Par personne
          </button>
        </div>
      </div>

      {view === "day" &&
        snap.days.map((day) => {
          const moments = MOMENTS.filter((m) => snap.chore_types.some((c) => idx.occurrences.has(`${c.id}|${day}|${m}`)));
          if (!moments.length) return null;
          return (
            <section key={day} className="card">
              <h2>{dayLabel(day, true)}</h2>
              {moments.map((m) => (
                <div key={m} className="chore-moment">
                  <h3>{MOMENT_LABEL[m]}</h3>
                  {snap.chore_types.map((c) => {
                    const people = idx.occurrences.get(`${c.id}|${day}|${m}`);
                    if (!people) return null;
                    return (
                      <div key={c.id} className="list-row">
                        <span>{c.name}</span>
                        <div className="chips">
                          {people.map((id) => (
                            <Chip key={id} person={idx.personById.get(id)} highlight={id === me?.id} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </section>
          );
        })}

      {view === "person" && (
        <div className="person-cards">
          {workers.map((p) => {
            const mine = snap.chore_assignments.filter((a) => a.person_id === p.id).sort(sortedMoments);
            return (
              <section key={p.id} className={`card ${p.id === me?.id ? "card-me" : ""}`}>
                <div className="card-head">
                  <h2>{p.name}</h2>
                  <span className="badge">{mine.length}</span>
                </div>
                <ul className="compact">
                  {mine.map((a, i) => (
                    <li key={i}>
                      <span className="muted">
                        {dayLabel(a.date)} · {MOMENT_LABEL[a.moment]}
                      </span>{" "}
                      — {idx.choreById.get(a.chore_type_id)?.name}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
