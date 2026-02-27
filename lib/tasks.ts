export const TASK_STATUSES = ["not_started", "in_progress", "completed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_FILTERS = ["active", "all", ...TASK_STATUSES] as const;
export type TaskFilter = (typeof TASK_FILTERS)[number];

export const VERIFICATION_MODES = ["none", "photo", "geolocation", "peer"] as const;
export type VerificationMode = (typeof VERIFICATION_MODES)[number];
export const ACTIVE_VERIFICATION_MODES = ["photo", "geolocation", "peer"] as const;
export type ActiveVerificationMode = (typeof ACTIVE_VERIFICATION_MODES)[number];

export const VERIFICATION_STATES = ["not_required", "pending", "submitted", "verified"] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];
export type PeerConfirmation = {
  email: string;
  confirmedAt: string;
};

export const GOAL_TYPES = ["general", "gym", "programming"] as const;
export type GoalType = (typeof GOAL_TYPES)[number];
export const GOAL_CADENCES = ["one_time", "weekly"] as const;
export type GoalCadence = (typeof GOAL_CADENCES)[number];

export type GoalTaskItem = {
  id: string;
  title: string;
  done: boolean;
  requiresProof: boolean;
  proofLabel: string;
  proofImageDataUrl: string;
  completedAt: string;
  peerConfirmations: PeerConfirmation[];
};

const TASK_STATUS_SET = new Set<string>(TASK_STATUSES);
const VERIFICATION_MODE_SET = new Set<string>(VERIFICATION_MODES);
const ACTIVE_VERIFICATION_MODE_SET = new Set<string>(ACTIVE_VERIFICATION_MODES);
const VERIFICATION_STATE_SET = new Set<string>(VERIFICATION_STATES);
const GOAL_TYPE_SET = new Set<string>(GOAL_TYPES);
const GOAL_CADENCE_SET = new Set<string>(GOAL_CADENCES);
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

export function normalizeVerificationModes(
  value: unknown,
  fallback: ActiveVerificationMode[] = [],
): ActiveVerificationMode[] {
  const modes = new Set<ActiveVerificationMode>();

  const addMode = (candidate: unknown) => {
    if (typeof candidate !== "string") {
      return;
    }

    const normalized = candidate.trim().toLowerCase();

    if (ACTIVE_VERIFICATION_MODE_SET.has(normalized)) {
      modes.add(normalized as ActiveVerificationMode);
    }
  };

  if (Array.isArray(value)) {
    for (const candidate of value) {
      addMode(candidate);
    }

    return ACTIVE_VERIFICATION_MODES.filter((mode) => modes.has(mode));
  }

  if (typeof value === "string") {
    for (const candidate of value.split(",")) {
      addMode(candidate);
    }

    return ACTIVE_VERIFICATION_MODES.filter((mode) => modes.has(mode));
  }

  if (value !== undefined) {
    return [];
  }

  return normalizeVerificationModes(fallback);
}

export function mergeVerificationModes(
  ...modeGroups: Array<Iterable<ActiveVerificationMode> | undefined>
): ActiveVerificationMode[] {
  const merged = new Set<ActiveVerificationMode>();

  for (const group of modeGroups) {
    if (!group) {
      continue;
    }

    for (const mode of group) {
      if (ACTIVE_VERIFICATION_MODE_SET.has(mode)) {
        merged.add(mode as ActiveVerificationMode);
      }
    }
  }

  return ACTIVE_VERIFICATION_MODES.filter((mode) => merged.has(mode));
}

export function resolveVerificationModes(
  modesValue: unknown,
  legacyModeValue: unknown,
): ActiveVerificationMode[] {
  const modes = normalizeVerificationModes(modesValue);

  if (modes.length > 0 || modesValue !== undefined) {
    return modes;
  }

  const legacyMode = normalizeVerificationMode(legacyModeValue);
  return legacyMode === "none" ? [] : [legacyMode];
}

export function normalizeGoalType(value: unknown, fallback: GoalType = "general"): GoalType {
  if (typeof value === "string" && GOAL_TYPE_SET.has(value)) {
    return value as GoalType;
  }

  return fallback;
}

export function normalizeGoalCadence(value: unknown, fallback: GoalCadence = "one_time"): GoalCadence {
  if (typeof value === "string" && GOAL_CADENCE_SET.has(value)) {
    return value as GoalCadence;
  }

  return fallback;
}

function normalizeGoalTaskDate(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return DATE_KEY_PATTERN.test(trimmed) ? trimmed : "";
}

export function normalizeGoalTasks(value: unknown): GoalTaskItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const tasks: GoalTaskItem[] = [];
  const seenIds = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];

    if (typeof raw !== "object" || raw === null) {
      continue;
    }

    const idCandidate = "id" in raw && typeof raw.id === "string" ? raw.id.trim() : "";
    const id = idCandidate || `goal-task-${index + 1}`;

    const title = "title" in raw && typeof raw.title === "string" ? raw.title.trim().slice(0, 120) : "";

    if (!title) {
      continue;
    }

    if (seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);

    const done = "done" in raw && raw.done === true;
    const requiresProof = "requiresProof" in raw && raw.requiresProof === true;
    const proofLabel = "proofLabel" in raw && typeof raw.proofLabel === "string" ? raw.proofLabel.trim().slice(0, 160) : "";
    const proofImageDataUrl =
      "proofImageDataUrl" in raw &&
      typeof raw.proofImageDataUrl === "string" &&
      raw.proofImageDataUrl.startsWith("data:image/")
        ? raw.proofImageDataUrl.slice(0, 2_500_000)
        : "";
    const completedAt = "completedAt" in raw ? normalizeGoalTaskDate(raw.completedAt) : "";
    const peerConfirmations = "peerConfirmations" in raw ? normalizePeerConfirmations(raw.peerConfirmations) : [];

    tasks.push({
      id,
      title,
      done,
      requiresProof,
      proofLabel,
      proofImageDataUrl,
      completedAt,
      peerConfirmations,
    });
  }

  return tasks;
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

type VerificationStateInput = {
  modes: ActiveVerificationMode[];
  photoProofImageDataUrl?: string;
  geolocationLabel?: string;
  peerConfirmers?: string[];
  peerConfirmations?: PeerConfirmation[];
};

export function computeVerificationState({
  modes,
  photoProofImageDataUrl = "",
  geolocationLabel = "",
  peerConfirmers = [],
  peerConfirmations = [],
}: VerificationStateInput): VerificationState {
  if (modes.length === 0) {
    return "not_required";
  }

  let satisfiedCount = 0;

  for (const mode of modes) {
    if (mode === "photo") {
      if (photoProofImageDataUrl.startsWith("data:image/")) {
        satisfiedCount += 1;
      }

      continue;
    }

    if (mode === "geolocation") {
      if (geolocationLabel.startsWith("geo:")) {
        satisfiedCount += 1;
      }

      continue;
    }

    if (peerConfirmers.length > 0 && peerConfirmations.length > 0) {
      satisfiedCount += 1;
    }
  }

  if (satisfiedCount === 0) {
    return "pending";
  }

  if (satisfiedCount === modes.length) {
    return "verified";
  }

  return "submitted";
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
