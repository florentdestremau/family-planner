import { useState } from "react";
import type { ChoreType, Moment, Snapshot } from "../../api";
import { AddPersonSelect, Chip, Empty } from "../../components/ui";
import { dayLabel, type Index, MOMENT_LABEL, MOMENTS, sortedMoments } from "../../lib";
import { useStay } from "../../stay";
import { toast } from "../../toast";

interface Occ {
  chore: ChoreType;
  date: string;
  moment: Moment;
  people: number[];
}

/** Occurrences attendues (même règle que le tirage côté serveur) + celles déjà affectées. */
function computeOccurrences(snap: Snapshot, idx: Index): Occ[] {
  const result = new Map<string, Occ>();
  snap.chore_types.forEach((chore) => {
    snap.days.forEach((date, i) => {
      if (i % chore.every_n_days) return;
      for (const moment of chore.moments) {
        const anyone =
          moment === "day"
            ? snap.presences.some((p) => p.date === date)
            : idx.hasSlot(date, moment) && snap.presences.some((p) => p.date === date && p.meal === moment);
        if (anyone) result.set(`${chore.id}|${date}|${moment}`, { chore, date, moment, people: [] });
      }
    });
  });
  for (const [key, people] of idx.occurrences) {
    const [choreId, date, moment] = key.split("|");
    const chore = idx.choreById.get(Number(choreId));
    if (chore) result.set(key, { chore, date, moment: moment as Moment, people });
  }
  return [...result.values()].sort((a, b) => sortedMoments(a, b) || a.chore.id - b.chore.id);
}

