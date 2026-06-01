import { useCallback, useEffect, useState } from "react";
import { API_ROOT } from "../config/runtime.ts";

export type CatalogRuntimeUniversityStatus = {
  id: string;
  updatedAt: string | null;
  hasTerms: boolean;
  hasCourses: boolean;
  currentTermCode: string | null;
};

export type CatalogRuntimeStatus = {
  sequence: number;
  changedAt: string;
  reason: string;
  autoRefreshEnabled: boolean;
  refreshIntervalMinutes: number;
  lastRefreshStartedAt: string | null;
  lastRefreshFinishedAt: string | null;
  lastRefreshSucceededAt: string | null;
  lastRefreshError: string | null;
  lastVisualImportAt: string | null;
  lastManualImportReloadAt: string | null;
  universities: CatalogRuntimeUniversityStatus[];
};

const CATALOG_STATUS_POLL_INTERVAL_MS = Number(
  import.meta.env.VITE_CATALOG_STATUS_POLL_INTERVAL_MS ?? 45_000,
);

async function fetchCatalogStatus(): Promise<CatalogRuntimeStatus | null> {
  const url = new URL(`${API_ROOT}/api/catalog-status`, window.location.origin);
  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Catalog status failed: ${response.status}`);
  }
  return response.json() as Promise<CatalogRuntimeStatus>;
}

export function useCatalogStatus() {
  const [status, setStatus] = useState<CatalogRuntimeStatus | null>(null);

  const refresh = useCallback(() => {
    fetchCatalogStatus()
      .then((nextStatus) => {
        if (!nextStatus) return;
        setStatus((currentStatus) => {
          if (
            currentStatus
            && currentStatus.sequence === nextStatus.sequence
            && currentStatus.changedAt === nextStatus.changedAt
            && currentStatus.lastRefreshError === nextStatus.lastRefreshError
          ) {
            return currentStatus;
          }
          return nextStatus;
        });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, CATALOG_STATUS_POLL_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  return status;
}
