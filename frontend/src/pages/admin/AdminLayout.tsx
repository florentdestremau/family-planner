import { useEffect, useState } from "react";
import { NavLink, Outlet, useSearchParams } from "react-router";
import { api } from "../../api";
import { useStay } from "../../stay";

export default function AdminLayout() {
  const { slug, adminKey, setAdminKey } = useStay();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<"checking" | "ok" | "denied">("checking");
  const [input, setInput] = useState("");

  // Le lien organisateur porte la clé en paramètre : on la mémorise puis on la retire de l'URL.
  useEffect(() => {
    const fromUrl = params.get("key");
    if (fromUrl) {
      setAdminKey(fromUrl);
      setParams({}, { replace: true });
    }
  }, [params, setParams, setAdminKey]);

  useEffect(() => {
    const key = params.get("key") ?? adminKey;
    if (!key) {
      setStatus("denied");
      return;
    }
    setStatus("checking");
    api("GET", `/stays/${slug}/admin`, undefined, key)
      .then(() => setStatus("ok"))
      .catch(() => setStatus("denied"));
  }, [slug, adminKey, params]);

  if (status === "checking") return <div className="center muted">Vérification…</div>;
  if (status === "denied")
    return (
      <section className="card">
        <h2>Espace organisateur</h2>
        <p className="muted">Ouvrez le lien organisateur reçu à la création du séjour, ou collez la clé ci-dessous.</p>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            setAdminKey(input.trim());
          }}
        >
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Clé organisateur" required />
          <button className="btn btn-primary">Entrer</button>
        </form>
      </section>
    );

  const base = `/s/${slug}/admin`;
  return (
    <div className="stack">
      <nav className="subtabs">
        <NavLink to={base} end>
          Séjour
        </NavLink>
        <NavLink to={`${base}/personnes`}>Personnes</NavLink>
        <NavLink to={`${base}/chambres`}>Chambres</NavLink>
        <NavLink to={`${base}/corvees`}>Corvées</NavLink>
        <NavLink to={`${base}/activites`}>Activités</NavLink>
        <NavLink to={`${base}/menus`}>Menus</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
