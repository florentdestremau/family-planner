import { useState } from "react";
import type { BedKind, Room } from "../../api";
import { AddPersonSelect, Chip } from "../../components/ui";
import { BED_LABEL, BED_PLACES } from "../../lib";
import { useStay } from "../../stay";
import { toast } from "../../toast";

export default function AdminRooms() {
  const { snap, call } = useStay();
  const [name, setName] = useState("");
  const unassigned = snap.persons.filter((p) => p.bed_id == null);
  const capacity = snap.rooms.reduce((n, r) => n + r.beds.reduce((m, b) => m + BED_PLACES[b.kind], 0), 0);

  async function addRoom(e: React.FormEvent) {
    e.preventDefault();
    if (await call("POST", "/rooms", { name: name.trim() }, { admin: true })) setName("");
  }

  async function autoAssign() {
    const r = await call<{ assigned: number; unassigned: number }>("POST", "/rooms/auto-assign", undefined, { admin: true });
    if (r) toast(`${r.assigned} personne(s) placée(s)${r.unassigned ? `, ${r.unassigned} sans lit` : ""}`);
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>Couchages</h2>
          <span className="badge">
            {snap.persons.length - unassigned.length}/{capacity} places occupées
          </span>
        </div>
        {unassigned.length > 0 ? (
          <>
            <p className="small">
              <strong>Sans lit :</strong> {unassigned.map((p) => p.name).join(", ")}
            </p>
            <button className="btn" onClick={autoAssign} disabled={!snap.rooms.length}>
              ✨ Proposer une répartition pour les non-logés
            </button>
            <p className="hint">Couples dans les lits doubles, enfants près de leur adulte référent. Ajustez ensuite à la main.</p>
          </>
        ) : (
          <p className="muted small">Tout le monde a un lit.</p>
        )}
        <form className="inline-form" onSubmit={addRoom}>
          <input placeholder="Nouvelle chambre (ex. Chambre bleue)" value={name} onChange={(e) => setName(e.target.value)} required />
          <button className="btn btn-primary">Ajouter</button>
        </form>
      </section>
      <div className="room-grid">
        {snap.rooms.map((room) => (
          <RoomCard key={room.id} room={room} />
        ))}
      </div>
    </div>
  );
}

function RoomCard({ room }: { room: Room }) {
  const { snap, call } = useStay();
  const [name, setName] = useState(room.name);
  const [notes, setNotes] = useState(room.notes);
  const [bedKind, setBedKind] = useState<BedKind>("double");
  const unassigned = snap.persons.filter((p) => p.bed_id == null);
  const save = () =>
    (name !== room.name || notes !== room.notes) && name.trim() && call("PATCH", `/rooms/${room.id}`, { name: name.trim(), notes }, { admin: true });

  return (
    <section className="card">
      <div className="card-head">
        <input className="input-title" value={name} onChange={(e) => setName(e.target.value)} onBlur={save} />
        <button
          className="btn btn-small btn-danger"
          onClick={() => confirm(`Supprimer « ${room.name} » ?`) && call("DELETE", `/rooms/${room.id}`, undefined, { admin: true })}
        >
          Supprimer
        </button>
      </div>
      <input className="input-notes" placeholder="Remarques (étage, salle de bain…)" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={save} />
      <ul className="list">
        {room.beds.map((bed) => {
          const occupants = snap.persons.filter((p) => p.bed_id === bed.id);
          const full = occupants.length >= BED_PLACES[bed.kind];
          return (
            <li key={bed.id} className="bed">
              <div className="bed-head">
                <span>
                  {bed.label || BED_LABEL[bed.kind]}{" "}
                  <span className="muted small">
                    ({occupants.length}/{BED_PLACES[bed.kind]})
                  </span>
                </span>
                <button className="btn-icon" title="Retirer ce lit" onClick={() => call("DELETE", `/beds/${bed.id}`, undefined, { admin: true })}>
                  🗑
                </button>
              </div>
              <div className="chips">
                {occupants.map((p) => (
                  <Chip key={p.id} person={p} onRemove={() => call("PUT", `/persons/${p.id}/bed`, { bed_id: null }, { admin: true })} />
                ))}
                {!full && (
                  <AddPersonSelect
                    people={unassigned}
                    onPick={(id) => call("PUT", `/persons/${id}/bed`, { bed_id: bed.id }, { admin: true })}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="inline-form">
        <select value={bedKind} onChange={(e) => setBedKind(e.target.value as BedKind)}>
          {(Object.keys(BED_LABEL) as BedKind[]).map((k) => (
            <option key={k} value={k}>
              {BED_LABEL[k]} ({BED_PLACES[k]} pl.)
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => call("POST", `/rooms/${room.id}/beds`, { kind: bedKind }, { admin: true })}>
          + Lit
        </button>
      </div>
    </section>
  );
}
