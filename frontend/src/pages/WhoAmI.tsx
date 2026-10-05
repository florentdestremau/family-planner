import { useState } from "react";
import type { Person } from "../api";
import { useStay } from "../stay";

/** Sélection de son identité, mémorisée localement (pas de compte). */
export default function WhoAmI() {
  const { snap, idx, setMe, call } = useStay();
  const [name, setName] = useState("");
  const adults = snap.persons.filter((p) => p.kind === "adult");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const p = await call<Person>("POST", "/persons", { name: name.trim(), kind: "adult" });
    if (p) setMe(p.id);
  }

  return (
    <section className="card whoami">
      <h2>Qui êtes-vous ?</h2>
      <p className="muted">Choisissez votre nom : vous pourrez ensuite renseigner vos présences et celles de vos enfants.</p>
      {adults.length > 0 && (
        <div className="who-list">
          {adults.map((p) => (
            <button key={p.id} className="who-pick" onClick={() => setMe(p.id)}>
              <span className="avatar">{p.name.charAt(0).toUpperCase()}</span>
              <span>
                {p.name}
                {idx.members(p.household_id).length > 1 && (
                  <span className="who-household">Foyer {idx.householdLabel(p.household_id)}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
      <form onSubmit={add} className="inline-form">
        <input placeholder="Je ne suis pas dans la liste : mon prénom" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="btn btn-primary">M'ajouter</button>
      </form>
    </section>
  );
}
