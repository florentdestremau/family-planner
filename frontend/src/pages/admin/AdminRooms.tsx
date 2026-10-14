import { useState } from "react";
import type { AutoAssignResult, BedAssignResult, BedKind, Person, Room } from "../../api";
import { AddPersonSelect, Chip } from "../../components/ui";
import { BED_LABEL, BED_PLACES, dayLabel } from "../../lib";
import { useStay } from "../../stay";
import { toast } from "../../toast";

/** Lit pour des nuits (par défaut toutes celles de la personne) ; signale les nuits ajoutées. */
function useAssignBed() {
  const { call } = useStay();
  return async (personId: number, bedId: number | null, dates?: string[]) => {
    const r = await call<BedAssignResult>("PUT", `/persons/${personId}/bed`, { bed_id: bedId, dates }, { admin: true });
    if (r?.warning) toast(r.warning, "warn");
  };
}

/**
 * Chambres, nuit par nuit. « Toutes les nuits » (par défaut) : chacun garde son lit tout le séjour,
 * et une affectation vaut pour toutes ses nuits ; une nuit précise : on ne change que cette nuit-là
 * (une chambre qui sert à deux familles des nuits différentes).
 */
export default function AdminRooms() {
  const { snap, idx, call } = useStay();
  const [name, setName] = useState("");
  const [night, setNight] = useState<string | null>(null);
  const unbedded = idx.unbedded(night);
  const undeclared = idx.withoutNights();
  const nights = snap.person_nights.filter((n) => night === null || n.date === night);
  const placed = nights.filter((n) => n.bed_id !== null).length;
  const capacity = snap.rooms.reduce((n, r) => n + r.beds.reduce((m, b) => m + BED_PLACES[b.kind], 0), 0);

  async function addRoom(e: React.FormEvent) {
    e.preventDefault();
    if (await call("POST", "/rooms", { name: name.trim() }, { admin: true })) setName("");
  }

  async function autoAssign() {
    const r = await call<AutoAssignResult>("POST", "/rooms/auto-assign", undefined, { admin: true });
    if (r) {
      const left = r.unassigned ? `, ${r.unassigned} encore sans lit` : "";
      const undeclared = r.undeclared ? ` ; ${r.undeclared} personne(s) sans nuit déclarée, pas couchée(s)` : "";
      toast(`${r.assigned} nuitée(s) attribuée(s)${left}${undeclared}`, r.undeclared ? "warn" : "ok");
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>Couchages</h2>
          <span className="badge">
            {night ? `${placed}/${capacity} places cette nuit` : `${placed}/${nights.length} nuitées avec un lit`}
          </span>
        </div>
        {snap.nights.length > 1 && (
          <div className="segmented night-picker" role="group" aria-label="Nuit">
            <button className={night === null ? "on" : ""} onClick={() => setNight(null)}>
              Toutes les nuits
            </button>
            {snap.nights.map((d) => (
              <button key={d} className={night === d ? "on" : ""} onClick={() => setNight(d)}>
                🌙 {dayLabel(d)}
              </button>
            ))}
          </div>
        )}
        {unbedded.length > 0 ? (
          <>
            <p className="small">
              <strong>Sans lit{night ? " cette nuit" : ""} :</strong>{" "}
              {unbedded.map(({ person, nights }) => person.name + (night ? "" : idx.nightsSuffix(nights))).join(", ")}
            </p>
            <button className="btn" onClick={autoAssign} disabled={!snap.rooms.length}>
              ✨ Proposer une répartition pour les non-logés
            </button>
            <p className="hint">
              Nuit par nuit : chacun garde son lit d'une nuit à l'autre, couples dans les lits doubles, enfants près de leur
              adulte référent. Ajustez ensuite à la main.
            </p>
          </>
        ) : (
          nights.length > 0 && (
            <p className="muted small">
              {night ? "Tout le monde a un lit cette nuit." : undeclared.length ? "Toutes les nuits déclarées ont un lit." : "Tout le monde a un lit."}
            </p>
          )
        )}
        {!night && undeclared.length > 0 && (
          <p className="hint">
            Nuits non déclarées : {undeclared.map((p) => p.name).join(", ")}. Leur donner un lit les fait dormir sur place toutes
            les nuits du séjour.
          </p>
        )}
        <form className="inline-form" onSubmit={addRoom}>
          <input placeholder="Nouvelle chambre (ex. Chambre bleue)" value={name} onChange={(e) => setName(e.target.value)} required />
          <button className="btn btn-primary">Ajouter</button>
        </form>
      </section>
      <div className="room-grid">
        {snap.rooms.map((room) => (
          <RoomCard key={room.id} room={room} night={night} />
        ))}
      </div>
    </div>
  );
}

/** Personne qu'on peut coucher dans un lit, et les nuits à envoyer (absent : toutes celles du séjour). */
interface Candidate {
  person: Person;
  dates?: string[];
  hint: string;
}

function RoomCard({ room, night }: { room: Room; night: string | null }) {
  const { snap, idx, call } = useStay();
  const assign = useAssignBed();
  const [name, setName] = useState(room.name);
  const [notes, setNotes] = useState(room.notes);
  const [bedKind, setBedKind] = useState<BedKind>("double");
  // Candidats d'un lit : ses nuits sans lit (cette nuit-là, ou toutes), à condition que le lit ait de
  // la place chacune de ces nuits ; on n'envoie que ces nuits-là, les nuits déjà couchées ailleurs ne
  // bougent pas. Toutes nuits confondues, aussi ceux qui n'ont déclaré aucune nuit (le serveur les
  // fait dormir tout le séjour, avec un avertissement).
  const candidates = (bedId: number) => {
    const waiting = idx
      .unbedded(night)
      .filter((l) => idx.hasRoom(bedId, l.nights))
      .map(({ person, nights }): Candidate => ({ person, dates: nights, hint: night ? "" : idx.nightsNote(nights) }));
    const undeclared = night || !idx.hasRoom(bedId, snap.nights) ? [] : idx.withoutNights();
    return [...waiting, ...undeclared.map((person): Candidate => ({ person, hint: "nuits non déclarées" }))];
  };
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
          const places = BED_PLACES[bed.kind];
          const occupants = idx.occupants(bed.id, night);
          const load = night ? occupants.length : idx.bedLoad(bed.id);
          const options = candidates(bed.id);
          return (
            <li key={bed.id} className="bed">
              <div className="bed-head">
                <span>
                  {bed.label || BED_LABEL[bed.kind]}{" "}
                  <span className="muted small">
                    ({load}/{places}
                    {night ? "" : " au plus"})
                  </span>
                </span>
                <button className="btn-icon" title="Retirer ce lit" onClick={() => call("DELETE", `/beds/${bed.id}`, undefined, { admin: true })}>
                  🗑
                </button>
              </div>
              <div className="chips">
                {occupants.map(({ person, nights }) => (
                  <Chip
                    key={person.id}
                    person={person}
                    note={night ? undefined : idx.nightsNote(nights)}
                    onRemove={() => assign(person.id, null, nights)}
                  />
                ))}
                <AddPersonSelect
                  people={options.map((o) => o.person)}
                  hint={(p) => options.find((o) => o.person.id === p.id)?.hint ?? ""}
                  onPick={(id) => assign(id, bed.id, options.find((o) => o.person.id === id)?.dates)}
                />
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
