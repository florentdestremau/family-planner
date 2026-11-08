import { Fragment, useState } from "react";
import type { Person, PersonKind } from "../api";
import { OfflineLock } from "../components/Pwa";
import { usePending } from "../components/ui";
import { checkJoin, coupleIndex, oneOf, PERSON_KINDS, personHue, type JoinMember } from "../lib";
import { useStay } from "../stay";
import { toast } from "../toast";

/** Sélection de son identité, mémorisée localement (pas de compte) ; elle signe les modifications au journal. */
export default function WhoAmI({ organizer = false }: { organizer?: boolean }) {
  const { snap } = useStay();
  const adults = snap.persons.filter((p) => p.kind === "adult");

  return (
    <section className="card whoami">
      <h2>Qui êtes-vous ?</h2>
      <p className="muted">
        {organizer
          ? "Chaque modification du séjour est notée au journal, au nom de la personne qui la fait. Choisissez votre nom ; si vous ne venez pas au séjour, ajoutez-vous quand même, sans présences."
          : "Choisissez votre nom : vous pourrez ensuite renseigner vos présences et celles de votre foyer."}
      </p>
      {adults.length > 0 && <WhoList />}
      <OfflineLock>
        <JoinForm first={adults.length === 0} />
      </OfflineLock>
    </section>
  );
}

/** Les adultes à choisir, foyer par foyer : ceux d'un même foyer côte à côte, reliés par un petit trait. */
function WhoList() {
  const { idx } = useStay();
  const groups = idx
    .households()
    .map((h) => ({ ...h, adults: h.members.filter((p) => p.kind === "adult") }))
    .filter((h) => h.adults.length > 0);
  return (
    <div className="who-list">
      {groups.map((h) => (
        <div key={h.id} className="who-group" {...(h.adults.length > 1 && { role: "group", "aria-label": `Foyer ${h.label}` })}>
          {h.adults.map((p, i) => (
            <Fragment key={p.id}>
              {i > 0 && <span className="who-link" aria-hidden="true" />}
              <WhoPick person={p} />
            </Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}

function WhoPick({ person }: { person: Person }) {
  const { setMe } = useStay();
  return (
    <button type="button" className="who-pick" style={{ "--hue": personHue(person.name) }} onClick={() => setMe(person.id)}>
      <span className="avatar">{person.name.charAt(0).toUpperCase()}</span>
      <span className="who-pick-name">{person.name}</span>
    </button>
  );
}

const newMember = (members: JoinMember[]): JoinMember => ({ name: "", kind: members.length === 0 ? "adult" : "child", couple: true });

/**
 * Inscription en deux temps : je m'ajoute d'abord (mon prénom), et seulement si je le choisis,
 * j'ajoute les autres membres de mon foyer (conjoint, enfants…), qui viennent avec moi. Mon prénom
 * ne se saisit qu'une fois : le répéter parmi les membres est refusé.
 */
function JoinForm({ first }: { first: boolean }) {
  const { snap, idx, setMe, call } = useStay();
  const [name, setName] = useState("");
  const [withMembers, setWithMembers] = useState(false);
  const [members, setMembers] = useState<JoinMember[]>([]);
  const [pending, once] = usePending();
  const sent = withMembers ? members : [];
  const couple = coupleIndex(sent);

  const update = (i: number, patch: Partial<JoinMember>) => setMembers(members.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const toggleMembers = (on: boolean) => {
    setWithMembers(on);
    if (on && members.length === 0) setMembers([newMember([])]);
  };

  async function join(e: React.SubmitEvent) {
    e.preventDefault();
    const me = name.trim();
    const others = sent.map((m) => ({ ...m, name: m.name.trim() }));
    const { repeated, existing } = checkJoin(snap.persons, [me, ...others.map((m) => m.name)]);
    if (repeated !== undefined) {
      toast(`${repeated.trim()} est saisi deux fois : vous ne vous ajoutez qu'une fois, dans « Mon prénom ».`, "error");
      return;
    }
    // Déjà dans le séjour ? Le plus souvent c'est la même personne : on le dit avant d'ajouter un homonyme.
    if (existing.length > 0) {
      const list = existing.map((p) => `« ${p.name} » (foyer ${idx.householdLabel(p.household_id)})`).join(", ");
      const question = `Déjà dans le séjour : ${list}.\n\nSi c'est vous, choisissez votre nom dans la liste. Ajouter quand même ?`;
      if (!confirm(question)) return;
    }
    const allow_same_name = existing.length > 0;
    await once(async () => {
      const created = await call<Person>("POST", "/persons", { name: me, kind: "adult", allow_same_name });
      if (!created) return;
      for (const [i, m] of others.entries()) {
        const partner_id = i === couple && m.couple ? created.id : null;
        const body = { name: m.name, kind: m.kind, household_id: created.household_id, partner_id, allow_same_name };
        // Un à un, dans l'ordre saisi : le journal les note dans cet ordre.
        // oxlint-disable-next-line eslint/no-await-in-loop
        await call("POST", "/persons", body, { actor: created.id });
      }
      setMe(created.id);
    });
  }

  const total = 1 + sent.length;
  return (
    <form onSubmit={(e) => void join(e)} className="form join-form">
      <h3>{first ? "Je m'inscris" : "Je ne suis pas dans la liste"}</h3>
      <label>
        Mon prénom
        <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Votre prénom" />
      </label>
      <label className="check">
        <input type="checkbox" checked={withMembers} onChange={(e) => toggleMembers(e.target.checked)} />
        J'ajoute d'autres membres de mon foyer (conjoint, enfants…)
      </label>
      {withMembers && (
        <fieldset className="join-members">
          <legend>Membres de mon foyer</legend>
          <p className="hint">
            Seulement les personnes qui viennent avec vous{name.trim() ? `, ${name.trim()}` : ""} : votre conjoint, vos enfants. Les autres familles
            s'inscrivent elles-mêmes, avec ce même lien. Vous pourrez aussi en ajouter plus tard.
          </p>
          {members.map((m, i) => (
            <div key={i} className="join-member">
              <div className="inline-form wrap">
                <input
                  value={m.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  required
                  autoComplete="off"
                  placeholder="Prénom"
                  aria-label={`Prénom du membre ${i + 1}`}
                />
                <select
                  value={m.kind}
                  onChange={(e) => update(i, { kind: oneOf<PersonKind>(PERSON_KINDS, e.target.value) })}
                  aria-label={`Membre ${i + 1} : adulte ou enfant`}
                >
                  <option value="adult">Adulte</option>
                  <option value="child">Enfant</option>
                </select>
                <button type="button" className="btn btn-small" onClick={() => setMembers(members.filter((_, j) => j !== i))} aria-label={`Retirer le membre ${i + 1}`}>
                  ✕
                </button>
              </div>
              {i === couple && (
                <label className="check small">
                  <input type="checkbox" checked={m.couple} onChange={(e) => update(i, { couple: e.target.checked })} />
                  En couple avec moi
                </label>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-small" onClick={() => setMembers([...members, newMember(members)])}>
            + Un autre membre
          </button>
        </fieldset>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {total > 1 ? `Nous ajouter (${total})` : "M'ajouter"}
      </button>
    </form>
  );
}
