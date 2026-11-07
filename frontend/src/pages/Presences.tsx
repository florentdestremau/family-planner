import type { Meal } from "../api";
import { arrivalShort, dayLabel, departureColumn, hourLabel, MOMENT_LABEL, timeLabel } from "../lib";
import { useStay } from "../stay";

type Column = { date: string; meal: Meal | null }; // meal nul : la nuit du jour

/** Colonnes du tableau des présences pour un jour : ses repas, puis sa nuit s'il en a une. */
export function presenceColumns(snap: { slots: { date: string; meal: Meal }[]; nights: string[] }, date: string): Column[] {
  return [...snap.slots.filter((s) => s.date === date), ...(snap.nights.includes(date) ? [{ date, meal: null }] : [])];
}

/** En-têtes en emoji de la fiche imprimée, pour faire tenir une quarantaine de colonnes en largeur. */
const MEAL_EMOJI: Record<Meal, string> = { breakfast: "☕", lunch: "🥗", dinner: "🍲" };
const NIGHT_EMOJI = "🛏";

/** Légende des en-têtes en emoji, sous le tableau imprimé. */
export const PRESENCE_LEGEND = `${MEAL_EMOJI.breakfast} petit-déj · ${MEAL_EMOJI.lunch} déjeuner · ${MEAL_EMOJI.dinner} dîner · ${NIGHT_EMOJI} nuit`;

/**
 * Tableau global personnes × repas et nuits, avec les couverts par repas et les couchages par nuit.
 * `days` restreint l'affichage à une tranche du séjour (fiche imprimée) ; les départs restent calculés
 * sur tout le séjour, et la colonne « Après » ne figure que dans la tranche du dernier jour.
 */
export function PresenceTable({ days, compact = false }: { days?: string[]; compact?: boolean }) {
  const { snap, idx, me } = useStay();
  const all: Column[] = snap.days.flatMap((date) => presenceColumns(snap, date));
  const shownDays = days ?? snap.days;
  const shown = new Set(shownDays);
  const columns = all.map((c, i) => ({ ...c, i })).filter((c) => shown.has(c.date));
  const colKey = (c: Column) => `${c.date}${c.meal ?? "night"}`;
  const count = (c: Column) => (c.meal ? idx.mealCount(c.date, c.meal) : idx.nightCount(c.date));
  const on = (personId: number, c: Column) => (c.meal ? idx.isPresent(personId, c.date, c.meal) : idx.sleepsOn(personId, c.date));
  const departures = new Map(snap.persons.map((p) => [p.id, departureColumn(all.map((c) => on(p.id, c)), p.departure_time)]));
  // Colonne « Après » : pour qui part après le dernier repas du séjour.
  const after = shown.has(snap.days.at(-1) ?? "") && [...departures.values()].includes(all.length);
  const mealLabel = (meal: Meal) => (compact ? MEAL_EMOJI[meal] : `${MOMENT_LABEL[meal].slice(0, 4)}.`);
  return (
    <div className="table-wrap">
      <table className={`grid-table ${compact ? "grid-table-compact" : ""}`}>
        {compact && (
          <colgroup>
            <col className="col-person" />
          </colgroup>
        )}
        <thead>
          <tr>
            <th aria-label="Personne" />
            {shownDays.map((d) => (
              <th key={d} colSpan={columns.filter((c) => c.date === d).length} className="th-day">
                {dayLabel(d)}
              </th>
            ))}
            {after && <th aria-label="Après le séjour" />}
          </tr>
          <tr>
            <th aria-label="Personne" />
            {columns.map((c) => (
              <th key={colKey(c)} className={`th-meal ${c.meal ? "" : "cell-night"}`} title={c.meal ? MOMENT_LABEL[c.meal] : "Dort sur place"}>
                {c.meal ? mealLabel(c.meal) : compact ? NIGHT_EMOJI : "Nuit"}
              </th>
            ))}
            {after && (
              <th className="th-meal th-after" title="Départ après le dernier repas">
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
                {columns.map((c) =>
                  c.i === departures.get(p.id) ? (
                    <DepartureCell key={colKey(c)} time={p.departure_time} night={!c.meal} />
                  ) : (
                    <td key={colKey(c)} className={`${on(p.id, c) ? "cell-on" : ""} ${c.meal ? "" : "cell-night"}`}>
                      {on(p.id, c) ? (c.meal ? "●" : "☾") : ""}
                    </td>
                  ),
                )}
                {after && (departures.get(p.id) === all.length ? <DepartureCell time={p.departure_time} night={false} /> : <td aria-label="Parti avant" />)}
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
