import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import "./styles.css";
import { initTheme } from "./theme";

initTheme();

const WEEK = 7 * 24 * 3600 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      // Gardées une semaine, et sauvegardées : les séjours déjà ouverts restent lisibles hors ligne.
      gcTime: WEEK,
      // Tente le réseau même hors ligne (sinon la requête reste suspendue) puis retombe sur le cache.
      networkMode: "offlineFirst",
    },
  },
});

const persister = createSyncStoragePersister({ storage: window.localStorage, key: "fp:cache" });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: WEEK, buster: __BUILD_ID__ }}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);
