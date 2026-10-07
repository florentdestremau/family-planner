import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, apiUpload, coverUrl, type Meal, type Stay } from "../../api";
import { CopyButton, Toggle } from "../../components/ui";
import { MEALS, MOMENT_LABEL } from "../../lib";
import { useStay } from "../../stay";
import { toast } from "../../toast";

export default function AdminStay() {
  const { slug, snap, adminKey, call } = useStay();
  const [form, setForm] = useState(snap.stay);
  useEffect(() => setForm(snap.stay), [snap.stay]);

  const origin = window.location.origin;
  const publicLink = `${origin}/s/${slug}`;
  const adminLink = `${origin}/s/${slug}/admin?key=${adminKey}`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { name, start_date, end_date, first_meal, last_meal } = form;
    const shrinking = start_date > snap.stay.start_date || end_date < snap.stay.end_date;
    if (shrinking && !confirm("Les présences, menus et corvées hors de la nouvelle période seront supprimés. Continuer ?")) return;
    if (await call("PATCH", "/stay", { name, start_date, end_date, first_meal, last_meal }, { admin: true })) toast("Séjour enregistré");
  }

  const stats = {
    households: snap.households.length,
    adults: snap.persons.filter((p) => p.kind === "adult").length,
    children: snap.persons.filter((p) => p.kind === "child").length,
    noPresence: snap.persons.filter((p) => !snap.presences.some((pr) => pr.person_id === p.id)).length,
  };

  return (
    <div className="stack">
      <section className="card">
        <h2>Liens de partage</h2>
        <div className="share">
          <div>
            <div className="small muted">Lien famille — à envoyer à tout le monde</div>
            <code>{publicLink}</code>
          </div>
          <CopyButton text={publicLink} />
        </div>
        <div className="share">
          <div>
            <div className="small muted">Lien organisateur — à ne partager qu'avec les co-organisateurs</div>
            <code className="secret">{adminLink}</code>
          </div>
          <CopyButton text={adminLink} />
        </div>
      </section>

      <CoverImageSection slug={slug} stay={snap.stay} adminKey={adminKey} />

      <section className="card">
        <h2>En bref</h2>
        <div className="stats">
          <div>
            <strong>{stats.households}</strong>
            <span>foyers</span>
          </div>
          <div>
            <strong>{stats.adults}</strong>
            <span>adultes</span>
          </div>
          <div>
            <strong>{stats.children}</strong>
            <span>enfants</span>
          </div>
          <div className={stats.noPresence ? "warn" : ""}>
            <strong>{stats.noPresence}</strong>
            <span>sans présence</span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Dates du séjour</h2>
        <form className="form" onSubmit={save}>
          <label>
            Nom
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <div className="row2">
            <label>
              Arrivée
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
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
              <input type="date" value={form.end_date} min={form.start_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required />
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
          <button className="btn btn-primary">Enregistrer</button>
        </form>
      </section>

      <section className="card">
        <h2>Règles des corvées</h2>
        <Toggle
          label="Séparer les couples (jamais sur la même corvée)"
          checked={snap.stay.separate_couples}
          onChange={(v) => call("PATCH", "/stay", { separate_couples: v }, { admin: true })}
        />
      </section>
    </div>
  );
}

function CoverImageSection({ slug, stay, adminKey }: { slug: string; stay: Stay; adminKey: string | null }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const url = coverUrl(slug, stay.cover_image);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["stay", slug] });
  }

  async function upload(file: File) {
    setBusy(true);
    try {
      await apiUpload<Stay>("POST", `/stays/${slug}/admin/stay/cover`, file, adminKey);
      toast("Image de couverture enregistrée");
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erreur lors de l'upload", "error");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!confirm("Supprimer l'image de couverture ?")) return;
    setBusy(true);
    try {
      await api<Stay>("DELETE", `/stays/${slug}/admin/stay/cover`, undefined, adminKey);
      toast("Image de couverture supprimée");
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erreur lors de la suppression", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>🖼️ Image de couverture</h2>
      {url && (
        <div className="cover-preview">
          <img src={url} alt={`Couverture — ${stay.name}`} />
        </div>
      )}
      <div className="cover-actions">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
          className="cover-input"
          id="cover-upload"
        />
        <label htmlFor="cover-upload" className={`btn ${busy ? "btn-disabled" : ""}`}>
          {busy ? "Envoi…" : url ? "Changer l'image" : "Ajouter une image"}
        </label>
        {url && (
          <button className="btn btn-danger" disabled={busy} onClick={remove}>
            Supprimer
          </button>
        )}
      </div>
      <p className="hint">JPEG, PNG, GIF ou WebP — 5 Mo maximum. Affichée sur la page d'accueil et en haut du séjour.</p>
    </section>
  );
}
