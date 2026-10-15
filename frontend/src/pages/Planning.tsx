import type { Activity } from "../api";
import { OfflineLock } from "../components/Pwa";
import { MovementItem } from "../components/Times";
import { Chip, Empty, Toggle } from "../components/ui";
import { dayLabel, dayTimeline } from "../lib";
import { useStay } from "../stay";

/** Planning jour par jour : activités, arrivées et départs, dans l'ordre des heures. */
export default function Planning() {
  const { snap, idx } = useStay();
  const movements = idx.movements();

  if (snap.activities.length === 0 && movements.length === 0) return <Empty>Aucune activité prévue pour l'instant.</Empty>;

  return (
    <div className="stack">
      <h1 className="page-title">Activités</h1>
      {snap.days.map((day) => {
        const items = dayTimeline(
          snap.activities.filter((a) => a.date === day),
          movements.filter((m) => m.day === day),
        );
        if (items.length === 0) return null;
        return (
          <section key={day} className="card">
            <h2>{dayLabel(day, true)}</h2>
            <ul className="timeline">
              {items.map((item) =>
                item.movement ? (
                  <MovementItem key={`${item.movement.kind}${item.movement.time}`} movement={item.movement} />
                ) : (
                  <ActivityItem key={item.activity.id} activity={item.activity} />
                ),
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ActivityItem({ activity: a }: { activity: Activity }) {
  const { idx, me, call } = useStay();
  const household = idx.household(me);
  const participants = idx.activityParticipants(a);
  return (
    <li className="timeline-item">
      <div className="timeline-time">
        {a.start_time || "—"}
        {a.end_time && <span className="muted"> → {a.end_time}</span>}
      </div>
      <div className="timeline-body">
        <div className="timeline-title">
          <strong>{a.name}</strong>
        </div>
        {a.location && <div className="muted small">📍 {a.location}</div>}
        {a.description && <p className="small pre">{a.description}</p>}
        {household.length > 0 && (
          <OfflineLock>
            <div className="toggles">
              {household.map((p) => (
                <Toggle
                  key={p.id}
                  label={
                    <>
                      {p.name}
                      {!idx.isPresentOnDay(p.id, a.date) && <span className="muted small"> · absent ce jour-là</span>}
                    </>
                  }
                  checked={idx.signups.has(`${a.id}|${p.id}`)}
                  onChange={(v) => void call(v ? "PUT" : "DELETE", `/activities/${a.id}/signups/${p.id}`)}
                />
              ))}
            </div>
          </OfflineLock>
        )}
        <details className="small">
          <summary>
            {participants.length} inscrit{participants.length > 1 ? "s" : ""}
          </summary>
          <div className="chips">
            {participants.map((p) => (
              <Chip key={p.id} person={p} highlight={p.id === me?.id} />
            ))}
          </div>
        </details>
      </div>
    </li>
  );
}
