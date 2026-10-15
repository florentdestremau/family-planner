import { useEffect, useRef, useState } from "react";
import type { MemberTimes, Person } from "../api";
import {
  clockLabel,
  dayLabel,
  departureDay,
  hourLabel,
  isNightTime,
  MAX_TIMES_NOTE,
  MOVEMENT_LABEL,
  type Movement,
  oneLine,
  type StayRange,
  TIME_OPTIONS,
  timeLabel,
} from "../lib";
import { useStay } from "../stay";

type Times = Omit<MemberTimes, "person_id">;

/** La personne a-t-elle déjà donné une heure ou une note ? */
const given = (p: Person) => p.arrival_time !== "" || p.departure_time !== "" || p.times_note !== "";

const timesOf = (p: Person): Times => ({ arrival_time: p.arrival_time, departure_time: p.departure_time, times_note: p.times_note });

const sameTimes = (a: Times, b: Times) =>
  a.arrival_time === b.arrival_time && a.departure_time === b.departure_time && a.times_note === b.times_note;

/**
 * Enregistrement des heures d'un foyer, un envoi à la fois : chaque envoi remplace les heures des
 * personnes concernées, deux envois en parallèle pourraient arriver dans le désordre et l'ancien
 * écraserait le récent (heure de départ choisie juste après celle d'arrivée).
 */
export function useTimesSaver(householdId: number) {
  const { call } = useStay();
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  /** Résout à `true` une fois enregistré, `false` en cas d'échec (déjà signalé par un message). */
  return (members: MemberTimes[]): Promise<boolean> => {
    const done = queue.current.then(async () => (await call<Person[]>("PUT", `/households/${householdId}/times`, { members })) !== undefined);
    queue.current = done;
    return done;
  };
}

function TimeSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">Heure ?</option>
      {TIME_OPTIONS.map((t) => (
        <option key={t} value={t}>
          {hourLabel(t)}
          {isNightTime(t) ? " (nuit)" : ""}
        </option>
      ))}
    </select>
  );
}

/**
 * Heures d'une personne : arrivée, départ et note, enregistrées dès qu'on les change (la note en
 * quittant le champ). `onCopy` : bouton « Même heure pour tout le foyer ».
 */
export function TimesRow({
  person,
  range,
  onSave,
  onCopy,
}: {
  person: Person;
  range: StayRange;
  onSave: (times: Times) => Promise<boolean>;
  onCopy?: (times: Times) => void;
}) {
  const [times, setTimes] = useState(() => timesOf(person));
  // Resynchronise ce qui a changé ailleurs (autre adulte du foyer, organisateur, copie), champ par
  // champ : la note en cours de saisie n'est pas effacée par l'enregistrement d'une heure.
  const saved = useRef(timesOf(person));
  useEffect(() => {
    const before = saved.current;
    const after = { arrival_time: person.arrival_time, departure_time: person.departure_time, times_note: person.times_note };
    saved.current = after;
    setTimes((current) => ({
      arrival_time: after.arrival_time === before.arrival_time ? current.arrival_time : after.arrival_time,
      departure_time: after.departure_time === before.departure_time ? current.departure_time : after.departure_time,
      times_note: after.times_note === before.times_note ? current.times_note : after.times_note,
    }));
  }, [person.arrival_time, person.departure_time, person.times_note]);

  const change = async (next: Times) => {
    setTimes(next);
    // Échec : on revient à ce que le serveur a vraiment, plutôt que d'afficher une heure perdue.
    if (!(await onSave(next))) setTimes(saved.current);
  };
  const note = oneLine(times.times_note);

  return (
    <div className="times-row" role="group" aria-label={`Heures de ${person.name}`}>
      <strong className="times-name">{person.name}</strong>
      <label className="times-field">
        <span className="muted small">Arrivée · {dayLabel(range.arrival)}</span>
        <TimeSelect label={`Heure d'arrivée de ${person.name}`} value={times.arrival_time} onChange={(v) => void change({ ...times, arrival_time: v })} />
      </label>
      <label className="times-field">
        <span className="muted small">Départ · {dayLabel(departureDay(range, times.departure_time))}</span>
        <TimeSelect
          label={`Heure de départ de ${person.name}`}
          value={times.departure_time}
          onChange={(v) => void change({ ...times, departure_time: v })}
        />
      </label>
      <input
        className="times-note"
        value={times.times_note}
        maxLength={MAX_TIMES_NOTE}
        onChange={(e) => setTimes({ ...times, times_note: e.target.value })}
        onBlur={() => {
          if (note !== person.times_note) void change({ ...times, times_note: note });
        }}
        placeholder="Note (facultatif) : nous aurons déjà dîné, laissez la porte ouverte…"
        aria-label={`Note d'arrivée et de départ de ${person.name}`}
      />
      {onCopy && (
        <button type="button" className="btn btn-small times-copy" onClick={() => onCopy({ ...times, times_note: note })}>
          Même heure pour tout le foyer
        </button>
      )}
    </div>
  );
}

