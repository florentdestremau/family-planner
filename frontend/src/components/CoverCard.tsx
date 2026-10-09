import { useState } from "react";
import { shrinkImage } from "../image";
import { coverUrl } from "../lib";
import { useStay } from "../stay";
import { toast } from "../toast";

/** Organisateur : choisir, changer ou retirer l'image de couverture du séjour. */
export default function CoverCard() {
  const { slug, snap, call } = useStay();
  const [busy, setBusy] = useState(false);
  const version = snap.stay.cover_version;

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // pouvoir rechoisir la même image
    if (!file) return;
    setBusy(true);
    try {
      // Format que le navigateur ne sait pas décoder : envoyée telle quelle, le serveur tranche.
      const image = await shrinkImage(file).catch(() => file);
      if (await call("PUT", "/cover", image, { admin: true })) toast("Image de couverture enregistrée 🖼️");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Retirer l'image de couverture ?")) return;
    if (await call("DELETE", "/cover", undefined, { admin: true })) toast("Image retirée");
  }

  return (
    <section className="card">
      <h2>🖼️ Image de couverture</h2>
      {version != null ? (
        <img className="cover-preview" src={coverUrl(slug, version)} alt="Image de couverture actuelle" />
      ) : (
        <p className="muted small">Une photo de la maison, du lieu ou de la famille, affichée en tête du séjour et sur l'accueil.</p>
      )}
      <div className="cover-actions">
        {/* Champ masqué mais focalisable : le label sert de bouton, au clavier aussi. */}
        <label className={`btn cover-pick ${version == null ? "btn-primary" : ""}`} aria-disabled={busy}>
          {busy ? "Envoi…" : version != null ? "📷 Changer l'image" : "📷 Choisir une image"}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/*" disabled={busy} onChange={pick} />
        </label>
        {version != null && (
          <button className="btn btn-ghost" onClick={remove} disabled={busy}>
            Retirer
          </button>
        )}
      </div>
      <p className="hint cover-hint">JPEG, PNG ou WebP. Les photos sont allégées avant l'envoi.</p>
    </section>
  );
}
