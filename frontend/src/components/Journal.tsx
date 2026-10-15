import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { api, type JournalEntry, type JournalPage } from "../api";
import { journalSentence, journalTime } from "../lib";
import { useStay } from "../stay";
import { useOnline } from "./Pwa";
import { Empty } from "./ui";

/** Journal du séjour, page par page (le plus récent d'abord) ; jamais gardé hors ligne (main.tsx). */
function useJournal(persons: number[], admin: boolean, pageSize: number) {
  const { slug, adminKey } = useStay();
  const isOnline = useOnline();
  return useInfiniteQuery({
    queryKey: ["journal", slug, admin ? "admin" : "public", persons, pageSize],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (pageParam !== undefined) params.set("before", String(pageParam));
      for (const id of persons) params.append("persons", String(id));
      const path = `/stays/${slug}${admin ? "/admin" : ""}/journal?${params.toString()}`;
      return api<JournalPage>("GET", path, undefined, admin ? adminKey : null);
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.more ? last.entries.at(-1)?.id : undefined),
    enabled: isOnline,
    // Seule la première page bouge : on ne la relit que tant qu'on n'en a pas chargé d'autres.
    refetchInterval: (query) => ((query.state.data?.pages.length ?? 0) > 1 ? false : 30_000),
  });
}

/** Le journal, ou ce qui l'empêche de s'afficher. */
function JournalBody({ entries, error }: { entries: JournalEntry[] | undefined; error: boolean }) {
  const isOnline = useOnline();
  if (!isOnline) return <Empty>📴 Le journal est disponible avec le réseau.</Empty>;
  if (error) return <Empty>Impossible de charger le journal.</Empty>;
  if (entries === undefined) return <p className="muted small">Chargement…</p>;
  if (entries.length === 0) return <Empty>Rien pour l'instant.</Empty>;
  return <Entries entries={entries} />;
}

function Entries({ entries }: { entries: JournalEntry[] }) {
  return (
    <ul className="list journal">
      {entries.map((e) => {
        const { who, what } = journalSentence(e);
        return (
          <li key={e.id} className="journal-entry">
            <p>
              {who && <strong>{who}</strong>} {what}
            </p>
            <span className="muted small">{journalTime(e.created_at)}</span>
            {e.detail && e.detail.length > 0 && (
              <details className="journal-detail">
                <summary className="small">Détail</summary>
                <div className="pre small">{e.detail.join("\n")}</div>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Quelques lignes du journal sur la page « Moi ». */
export function RecentActivity() {
  const { slug } = useStay();
  const { data, isError } = useJournal([], false, 5);
  return (
    <section className="card">
      <div className="card-head">
        <h2>🕘 Activité récente</h2>
        <Link to={`/s/${slug}/activite`} className="small">
          Tout voir →
        </Link>
      </div>
      <JournalBody entries={data?.pages[0]?.entries} error={isError} />
    </section>
  );
}

type Filter = "all" | "me" | "household";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "me", label: "Me concerne" },
  { value: "household", label: "Mon foyer" },
];

/** Le journal complet : participants (sans détail) ou organisateur (`admin`, avec l'avant / après). */
export default function Journal({ admin = false }: { admin?: boolean }) {
  const { me, idx } = useStay();
  const isOnline = useOnline();
  const [filter, setFilter] = useState<Filter>("all");
  const persons = !me || filter === "all" ? [] : filter === "me" ? [me.id] : idx.household(me).map((p) => p.id);
  const { data, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useJournal(persons, admin, 50);
  const entries = data?.pages.flatMap((page) => page.entries);

  return (
    <div className="stack">
      <h1 className="page-title">🕘 {admin ? "Journal du séjour" : "Activité du séjour"}</h1>
      <p className="muted small">
        Chaque modification, au nom de la personne qui s'est désignée sur l'appareil.
        {admin ? " Le détail garde ce qu'un geste de masse a remplacé ou supprimé." : ""} Les consultations ne sont pas notées.
      </p>
      {me && (
        <div className="segmented" role="group" aria-label="Filtrer le journal">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" className={filter === f.value ? "on" : ""} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
      )}
      <section className="card">
        <JournalBody entries={entries} error={isError} />
      </section>
      {isOnline && hasNextPage && (
        <button type="button" className="btn" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
          {isFetchingNextPage ? "Chargement…" : "Voir plus"}
        </button>
      )}
    </div>
  );
}