/** Heures d'arrivée et de départ du foyer, sous la grille des présences de « Moi ». */
export function HouseholdTimes({ me }: { me: Person }) {
  const { idx } = useStay();
  const save = useTimesSaver(me.household_id);
  // Sans présence, pas de jour d'arrivée : pas d'heure possible.
  const present = idx.household(me).flatMap((person) => {
    const range = idx.stayRange(person.id);
    return range ? [{ person, range }] : [];
  });
  if (present.length === 0) return null;
  const missing = present.some(({ person }) => !person.arrival_time || !person.departure_time);

  const copy = (from: Person, times: Times) => {
    const others = present.filter(({ person }) => person.id !== from.id).map(({ person }) => person);
    const overwritten = others.filter((p) => given(p) && !sameTimes(timesOf(p), times));
    if (overwritten.length > 0 && !confirm(`Recopier les heures de ${from.name} à ${overwritten.map((p) => p.name).join(", ")} ?`)) return;
    void save(present.map(({ person }) => ({ person_id: person.id, ...times })));
  };

  return (
    <div className="times">
      <h3>🕒 Arrivée et départ</h3>
      {missing && (
        <p className="hint times-invite">
          À quelle heure arrivez-vous ? Indiquez vers quelle heure chacun arrive et repart, pour qu'on sache quand vous attendre.
        </p>
      )}
      {present.map(({ person, range }) => (
        <TimesRow
          key={person.id}
          person={person}
          range={range}
          onSave={(times) => save([{ person_id: person.id, ...times }])}
          onCopy={present.length > 1 ? (times) => copy(person, times) : undefined}
        />
      ))}
    </div>
  );
}

/** Une arrivée ou un départ dans le planning, avec ses notes dépliables. */
export function MovementItem({ movement: m }: { movement: Movement }) {
  return (
    <li className={`timeline-item timeline-move timeline-${m.kind}`}>
      <div className="timeline-time">
        {m.time ? (
          <>
            <span className="muted">vers</span>
            {m.time}
            {isNightTime(m.time) && <span className="muted">dans la nuit</span>}
          </>
        ) : (
          "—"
        )}
      </div>
      <div className="timeline-body">
        <div className="timeline-title">
          <strong>
            {m.kind === "arrival" ? "🏡" : "👋"} {MOVEMENT_LABEL[m.kind]}
          </strong>{" "}
          · {m.persons.map((p) => p.name).join(", ")}
        </div>
        {!m.time && <div className="muted small">Heure non donnée</div>}
        {m.updatedAt !== null && <div className="small times-updated">Mis à jour à {clockLabel(m.updatedAt)}</div>}
        {m.notes.length > 0 && (
          <details className="small">
            <summary>
              📝 {m.notes.length} note{m.notes.length > 1 ? "s" : ""}
            </summary>
            <ul className="diet-list">
              {m.notes.map((n) => (
                <li key={n.text}>
                  <strong>{n.persons.map((p) => p.name).join(", ")}</strong> : {n.text}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </li>
  );
}

/** Section « Arrivées et départs » de la fiche imprimée des présences : tout est déplié. */
export function MovementsPrint() {
  const { idx } = useStay();
  const movements = idx.movements();
  if (movements.length === 0) return null;
  const days = [...new Set(movements.map((m) => m.day))];
  return (
    <section className="print-block print-moves">
      <h2>Arrivées et départs</h2>
      {days.map((day) => (
        <div key={day}>
          <h3>{dayLabel(day, true)}</h3>
          <ul className="compact">
            {movements
              .filter((m) => m.day === day)
              .map((m) => (
                <li key={`${m.kind}${m.time}`}>
                  <strong>{m.time ? timeLabel(m.time) : "Heure non donnée"}</strong> — {MOVEMENT_LABEL[m.kind]} : {m.persons.map((p) => p.name).join(", ")}
                  {m.notes.map((n) => (
                    <div key={n.text} className="small muted">
                      📝 {n.persons.map((p) => p.name).join(", ")} : {n.text}
                    </div>
                  ))}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
