/** Appli installable et usage hors ligne : état de la connexion, invite d'installation. */

type Listener = () => void;

/** Petit magasin observable, lu par useSyncExternalStore. */
function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (l: Listener) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}

/** Connexion réseau, d'après le navigateur. */
export const online = (() => {
  const s = store(navigator.onLine);
  const update = () => s.set(navigator.onLine);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  return { get: s.get, subscribe: s.subscribe };
})();

/** L'événement `beforeinstallprompt` (Chromium) : pas encore dans les types du DOM. */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallMode = "installed" | "prompt" | "ios" | "none";

/** Déjà lancée comme appli (écran d'accueil, fenêtre dédiée). */
export function isStandalone(win: Window = window): boolean {
  return win.matchMedia?.("(display-mode: standalone)").matches || (win.navigator as { standalone?: boolean }).standalone === true;
}

/** iPhone, iPad (qui se présente comme un Mac tactile) : installation manuelle depuis Safari. */
export function isIos(nav: Pick<Navigator, "userAgent" | "maxTouchPoints"> = navigator): boolean {
  return /iphone|ipad|ipod/i.test(nav.userAgent) || (/macintosh/i.test(nav.userAgent) && nav.maxTouchPoints > 1);
}

export function installMode(standalone: boolean, prompt: InstallPromptEvent | null, ios: boolean): InstallMode {
  if (standalone) return "installed";
  if (prompt) return "prompt";
  return ios ? "ios" : "none";
}

/**
 * Invite d'installation. Le navigateur l'émet tôt, parfois avant le rendu : elle est captée dès le
 * chargement du module et gardée jusqu'au clic sur « Installer ».
 */
export const install = (() => {
  const s = store<{ prompt: InstallPromptEvent | null; installed: boolean }>({ prompt: null, installed: isStandalone() });
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    s.set({ ...s.get(), prompt: e as InstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => s.set({ prompt: null, installed: true }));
  return {
    get: s.get,
    subscribe: s.subscribe,
    mode: () => installMode(s.get().installed, s.get().prompt, isIos()),
    /** Affiche l'invite du navigateur ; elle ne sert qu'une fois. */
    async prompt(): Promise<boolean> {
      const { prompt } = s.get();
      if (!prompt) return false;
      s.set({ ...s.get(), prompt: null });
      await prompt.prompt();
      return (await prompt.userChoice).outcome === "accepted";
    },
  };
})();

/** « à 15:32 » le jour même, sinon « le 12/10 à 15:32 ». */
export function savedAtLabel(ts: number, now: number = Date.now()): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === new Date(now).toDateString()) return `à ${time}`;
  return `le ${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} à ${time}`;
}
