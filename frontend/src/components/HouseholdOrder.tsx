import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type Announcements, type DragEndEvent, type UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import type { Person } from "../api";
import { useStay } from "../stay";

/**
 * Ordre des foyers, réglé par glisser-déposer (souris, doigt sur la poignée, ou clavier) :
 * le même partout, tableau des présences, impressions et foyers.
 */
export default function HouseholdOrder() {
  const { idx, call } = useStay();
  const households = idx.households();
  // Ordre affiché le temps de l'enregistrement, pour que la liste ne revienne pas en arrière.
  const [pending, setPending] = useState<number[] | null>(null);
  const ids = pending ?? households.map((h) => h.id);
  const byId = new Map(households.map((h) => [h.id, h]));
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  async function drop({ active, over }: DragEndEvent) {
    if (over === null || active.id === over.id) return;
    const next = arrayMove(ids, ids.indexOf(Number(active.id)), ids.indexOf(Number(over.id)));
    setPending(next);
    await call("PUT", "/households/order", { household_ids: next }, { admin: true });
    setPending(null);
  }

  const label = (id: UniqueIdentifier) => `le foyer ${idx.householdLabel(Number(id))}`;
  const position = (id: UniqueIdentifier | undefined) => (id === undefined ? "" : ` en position ${ids.indexOf(Number(id)) + 1}`);
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${label(active.id)} est saisi`,
    onDragOver: ({ active, over }) => `${label(active.id)} passe${position(over?.id)}`,
    onDragEnd: ({ active, over }) => `${label(active.id)} est déposé${position(over?.id)}`,
    onDragCancel: ({ active }) => `${label(active.id)} reste à sa place`,
  };

  if (households.length < 2) return null;
  return (
    <details className="card household-order">
      <summary>
        <strong>↕ Ordre des foyers</strong>
      </summary>
      <p className="hint">
        Glissez les foyers par leur poignée ⠿ pour les ranger, par exemple par ordre de naissance. Cet ordre est repris partout : présences,
        impressions, foyers.
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(e) => void drop(e)}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: "Espace pour saisir le foyer, flèches pour le déplacer, Espace pour le déposer, Échap pour annuler.",
          },
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol className="order-list">
            {ids.map((id) => (
              <OrderItem key={id} id={id} label={byId.get(id)?.label ?? ""} members={byId.get(id)?.members ?? []} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </details>
  );
}

function OrderItem({ id, label, members }: { id: number; label: string; members: Person[] }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li ref={setNodeRef} className={`order-item ${isDragging ? "order-item-dragging" : ""}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button type="button" ref={setActivatorNodeRef} className="order-handle" aria-label={`Déplacer le foyer ${label}`} {...attributes} {...listeners}>
        ⠿
      </button>
      <span>
        <strong>Foyer {label}</strong> <span className="muted small">{members.map((p) => p.name).join(", ")}</span>
      </span>
    </li>
  );
}
