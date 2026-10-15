import { Link, useParams } from "react-router";
import { Linkified } from "../components/ui";
import { BED_LABEL, countLabel, dayLabel, MOMENT_LABEL, MOMENTS, rangeLabel, sortedMoments } from "../lib";
import { DietSummary } from "../components/Diets";
import { useStay } from "../stay";
import { PresenceTable } from "./Presences";

const TITLES: Record<string, string> = {
  presences: "Planning de présence",
  corvees: "Répartition des corvées",
  menus: "Menus",
  chambres: "Chambres",
  activites: "Activités",
  infos: "Infos pratiques",
};

export default function Print() {
  const { kind = "" } = useParams();
  const { slug, snap } = useStay();
  return (
    <div className={`print print-${kind}`}>
      <div className="print-toolbar no-print">
        <Link to={`/s/${slug}/imprimer`} className="btn btn-ghost">
          ← Retour
        </Link>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          🖨 Imprimer
        </button>
      </div>
      <header className="print-header">
        <h1>{TITLES[kind] ?? "Impression"}</h1>
        <div className="muted">
          {snap.stay.name} — {rangeLabel(snap.stay.start_date, snap.stay.end_date)}
        </div>
      </header>
      {kind === "presences" && <PresenceTable />}
      {kind === "corvees" && <ChoresPrint />}
      {kind === "menus" && <MenusPrint />}
      {kind === "chambres" && <RoomsPrint />}
      {kind === "activites" && <ActivitiesPrint />}
      {kind === "infos" && <InfoPrint />}
    </div>
  );
}

function ChoresPrint() {
  const { snap, idx } = useStay();
  const workers = snap.persons.filter((p) => snap.chore_assignments.some((a) => a.person_id === p.id));
  return (
    <>
      <div className="print-columns">
        {workers.map((p) => (
          <section key={p.id} className="print-block">
            <h2>{p.name}</h2>
            <ul className="compact">
              {snap.chore_assignments
                .filter((a) => a.person_id === p.id)
                .toSorted(sortedMoments)
                .map((a, i) => (
                  <li key={i}>
                    ☐ {dayLabel(a.date)} · {MOMENT_LABEL[a.moment]} — <strong>{idx.choreById.get(a.chore_type_id)?.name}</strong>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
      <h2 className="print-break">Jour par jour</h2>
      <table className="grid-table print-table">
        <thead>
          <tr>
            <th>Jour</th>
            <th>Moment</th>
            {snap.chore_types.map((c) => (
              <th key={c.id}>{c.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {snap.days.flatMap((day) =>
            MOMENTS.filter((m) => snap.chore_types.some((c) => idx.occurrences.has(`${c.id}|${day}|${m}`))).map((m) => (
              <tr key={`${day}${m}`}>
                <th>{dayLabel(day)}</th>
                <td>{MOMENT_LABEL[m]}</td>
                {snap.chore_types.map((c) => (
                  <td key={c.id}>{(idx.occurrences.get(`${c.id}|${day}|${m}`) ?? []).map(idx.name).join(", ")}</td>
                ))}
              </tr>
            )),
          )}
        </tbody>
      </table>
    </>
  );
}

function MenusPrint() {
  const { snap, idx } = useStay();
  return (
    <div className="print-columns">
      {snap.slots.map((s) => {
        const menu = idx.menuBySlot.get(`${s.date}|${s.meal}`);
        const count = idx.mealCount(s.date, s.meal);
        const cooks = snap.chore_types
          .filter((c) => c.moments.includes(s.meal))
          .map((c) => ({ c, people: idx.occurrences.get(`${c.id}|${s.date}|${s.meal}`) ?? [] }))
          .filter((x) => x.people.length);
        return (
          <section key={`${s.date}${s.meal}`} className="print-block">
            <h2>
              {dayLabel(s.date)} — {MOMENT_LABEL[s.meal]}
            </h2>
            <div className="covers-big">
              🍽 {count.total} couverts <span className="muted">({countLabel(count)})</span>
            </div>
            <DietSummary persons={idx.presentAt(s.date, s.meal)} expanded />
            <ul className="dishes">
              {(menu?.dishes.split("\n").filter((d) => d.trim()) ?? []).map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
            {menu?.notes && <p className="small note">{menu.notes}</p>}
            {cooks.map(({ c, people }) => (
              <div key={c.id} className="small">
                <strong>{c.name} :</strong> {people.map(idx.name).join(", ")}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function RoomsPrint() {
  const { snap, idx } = useStay();
  const unbedded = idx.unbedded(null);
  return (
    <>
      <div className="print-columns">
        {snap.rooms.map((room) => (
          <section key={room.id} className="print-block">
            <h2>{room.name}</h2>
            <ul className="compact">
              {room.beds.map((bed) => (
                <li key={bed.id}>
                  <span className="muted">{bed.label || BED_LABEL[bed.kind]} :</span>{" "}
                  {idx
                    .occupants(bed.id, null)
                    .map(({ person, nights }) => person.name + idx.nightsSuffix(nights))
                    .join(", ") || "—"}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {unbedded.length > 0 && (
        <p className="small">
          <strong>Sans lit :</strong>{" "}
          {unbedded.map(({ person, nights }) => person.name + idx.nightsSuffix(nights)).join(", ")}
        </p>
      )}
    </>
  );
}

function ActivitiesPrint() {
  const { snap, idx } = useStay();
  return (
    <>
      {snap.days.map((day) => {
        const activities = snap.activities.filter((a) => a.date === day);
        if (activities.length === 0) return null;
        return (
          <section key={day} className="print-block">
            <h2>{dayLabel(day, true)}</h2>
            <ul className="compact">
              {activities.map((a) => (
                <li key={a.id}>
                  <strong>
                    {a.start_time && `${a.start_time} `}
                    {a.name}
                  </strong>
                  {a.location && ` — ${a.location}`}
                  <div className="small muted">
                    Inscrits : {idx.activityParticipants(a).map((p) => p.name).join(", ") || "personne"}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

/** Fiche à afficher à l'entrée : l'adresse en clair, le lien collé par l'organisateur s'il y en a un, les consignes. */
function InfoPrint() {
  const { snap } = useStay();
  const { address, map_url, practical_info } = snap.stay;
  if (!address && !map_url && !practical_info) return <p className="muted">Aucune info pratique pour l'instant.</p>;
  return (
    <section className="print-block print-info">
      {address && <p className="print-address">📍 {address}</p>}
      {map_url && <p className="small print-url">Carte : {map_url}</p>}
      {practical_info && (
        <p className="pre">
          <Linkified text={practical_info} />
        </p>
      )}
    </section>
  );
}
