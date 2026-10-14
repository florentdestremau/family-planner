import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router";
import { useRegisterSW } from "virtual:pwa-register/react";
import { countView, dismissNudge, install, isMobile, type NudgeState, online, savedAtLabel, shouldSuggestInstall } from "../pwa";
import { storage } from "../storage";

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
      {help && <IosInstallHelp onClose={() => setHelp(false)} />}
    </>
  );
}

/** Mode d'emploi Safari : iOS n'a pas d'invite d'installation. */
function IosInstallHelp({ onClose }: { onClose: () => void }) {
  // Hors de la barre du haut (sticky, flou) qui piégerait la fenêtre dans son empilement.
  return createPortal(
    <div className="install-help-backdrop" onClick={onClose}>
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
        <button className="btn btn-primary" onClick={onClose}>
          Compris
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Bandeau discret qui suggère l'installation, sur mobile, à partir de la 3ᵉ page vue. « Plus tard »
 * le masque ; il revient au plus tôt 14 jours après, 3 refus au plus (règles dans pwa.ts).
 */
export function InstallNudge() {
  const { pathname } = useLocation();
  useSyncExternalStore(install.subscribe, install.get);
  const [state, setState] = useState(() => storage.installNudge());
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const next = countView(storage.installNudge(), pathname);
    storage.setInstallNudge(next);
    setState(next);
  }, [pathname]);

  const save = (next: NudgeState) => {
    storage.setInstallNudge(next);
    setState(next);
  };
  const later = () => save(dismissNudge(state));

  async function accept() {
    if (install.mode() === "ios") return setHelp(true);
    if (await install.prompt()) save({ ...state, done: true });
    else later();
  }

  const mode = install.mode();
  const visible = isMobile() && (mode === "prompt" || mode === "ios") && !pathname.includes("/imprimer") && shouldSuggestInstall(state);
  if (help)
    return (
      <IosInstallHelp
        onClose={() => {
          setHelp(false);
          later();
        }}
      />
    );
  if (!visible) return null;
  return (
    <div className="install-nudge no-print" role="status">
      <span>📲 L'appli, même hors ligne</span>
      <button className="btn btn-small btn-primary" onClick={() => void accept()}>
        Installer
      </button>
      <button className="install-nudge-close" onClick={later} aria-label="Plus tard" title="Plus tard">
        ✕
      </button>
    </div>
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
