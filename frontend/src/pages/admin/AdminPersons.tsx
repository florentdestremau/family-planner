import { useState } from "react";
import type { Person, PersonKind } from "../../api";
import { Toggle } from "../../components/ui";
import { useStay } from "../../stay";

export default function AdminPersons() {
  const { snap, call } = useStay();
  const [form, setForm] = useState({ name: "", kind: "adult" as PersonKind, guardian_id: "" });
  const adults = snap.persons.filter((p) => p.kind === "adult");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name.trim(),
      kind: form.kind,
      guardian_id: form.kind === "child" && form.guardian_id ? Number(form.guardian_id) : null,
    };
    if (await call("POST", "/persons", body, { admin: true })) setForm({ ...form, name: "" });
  }

  const sorted = [...adults, ...snap.persons.filter((p) => p.kind === "child")];

  return (
    <div className="stack">
      <section className="card">
        <h2>Ajouter une personne</h2>
        <form className="inline-form wrap" onSubmit={add}>
          <input placeholder="Prénom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as PersonKind })}>
            <option value="adult">Adulte</option>
            <option value="child">Enfant</option>
          </select>
          {form.kind === "child" && (
            <select value={form.guardian_id} onChange={(e) => setForm({ ...form, guardian_id: e.target.value })}>
              <option value="">Rattaché à…</option>
              {adults.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <button className="btn btn-primary">Ajouter</button>
        </form>
      </section>

      <section className="card card-flush">
        <div className="card-head padded">
          <h2>Participants ({snap.persons.length})</h2>
        </div>
        <ul className="person-admin-list">
          {sorted.map((p) => (
            <PersonRow key={p.id} person={p} adults={adults} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function PersonRow({ person: p, adults }: { person: Person; adults: Person[] }) {
  const { call, idx } = useStay();
  const [name, setName] = useState(p.name);
  const patch = (body: Partial<Person>) => call("PATCH", `/persons/${p.id}`, body, { admin: true });

  return (
    <li className="person-admin">
      <div className="person-admin-main">
        <input
          className="input-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== p.name && patch({ name: name.trim() })}
        />
        <select value={p.kind} onChange={(e) => patch({ kind: e.target.value as PersonKind })}>
          <option value="adult">Adulte</option>
          <option value="child">Enfant</option>
        </select>
        {p.kind === "child" ? (
          <select value={p.guardian_id ?? ""} onChange={(e) => patch({ guardian_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Sans référent</option>
            {adults.map((a) => (
              <option key={a.id} value={a.id}>
                ↳ {a.name}
              </option>
            ))}
          </select>
        ) : (
          <select
            value={p.partner_id ?? ""}
            onChange={(e) => call("PUT", `/persons/${p.id}/partner`, { partner_id: e.target.value ? Number(e.target.value) : null }, { admin: true })}
          >
            <option value="">Pas de couple</option>
            {adults
              .filter((a) => a.id !== p.id)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  ♥ {a.name}
                </option>
              ))}
          </select>
        )}
      </div>
      <div className="person-admin-flags">
        <Toggle label="Corvées" checked={p.does_chores} onChange={(v) => patch({ does_chores: v })} />
        <Toggle label="Activités" checked={p.does_activities} onChange={(v) => patch({ does_activities: v })} />
        <button
          className="btn btn-small btn-danger"
          onClick={() => confirm(`Supprimer ${p.name} et toutes ses données ?`) && call("DELETE", `/persons/${p.id}`, undefined, { admin: true })}
        >
          Supprimer
        </button>
      </div>
      {p.kind === "adult" && idx.household(p).length > 1 && (
        <div className="small muted">
          Enfants :{" "}
          {idx
            .household(p)
            .slice(1)
            .map((c) => c.name)
            .join(", ")}
        </div>
      )}
    </li>
  );
}
