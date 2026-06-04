const DEFAULT_SUPABASE_URL = "https://wymsmputeifyemyprlpt.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5bXNtcHV0ZWlmeWVteXBybHB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MDIxMDAsImV4cCI6MjA4NzI3ODEwMH0.96_DkUJkJLw-86zwa-xleklN-TCYSZ8dk10DNMQFl28";

function stripTrailingSlash(value = "") {
  return value.replace(/\/+$/, "");
}

function normalizeBasePath(value = "/") {
  const normalized = String(value || "/").trim();
  if (!normalized || normalized === "/") return "/";
  return `/${normalized.replace(/^\/+|\/+$/g, "")}`;
}

function resolveWindowOrigin() {
  if (typeof window === "undefined") return "";
  return stripTrailingSlash(window.location.origin || "");
}

function isLocalHost(hostname = "") {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isPreviewOrDevPort(port = "") {
  return /^(417|517)\d*$/.test(port);
}

function resolveApiRoot() {
  const explicit = stripTrailingSlash(import.meta.env.VITE_API_URL || "");
  if (explicit) {
    return {
      viteApiUrl: explicit,
      resolvedApiRoot: explicit,
      origin: resolveWindowOrigin(),
      usingExplicitApiUrl: true,
      usingDevProxyFallback: false,
      configurationWarning: "",
    };
  }

  if (typeof window === "undefined") {
    return {
      viteApiUrl: "",
      resolvedApiRoot: "",
      origin: "",
      usingExplicitApiUrl: false,
      usingDevProxyFallback: false,
      configurationWarning: "",
    };
  }

  const { protocol, hostname, port } = window.location;
  if (!hostname) {
    return {
      viteApiUrl: "",
      resolvedApiRoot: "",
      origin: resolveWindowOrigin(),
      usingExplicitApiUrl: false,
      usingDevProxyFallback: false,
      configurationWarning: "Window location origin is unavailable.",
    };
  }

  if (isLocalHost(hostname) && isPreviewOrDevPort(port)) {
    return {
      viteApiUrl: "",
      resolvedApiRoot: `${protocol}//${hostname}:3001`,
      origin: resolveWindowOrigin(),
      usingExplicitApiUrl: false,
      usingDevProxyFallback: true,
      configurationWarning: "",
    };
  }

  if (isLocalHost(hostname)) {
    return {
      viteApiUrl: "",
      resolvedApiRoot: resolveWindowOrigin(),
      origin: resolveWindowOrigin(),
      usingExplicitApiUrl: false,
      usingDevProxyFallback: false,
      configurationWarning: "",
    };
  }

  return {
    viteApiUrl: "",
    resolvedApiRoot: resolveWindowOrigin(),
    origin: resolveWindowOrigin(),
    usingExplicitApiUrl: false,
    usingDevProxyFallback: false,
    configurationWarning:
      "VITE_API_URL is not set, so Termer is using the current site origin for API calls. Set VITE_API_URL when the frontend and backend are hosted separately.",
  };
}

const runtimeApi = resolveApiRoot();

export const API_ROOT = runtimeApi.resolvedApiRoot;
export const APP_BASE_PATH = normalizeBasePath(import.meta.env.BASE_URL || import.meta.env.VITE_APP_BASE_PATH || "/");
export const PUBLIC_SITE_URL = stripTrailingSlash(
  import.meta.env.VITE_PUBLIC_SITE_URL
  || (typeof window !== "undefined" ? window.location.origin : ""),
);
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
export const API_DIAGNOSTICS = runtimeApi;

export function buildAppPath(pathname = "/") {
  const cleanPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (APP_BASE_PATH === "/") return cleanPath;
  return `${APP_BASE_PATH}${cleanPath}`.replace(/\/{2,}/g, "/");
}

export function buildAppUrl(pathname = "/") {
  const appPath = buildAppPath(pathname);
  return PUBLIC_SITE_URL
    ? new URL(appPath, `${PUBLIC_SITE_URL}/`).toString()
    : appPath;
}
