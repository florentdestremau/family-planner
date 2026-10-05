import { useState } from "react";
import type { Person, PersonKind } from "../api";
import { useStay } from "../stay";

/**
 * Ajout d'un membre à un foyer. Pour un adulte, le couple est proposé (coché par défaut) quand le
 * foyer n'a qu'un adulte, sans conjoint : le célibataire qui ajoute son conjoint. Avec plusieurs
 * adultes (par exemple un couple et une grand-mère), rien n'est proposé.
 */
export default function AddMember({ householdId, admin = false }: { householdId: number; admin?: boolean }) {
  const { idx, call } = useStay();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PersonKind>("adult");
  const adults = idx.members(householdId).filter((p) => p.kind === "adult");
  const partner: Person | undefined = adults.length === 1 && adults[0].partner_id == null ? adults[0] : undefined;
  const [couple, setCouple] = useState(true);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      name: name.trim(),
      kind,
      household_id: householdId,
      partner_id: kind === "adult" && partner && couple ? partner.id : null,
    };
    if (await call("POST", "/persons", body, { admin })) {
      setName("");
      setCouple(true);
    }
  }

  return (
    <form onSubmit={submit} className="add-member">
      <div className="inline-form wrap">
        <input placeholder="Prénom" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Prénom du nouveau membre" />
        <select value={kind} onChange={(e) => setKind(e.target.value as PersonKind)} aria-label="Adulte ou enfant">
          <option value="adult">Adulte</option>
          <option value="child">Enfant</option>
        </select>
        <button className="btn">Ajouter au foyer</button>
      </div>
      {kind === "adult" && partner && (
        <label className="check small">
          <input type="checkbox" checked={couple} onChange={(e) => setCouple(e.target.checked)} />
          En couple avec {partner.name}
        </label>
      )}
    </form>
  );
}
