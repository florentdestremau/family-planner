import { useState } from "react";
import type { Person } from "../api";
import { toast } from "../toast";

export function Chip({
  person,
  highlight,
  onRemove,
}: {
  person: Person | undefined;
  highlight?: boolean;
  onRemove?: () => void;
}) {
  if (!person) return null;
  return (
    <span className={`chip ${highlight ? "chip-me" : ""} ${person.kind === "child" ? "chip-child" : ""}`}>
      {person.name}
      {onRemove && (
        <button className="chip-x" onClick={onRemove} aria-label={`Retirer ${person.name}`}>
          ×
        </button>
      )}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`toggle ${disabled ? "is-disabled" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden />
      <span>{label}</span>
    </label>
  );
}

export function CopyButton({ text, label = "Copier" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast("Copie impossible : sélectionnez le texte manuellement", "error");
        }
      }}
    >
      {done ? "Copié ✓" : label}
    </button>
  );
}

/** Sélecteur « ajouter une personne » qui se réinitialise après choix. */
export function AddPersonSelect({
  people,
  onPick,
  placeholder = "+ Ajouter…",
}: {
  people: Person[];
  onPick: (id: number) => void;
  placeholder?: string;
}) {
  if (!people.length) return null;
  return (
    <select
      className="add-select"
      value=""
      onChange={(e) => {
        if (e.target.value) onPick(Number(e.target.value));
      }}
    >
      <option value="">{placeholder}</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.kind === "child" ? " (enfant)" : ""}
        </option>
      ))}
    </select>
  );
}
