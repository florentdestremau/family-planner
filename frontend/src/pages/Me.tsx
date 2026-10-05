import { useState } from "react";
import { Link } from "react-router";
import type { Person } from "../api";
import PresenceEditor from "../components/PresenceEditor";
import { Chip, Empty, Toggle } from "../components/ui";
import { BED_LABEL, dayLabel, MOMENT_LABEL, sortedMoments } from "../lib";
import { useStay } from "../stay";
import WhoAmI from "./WhoAmI";

export default function Me() {
  const { me } = useStay();
  if (!me) return <WhoAmI />;
  return <Dashboard me={me} />;
}

function Dashboard({ me }: { me: Person }) {
  const { snap, idx, slug, call, setMe } = useStay();
  const household = idx.household(me);
  const householdIds = new Set(household.map((p) => p.id));
  const [childName, setChildName] = useState("");

  const myChores = snap.chore_assignments.filter((a) => householdIds.has(a.person_id)).sort(sortedMoments);
  const optional = snap.activities.filter((a) => a.optional);

  async function addChild(e: React.FormEvent) {
    e.preventDefault();
    await call("POST", "/persons", { name: childName.trim(), kind: "child", guardian_id: me.id });
    setChildName("");
  }

  return (
    <div className="stack">
      <h1 className="page-title">Bonjour {me.name} 👋</h1>

      <section className="card">
        <div className="card-head">
          <h2>Présences</h2>
          <span className="muted small">Présent sur place = présent au repas</span>
        </div>
        {household.map((p) => (
          <details key={p.id} className="person-block" open={p.id === me.id}>
            <summary>
              <strong>{p.name}</strong>
              {p.kind === "child" && <span className="badge">enfant</span>}
            </summary>
            <PresenceEditor person={p} />
          </details>
        ))}
        <form onSubmit={addChild} className="inline-form">
          <input placeholder="Ajouter un enfant à ma charge" value={childName} onChange={(e) => setChildName(e.target.value)} required />
          <button className="btn">Ajouter</button>
        </form>
      </section>

      <section className="card">
        <h2>Corvées</h2>
        {myChores.length === 0 ? (
          <Empty>Aucune corvée pour l'instant{snap.chore_assignments.length === 0 ? " — le tirage n'a pas encore eu lieu" : ""}.</Empty>
        ) : (
          <ul className="list">
            {myChores.map((a, i) => {
              const team = idx.occurrences.get(`${a.chore_type_id}|${a.date}|${a.moment}`) ?? [];
              return (
                <li key={i} className="list-row">
                  <div>
                    <strong>{idx.choreById.get(a.chore_type_id)?.name}</strong>
                    <div className="muted small">
                      {dayLabel(a.date)} · {MOMENT_LABEL[a.moment]}
                      {household.length > 1 && ` · ${idx.name(a.person_id)}`}
                    </div>
                  </div>
                  <div className="chips">
                    {team
                      .filter((id) => id !== a.person_id)
                      .map((id) => (
                        <Chip key={id} person={idx.personById.get(id)} />
                      ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {optional.length > 0 && (
        <section className="card">
          <h2>Activités facultatives</h2>
          <ul className="list">
            {optional.map((a) => (
              <li key={a.id} className="list-row list-row-wrap">
                <div>
                  <strong>{a.name}</strong>
                  <div className="muted small">
                    {dayLabel(a.date)}
                    {a.start_time && ` · ${a.start_time}`}
                    {a.location && ` · ${a.location}`}
                  </div>
                </div>
                <div className="toggles">
                  {household
                    .filter((p) => p.does_activities)
                    .map((p) => {
                      const on = idx.signups.has(`${a.id}|${p.id}`);
                      return (
                        <Toggle
                          key={p.id}
                          label={p.name}
                          checked={on}
                          onChange={(v) => call(v ? "PUT" : "DELETE", `/activities/${a.id}/signups/${p.id}`)}
                        />
                      );
                    })}
                </div>
              </li>
            ))}
          </ul>
          <Link to={`/s/${slug}/planning`} className="small">
            Voir tout le planning →
          </Link>
        </section>
      )}

      <section className="card">
        <h2>Couchage</h2>
        <ul className="list">
          {household.map((p) => {
            const bed = p.bed_id != null ? idx.bedById.get(p.bed_id) : undefined;
            return (
              <li key={p.id} className="list-row">
                <strong>{p.name}</strong>
                <span className="muted">
                  {bed ? `${bed.room.name} — ${bed.label || BED_LABEL[bed.kind]}` : "Pas encore attribué"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <button className="btn btn-ghost" onClick={() => setMe(null)}>
        Je ne suis pas {me.name}
      </button>
    </div>
  );
}
