import { useEffect, useState } from "react";
import type { Stay } from "../api";
import { MAX_PRACTICAL_INFO } from "../lib";
import { useStay } from "../stay";
import { toast } from "../toast";

const EXAMPLE = `Portail : code 1234, à refermer derrière vous
Parking : dans le pré, pas devant la grange
Arrivée conseillée : à partir de 17 h
À apporter : draps, serviettes, bottes
Wifi : MaisonInvites / motdepasse
Clés chez le voisin : 06 12 34 56 78`;

const pick = ({ address, map_url, practical_info }: Stay) => ({ address, map_url, practical_info });

/** Organisateur : adresse, lien Google Maps et consignes pratiques du séjour. */
export default function PlaceCard() {
  const { snap, call } = useStay();
  const [form, setForm] = useState(() => pick(snap.stay));
  useEffect(() => setForm(pick(snap.stay)), [snap.stay]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (await call("PATCH", "/stay", form, { admin: true })) toast("Infos pratiques enregistrées 📍");
  }

  return (
    <section className="card">
      <h2>📍 Lieu et infos pratiques</h2>
      <p className="hint">
        ⚠️ Visible par toute personne qui ouvre l'application. N'y mettez pas un code que vous ne donneriez pas à un inconnu.
      </p>
      <form className="form" onSubmit={save}>
        <label>
          Adresse
          <input
            value={form.address}
            maxLength={300}
            placeholder="12 chemin des Vignes, 26110 Nyons"
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </label>
        <label>
          Lien Google Maps
          <input
            type="url"
            value={form.map_url}
            maxLength={500}
            placeholder="https://maps.app.goo.gl/…"
            onChange={(e) => setForm({ ...form, map_url: e.target.value })}
          />
          <span className="hint">Facultatif : collez le lien d'un point précis si Maps place mal l'adresse.</span>
        </label>
        <label>
          Infos pratiques
          <textarea
            value={form.practical_info}
            rows={8}
            maxLength={MAX_PRACTICAL_INFO}
            placeholder={EXAMPLE}
            onChange={(e) => setForm({ ...form, practical_info: e.target.value })}
          />
          <span className="hint">
            Les liens et les numéros de téléphone deviennent cliquables. {form.practical_info.length} / {MAX_PRACTICAL_INFO}
          </span>
        </label>
        <button className="btn btn-primary">Enregistrer</button>
      </form>
    </section>
  );
}
