import { useState } from "react";
import type { Activity } from "../../api";
import { Chip, Empty, Toggle } from "../../components/ui";
import { dayLabel } from "../../lib";
import { useStay } from "../../stay";
import { toast } from "../../toast";

/** `invite_all` ne sert qu'à la création : inscrire d'emblée les présents du jour. */
type Form = Omit<Activity, "id"> & { invite_all: boolean };

export default function AdminActivities() {
  const { snap, idx, call } = useStay();
  const empty: Form = { name: "", description: "", location: "", date: snap.days[0], start_time: "", end_time: "", invite_all: true };
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<Form>(empty);

  const start = (a?: Activity) => {
    setEditing(a ? a.id : "new");
    setForm(a ? { ...a, invite_all: false } : empty);
  };

  async function save(e: React.SubmitEvent) {
    e.preventDefault();
    const { invite_all, ...fields } = form;
    const body = { ...fields, id: undefined };
    const ok =
      editing === "new"
        ? await call("POST", "/activities", { ...body, invite_all }, { admin: true })
        : await call("PATCH", `/activities/${editing}`, body, { admin: true });
    if (ok !== undefined) setEditing(null);
  }

  async function inviteAll(a: Activity) {
    const res = await call<{ added: number }>("POST", `/activities/${a.id}/signups/all`, undefined, { admin: true });
    if (res) {
      const n = res.added;
      toast(
        n
          ? `${n} personne${n > 1 ? "s" : ""} inscrite${n > 1 ? "s" : ""} à « ${a.name} »`
          : "Tous les présents de ce jour sont déjà inscrits",
      );
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>Planning des activités</h2>
          {editing === null && (
            <button type="button" className="btn btn-small" onClick={() => start()}>
              + Activité
            </button>
          )}
        </div>
        <p className="hint">
          Chacun s'inscrit depuis le planning ; × retire un inscrit. « Inscrire tout le monde » inscrit d'un coup les personnes présentes ce
          jour-là ; chacun peut ensuite se retirer.
        </p>
        {editing !== null && (
          <form className="form" onSubmit={(e) => void save(e)}>
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
            {editing === "new" && (
              <Toggle
                label="Inscrire tout le monde (présents ce jour-là)"
                checked={form.invite_all}
                onChange={(v) => setForm({ ...form, invite_all: v })}
              />
            )}
            <div className="actions">
              <button type="submit" className="btn btn-primary">Enregistrer</button>
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
            {snap.activities.map((a) => {
              const participants = idx.activityParticipants(a);
              return (
                <li key={a.id} className="list-row list-row-wrap">
                  <div>
                    <strong>{a.name}</strong>
                    <div className="muted small">
                      {dayLabel(a.date)}
                      {a.start_time && ` · ${a.start_time}`}
                      {a.end_time && `–${a.end_time}`}
                      {a.location && ` · ${a.location}`}
                    </div>
                    <details className="small">
                      <summary>
                        {participants.length} inscrit{participants.length > 1 ? "s" : ""}
                      </summary>
                      <div className="chips">
                        {participants.map((p) => (
                          <Chip key={p.id} person={p} onRemove={() => void call("DELETE", `/activities/${a.id}/signups/${p.id}`)} />
                        ))}
                      </div>
                    </details>
                  </div>
                  <div className="actions">
                    <button type="button" className="btn btn-small" onClick={() => void inviteAll(a)}>
                      Inscrire tout le monde
                    </button>
                    <button type="button" className="btn btn-small btn-ghost" onClick={() => start(a)}>
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-danger"
                      onClick={() => {
                        if (confirm(`Supprimer « ${a.name} » ?`)) void call("DELETE", `/activities/${a.id}`, undefined, { admin: true });
                      }}
                    >
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
