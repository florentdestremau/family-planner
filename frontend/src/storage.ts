/** Petites préférences locales (identité, clé organisateur, séjours connus). */

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible : on ignore */
  }
}

export const storage = {
  me: (slug: string) => read<number | null>(`fp:me:${slug}`, null),
  setMe: (slug: string, id: number | null) => write(`fp:me:${slug}`, id),
  adminKey: (slug: string) => read<string | null>(`fp:admin:${slug}`, null),
  setAdminKey: (slug: string, key: string | null) => write(`fp:admin:${slug}`, key),
  knownStays: () => read<{ slug: string; name: string }[]>("fp:stays", []),
  rememberStay: (slug: string, name: string) => {
    const others = storage.knownStays().filter((s) => s.slug !== slug);
    write("fp:stays", [{ slug, name }, ...others].slice(0, 20));
  },
};
