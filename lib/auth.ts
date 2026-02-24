// Shared auth values live here so pages and API routes stay consistent.
export const SESSION_COOKIE_NAME = "progr3s_session";

export type UserRole = "user" | "admin";

// Demo-only user for this MVP. Replace with database users later.
export const DEMO_USER = {
  email: process.env.DEMO_USER_EMAIL?.trim().toLowerCase() ?? "",
  password: process.env.DEMO_USER_PASSWORD?.trim() ?? "",
  name: "Demo Builder",
  role: "user" as UserRole,
};

export const DEMO_ADMIN = {
  email: process.env.DEMO_ADMIN_EMAIL?.trim().toLowerCase() ?? "",
  password: process.env.DEMO_ADMIN_PASSWORD?.trim() ?? "",
  name: "Admin Owner",
  role: "admin" as UserRole,
};

export function hasConfiguredDemoCredentials(): boolean {
  return Boolean(
    DEMO_USER.email &&
      DEMO_USER.password &&
      DEMO_ADMIN.email &&
      DEMO_ADMIN.password &&
      DEMO_USER.password.length >= 8 &&
      DEMO_ADMIN.password.length >= 8,
  );
}

export function normalizeEmail(value: string | undefined): string {
  // Lowercase + trim keeps comparisons stable across input styles.
  return value?.trim().toLowerCase() ?? "";
}

export function createSessionValue(email: string): string {
  // Prefix lets us quickly validate format before trusting the value.
  return `session:${email}`;
}

export function readEmailFromSession(sessionValue: string | undefined): string | null {
  if (!sessionValue) {
    return null;
  }

  if (!sessionValue.startsWith("session:")) {
    return null;
  }

  return sessionValue.replace("session:", "");
}
