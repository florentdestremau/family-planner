import { Chip, Empty } from "../components/ui";
import { BED_LABEL, BED_PLACES } from "../lib";
import { useStay } from "../stay";

export default function Rooms() {
  const { snap, me } = useStay();
  if (!snap.rooms.length) return <Empty>Les chambres n'ont pas encore été définies.</Empty>;
  const unassigned = snap.persons.filter((p) => p.bed_id == null);
  return (
    <div className="stack">
      <h1 className="page-title">Chambres</h1>
      <div className="room-grid">
        {snap.rooms.map((room) => {
          const capacity = room.beds.reduce((n, b) => n + BED_PLACES[b.kind], 0);
          const occupants = snap.persons.filter((p) => room.beds.some((b) => b.id === p.bed_id));
          return (
            <section key={room.id} className="card">
              <div className="card-head">
                <h2>{room.name}</h2>
                <span className="badge">
                  {occupants.length}/{capacity}
                </span>
              </div>
              {room.notes && <p className="muted small">{room.notes}</p>}
              <ul className="list">
                {room.beds.map((bed) => (
                  <li key={bed.id} className="list-row">
                    <span className="small">{bed.label || BED_LABEL[bed.kind]}</span>
                    <div className="chips">
                      {snap.persons
                        .filter((p) => p.bed_id === bed.id)
                        .map((p) => (
                          <Chip key={p.id} person={p} highlight={p.id === me?.id} />
                        ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {unassigned.length > 0 && (
        <p className="muted small">
          Pas encore de lit : {unassigned.map((p) => p.name).join(", ")}
        </p>
      )}
    </div>
  );
}
