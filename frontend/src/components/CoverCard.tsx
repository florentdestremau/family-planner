import { useState } from "react";
import { shrinkImage } from "../image";
import { coverUrl, MAX_COVER_BYTES } from "../lib";
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
      if (image.size > MAX_COVER_BYTES) {
        // Inutile d'envoyer un fichier que le serveur refusera.
        toast(`Image trop lourde (au plus ${MAX_COVER_BYTES / 1_000_000} Mo)`, "error");
        return;
      }
      if ((await call("PUT", "/cover", image, { admin: true })) !== undefined) toast("Image de couverture enregistrée 🖼️");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Retirer l'image de couverture ?")) return;
    if ((await call("DELETE", "/cover", undefined, { admin: true })) !== undefined) toast("Image retirée");
  }

  return (
    <section className="card">
      <h2>🖼️ Image de couverture</h2>
      {version == null ? (
        <p className="muted small">Une photo de la maison, du lieu ou de la famille, affichée en tête du séjour et sur l'accueil.</p>
      ) : (
        <img className="cover-preview" src={coverUrl(slug, version)} alt="Couverture actuelle du séjour" />
      )}
      <div className="cover-actions">
        {/* Champ masqué mais focalisable : le label sert de bouton, au clavier aussi. */}
        <label className={`btn cover-pick ${version == null ? "btn-primary" : ""}`} aria-disabled={busy}>
          {busy ? "Envoi…" : version == null ? "📷 Choisir une image" : "📷 Changer l'image"}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/*" disabled={busy} onChange={(e) => void pick(e)} />
        </label>
        {version != null && (
          <button type="button" className="btn btn-ghost" onClick={() => void remove()} disabled={busy}>
            Retirer
          </button>
        )}
      </div>
      <p className="hint cover-hint">JPEG, PNG ou WebP. Les photos sont allégées avant l'envoi.</p>
    </section>
  );
}
