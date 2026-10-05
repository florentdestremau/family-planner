import { useEffect, useState } from "react";

type Toast = { id: number; message: string; kind: "error" | "ok" };
const listeners = new Set<(t: Toast) => void>();
let nextId = 1;

export function toast(message: string, kind: Toast["kind"] = "ok"): void {
  const t = { id: nextId++, message, kind };
  listeners.forEach((l) => l(t));
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const listener = (t: Toast) => {
      setToasts((ts) => [...ts, t]);
      setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== t.id)), 3500);
    };
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
