type LocalAdminSession = {
  active: true;
  username: string;
  startedAt: string;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function isLocalAdminCredentialPair(username: string, password: string) {
  void username;
  void password;
  return false;
}

export function startLocalAdminSession() {
  return null;
}

export function clearLocalAdminSession() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem("termer_local_admin_session");
}

export function getLocalAdminSession(): LocalAdminSession | null {
  return null;
}

export function hasLocalAdminSession() {
  return Boolean(getLocalAdminSession());
}
