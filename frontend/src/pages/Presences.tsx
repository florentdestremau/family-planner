import { dayLabel, MOMENT_LABEL } from "../lib";
import { useStay } from "../stay";

/** Tableau global personnes × repas, avec les couverts par repas. */
export function PresenceTable() {
  const { snap, idx, me } = useStay();
  const persons = [...snap.persons].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "adult" ? -1 : 1));
  return (
    <div className="table-wrap">
      <table className="grid-table">
        <thead>
          <tr>
            <th />
            {snap.days.map((d) => {
              const n = snap.slots.filter((s) => s.date === d).length;
              return (
                <th key={d} colSpan={n} className="th-day">
                  {dayLabel(d)}
                </th>
              );
            })}
          </tr>
          <tr>
            <th />
            {snap.slots.map((s) => (
              <th key={`${s.date}${s.meal}`} className="th-meal">
                {MOMENT_LABEL[s.meal].slice(0, 4)}.
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {persons.map((p) => (
            <tr key={p.id} className={p.id === me?.id ? "row-me" : ""}>
              <th className="th-person">
                {p.name}
                {p.kind === "child" && <span className="muted"> (e)</span>}
              </th>
              {snap.slots.map((s) => (
                <td key={`${s.date}${s.meal}`} className={idx.isPresent(p.id, s.date, s.meal) ? "cell-on" : ""}>
                  {idx.isPresent(p.id, s.date, s.meal) ? "●" : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>Adultes</th>
            {snap.slots.map((s) => (
              <td key={`${s.date}${s.meal}`}>{idx.mealCount(s.date, s.meal).adults}</td>
            ))}
          </tr>
          <tr>
            <th>Enfants</th>
            {snap.slots.map((s) => (
              <td key={`${s.date}${s.meal}`}>{idx.mealCount(s.date, s.meal).children}</td>
            ))}
          </tr>
          <tr className="row-total">
            <th>Couverts</th>
            {snap.slots.map((s) => (
              <td key={`${s.date}${s.meal}`}>{idx.mealCount(s.date, s.meal).total}</td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function Presences() {
  return (
    <div className="stack">
      <h1 className="page-title">Présences</h1>
      <section className="card card-flush">
        <PresenceTable />
      </section>
    </div>
  );
}
