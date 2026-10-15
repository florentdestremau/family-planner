import { useState } from "react";
import type { Person, PersonKind } from "../api";
import { oneOf, PERSON_KINDS } from "../lib";
import { useStay } from "../stay";
import { DietInvite } from "./Diets";

/**
 * Ajout d'un membre à un foyer. Pour un adulte, le couple est proposé (coché par défaut) quand le
 * foyer n'a qu'un adulte, sans conjoint : le célibataire qui ajoute son conjoint. Avec plusieurs
 * adultes (par exemple un couple et une grand-mère), rien n'est proposé. Une fois le membre ajouté,
 * on propose au foyer d'indiquer ses régimes et allergies (l'organisateur a son bouton « Régimes »).
 */
export default function AddMember({ householdId, admin = false }: { householdId: number; admin?: boolean }) {
  const { idx, call } = useStay();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PersonKind>("adult");
  const adults = idx.members(householdId).filter((p) => p.kind === "adult");
  const partner: Person | undefined = adults.length === 1 && adults[0].partner_id == null ? adults[0] : undefined;
  const [couple, setCouple] = useState(true);
  const [added, setAdded] = useState<Person | undefined>();

  async function submit(e: React.SubmitEvent) {
    e.preventDefault();
    const body = {
      name: name.trim(),
      kind,
      household_id: householdId,
      partner_id: kind === "adult" && partner && couple ? partner.id : null,
    };
    const created = await call<Person>("POST", "/persons", body, { admin });
    if (created) {
      setName("");
      setCouple(true);
      if (!admin) setAdded(created);
    }
  }

  return (
    <>
      <form onSubmit={(e) => void submit(e)} className="add-member">
        <div className="inline-form wrap">
          <input placeholder="Prénom" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Prénom du nouveau membre" />
          <select value={kind} onChange={(e) => setKind(oneOf(PERSON_KINDS, e.target.value))} aria-label="Adulte ou enfant">
            <option value="adult">Adulte</option>
            <option value="child">Enfant</option>
          </select>
          <button type="submit" className="btn">Ajouter au foyer</button>
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
