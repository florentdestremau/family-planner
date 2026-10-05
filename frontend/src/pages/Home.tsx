import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, type Meal, type Stay } from "../api";
import { addDays, MEALS, MOMENT_LABEL, toIso } from "../lib";
import { storage } from "../storage";
import { toast } from "../toast";

function nextFriday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  return toIso(d);
}

export default function Home() {
  const navigate = useNavigate();
  const known = storage.knownStays();
  const [form, setForm] = useState(() => {
    const start = nextFriday();
    return { name: "", start_date: start, end_date: addDays(start, 2), first_meal: "dinner" as Meal, last_meal: "lunch" as Meal };
  });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const stay = await api<Stay & { admin_key: string }>("POST", "/stays", form);
      storage.setAdminKey(stay.slug, stay.admin_key);
      storage.rememberStay(stay.slug, stay.name);
      navigate(`/s/${stay.slug}/admin`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erreur", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="home">
      <header className="home-hero">
        <div className="home-logo">🏡</div>
        <h1>Week-end en famille</h1>
        <p className="muted">Menus, chambres, activités, présences et corvées : toute la logistique du séjour au même endroit.</p>
      </header>

      {known.length > 0 && (
        <section className="card">
          <h2>Mes séjours</h2>
          <ul className="list">
            {known.map((s) => (
              <li key={s.slug}>
                <Link to={`/s/${s.slug}`} className="list-link">
                  {s.name} <span aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Organiser un nouveau séjour</h2>
        <form onSubmit={submit} className="form">
          <label>
            Nom du séjour
            <input
              required
              placeholder="Toussaint chez Mamie"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <div className="row2">
            <label>
              Arrivée
              <input
                type="date"
                required
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
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
              <input
                type="date"
                required
                min={form.start_date}
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
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
          <button className="btn btn-primary" disabled={busy}>
            Créer le séjour
          </button>
          <p className="hint">
            Vous obtiendrez un lien à partager avec la famille et un lien organisateur, à garder pour vous.
          </p>
        </form>
      </section>
    </main>
  );
}
