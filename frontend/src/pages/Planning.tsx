import { Chip, Empty, Toggle } from "../components/ui";
import { dayLabel } from "../lib";
import { useStay } from "../stay";

export default function Planning() {
  const { snap, idx, me, call } = useStay();
  const household = idx.household(me).filter((p) => p.does_activities);

  if (!snap.activities.length) return <Empty>Aucune activité prévue pour l'instant.</Empty>;

  return (
    <div className="stack">
      <h1 className="page-title">Activités</h1>
      {snap.days.map((day) => {
        const activities = snap.activities.filter((a) => a.date === day);
        if (!activities.length) return null;
        return (
          <section key={day} className="card">
            <h2>{dayLabel(day, true)}</h2>
            <ul className="timeline">
              {activities.map((a) => {
                const participants = idx.activityParticipants(a);
                return (
                  <li key={a.id} className="timeline-item">
                    <div className="timeline-time">
                      {a.start_time || "—"}
                      {a.end_time && <span className="muted"> → {a.end_time}</span>}
                    </div>
                    <div className="timeline-body">
                      <div className="timeline-title">
                        <strong>{a.name}</strong>
                        {a.optional ? <span className="badge badge-accent">facultatif</span> : <span className="badge">tout le monde</span>}
                      </div>
                      {a.location && <div className="muted small">📍 {a.location}</div>}
                      {a.description && <p className="small pre">{a.description}</p>}
                      {a.optional && household.length > 0 && (
                        <div className="toggles">
                          {household.map((p) => (
                            <Toggle
                              key={p.id}
                              label={p.name}
                              checked={idx.signups.has(`${a.id}|${p.id}`)}
                              onChange={(v) => call(v ? "PUT" : "DELETE", `/activities/${a.id}/signups/${p.id}`)}
                            />
                          ))}
                        </div>
                      )}
                      <details className="small">
                        <summary>{participants.length} participant{participants.length > 1 ? "s" : ""}</summary>
                        <div className="chips">
                          {participants.map((p) => (
                            <Chip key={p.id} person={p} highlight={p.id === me?.id} />
                          ))}
                        </div>
                      </details>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
