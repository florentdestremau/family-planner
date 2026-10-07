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
      const image = await shrinkImage(file).catch(() => {
        throw new Error("Image illisible : choisissez une photo JPEG, PNG ou WebP");
      });
      if (await call("PUT", "/cover", image, { admin: true })) toast("Image de couverture enregistrée 🖼️");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erreur", "error");
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
        <label className={`btn ${version == null ? "btn-primary" : ""}`} aria-disabled={busy}>
          {busy ? "Envoi…" : version != null ? "📷 Changer l'image" : "📷 Choisir une image"}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/*" hidden disabled={busy} onChange={pick} />
        </label>
        {version != null && (
          <button className="btn btn-ghost" onClick={remove} disabled={busy}>
            Retirer
          </button>
        )}
      </div>
    </section>
  );
}
