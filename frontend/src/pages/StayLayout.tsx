import { useEffect } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router";
import { ApiError } from "../api";
import { rangeLabel } from "../lib";
import { StayProvider, useSnapshot, useStay } from "../stay";
import { storage } from "../storage";

export default function StayLayout() {
  const { slug = "" } = useParams();
  const { data, error, isPending } = useSnapshot(slug);

  useEffect(() => {
    if (data) {
      storage.rememberStay(slug, data.stay.name);
      document.title = data.stay.name;
    }
  }, [slug, data]);

  if (isPending) return <div className="center muted">Chargement…</div>;
  if (error || !data)
    return (
      <div className="center">
        <p>{error instanceof ApiError && error.status === 404 ? "Ce séjour n'existe pas." : "Impossible de charger le séjour."}</p>
        <Link to="/" className="btn">
          Accueil
        </Link>
      </div>
    );

  return (
    <StayProvider slug={slug} snap={data}>
      <Shell />
    </StayProvider>
  );
}

function Shell() {
  const { slug, snap, me, setMe, adminKey } = useStay();
  const base = `/s/${slug}`;
  const tabs = [
    { to: base, label: "Moi", end: true },
    { to: `${base}/planning`, label: "Activités" },
    { to: `${base}/repas`, label: "Repas" },
    { to: `${base}/corvees`, label: "Corvées" },
    { to: `${base}/presences`, label: "Présences" },
    { to: `${base}/chambres`, label: "Chambres" },
    { to: `${base}/imprimer`, label: "Imprimer" },
  ];
  if (adminKey) tabs.push({ to: `${base}/admin`, label: "⚙ Organisation" });

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="topbar-inner">
          <div className="topbar-title">
            <Link to="/" className="brand" aria-label="Accueil">
              🏡
            </Link>
            <div>
              <div className="stay-name">{snap.stay.name}</div>
              <div className="stay-dates">{rangeLabel(snap.stay.start_date, snap.stay.end_date)}</div>
            </div>
          </div>
          {me && (
            <button className="who" onClick={() => setMe(null)} title="Changer de personne">
              <span className="avatar">{me.name.charAt(0).toUpperCase()}</span>
              <span className="who-name">{me.name}</span>
            </button>
          )}
        </div>
        <nav className="tabs">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className="tab">
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
