import { useState } from "react";
import type { Diet, Person } from "../api";
import { ALLERGIES, DIET_LABEL, dietCountLabel, dietGroups, dietIcon, dietLabel, REGIMES, toggleDiet } from "../lib";
import { useStay } from "../stay";

/**
 * Régimes et allergies d'un groupe de personnes (les présents à un repas, tout le séjour…) :
 * compteurs, dépliés sur les noms et les précisions ; `expanded` affiche directement les noms
 * (impression, récapitulatif de l'organisateur). Rien s'il n'y a aucune contrainte.
 */
export function DietSummary({ persons, expanded = false }: { persons: Person[]; expanded?: boolean }) {
  const groups = dietGroups(persons);
  const label = dietCountLabel(groups);
  if (!label) return null;
  const list = (
    <ul className="diet-list">
      {groups.byDiet.map(({ diet, persons: people }) => (
        <li key={diet}>
          {dietIcon(diet)} <strong>{DIET_LABEL[diet]}</strong> : {people.map((p) => p.name).join(", ")}
        </li>
      ))}
      {groups.notes.map((p) => (
        <li key={p.id}>
          📝 <strong>{p.name}</strong> : {p.diet_note}
        </li>
      ))}
    </ul>
  );
  if (expanded) return <div className="diets">{list}</div>;
  return (
    <details className="diets">
      <summary>{label}</summary>
      {list}
    </details>
  );
}

/** Saisie des régimes et allergies d'une personne (adulte du foyer ou organisateur). */
export function DietEditor({ person, onClose }: { person: Person; onClose: () => void }) {
  const { call } = useStay();
  const [diets, setDiets] = useState<Diet[]>(person.diets);
  const [note, setNote] = useState(person.diet_note);

  async function save(e: React.SubmitEvent) {
    e.preventDefault();
    if ((await call("PUT", `/persons/${person.id}/diet`, { diets, diet_note: note.trim() })) !== undefined) onClose();
  }

  const box = (diet: Diet) => (
    <label key={diet} className="check">
      <input type="checkbox" checked={diets.includes(diet)} onChange={(e) => setDiets(toggleDiet(diets, diet, e.target.checked))} />
      {DIET_LABEL[diet]}
    </label>
  );

  return (
    <form className="form diet-editor" onSubmit={(e) => void save(e)} aria-label={`Régimes et allergies de ${person.name}`}>
      <fieldset>
        <legend>Régime</legend>
        <div className="checks">{REGIMES.map(box)}</div>
      </fieldset>
      <fieldset>
        <legend>Allergies et intolérances</legend>
        <div className="checks">{ALLERGIES.map(box)}</div>
      </fieldset>
      <input
        value={note}
        maxLength={200}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Précision (facultatif) : allergie grave, autre aliment, n'aime pas…"
        aria-label={`Précision pour ${person.name}`}
      />
      <div className="inline-form">
        <button type="submit" className="btn btn-primary">Enregistrer</button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Annuler
        </button>
      </div>
    </form>
  );
}

/** Une personne, ses contraintes et le bouton pour les modifier. */
export function DietRow({ person }: { person: Person }) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="diet-row">
      <div className="list-row">
        <div>
          <strong>{person.name}</strong>
          <div className="muted small">{dietLabel(person)}</div>
        </div>
        {!editing && (
          <button type="button" className="btn btn-small" onClick={() => setEditing(true)} aria-label={`Modifier les régimes et allergies de ${person.name}`}>
            Modifier
          </button>
        )}
      </div>
      {editing && <DietEditor person={person} onClose={() => setEditing(false)} />}
    </li>
  );
}

/** Carte « Régimes et allergies » de la page Moi : tout le foyer. */
export function DietCard({ me }: { me: Person }) {
  const { idx } = useStay();
  return (
    <section className="card">
      <h2>🥗 Régimes et allergies</h2>
      <p className="hint">Visible par tous les participants du séjour, pour que ceux qui cuisinent en tiennent compte.</p>
      <ul className="list">
        {idx.household(me).map((p) => (
          <DietRow key={p.id} person={p} />
        ))}
      </ul>
    </section>
  );
}

/** Invitation discrète, juste après l'ajout d'un membre au foyer. */
export function DietInvite({ person, onDone }: { person: Person; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <DietEditor person={person} onClose={onDone} />;
  return (
    <p className="hint diet-invite">
      Régime ou allergie pour {person.name} ?{" "}
      <button type="button" className="btn btn-small" onClick={() => setEditing(true)}>
        Indiquer
      </button>{" "}
      <button type="button" className="btn btn-small btn-ghost" onClick={onDone}>
        Plus tard
      </button>
    </p>
  );
}
