import { useEffect, useRef, useState } from "react";
import type { Person } from "../api";
import { sameSets, slotsOf, toSlots } from "../lib";
import { useStay } from "../stay";
import PresenceGrid from "./PresenceGrid";
import { Toggle } from "./ui";

/**
 * Présences de tout un foyer. Par défaut « tout le foyer pareil » : une seule grille, mes
 * présences valent pour chacun. On décoche pour décaler quelqu'un (arrivée plus tard…).
 */
export default function HouseholdPresences({ me }: { me: Person }) {
  const { snap, idx, call } = useStay();
  const members = idx.household(me);
  const fromServer = () => new Map(members.map((p) => [p.id, slotsOf(snap, p.id)]));
  const [state, setState] = useState(fromServer);
  const [together, setTogether] = useState(() => sameSets([...fromServer().values()]));
  const memberIds = members.map((p) => p.id).join(",");
  // Enregistrements en file : chaque envoi remplace toutes les présences du foyer, deux envois en
  // parallèle pourraient arriver dans le désordre et l'ancien écraserait le récent. Un seul envoi à
  // la fois, toujours avec le dernier état connu.
  const queue = useRef<{ running: boolean; next: Map<number, Set<string>> | null }>({ running: false, next: null });

  // Resynchronise si les données changent ailleurs (autre membre du foyer, autre appareil), sauf
  // pendant nos propres enregistrements.
  useEffect(() => {
    if (!queue.current.running) setState(fromServer());
  }, [snap.presences, memberIds]);

  async function flush() {
    const q = queue.current;
    if (q.running) return;
    q.running = true;
    while (q.next) {
      const next = q.next;
      q.next = null;
      await call("PUT", `/households/${me.household_id}/presences`, {
        members: [...next].map(([person_id, keys]) => ({ person_id, slots: toSlots(snap, keys) })),
      });
    }
    q.running = false;
  }

  function save(next: Map<number, Set<string>>) {
    setState(next);
    queue.current.next = next;
    void flush();
  }

  const mine = state.get(me.id) ?? new Set<string>();
  const everyone = (keys: Set<string>) => new Map(members.map((p) => [p.id, new Set(keys)]));

  function setMode(on: boolean) {
    if (on && !sameSets([...state.values()])) {
      const others = members.filter((p) => p.id !== me.id).map((p) => p.name).join(", ");
      if (!confirm(`Copier les présences de ${me.name} à ${others} ?`)) return;
      save(everyone(mine));
    }
    setTogether(on);
  }

  if (members.length === 1) {
    return <PresenceGrid selected={mine} onChange={(keys) => save(new Map([[me.id, keys]]))} />;
  }

  return (
    <div className="stack-sm">
      <Toggle label="Tout le foyer a les mêmes présences" checked={together} onChange={setMode} />
      {together ? (
        <>
          <p className="hint">Pour {members.map((p) => p.name).join(", ")}.</p>
          <PresenceGrid selected={mine} onChange={(keys) => save(everyone(keys))} />
        </>
      ) : (
        members.map((p) => (
          <details key={p.id} className="person-block" open={p.id === me.id}>
            <summary>
              <strong>{p.name}</strong>
              {p.kind === "child" && <span className="badge">enfant</span>}
              <span className="muted small"> · {state.get(p.id)?.size ?? 0} repas</span>
            </summary>
            <PresenceGrid
              selected={state.get(p.id) ?? new Set()}
              onChange={(keys) => save(new Map(state).set(p.id, keys))}
            />
          </details>
        ))
      )}
    </div>
  );
}
