import { useEffect, useState } from "react";
import type { Meal } from "../../api";
import { CopyButton, Toggle } from "../../components/ui";
import { MEALS, MOMENT_LABEL } from "../../lib";
import { useStay } from "../../stay";
import { toast } from "../../toast";

export default function AdminStay() {
  const { slug, snap, adminKey, call } = useStay();
  const [form, setForm] = useState(snap.stay);
  useEffect(() => setForm(snap.stay), [snap.stay]);

  const origin = window.location.origin;
  const publicLink = `${origin}/s/${slug}`;
  const adminLink = `${origin}/s/${slug}/admin?key=${adminKey}`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { name, start_date, end_date, first_meal, last_meal } = form;
    const shrinking = start_date > snap.stay.start_date || end_date < snap.stay.end_date;
    if (shrinking && !confirm("Les présences, menus et corvées hors de la nouvelle période seront supprimés. Continuer ?")) return;
    if (await call("PATCH", "/stay", { name, start_date, end_date, first_meal, last_meal }, { admin: true })) toast("Séjour enregistré");
  }

  const stats = {
    adults: snap.persons.filter((p) => p.kind === "adult").length,
    children: snap.persons.filter((p) => p.kind === "child").length,
    noPresence: snap.persons.filter((p) => !snap.presences.some((pr) => pr.person_id === p.id)).length,
  };

  return (
    <div className="stack">
      <section className="card">
        <h2>Liens de partage</h2>
        <div className="share">
          <div>
            <div className="small muted">Lien famille — à envoyer à tout le monde</div>
            <code>{publicLink}</code>
          </div>
          <CopyButton text={publicLink} />
        </div>
        <div className="share">
          <div>
            <div className="small muted">Lien organisateur — à ne partager qu'avec les co-organisateurs</div>
            <code className="secret">{adminLink}</code>
          </div>
          <CopyButton text={adminLink} />
        </div>
      </section>

      <section className="card">
        <h2>En bref</h2>
        <div className="stats">
          <div>
            <strong>{stats.adults}</strong>
            <span>adultes</span>
          </div>
          <div>
            <strong>{stats.children}</strong>
            <span>enfants</span>
          </div>
          <div>
            <strong>{snap.slots.length}</strong>
            <span>repas</span>
          </div>
          <div className={stats.noPresence ? "warn" : ""}>
            <strong>{stats.noPresence}</strong>
            <span>sans présence</span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Dates du séjour</h2>
        <form className="form" onSubmit={save}>
          <label>
            Nom
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <div className="row2">
            <label>
              Arrivée
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
            </label>
            <label>
              Premier repas
              <select value={form.first_meal} onChange={(e) => setForm({ ...form, first_meal: e.target.value as Meal })}>
                {MEALS.map((m) => (
                  <option key={m} value={m}>
                    {MOMENT_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row2">
            <label>
              Départ
              <input type="date" value={form.end_date} min={form.start_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required />
            </label>
            <label>
              Dernier repas
              <select value={form.last_meal} onChange={(e) => setForm({ ...form, last_meal: e.target.value as Meal })}>
                {MEALS.map((m) => (
                  <option key={m} value={m}>
                    {MOMENT_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="btn btn-primary">Enregistrer</button>
        </form>
      </section>

      <section className="card">
        <h2>Règles des corvées</h2>
        <Toggle
          label="Séparer les couples (jamais sur la même corvée)"
          checked={snap.stay.separate_couples}
          onChange={(v) => call("PATCH", "/stay", { separate_couples: v }, { admin: true })}
        />
      </section>
    </div>
  );
}
