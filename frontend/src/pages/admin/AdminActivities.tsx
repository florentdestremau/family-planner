import { useState } from "react";
import type { Activity } from "../../api";
import { Empty, Toggle } from "../../components/ui";
import { dayLabel } from "../../lib";
import { useStay } from "../../stay";

type Form = Omit<Activity, "id">;

export default function AdminActivities() {
  const { snap, idx, call } = useStay();
  const empty: Form = { name: "", description: "", location: "", date: snap.days[0], start_time: "", end_time: "", optional: false };
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<Form>(empty);

  const start = (a?: Activity) => {
    setEditing(a ? a.id : "new");
    setForm(a ? { ...a } : empty);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...form, id: undefined };
    const ok =
      editing === "new"
        ? await call("POST", "/activities", body, { admin: true })
        : await call("PATCH", `/activities/${editing}`, body, { admin: true });
    if (ok) setEditing(null);
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>Planning des activités</h2>
          {editing === null && (
            <button className="btn btn-small" onClick={() => start()}>
              + Activité
            </button>
          )}
        </div>
        <p className="hint">Par défaut tout le monde participe (personnes « Activités » présentes ce jour-là). Une activité facultative demande une inscription.</p>
        {editing !== null && (
          <form className="form" onSubmit={save}>
            <label>
              Nom
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Rando au lac" />
            </label>
            <div className="row3">
              <label>
                Jour
                <select value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}>
                  {snap.days.map((d) => (
                    <option key={d} value={d}>
                      {dayLabel(d)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Début
                <input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </label>
              <label>
                Fin
                <input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </label>
            </div>
            <label>
              Lieu
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </label>
            <label>
              Description
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <Toggle label="Facultative (inscription individuelle)" checked={form.optional} onChange={(v) => setForm({ ...form, optional: v })} />
            <div className="actions">
              <button className="btn btn-primary">Enregistrer</button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                Annuler
              </button>
            </div>
          </form>
        )}
      </section>

      {snap.activities.length === 0 ? (
        <Empty>Aucune activité.</Empty>
      ) : (
        <section className="card">
          <ul className="list">
            {snap.activities.map((a) => (
              <li key={a.id} className="list-row">
                <div>
                  <strong>{a.name}</strong> {a.optional && <span className="badge badge-accent">facultatif</span>}
                  <div className="muted small">
                    {dayLabel(a.date)}
                    {a.start_time && ` · ${a.start_time}`}
                    {a.end_time && `–${a.end_time}`}
                    {a.location && ` · ${a.location}`} · {idx.activityParticipants(a).length} participant(s)
                  </div>
                </div>
                <div className="actions">
                  <button className="btn btn-small btn-ghost" onClick={() => start(a)}>
                    Modifier
                  </button>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={() => confirm(`Supprimer « ${a.name} » ?`) && call("DELETE", `/activities/${a.id}`, undefined, { admin: true })}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
