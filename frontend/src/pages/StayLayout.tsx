import { useIsRestoring } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router";
import { ApiError } from "../api";
import AssistantFab from "../components/Assistant";
import { InstallButton, OfflineBanner, useOnline } from "../components/Pwa";
import { rangeLabel } from "../lib";
import { StayProvider, useSnapshot, useStay } from "../stay";
import { ThemeToggle } from "../theme";

export default function StayLayout() {
  const { slug = "" } = useParams();
  const { data, error, isPending, isError, dataUpdatedAt } = useSnapshot(slug);
  const isOnline = useOnline();
  const restoring = useIsRestoring();

  useEffect(() => {
    if (data) {
      document.title = data.stay.name;
    }
  }, [data]);

  if (isPending && !isOnline && !restoring)
    return (
      <div className="center">
        <p>📴 Hors ligne : ce séjour n'a pas encore été ouvert sur cet appareil.</p>
        <Link to="/" className="btn">
          Accueil
        </Link>
      </div>
    );
  if (isPending) return <div className="center muted">Chargement…</div>;
  // Réseau coupé avec des données déjà chargées : on garde l'affichage.
  const missing = error instanceof ApiError && error.status === 404;
  if (!data || missing)
    return (
      <div className="center">
        <p>{missing ? "Ce séjour n'existe pas." : "Impossible de charger le séjour."}</p>
        <Link to="/" className="btn">
          Accueil
        </Link>
      </div>
    );

  return (
    <StayProvider slug={slug} snap={data}>
      <Shell savedAt={dataUpdatedAt} failed={isError} />
    </StayProvider>
  );
}

function Shell({ savedAt, failed }: { savedAt: number; failed: boolean }) {
  const { slug, snap, me, setMe, adminKey } = useStay();
  const base = `/s/${slug}`;
  const tabs = [
    { to: base, label: "🏠 Moi", end: true },
    { to: `${base}/planning`, label: "🎯 Activités" },
    { to: `${base}/repas`, label: "🍽️ Repas" },
    { to: `${base}/corvees`, label: "🧹 Corvées" },
    { to: `${base}/presences`, label: "✅ Présences" },
    { to: `${base}/chambres`, label: "🛏️ Chambres" },
    { to: `${base}/imprimer`, label: "🖨️ Imprimer" },
  ];
  if (adminKey) tabs.push({ to: `${base}/admin`, label: "⚙️ Organisation" });

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="topbar-inner">
          <div className="topbar-title">
            <Link to="/" className="brand" aria-label="Accueil">
              🎉
            </Link>
            <div>
              <div className="stay-name">{snap.stay.name}</div>
              <div className="stay-dates">{rangeLabel(snap.stay.start_date, snap.stay.end_date)}</div>
            </div>
          </div>
          <div className="topbar-actions">
            <InstallButton compact />
            <ThemeToggle />
            {me && (
              <button type="button" className="who" onClick={() => setMe(null)} title="Changer de personne">
                <span className="avatar">{me.name.charAt(0).toUpperCase()}</span>
                <span className="who-name">{me.name}</span>
              </button>
            )}
          </div>
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
        <OfflineBanner savedAt={savedAt} failed={failed} />
        <Outlet />
      </main>
      <AssistantFab />
    </div>
  );
}
