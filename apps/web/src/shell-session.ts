/** Mirrors @hofos/shell-ui/signOutOfHofShell — local copy avoids peer version drift during typecheck. */
export function driveShellSignOut({
  redirectTo = "/",
  reload = false,
  extraStorageKeys = [] as readonly string[],
}: {
  redirectTo?: string | null;
  reload?: boolean;
  extraStorageKeys?: readonly string[];
} = {}): void {
  if (typeof window === "undefined") return;
  for (const key of ["hof_token", "mailai.token", ...extraStorageKeys]) {
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch {
      //
    }
  }
  for (const key of ["hof_subapp_session", "hof_token"]) {
    document.cookie = `${encodeURIComponent(key)}=; path=/; max-age=0; SameSite=Lax`;
  }
  if (redirectTo !== null) {
    window.location.href = redirectTo;
  } else if (reload) {
    window.location.reload();
  }
}
