import { useState } from "react";
import type { Person } from "../api";
import { linkify } from "../lib";
import { toast } from "../toast";

export function Chip({
  person,
  highlight,
  onRemove,
  note,
}: {
  person: Person | undefined;
  highlight?: boolean;
  onRemove?: () => void;
  /** Précision après le nom, par exemple les nuits quand elles ne couvrent pas tout le séjour. */
  note?: string;
}) {
  if (!person) return null;
  return (
    <span className={`chip ${highlight ? "chip-me" : ""} ${person.kind === "child" ? "chip-child" : ""}`}>
      {person.name}
      {note && <span className="chip-note"> {note}</span>}
      {onRemove && (
        <button type="button" className="chip-x" onClick={onRemove} aria-label={`Retirer ${person.name}`}>
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
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      toast("Copie impossible : sélectionnez le texte manuellement", "error");
    }
  };
  return (
    <button type="button" className="btn btn-small" onClick={() => void copy()}>
      {done ? "Copié ✓" : label}
    </button>
  );
}

/** Texte libre avec les liens et les numéros de téléphone cliquables (retours à la ligne gardés par `.pre`). */
export function Linkified({ text }: { text: string }) {
  return linkify(text).map((part, i) =>
    part.href?.startsWith("tel:") ? (
      <a key={i} href={part.href}>
        {part.text}
      </a>
    ) : part.href ? (
      <a key={i} href={part.href} target="_blank" rel="noopener noreferrer">
        {part.text}
      </a>
    ) : (
      part.text
    ),
  );
}

/** Sélecteur « ajouter une personne » qui se réinitialise après choix. */
export function AddPersonSelect({
  people,
  onPick,
  placeholder = "+ Ajouter…",
  hint,
}: {
  people: Person[];
  onPick: (id: number) => void;
  placeholder?: string;
  /** Précision affichée après le nom (charge, conflit…). */
  hint?: (p: Person) => string;
}) {
  if (people.length === 0) return null;
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
          {hint?.(p) ? ` — ${hint(p)}` : ""}
        </option>
      ))}
    </select>
  );
}
