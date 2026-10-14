import { Chip, Empty } from "../components/ui";
import { BED_LABEL, BED_PLACES, nightsLabel } from "../lib";
import { useStay } from "../stay";

/** Chambres pour tous : occupants de chaque lit, avec leurs nuits quand ils ne restent pas tout le séjour. */
export default function Rooms() {
  const { snap, idx, me } = useStay();
  if (!snap.rooms.length) return <Empty>Les chambres n'ont pas encore été définies.</Empty>;
  const unbedded = idx.unbedded(null);
  return (
    <div className="stack">
      <h1 className="page-title">Chambres</h1>
      <div className="room-grid">
        {snap.rooms.map((room) => {
          const capacity = room.beds.reduce((n, b) => n + BED_PLACES[b.kind], 0);
          // La nuit la plus chargée de la chambre.
          const load = Math.max(0, ...snap.nights.map((d) => room.beds.reduce((n, b) => n + idx.occupants(b.id, d).length, 0)));
          return (
            <section key={room.id} className="card">
              <div className="card-head">
                <h2>{room.name}</h2>
                <span className="badge">
                  {load}/{capacity}
                </span>
              </div>
              {room.notes && <p className="muted small">{room.notes}</p>}
              <ul className="list">
                {room.beds.map((bed) => (
                  <li key={bed.id} className="list-row">
                    <span className="small">{bed.label || BED_LABEL[bed.kind]}</span>
                    <div className="chips">
                      {idx.occupants(bed.id, null).map(({ person, nights }) => (
                        <Chip key={person.id} person={person} highlight={person.id === me?.id} note={idx.nightsNote(nights)} />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {unbedded.length > 0 && (
        <p className="muted small">
          Pas encore de lit :{" "}
          {unbedded.map(({ person, nights }) => `${person.name}${idx.nightsNote(nights) ? ` (${nightsLabel(nights)})` : ""}`).join(", ")}
        </p>
      )}
    </div>
  );
}
