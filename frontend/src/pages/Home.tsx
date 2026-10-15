import { useIsRestoring, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { InstallButton, OfflineBanner, useOnline } from "../components/Pwa";
import { api, type Stay, type StaySummary } from "../api";
import { addDays, coverThumbUrl, groupStays, MEALS, MOMENT_LABEL, oneOf, shortRange, toIso } from "../lib";
import { storage } from "../storage";
import { ThemeToggle } from "../theme";
import { toast } from "../toast";

function nextFriday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  return toIso(d);
}

export default function Home() {
  const navigate = useNavigate();
  const [form, setForm] = useState(() => {
    const start = nextFriday();
    return { name: "", start_date: start, end_date: addDays(start, 2), first_meal: "dinner", last_meal: "lunch" };
  });
  const [busy, setBusy] = useState(false);
  const isOnline = useOnline();

  async function submit(e: React.SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const stay = await api<Stay & { admin_key: string }>("POST", "/stays", form);
      storage.setAdminKey(stay.slug, stay.admin_key);
      void navigate(`/s/${stay.slug}/admin`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erreur", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="home">
      <div className="home-topbar">
        <InstallButton />
        <ThemeToggle />
      </div>
      <header className="home-hero">
        <div className="home-logo">🎉</div>
        <h1>Week-end en famille</h1>
        <p className="muted">Menus, chambres, activités, présences et corvées : toute la logistique du séjour au même endroit. ✨</p>
      </header>

      <StayList />

      <section className="card">
        <h2>✨ Organiser un nouveau séjour</h2>
        <form onSubmit={(e) => void submit(e)} className="form">
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
              <select value={form.first_meal} onChange={(e) => setForm({ ...form, first_meal: oneOf(MEALS, e.target.value) })}>
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
              <select value={form.last_meal} onChange={(e) => setForm({ ...form, last_meal: oneOf(MEALS, e.target.value) })}>
                {MEALS.map((m) => (
                  <option key={m} value={m}>
                    {MOMENT_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy || !isOnline}>
            🚀 Créer le séjour
          </button>
          {!isOnline && <p className="hint">📴 Hors ligne : la création d'un séjour attendra le retour du réseau.</p>}
          <p className="hint">
            🎁 Vous obtiendrez un lien à partager avec la famille et un lien organisateur, à garder pour vous.
          </p>
        </form>
      </section>
    </main>
  );
}

function StayList() {
  const { data, isPending, isError, dataUpdatedAt } = useQuery({
    queryKey: ["stays"],
    queryFn: () => api<StaySummary[]>("GET", "/stays"),
  });
  const isOnline = useOnline();
  const restoring = useIsRestoring();
  if (isPending && !isOnline && !restoring)
    return <p className="muted center-text">📴 Hors ligne : la liste des séjours n'est pas encore sur cet appareil.</p>;
  if (isPending) return <p className="muted center-text">Chargement des séjours…</p>;
  if (!data) return <p className="warn center-text">Impossible de charger les séjours.</p>;
  if (data.length === 0) return null;

  // oxlint-disable-next-line react/purity -- la date du jour, relue à chaque rendu
  const { current, upcoming, past } = groupStays(data, toIso(new Date()));
  return (
    <section className="card">
      <h2>🏡 Séjours</h2>
      <OfflineBanner savedAt={dataUpdatedAt} failed={isError} />
      {[
        { title: "🔥 En cours", stays: current },
        { title: "📅 À venir", stays: upcoming },
        { title: "📸 Passés", stays: past },
      ]
        .filter((g) => g.stays.length)
        .map((g) => (
          <div key={g.title} className="stay-group">
            <h3>{g.title}</h3>
            <ul className="list">
              {g.stays.map((s) => (
                <li key={s.slug}>
                  <Link to={`/s/${s.slug}`} className="stay-link">
                    {s.cover_version != null && (
                      <img className="stay-thumb" src={coverThumbUrl(s.slug, s.cover_version)} alt="" loading="lazy" />
                    )}
                    <span className="stay-link-text">
                      <span className="stay-link-main">
                        <strong>{s.name}</strong>
                        {storage.adminKey(s.slug) && <span className="badge badge-accent">organisateur</span>}
                      </span>
                      <span className="muted small">
                        {shortRange(s.start_date, s.end_date)} · {s.households} foyer{s.households > 1 ? "s" : ""} · {s.persons}{" "}
                        personne{s.persons > 1 ? "s" : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </section>
  );
}