export default function AdminChores() {
  const { snap, idx, call } = useStay();
  const occurrences = computeOccurrences(snap, idx);
  const unfilled = occurrences.reduce((n, o) => n + Math.max(0, o.chore.people_needed - o.people.length), 0);
  const workers = snap.persons.filter((p) => p.does_chores);
  const load = new Map(workers.map((p) => [p.id, 0]));
  snap.chore_assignments.forEach((a) => load.set(a.person_id, (load.get(a.person_id) ?? 0) + 1));

  async function drawLots() {
    if (snap.chore_assignments.length && !confirm("Re-répartir efface toutes les affectations actuelles, y compris les ajustements manuels. Continuer ?"))
      return;
    const r = await call<{ occurrences: number; assigned: number; unfilled: number }>("POST", "/chores/draw", undefined, { admin: true });
    if (r) toast(`${r.assigned} affectations sur ${r.occurrences} créneaux${r.unfilled ? ` — ${r.unfilled} place(s) non pourvue(s)` : ""}`);
  }

  return (
    <div className="stack">
      <ChoreTypes />

      <section className="card">
        <div className="card-head">
          <h2>Tirage au sort</h2>
          <button className="btn btn-primary" onClick={drawLots} disabled={!snap.presences.length}>
            🎲 {snap.chore_assignments.length ? "Re-répartir" : "Tirer au sort"}
          </button>
        </div>
        <p className="hint">
          Seules les personnes « Corvées » présentes au créneau sont tirées. Charge équilibrée selon le temps de présence
          {snap.stay.separate_couples ? ", couples séparés" : ""}. Ajustez ensuite chaque créneau à la main.
        </p>
        {!snap.presences.length && <p className="warn small">Personne n'a encore déclaré sa présence.</p>}
        {unfilled > 0 && snap.chore_assignments.length > 0 && <p className="warn small">{unfilled} place(s) non pourvue(s).</p>}
        {snap.chore_assignments.length > 0 && (
          <div className="chips load">
            {workers
              .sort((a, b) => (load.get(b.id) ?? 0) - (load.get(a.id) ?? 0))
              .map((p) => (
                <span key={p.id} className="chip">
                  {p.name} <strong>{load.get(p.id)}</strong>
                </span>
              ))}
          </div>
        )}
      </section>

      {occurrences.length === 0 ? (
        <Empty>Aucune corvée à répartir : définissez des corvées et attendez les présences.</Empty>
      ) : (
        snap.days.map((day) => {
          const dayOccs = occurrences.filter((o) => o.date === day);
          if (!dayOccs.length) return null;
          return (
            <section key={day} className="card">
              <h2>{dayLabel(day, true)}</h2>
              <ul className="list">
                {dayOccs.map((o) => (
                  <OccurrenceRow key={`${o.chore.id}${o.moment}`} occ={o} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function OccurrenceRow({ occ }: { occ: Occ }) {
  const { snap, idx, call } = useStay();
  const set = (personIds: number[]) =>
    call("PUT", "/chores/occurrence", { chore_type_id: occ.chore.id, date: occ.date, moment: occ.moment, person_ids: personIds }, { admin: true });
  const present = (pid: number) => (occ.moment === "day" ? idx.isPresentOnDay(pid, occ.date) : idx.isPresent(pid, occ.date, occ.moment));
  const load = (pid: number) => snap.chore_assignments.filter((a) => a.person_id === pid).length;
  const conflict = (pid: number) => occ.people.includes(idx.personById.get(pid)?.partner_id ?? -1);
  // Les mieux placés d'abord : pas de conjoint déjà sur ce créneau, puis les moins chargés.
  const candidates = snap.persons
    .filter((p) => !occ.people.includes(p.id) && present(p.id) && p.does_chores)
    .sort((a, b) => Number(conflict(a.id)) - Number(conflict(b.id)) || load(a.id) - load(b.id) || a.name.localeCompare(b.name));
  const missing = occ.chore.people_needed - occ.people.length;
  const partners = occ.people.some((id) => occ.people.includes(idx.personById.get(id)?.partner_id ?? -1));

  return (
    <li className="list-row list-row-wrap">
      <div>
        <strong>{occ.chore.name}</strong> <span className="muted small">{MOMENT_LABEL[occ.moment]}</span>
        {missing > 0 && <span className="badge badge-warn">{missing} manquant{missing > 1 ? "s" : ""}</span>}
        {partners && <span className="badge badge-warn">couple</span>}
      </div>
      <div className="chips">
        {occ.people.map((id) => (
          <Chip key={id} person={idx.personById.get(id)} onRemove={() => set(occ.people.filter((x) => x !== id))} />
        ))}
        <AddPersonSelect
          people={candidates}
          onPick={(id) => set([...occ.people, id])}
          hint={(p) => `${load(p.id)} corvée${load(p.id) > 1 ? "s" : ""}${conflict(p.id) ? " · ♥ en couple avec un inscrit" : ""}`}
        />
      </div>
    </li>
  );
}

function ChoreTypes() {
  const { snap, call } = useStay();
  const empty = { name: "", moments: ["dinner"] as Moment[], people_needed: 2, every_n_days: 1 };
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState(empty);

  const start = (chore?: ChoreType) => {
    setEditing(chore ? chore.id : "new");
    setForm(chore ? { name: chore.name, moments: chore.moments, people_needed: chore.people_needed, every_n_days: chore.every_n_days } : empty);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const ok =
      editing === "new"
        ? await call("POST", "/chore-types", form, { admin: true })
        : await call("PATCH", `/chore-types/${editing}`, form, { admin: true });
    if (ok) setEditing(null);
  }

  const toggleMoment = (m: Moment) =>
    setForm({ ...form, moments: form.moments.includes(m) ? form.moments.filter((x) => x !== m) : [...form.moments, m] });

  const rhythm = (c: { every_n_days: number }) => (c.every_n_days === 1 ? "tous les jours" : `tous les ${c.every_n_days} jours`);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Types de corvées</h2>
        {editing === null && (
          <button className="btn btn-small" onClick={() => start()}>
            + Corvée
          </button>
        )}
      </div>
      {editing !== null && (
        <form className="form chore-form" onSubmit={save}>
          <label>
            Nom
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Vaisselle" />
          </label>
          <fieldset>
            <legend>Moments</legend>
            <div className="checks">
              {MOMENTS.map((m) => (
                <label key={m} className="check">
                  <input type="checkbox" checked={form.moments.includes(m)} onChange={() => toggleMoment(m)} />
                  {MOMENT_LABEL[m]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="row2">
            <label>
              Personnes par créneau
              <input type="number" min={1} max={20} value={form.people_needed} onChange={(e) => setForm({ ...form, people_needed: Number(e.target.value) })} />
            </label>
            <label>
              Tous les … jours
              <input type="number" min={1} max={30} value={form.every_n_days} onChange={(e) => setForm({ ...form, every_n_days: Number(e.target.value) })} />
            </label>
          </div>
          <div className="actions">
            <button className="btn btn-primary" disabled={!form.moments.length}>
              Enregistrer
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
              Annuler
            </button>
          </div>
        </form>
      )}
      <ul className="list">
        {snap.chore_types.map((c) => (
          <li key={c.id} className="list-row">
            <div>
              <strong>{c.name}</strong>
              <div className="muted small">
                {c.moments.map((m) => MOMENT_LABEL[m]).join(", ")} · {c.people_needed} pers. · {rhythm(c)}
              </div>
            </div>
            <div className="actions">
              <button className="btn btn-small btn-ghost" onClick={() => start(c)}>
                Modifier
              </button>
              <button
                className="btn btn-small btn-danger"
                onClick={() => confirm(`Supprimer « ${c.name} » et ses affectations ?`) && call("DELETE", `/chore-types/${c.id}`, undefined, { admin: true })}
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
