import { useCallback, useEffect, useState } from "react";
import { storage, type Theme } from "./storage";

const THEME_ICONS: Record<Theme, string> = {
  light: "☀️",
  dark: "🌙",
  system: "💻",
};

const THEME_LABELS: Record<Theme, string> = {
  light: "Clair",
  dark: "Sombre",
  system: "Système",
};

const THEME_ORDER: Theme[] = ["system", "light", "dark"];

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

/** Applique le thème au chargement (évite le flash). */
export function initTheme() {
  applyTheme(storage.theme());
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => storage.theme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    storage.setTheme(t);
    setThemeState(t);
  }, []);

  const cycle = useCallback(() => {
    const idx = THEME_ORDER.indexOf(theme);
    const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
    setTheme(next);
  }, [theme, setTheme]);

  return { theme, setTheme, cycle, icon: THEME_ICONS[theme], label: THEME_LABELS[theme] };
}

export function ThemeToggle() {
  const { cycle, icon, label } = useTheme();
  return (
    <button className="theme-toggle" onClick={cycle} title={`Thème : ${label} (cliquer pour changer)`} aria-label={`Thème : ${label}`}>
      <span className="theme-toggle-icon">{icon}</span>
    </button>
  );
}
