import { useEffect, useState } from "react";
import type { Person, PersonKind } from "../../api";
import AddMember from "../../components/AddMember";
import { DietEditor } from "../../components/Diets";
import HouseholdOrder from "../../components/HouseholdOrder";
import { TimesRow, useTimesSaver } from "../../components/Times";
import { Toggle, usePending } from "../../components/ui";
import { dietLabel, duplicateGroups, hasDiet, homonym, oneOf, PERSON_KINDS, timesSummary } from "../../lib";
import { useStay } from "../../stay";
import { toast } from "../../toast";

export default function AdminHouseholds() {
  const { idx, snap } = useStay();
  const households = idx.households();
  const withoutTimes = idx.withoutTimes();
  return (
    <div className="stack">
      <NewPerson />
      <Duplicates />
      <p className="muted small">
        {households.length} foyer{households.length > 1 ? "s" : ""} · {snap.persons.length} personne{snap.persons.length > 1 ? "s" : ""}
      </p>
      {withoutTimes.length > 0 && (
        <p className="small times-missing">
          🕒 <strong>Sans heure d'arrivée ou de départ :</strong> {withoutTimes.map((p) => p.name).join(", ")}
        </p>
      )}
      <HouseholdOrder />
      <div className="household-grid">
        {households.map((h) => (
          <HouseholdCard key={h.id} id={h.id} members={h.members} />
        ))}
      </div>
    </div>
  );
}

