export const TASK_STATUSES = ["not_started", "in_progress", "completed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_FILTERS = ["active", "all", ...TASK_STATUSES] as const;
export type TaskFilter = (typeof TASK_FILTERS)[number];

export const VERIFICATION_MODES = ["none", "photo", "geolocation", "peer"] as const;
export type VerificationMode = (typeof VERIFICATION_MODES)[number];

export const VERIFICATION_STATES = ["not_required", "pending", "submitted", "verified"] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];
export type PeerConfirmation = {
  email: string;
  confirmedAt: string;
};

const TASK_STATUS_SET = new Set<string>(TASK_STATUSES);
const VERIFICATION_MODE_SET = new Set<string>(VERIFICATION_MODES);
const VERIFICATION_STATE_SET = new Set<string>(VERIFICATION_STATES);

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizeTaskStatus(value: unknown, fallback: TaskStatus = "not_started"): TaskStatus {
  if (typeof value === "string" && TASK_STATUS_SET.has(value)) {
    return value as TaskStatus;
  }

  return fallback;
}

export function normalizeVerificationMode(
  value: unknown,
  fallback: VerificationMode = "none",
): VerificationMode {
  if (typeof value === "string" && VERIFICATION_MODE_SET.has(value)) {
    return value as VerificationMode;
  }

  return fallback;
}

export function normalizeVerificationState(
  value: unknown,
  fallback: VerificationState = "not_required",
): VerificationState {
  if (typeof value === "string" && VERIFICATION_STATE_SET.has(value)) {
    return value as VerificationState;
  }

  return fallback;
}

export function normalizeScheduledDays(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueDays = new Set<number>();

  for (const item of value) {
    const normalized =
      typeof item === "string"
        ? Number.parseInt(item, 10)
        : isNumber(item)
          ? Math.trunc(item)
          : Number.NaN;

    if (normalized >= 0 && normalized <= 6) {
      uniqueDays.add(normalized);
    }
  }

  return Array.from(uniqueDays).sort((a, b) => a - b);
}

export function normalizeEmailList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
          .filter((email) => email.length > 3 && email.includes("@")),
      ),
    );
  }

  if (typeof value === "string") {
    return Array.from(
      new Set(
        value
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .filter((email) => email.length > 3 && email.includes("@")),
      ),
    );
  }

  return [];
}

export function normalizePeerConfirmations(value: unknown): PeerConfirmation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const byEmail = new Map<string, string>();

  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const emailRaw = "email" in item ? item.email : "";
    const confirmedAtRaw = "confirmedAt" in item ? item.confirmedAt : "";

    if (typeof emailRaw !== "string" || !emailRaw.includes("@")) {
      continue;
    }

    const email = emailRaw.trim().toLowerCase();
    let confirmedAt = "";

    if (confirmedAtRaw instanceof Date) {
      confirmedAt = confirmedAtRaw.toISOString();
    } else if (typeof confirmedAtRaw === "string") {
      const parsed = new Date(confirmedAtRaw);
      confirmedAt = Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
    }

    if (!confirmedAt) {
      confirmedAt = new Date().toISOString();
    }

    byEmail.set(email, confirmedAt);
  }

  return Array.from(byEmail.entries())
    .map(([email, confirmedAt]) => ({ email, confirmedAt }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export function computePeerVerificationState(
  peerConfirmers: string[],
  peerConfirmations: PeerConfirmation[],
): VerificationState {
  if (peerConfirmers.length === 0) {
    return "not_required";
  }

  if (peerConfirmations.length === 0) {
    return "pending";
  }

  if (peerConfirmations.length < peerConfirmers.length) {
    return "submitted";
  }

  return "verified";
}

export function toLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftDateKey(dateKey: string, days: number): string {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split("-");
  const year = Number.parseInt(yearRaw ?? "", 10);
  const month = Number.parseInt(monthRaw ?? "", 10);
  const day = Number.parseInt(dayRaw ?? "", 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateKey;
  }

  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

export function computeStreakDays(dateKeys: Iterable<string>): number {
  const dateSet = new Set(Array.from(dateKeys));

  if (dateSet.size === 0) {
    return 0;
  }

  let streak = 0;
  let cursor = toLocalDateKey();

  while (dateSet.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  return streak;
}

export function resolveTaskStatus(statusValue: unknown, doneValue: unknown): TaskStatus {
  if (typeof statusValue === "string" && TASK_STATUS_SET.has(statusValue)) {
    return statusValue as TaskStatus;
  }

  if (typeof doneValue === "boolean") {
    return doneValue ? "completed" : "not_started";
  }

  return "not_started";
}
