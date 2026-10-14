import { afterEach, describe, expect, it, vi } from "vitest";
import type { InstallPromptEvent } from "./pwa";

/** Le module capte les événements dès son chargement : une copie neuve par test. */
async function load() {
  vi.resetModules();
  return import("./pwa");
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}

function fakePrompt(outcome: "accepted" | "dismissed") {
  const e = new Event("beforeinstallprompt", { cancelable: true }) as InstallPromptEvent;
  e.prompt = vi.fn(async () => {});
  e.userChoice = Promise.resolve({ outcome });
  return e;
}

function matchMedia(standalone: boolean) {
  return vi.fn(() => ({ matches: standalone }) as MediaQueryList);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setOnline(true);
});

describe("online", () => {
  it("suit les événements online / offline", async () => {
    const { online } = await load();
    const listener = vi.fn();
    const unsubscribe = online.subscribe(listener);
    expect(online.get()).toBe(true);
    setOnline(false);
    expect(online.get()).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    setOnline(true);
    expect(online.get()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe("détection", () => {
  it("isStandalone : display-mode ou navigator.standalone (iOS)", async () => {
    const { isStandalone } = await load();
    expect(isStandalone({ matchMedia: matchMedia(true), navigator: {} } as unknown as Window)).toBe(true);
    expect(isStandalone({ matchMedia: matchMedia(false), navigator: { standalone: true } } as unknown as Window)).toBe(true);
    expect(isStandalone({ matchMedia: matchMedia(false), navigator: {} } as unknown as Window)).toBe(false);
    expect(isStandalone({ navigator: {} } as unknown as Window)).toBe(false);
  });

  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5, true],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5, true],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0, false],
    ["Mozilla/5.0 (Linux; Android 15; Pixel 7)", 5, false],
  ])("isIos(%s, %i points) → %s", async (userAgent, maxTouchPoints, expected) => {
    const { isIos } = await load();
    expect(isIos({ userAgent, maxTouchPoints })).toBe(expected);
  });

  it("isIos lit le navigateur par défaut", async () => {
    const { isIos } = await load();
    expect(isIos()).toBe(false);
  });

  it("installMode", async () => {
    const { installMode } = await load();
    const prompt = fakePrompt("accepted");
    expect(installMode(true, prompt, true)).toBe("installed");
    expect(installMode(false, prompt, true)).toBe("prompt");
    expect(installMode(false, null, true)).toBe("ios");
    expect(installMode(false, null, false)).toBe("none");
  });
});

describe("install", () => {
  it("garde l'invite du navigateur et la rejoue au clic", async () => {
    const { install } = await load();
    expect(install.mode()).toBe("none");
    await expect(install.prompt()).resolves.toBe(false);

    const listener = vi.fn();
    install.subscribe(listener);
    const e = fakePrompt("accepted");
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(listener).toHaveBeenCalled();
    expect(install.mode()).toBe("prompt");

    await expect(install.prompt()).resolves.toBe(true);
    expect(e.prompt).toHaveBeenCalledOnce();
    // L'invite ne sert qu'une fois.
    expect(install.mode()).toBe("none");
  });

  it("refus de l'utilisateur", async () => {
    const { install } = await load();
    window.dispatchEvent(fakePrompt("dismissed"));
    await expect(install.prompt()).resolves.toBe(false);
  });

  it("une fois installée, plus de bouton", async () => {
    const { install } = await load();
    window.dispatchEvent(fakePrompt("accepted"));
    window.dispatchEvent(new Event("appinstalled"));
    expect(install.mode()).toBe("installed");
  });

  it("déjà lancée comme appli", async () => {
    vi.stubGlobal("matchMedia", matchMedia(true));
    const { install } = await load();
    expect(install.mode()).toBe("installed");
  });
});

describe("savedAtLabel", () => {
  it("heure seule le jour même, date sinon", async () => {
    const { savedAtLabel } = await load();
    const ts = new Date(2026, 9, 14, 15, 32).getTime();
    expect(savedAtLabel(ts, new Date(2026, 9, 14, 20, 0).getTime())).toBe("à 15:32");
    expect(savedAtLabel(ts, new Date(2026, 9, 16, 9, 0).getTime())).toBe("le 14/10 à 15:32");
    expect(savedAtLabel(Date.now())).toMatch(/^à \d\d:\d\d$/);
  });
});
