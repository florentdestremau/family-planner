import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { api, type Person, type Snapshot } from "./api";
import { buildIndex, type Index } from "./lib";
import { storage } from "./storage";
import { toast } from "./toast";

export function useSnapshot(slug: string) {
  return useQuery({
    queryKey: ["stay", slug],
    queryFn: () => api<Snapshot>("GET", `/stays/${slug}`),
    refetchInterval: 30_000,
  });
}

interface StayCtx {
  slug: string;
  snap: Snapshot;
  idx: Index;
  me: Person | undefined;
  setMe: (id: number | null) => void;
  adminKey: string | null;
  setAdminKey: (key: string | null) => void;
  /** Appel API puis rafraîchissement du séjour ; les erreurs sont affichées en toast. */
  call: <T = unknown>(method: string, path: string, body?: unknown, opts?: { admin?: boolean }) => Promise<T | undefined>;
}

const Ctx = createContext<StayCtx | null>(null);

export function useStay(): StayCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStay hors d'un séjour");
  return ctx;
}

export function StayProvider({ slug, snap, children }: { slug: string; snap: Snapshot; children: React.ReactNode }) {
  const qc = useQueryClient();
  const [meId, setMeId] = useState(() => storage.me(slug));
  const [adminKey, setAdminKeyState] = useState(() => storage.adminKey(slug));
  const idx = useMemo(() => buildIndex(snap), [snap]);
  const me = meId != null ? idx.personById.get(meId) : undefined;

  const setMe = useCallback(
    (id: number | null) => {
      storage.setMe(slug, id);
      setMeId(id);
    },
    [slug],
  );
  const setAdminKey = useCallback(
    (key: string | null) => {
      storage.setAdminKey(slug, key);
      setAdminKeyState(key);
    },
    [slug],
  );

  const call = useCallback(
    async <T,>(method: string, path: string, body?: unknown, opts?: { admin?: boolean }) => {
      try {
        const prefix = opts?.admin ? `/stays/${slug}/admin` : `/stays/${slug}`;
        return await api<T>(method, `${prefix}${path}`, body, opts?.admin ? adminKey : null);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Erreur inattendue", "error");
        return undefined;
      } finally {
        await qc.invalidateQueries({ queryKey: ["stay", slug] });
      }
    },
    [slug, adminKey, qc],
  );

  const value = useMemo(
    () => ({ slug, snap, idx, me, setMe, adminKey, setAdminKey, call }),
    [slug, snap, idx, me, setMe, adminKey, setAdminKey, call],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
