import type { Meal } from "../api";
import { dayLabel, MOMENT_LABEL } from "../lib";
import { useStay } from "../stay";

type Column = { date: string; meal: Meal | null }; // meal nul : la nuit du jour

/** Tableau global personnes × repas et nuits, avec les couverts par repas et les couchages par nuit. */
export function PresenceTable() {
  const { snap, idx, me } = useStay();
  const nights = new Set(snap.nights);
  const columns: Column[] = snap.days.flatMap((date) => [
    ...snap.slots.filter((s) => s.date === date),
    ...(nights.has(date) ? [{ date, meal: null }] : []),
  ]);
  const colKey = (c: Column) => `${c.date}${c.meal ?? "night"}`;
  const count = (c: Column) => (c.meal ? idx.mealCount(c.date, c.meal) : idx.nightCount(c.date));
  const on = (personId: number, c: Column) => (c.meal ? idx.isPresent(personId, c.date, c.meal) : idx.sleepsOn(personId, c.date));
  return (
    <div className="table-wrap">
      <table className="grid-table">
        <thead>
          <tr>
            <th aria-label="Personne" />
            {snap.days.map((d) => (
              <th key={d} colSpan={columns.filter((c) => c.date === d).length} className="th-day">
                {dayLabel(d)}
              </th>
            ))}
          </tr>
          <tr>
            <th aria-label="Personne" />
            {columns.map((c) => (
              <th key={colKey(c)} className={`th-meal ${c.meal ? "" : "cell-night"}`} title={c.meal ? undefined : "Dort sur place"}>
                {c.meal ? `${MOMENT_LABEL[c.meal].slice(0, 4)}.` : "Nuit"}
              </th>
            ))}
          </tr>
        </thead>
        {idx.households().map((h) => (
          <tbody key={h.id} className="household-rows">
            <tr className="row-household">
              <th colSpan={columns.length + 1}>Foyer {h.label}</th>
            </tr>
            {h.members.map((p) => (
              <tr key={p.id} className={p.id === me?.id ? "row-me" : ""}>
                <th className="th-person">
                  {p.name}
                  {p.kind === "child" && <span className="muted"> (e)</span>}
                </th>
                {columns.map((c) => (
                  <td key={colKey(c)} className={`${on(p.id, c) ? "cell-on" : ""} ${c.meal ? "" : "cell-night"}`}>
                    {on(p.id, c) ? (c.meal ? "●" : "☾") : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
        <tfoot>
          <tr>
            <th>Adultes</th>
            {columns.map((c) => (
              <td key={colKey(c)}>{count(c).adults}</td>
            ))}
          </tr>
          <tr>
            <th>Enfants</th>
            {columns.map((c) => (
              <td key={colKey(c)}>{count(c).children}</td>
            ))}
          </tr>
          <tr className="row-total">
            <th title="Couverts pour les repas, couchages pour les nuits">Couverts · couchages</th>
            {columns.map((c) => (
              <td key={colKey(c)}>{count(c).total}</td>
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
