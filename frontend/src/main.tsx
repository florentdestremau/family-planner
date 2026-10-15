import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { defaultShouldDehydrateQuery, QueryClient } from "@tanstack/react-query";
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

const persister = createAsyncStoragePersister({ storage: window.localStorage, key: "fp:cache" });

const root = document.getElementById("root");
if (!root) throw new Error("Élément #root introuvable");
createRoot(root).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: WEEK,
        buster: __BUILD_ID__,
        // Le journal ne se consulte qu'avec le réseau : il n'est pas sauvegardé pour le hors-ligne.
        dehydrateOptions: { shouldDehydrateQuery: (q) => defaultShouldDehydrateQuery(q) && q.queryKey[0] !== "journal" },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);
