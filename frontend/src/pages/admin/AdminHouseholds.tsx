import { useEffect, useState } from "react";
import type { Person, PersonKind } from "../../api";
import AddMember from "../../components/AddMember";
import { Toggle } from "../../components/ui";
import { useStay } from "../../stay";

export default function AdminHouseholds() {
  const { idx, snap } = useStay();
  const households = idx.households();
  return (
    <div className="stack">
      <NewPerson />
      <p className="muted small">
        {households.length} foyer{households.length > 1 ? "s" : ""} · {snap.persons.length} personne{snap.persons.length > 1 ? "s" : ""}
      </p>
      <div className="household-grid">
        {households.map((h) => (
          <HouseholdCard key={h.id} id={h.id} members={h.members} />
        ))}
      </div>
    </div>
  );
}

/** Ajout d'une personne : par défaut dans un nouveau foyer (un célibataire en un geste). */
function NewPerson() {
  const { idx, call } = useStay();
  const [form, setForm] = useState({ name: "", kind: "adult" as PersonKind, household: "" });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const body = { name: form.name.trim(), kind: form.kind, household_id: form.household ? Number(form.household) : null };
    if (await call("POST", "/persons", body, { admin: true })) setForm({ ...form, name: "" });
  }

  return (
    <section className="card">
      <h2>Ajouter une personne</h2>
      <form className="inline-form wrap" onSubmit={add}>
        <input placeholder="Prénom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as PersonKind })} aria-label="Adulte ou enfant">
          <option value="adult">Adulte</option>
          <option value="child">Enfant</option>
        </select>
        <select value={form.household} onChange={(e) => setForm({ ...form, household: e.target.value })} aria-label="Foyer">
          <option value="">Nouveau foyer</option>
          {idx.households().map((h) => (
            <option key={h.id} value={h.id}>
              Foyer {h.label}
            </option>
          ))}
        </select>
        <button className="btn btn-primary">Ajouter</button>
      </form>
      <p className="hint">Pour ajouter un conjoint ou un enfant, utilisez plutôt « Ajouter au foyer » sur la carte du foyer.</p>
    </section>
  );
}

function HouseholdCard({ id, members }: { id: number; members: Person[] }) {
  const { idx, call } = useStay();
  const household = idx.householdById.get(id);
  const [name, setName] = useState(household?.name ?? "");
  useEffect(() => setName(household?.name ?? ""), [household?.name]);
  const label = idx.householdLabel(id);
  const others = idx.households().filter((h) => h.id !== id);

  return (
    <section className="card household-card">
      <div className="card-head">
        <input
          className="input-title"
          value={name}
          placeholder={label}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() !== (household?.name ?? "") && call("PATCH", `/households/${id}`, { name: name.trim() })}
          aria-label="Nom du foyer"
        />
        <span className="badge">{members.length}</span>
      </div>
      <ul className="person-admin-list">
        {members.map((p) => (
          <MemberRow key={p.id} person={p} members={members} />
        ))}
      </ul>
      <AddMember householdId={id} admin />
      <div className="household-actions">
        {others.length > 0 && (
          <select
            className="add-select"
            value=""
            aria-label={`Fusionner le foyer ${label}`}
            onChange={(e) => {
              const into = Number(e.target.value);
              if (into && confirm(`Fusionner le foyer ${label} dans le foyer ${idx.householdLabel(into)} ?`)) {
                void call("POST", `/households/${id}/merge`, { into_id: into }, { admin: true });
              }
            }}
          >
            <option value="">Fusionner dans…</option>
            {others.map((h) => (
              <option key={h.id} value={h.id}>
                Foyer {h.label}
              </option>
            ))}
          </select>
        )}
        <button
          className="btn btn-small btn-danger"
          onClick={() =>
            confirm(`Supprimer le foyer ${label} et ses ${members.length} membre(s) ?`) &&
            call("DELETE", `/households/${id}`, undefined, { admin: true })
          }
        >
          Supprimer le foyer
        </button>
      </div>
    </section>
  );
}

function MemberRow({ person: p, members }: { person: Person; members: Person[] }) {
  const { idx, call } = useStay();
  const [name, setName] = useState(p.name);
  const patch = (body: Partial<Person>) => call("PATCH", `/persons/${p.id}`, body, { admin: true });
  const adults = members.filter((m) => m.kind === "adult" && m.id !== p.id);
  const others = idx.households().filter((h) => h.id !== p.household_id);

  return (
    <li className="person-admin">
      <div className="person-admin-main">
        <input
          className="input-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== p.name && patch({ name: name.trim() })}
          aria-label="Prénom"
        />
        <select value={p.kind} onChange={(e) => patch({ kind: e.target.value as PersonKind })} aria-label={`${p.name} : adulte ou enfant`}>
          <option value="adult">Adulte</option>
          <option value="child">Enfant</option>
        </select>
        {p.kind === "adult" && adults.length > 0 ? (
          <select
            value={p.partner_id ?? ""}
            aria-label={`Couple de ${p.name}`}
            onChange={(e) =>
              call("PUT", `/persons/${p.id}/partner`, { partner_id: e.target.value ? Number(e.target.value) : null }, { admin: true })
            }
          >
            <option value="">Pas de couple</option>
            {adults.map((a) => (
              <option key={a.id} value={a.id}>
                ♥ {a.name}
              </option>
            ))}
          </select>
        ) : (
          <span />
        )}
      </div>
      <div className="person-admin-flags">
        <Toggle label="Corvées" checked={p.does_chores} onChange={(v) => patch({ does_chores: v })} />
        <Toggle label="Activités" checked={p.does_activities} onChange={(v) => patch({ does_activities: v })} />
        <select
          className="add-select"
          value=""
          aria-label={`Déplacer ${p.name}`}
          onChange={(e) => {
            if (!e.target.value) return;
            const target = e.target.value === "new" ? null : Number(e.target.value);
            void call("PUT", `/persons/${p.id}/household`, { household_id: target }, { admin: true });
          }}
        >
          <option value="">Déplacer…</option>
          {members.length > 1 && <option value="new">Vers un nouveau foyer</option>}
          {others.map((h) => (
            <option key={h.id} value={h.id}>
              Vers le foyer {h.label}
            </option>
          ))}
        </select>
        <button
          className="btn btn-small btn-danger"
          onClick={() => confirm(`Supprimer ${p.name} et toutes ses données ?`) && call("DELETE", `/persons/${p.id}`, undefined, { admin: true })}
        >
          Supprimer
        </button>
      </div>
    </li>
  );
}
