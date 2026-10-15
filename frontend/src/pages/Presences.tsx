import type { Meal } from "../api";
import { arrivalShort, dayLabel, departureColumn, hourLabel, MOMENT_LABEL, timeLabel } from "../lib";
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
  const departures = new Map(snap.persons.map((p) => [p.id, departureColumn(columns.map((c) => on(p.id, c)), p.departure_time)]));
  // Colonne « Après » : pour qui part après le dernier repas du séjour.
  const after = [...departures.values()].includes(columns.length);
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
            {after && <th aria-label="Après le séjour" />}
          </tr>
          <tr>
            <th aria-label="Personne" />
            {columns.map((c) => (
              <th key={colKey(c)} className={`th-meal ${c.meal ? "" : "cell-night"}`} title={c.meal ? undefined : "Dort sur place"}>
                {c.meal ? `${MOMENT_LABEL[c.meal].slice(0, 4)}.` : "Nuit"}
              </th>
            ))}
            {after && (
              <th className="th-meal" title="Départ après le dernier repas">
                Après
              </th>
            )}
          </tr>
        </thead>
        {idx.households().map((h) => (
          <tbody key={h.id} className="household-rows">
            <tr className="row-household">
              <th colSpan={columns.length + 1 + Number(after)}>Foyer {h.label}</th>
            </tr>
            {h.members.map((p) => (
              <tr key={p.id} className={p.id === me?.id ? "row-me" : ""}>
                <th className="th-person">
                  {p.name}
                  {p.kind === "child" && <span className="muted"> (e)</span>}
                  {p.arrival_time !== "" && (
                    <div className="th-times" title={`Arrivée ${timeLabel(p.arrival_time)}`}>
                      🕒 {arrivalShort(p.arrival_time)}
                    </div>
                  )}
                </th>
                {columns.map((c, i) =>
                  i === departures.get(p.id) ? (
                    <DepartureCell key={colKey(c)} time={p.departure_time} night={!c.meal} />
                  ) : (
                    <td key={colKey(c)} className={`${on(p.id, c) ? "cell-on" : ""} ${c.meal ? "" : "cell-night"}`}>
                      {on(p.id, c) ? (c.meal ? "●" : "☾") : ""}
                    </td>
                  ),
                )}
                {after && (departures.get(p.id) === columns.length ? <DepartureCell time={p.departure_time} night={false} /> : <td aria-label="Parti avant" />)}
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
            {after && <td aria-label="Après le séjour" />}
          </tr>
          <tr>
            <th>Enfants</th>
            {columns.map((c) => (
              <td key={colKey(c)}>{count(c).children}</td>
            ))}
            {after && <td aria-label="Après le séjour" />}
          </tr>
          <tr className="row-total">
            <th title="Couverts pour les repas, couchages pour les nuits">Couverts · couchages</th>
            {columns.map((c) => (
              <td key={colKey(c)}>{count(c).total}</td>
            ))}
            {after && <td aria-label="Après le séjour" />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Heure de départ, dans la case qui suit la dernière présence. */
function DepartureCell({ time, night }: { time: string; night: boolean }) {
  return (
    <td className={`cell-departure ${night ? "cell-night" : ""}`} title={`Départ ${timeLabel(time)}`}>
      {hourLabel(time)}
    </td>
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
