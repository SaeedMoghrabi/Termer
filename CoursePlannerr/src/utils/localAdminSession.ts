type LocalAdminSession = {
  active: true;
  username: string;
  startedAt: string;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function canUseLocalAdminLogin() {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export function isLocalAdminUsername(username: string) {
  return username.trim().toLowerCase() === "admin";
}

export function isLocalAdminCredentialPair(username: string, password: string) {
  if (!canUseLocalAdminLogin()) return false;
  return isLocalAdminUsername(username) && password === "admin123";
}

export function startLocalAdminSession(username = "admin"): LocalAdminSession | null {
  if (!canUseStorage() || !canUseLocalAdminLogin()) return null;
  const session: LocalAdminSession = {
    active: true,
    username,
    startedAt: new Date().toISOString(),
  };
  window.localStorage.setItem("termer_local_admin_session", JSON.stringify(session));
  return session;
}

export function clearLocalAdminSession() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem("termer_local_admin_session");
}

export function getLocalAdminSession(): LocalAdminSession | null {
  if (!canUseStorage() || !canUseLocalAdminLogin()) return null;
  try {
    const raw = window.localStorage.getItem("termer_local_admin_session");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalAdminSession>;
    return parsed?.active && parsed.username
      ? {
          active: true,
          username: parsed.username,
          startedAt: parsed.startedAt || new Date().toISOString(),
        }
      : null;
  } catch {
    clearLocalAdminSession();
    return null;
  }
}

export function hasLocalAdminSession() {
  return Boolean(getLocalAdminSession());
}