/** Ajout d'une personne : par défaut dans un nouveau foyer (un célibataire en un geste). */
function NewPerson() {
  const { snap, idx, call } = useStay();
  const [form, setForm] = useState({ name: "", kind: "adult" as PersonKind, household: "" });
  const [pending, once] = usePending();

  async function add(e: React.SubmitEvent) {
    e.preventDefault();
    const name = form.name.trim();
    const householdId = form.household ? Number(form.household) : null;
    const same = homonym(snap.persons, name, householdId);
    if (same?.sameHousehold) {
      toast(`${same.person.name} fait déjà partie de ce foyer`, "error");
      return;
    }
    const where = same && `« ${same.person.name} » est déjà dans le séjour (foyer ${idx.householdLabel(same.person.household_id)}).`;
    if (where && !confirm(`${where}\n\nAjouter quand même une autre personne nommée ${name} ?`)) return;
    const body = { name, kind: form.kind, household_id: householdId, allow_same_name: same !== undefined };
    await once(async () => {
      if ((await call("POST", "/persons", body, { admin: true })) !== undefined) setForm({ ...form, name: "" });
    });
  }

  return (
    <section className="card">
      <h2>Ajouter une personne</h2>
      <form className="inline-form wrap" onSubmit={(e) => void add(e)}>
        <input placeholder="Prénom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: oneOf(PERSON_KINDS, e.target.value) })} aria-label="Adulte ou enfant">
          <option value="adult">Adulte</option>
          <option value="child">Enfant</option>
        </select>
        <select value={form.household} onChange={(e) => setForm({ ...form, household: e.target.value })} aria-label="Foyer">
          <option value="">Nouveau foyer</option>
          {idx.households().map((h) => (
            <option key={h.id} value={h.id}>
              Foyer {h.label}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          Ajouter
        </button>
      </form>
      <p className="hint">Pour ajouter un conjoint ou un enfant, utilisez plutôt « Ajouter au foyer » sur la carte du foyer.</p>
    </section>
  );
}

/** « Florent · foyer Carole & Florent · 23 repas, 8 nuits » : de quoi reconnaître le bon. */
function useDescribe() {
  const { snap, idx } = useStay();
  const meals = (id: number) => snap.presences.filter((x) => x.person_id === id).length;
  const weight = (p: Person) => meals(p.id) + idx.nightsOf(p.id).length;
  const describe = (p: Person) => {
    const n = meals(p.id);
    const nights = idx.nightsOf(p.id).length;
    const filled = n + nights === 0 ? "aucune présence" : `${n} repas, ${nights} nuit${nights > 1 ? "s" : ""}`;
    return `${p.name} · foyer ${idx.householdLabel(p.household_id)} · ${filled}`;
  };
  return { weight, describe };
}

/** Confirmation, puis fusion du doublon dans la personne gardée (ce qu'il avait en plus est gardé). */
function useMergeDuplicate() {
  const { call } = useStay();
  const { describe } = useDescribe();
  return (dup: Person, keep: Person) => {
    const question =
      `Retirer le doublon ${describe(dup)} ?\n\nIl est fusionné dans ${describe(keep)} : ` +
      "ses repas, nuits, inscriptions et corvées en plus sont gardés ; ses régimes et heures, s'il en manque.";
    if (confirm(question)) void call("POST", `/persons/${dup.id}/merge`, { into_id: keep.id }, { admin: true });
  };
}

/** Personnes de même prénom : le plus souvent ajoutées deux fois (formulaire envoyé deux fois, ou soi-même ajouté à son foyer). */
function Duplicates() {
  const { snap } = useStay();
  const { weight, describe } = useDescribe();
  const merge = useMergeDuplicate();
  const groups = duplicateGroups(snap.persons, weight);
  if (groups.length === 0) return null;
  return (
    <section className="card duplicates">
      <h2>👯 Doublons possibles</h2>
      <p className="hint">
        Même prénom, plusieurs fois. Si c'est la même personne, retirez le doublon : on garde la plus renseignée, et ce que le doublon avait en
        plus lui est rattaché. Un vrai homonyme ? Précisez son prénom (« Florent D. »).
      </p>
      {groups.map(([keep, ...dups]) => (
        <ul key={keep.id} className="duplicate-group">
          <li>
            <strong>{describe(keep)}</strong> <span className="muted small">— gardé</span>
          </li>
          {dups.map((dup) => (
            <li key={dup.id}>
              {describe(dup)}{" "}
              <button type="button" className="btn btn-small btn-danger" onClick={() => merge(dup, keep)} aria-label={`Retirer le doublon ${describe(dup)}`}>
                Retirer ce doublon
              </button>
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}

function HouseholdCard({ id, members }: { id: number; members: Person[] }) {
  const { idx, call } = useStay();
  const household = idx.householdById.get(id);
  const [name, setName] = useState(household?.name ?? "");
  useEffect(() => setName(household?.name ?? ""), [household?.name]);
  const label = idx.householdLabel(id);
  const others = idx.households().filter((h) => h.id !== id);

  return (
    <section className="card household-card">
      <div className="card-head">
        <input
          className="input-title"
          value={name}
          placeholder={label}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() !== (household?.name ?? "")) void call("PATCH", `/households/${id}`, { name: name.trim() });
          }}
          aria-label="Nom du foyer"
        />
        <span className="badge">{members.length}</span>
      </div>
      <ul className="person-admin-list">
        {members.map((p) => (
          <MemberRow key={p.id} person={p} members={members} />
        ))}
      </ul>
      <AddMember householdId={id} admin />
      <div className="household-actions">
        {others.length > 0 && (
          <select
            className="add-select"
            value=""
            aria-label={`Fusionner le foyer ${label}`}
            onChange={(e) => {
              const into = Number(e.target.value);
              if (into && confirm(`Fusionner le foyer ${label} dans le foyer ${idx.householdLabel(into)} ?`)) {
                void call("POST", `/households/${id}/merge`, { into_id: into }, { admin: true });
              }
            }}
          >
            <option value="">Fusionner dans…</option>
            {others.map((h) => (
              <option key={h.id} value={h.id}>
                Foyer {h.label}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="btn btn-small btn-danger"
          onClick={() => {
            if (confirm(`Supprimer le foyer ${label} et ses ${members.length} membre(s) ?`)) void call("DELETE", `/households/${id}`, undefined, { admin: true });
          }}
        >
          Supprimer le foyer
        </button>
      </div>
    </section>
  );
}

function MemberRow({ person: p, members }: { person: Person; members: Person[] }) {
  const { idx, call } = useStay();
  const [name, setName] = useState(p.name);
  const [diet, setDiet] = useState(false);
  const [times, setTimes] = useState(false);
  const range = idx.stayRange(p.id);
  const saveTimes = useTimesSaver(p.household_id);
  const patch = (body: Partial<Person>) => call("PATCH", `/persons/${p.id}`, body, { admin: true });
  const adults = members.filter((m) => m.kind === "adult" && m.id !== p.id);
  const others = idx.households().filter((h) => h.id !== p.household_id);
  const merge = useMergeDuplicate();

  return (
    <li className="person-admin">
      <div className="person-admin-main">
        <input
          className="input-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name !== p.name) void patch({ name: name.trim() });
          }}
          aria-label="Prénom"
        />
        <select value={p.kind} onChange={(e) => void patch({ kind: oneOf(PERSON_KINDS, e.target.value) })} aria-label={`${p.name} : adulte ou enfant`}>
          <option value="adult">Adulte</option>
          <option value="child">Enfant</option>
        </select>
        {p.kind === "adult" && adults.length > 0 ? (
          <select
            value={p.partner_id ?? ""}
            aria-label={`Couple de ${p.name}`}
            onChange={(e) =>
              void call("PUT", `/persons/${p.id}/partner`, { partner_id: e.target.value ? Number(e.target.value) : null }, { admin: true })
            }
          >
            <option value="">Pas de couple</option>
            {adults.map((a) => (
              <option key={a.id} value={a.id}>
                ♥ {a.name}
              </option>
            ))}
          </select>
        ) : (
          <span />
        )}
      </div>
      <div className="person-admin-flags">
        <Toggle label="Corvées" checked={p.does_chores} onChange={(v) => void patch({ does_chores: v })} />
        <button type="button" className="btn btn-small" onClick={() => setDiet(!diet)} aria-label={`Régimes et allergies de ${p.name}`}>
          🥗 Régimes
        </button>
        {range && (
          <button type="button" className="btn btn-small" onClick={() => setTimes(!times)} aria-label={`Heures d'arrivée et de départ de ${p.name}`}>
            🕒 Heures
          </button>
        )}
        <select
          className="add-select"
          value=""
          aria-label={`Déplacer ${p.name}`}
          onChange={(e) => {
            if (!e.target.value) return;
            const target = e.target.value === "new" ? null : Number(e.target.value);
            void call("PUT", `/persons/${p.id}/household`, { household_id: target }, { admin: true });
          }}
        >
          <option value="">Déplacer…</option>
          {members.length > 1 && <option value="new">Vers un nouveau foyer</option>}
          {others.map((h) => (
            <option key={h.id} value={h.id}>
              Vers le foyer {h.label}
            </option>
          ))}
        </select>
        <select
          className="add-select"
          value=""
          aria-label={`${p.name} est un doublon de…`}
          onChange={(e) => {
            const keep = idx.personById.get(Number(e.target.value));
            if (keep) merge(p, keep);
          }}
        >
          <option value="">Doublon de…</option>
          {idx
            .households()
            .map((h) => ({ ...h, members: h.members.filter((m) => m.id !== p.id) }))
            .filter((h) => h.members.length > 0)
            .map((h) => (
              <optgroup key={h.id} label={`Foyer ${h.label}`}>
                {h.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>
        <button
          type="button"
          className="btn btn-small btn-danger"
          onClick={() => {
            if (confirm(`Supprimer ${p.name} et toutes ses données ?`)) void call("DELETE", `/persons/${p.id}`, undefined, { admin: true });
          }}
        >
          Supprimer
        </button>
      </div>
      {diet ? (
        <DietEditor person={p} onClose={() => setDiet(false)} />
      ) : (
        hasDiet(p) && <div className="muted small">🥗 {dietLabel(p)}</div>
      )}
      {range &&
        (times ? (
          <TimesRow person={p} range={range} onSave={(values) => saveTimes([{ person_id: p.id, ...values }])} />
        ) : (
          <div className="muted small">🕒 {timesSummary(p, range)}</div>
        ))}
    </li>
  );
}
