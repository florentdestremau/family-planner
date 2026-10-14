import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import { install, online, savedAtLabel } from "../pwa";

export function useOnline(): boolean {
  return useSyncExternalStore(online.subscribe, online.get);
}

/** Bandeau hors ligne : on consulte les données gardées, sans pouvoir les modifier. */
export function OfflineBanner({ savedAt, failed = false }: { savedAt?: number; failed?: boolean }) {
  const isOnline = useOnline();
  if (isOnline && !failed) return null;
  return (
    <div className="offline-banner no-print" role="status">
      📴 {isOnline ? "Connexion impossible" : "Hors ligne"}
      {savedAt ? ` · données ${savedAtLabel(savedAt)}` : ""} · consultation seule
    </div>
  );
}

/** Désactive les champs et boutons qu'il contient quand on est hors ligne. */
export function OfflineLock({ children }: { children: React.ReactNode }) {
  const isOnline = useOnline();
  return (
    <fieldset className="offline-lock" disabled={!isOnline}>
      {children}
    </fieldset>
  );
}

/** Bouton « Installer l'appli » : invite du navigateur, ou mode d'emploi sur iPhone / iPad. */
export function InstallButton({ compact = false }: { compact?: boolean }) {
  useSyncExternalStore(install.subscribe, install.get);
  const [help, setHelp] = useState(false);
  const mode = install.mode();
  if (mode === "installed" || mode === "none") return null;

  return (
    <>
      <button
        className={compact ? "theme-toggle" : "btn btn-small install-btn"}
        onClick={() => (mode === "prompt" ? void install.prompt() : setHelp(true))}
        title="Installer l'appli sur cet appareil"
        aria-label="Installer l'appli"
      >
        {compact ? <span className="theme-toggle-icon">📲</span> : "📲 Installer l'appli"}
      </button>
      {help &&
        // Hors de la barre du haut (sticky, flou) qui piégerait la fenêtre dans son empilement.
        createPortal(
          <div className="install-help-backdrop" onClick={() => setHelp(false)}>
            <div className="card install-help" role="dialog" aria-label="Installer l'appli" onClick={(e) => e.stopPropagation()}>
              <h2>📲 Installer l'appli</h2>
              <ol>
                <li>
                  Dans Safari, touchez <strong>Partager</strong> (le carré avec une flèche vers le haut).
                </li>
                <li>
                  Choisissez <strong>Sur l'écran d'accueil</strong>, puis <strong>Ajouter</strong>.
                </li>
              </ol>
              <p className="hint">L'appli s'ouvrira en plein écran et restera consultable hors ligne.</p>
              <button className="btn btn-primary" onClick={() => setHelp(false)}>
                Compris
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

const HOUR = 3600 * 1000;

/** Enregistre le service worker et propose de recharger quand une nouvelle version est prête. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // Une appli installée reste ouverte longtemps : on vérifie les mises à jour toutes les heures.
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), HOUR);
    },
  });
  if (!needRefresh) return null;
  return (
    <div className="update-prompt no-print" role="status">
      <span>✨ Nouvelle version disponible</span>
      <button className="btn btn-small btn-primary" onClick={() => void updateServiceWorker(true)}>
        Recharger
      </button>
      <button className="btn btn-small btn-ghost" onClick={() => setNeedRefresh(false)} aria-label="Plus tard">
        ✕
      </button>
    </div>
  );
}
