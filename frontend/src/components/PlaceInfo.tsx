import { mapLink, updatedLabel } from "../lib";
import { useStay } from "../stay";
import { CopyButton, Linkified } from "./ui";

/** En tête de « Moi » : adresse et carte toujours visibles, consignes repliées. Rien si l'organisateur n'a rien saisi. */
export default function PlaceInfo() {
  const { snap } = useStay();
  const { address, practical_info, info_updated_at } = snap.stay;
  const map = mapLink(snap.stay);
  if (!map && !practical_info) return null;
  return (
    <section className="card place" aria-label="Lieu et infos pratiques">
      {address && <p className="place-address">📍 {address}</p>}
      {map && (
        <div className="place-actions">
          <a className="btn btn-primary btn-small" href={map} target="_blank" rel="noopener noreferrer">
            🗺️ Ouvrir dans Google Maps
          </a>
          {address && <CopyButton text={address} label="Copier l'adresse" />}
        </div>
      )}
      {practical_info && (
        <details className="place-info">
          <summary>Voir les infos pratiques</summary>
          <p className="pre">
            <Linkified text={practical_info} />
          </p>
        </details>
      )}
      {info_updated_at && <p className="hint">Mis à jour {updatedLabel(info_updated_at)}</p>}
    </section>
  );
}
