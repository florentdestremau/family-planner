import { useState } from "react";
import type { Person, PersonKind } from "../api";
import { homonym, oneOf, PERSON_KINDS } from "../lib";
import { useStay } from "../stay";
import { toast } from "../toast";
import { DietInvite } from "./Diets";
import { usePending } from "./ui";

/**
 * Ajout d'un membre à un foyer. Pour un adulte, le couple est proposé (coché par défaut) quand le
 * foyer n'a qu'un adulte, sans conjoint : le célibataire qui ajoute son conjoint. Avec plusieurs
 * adultes (par exemple un couple et une grand-mère), rien n'est proposé. Une fois le membre ajouté,
 * on propose au foyer d'indiquer ses régimes et allergies (l'organisateur a son bouton « Régimes »).
 * Un prénom déjà présent dans le foyer est refusé (on s'ajoute soi-même par erreur) ; ailleurs dans
 * le séjour, il est à confirmer.
 */
export default function AddMember({ householdId, admin = false }: { householdId: number; admin?: boolean }) {
  const { snap, idx, call } = useStay();
  const [name, setName] = useState("");
  const [pending, once] = usePending();
  const [kind, setKind] = useState<PersonKind>("adult");
  const adults = idx.members(householdId).filter((p) => p.kind === "adult");
  const partner: Person | undefined = adults.length === 1 && adults[0].partner_id == null ? adults[0] : undefined;
  const [couple, setCouple] = useState(true);
  const [added, setAdded] = useState<Person | undefined>();

  async function submit(e: React.SubmitEvent) {
    e.preventDefault();
    const typed = name.trim();
    const same = homonym(snap.persons, typed, householdId);
    if (same?.sameHousehold) {
      toast(`${same.person.name} fait déjà partie du foyer : saisissez le prénom de la personne à ajouter.`, "error");
      return;
    }
    const elsewhere = same && `« ${same.person.name} » est déjà dans le séjour (foyer ${idx.householdLabel(same.person.household_id)}).`;
    if (elsewhere && !confirm(`${elsewhere}\n\nAjouter quand même une autre personne nommée ${typed} à ce foyer ?`)) return;
    const body = {
      name: typed,
      kind,
      household_id: householdId,
      partner_id: kind === "adult" && partner && couple ? partner.id : null,
      allow_same_name: same !== undefined,
    };
    await once(async () => {
      const created = await call<Person>("POST", "/persons", body, { admin });
      if (created) {
        setName("");
        setCouple(true);
        if (!admin) setAdded(created);
      }
    });
  }

  return (
    <>
      <form onSubmit={(e) => void submit(e)} className="add-member">
        <div className="inline-form wrap">
          {/* Sans saisie automatique : le navigateur proposerait le prénom de la personne qui saisit. */}
          <input
            placeholder="Prénom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="off"
            aria-label="Prénom du nouveau membre"
          />
          <select value={kind} onChange={(e) => setKind(oneOf(PERSON_KINDS, e.target.value))} aria-label="Adulte ou enfant">
            <option value="adult">Adulte</option>
            <option value="child">Enfant</option>
          </select>
          <button type="submit" className="btn" disabled={pending}>
            Ajouter au foyer
          </button>
        </div>
        {kind === "adult" && partner && (
          <label className="check small">
            <input type="checkbox" checked={couple} onChange={(e) => setCouple(e.target.checked)} />
            En couple avec {partner.name}
          </label>
        )}
      </form>
      {added && <DietInvite key={added.id} person={added} onDone={() => setAdded(undefined)} />}
    </>
  );
}
