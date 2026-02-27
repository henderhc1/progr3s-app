import {
  computeVerificationState,
  mergeVerificationModes,
  normalizeGoalCadence,
  normalizeEmailList,
  normalizeGoalTasks,
  normalizePeerConfirmations,
  resolveTaskStatus,
  resolveVerificationModes,
} from "@/lib/tasks";

const DAY_MS = 24 * 60 * 60 * 1000;

type TaskMaintenanceInput = {
  status?: unknown;
  done?: unknown;
  scheduledDays?: unknown;
  goalCadence?: unknown;
  completionDates?: unknown;
  goalTasks?: unknown;
  verification?: {
    mode?: unknown;
    modes?: unknown;
    state?: unknown;
    proofLabel?: unknown;
    proofImageDataUrl?: unknown;
    geolocationLabel?: unknown;
    peerConfirmers?: unknown;
    peerConfirmations?: unknown;
  } | null;
  sharedWith?: unknown;
};

type TaskMaintenanceResult = {
  changed: boolean;
  goalTasks: ReturnType<typeof normalizeGoalTasks>;
  status: ReturnType<typeof resolveTaskStatus>;
  done: boolean;
  completionDates: string[];
  verification: {
    mode: string;
    modes: string[];
    state: ReturnType<typeof computeVerificationState>;
    proofLabel: string;
    proofImageDataUrl: string;
    geolocationLabel: string;
    peerConfirmers: string[];
    peerConfirmations: ReturnType<typeof normalizePeerConfirmations>;
  };
};

function parseDateKey(dateKey: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return null;
  }

  const [yearRaw, monthRaw, dayRaw] = dateKey.split("-");
  const year = Number.parseInt(yearRaw ?? "", 10);
  const month = Number.parseInt(monthRaw ?? "", 10);
  const day = Number.parseInt(dayRaw ?? "", 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function startOfLocalWeek(reference: Date): Date {
  const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function isDateKeyInWeek(dateKey: string, weekStart: Date): boolean {
  const parsed = parseDateKey(dateKey);

  if (!parsed) {
    return false;
  }

  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);
  return parsed >= weekStart && parsed < end;
}

function isDateKeyOlderThanDays(dateKey: string, days: number, now: Date): boolean {
  const parsed = parseDateKey(dateKey);

  if (!parsed) {
    return false;
  }

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = todayStart.getTime() - parsed.getTime();
  return diff > days * DAY_MS;
}

function normalizeCompletionDates(baseDates: unknown, goalTasks: ReturnType<typeof normalizeGoalTasks>): string[] {
  const dateSet = new Set<string>();

  if (Array.isArray(baseDates)) {
    for (const value of baseDates) {
      if (typeof value === "string") {
        dateSet.add(value);
      }
    }
  }

  for (const goalTask of goalTasks) {
    if (goalTask.completedAt) {
      dateSet.add(goalTask.completedAt);
    }
  }

  return Array.from(dateSet).sort((a, b) => a.localeCompare(b));
}

export function applyTaskMaintenance(input: TaskMaintenanceInput, retentionDays = 7): TaskMaintenanceResult {
  const now = new Date();
  const weekStart = startOfLocalWeek(now);
  const goalCadence = normalizeGoalCadence(input.goalCadence);
  const weeklyTracked = goalCadence === "weekly";
  const normalizedStatus = resolveTaskStatus(input.status, input.done);
  const normalizedGoalTasks = normalizeGoalTasks(input.goalTasks);
  const normalizedCompletionDates = normalizeCompletionDates(input.completionDates, normalizedGoalTasks);
  const latestCompletionDate = normalizedCompletionDates[normalizedCompletionDates.length - 1] ?? "";
  const staleFromPreviousWeek = weeklyTracked && !!latestCompletionDate && !isDateKeyInWeek(latestCompletionDate, weekStart);

  const nextGoalTasks = normalizedGoalTasks.map((goalTask) => {
    const nextGoalTask = { ...goalTask };

    if (staleFromPreviousWeek && nextGoalTask.done) {
      nextGoalTask.done = false;
    }

    const staleTaskImage = weeklyTracked && !!nextGoalTask.completedAt && !isDateKeyInWeek(nextGoalTask.completedAt, weekStart);
    const oldTaskImage =
      !!nextGoalTask.completedAt && isDateKeyOlderThanDays(nextGoalTask.completedAt, retentionDays, now);

    if ((staleTaskImage || oldTaskImage) && nextGoalTask.proofImageDataUrl) {
      nextGoalTask.proofImageDataUrl = "";
    }

    return nextGoalTask;
  });

  const completionDates = normalizeCompletionDates(input.completionDates, nextGoalTasks);

  let status = normalizedStatus;
  let done = status === "completed";

  if (staleFromPreviousWeek && (normalizedStatus === "completed" || done)) {
    status = "not_started";
    done = false;
  }

  const sharedWith = normalizeEmailList(input.sharedWith);
  const verificationModes = mergeVerificationModes(
    resolveVerificationModes(input.verification?.modes, input.verification?.mode),
    sharedWith.length > 0 ? ["peer"] : [],
  );
  const rawProofLabel = typeof input.verification?.proofLabel === "string" ? input.verification.proofLabel.trim() : "";
  const rawGeolocationLabel =
    typeof input.verification?.geolocationLabel === "string" ? input.verification.geolocationLabel.trim() : "";
  const geolocationLabel = rawGeolocationLabel || (rawProofLabel.startsWith("geo:") ? rawProofLabel : "");
  const proofLabel = geolocationLabel && rawProofLabel === geolocationLabel ? "" : rawProofLabel;

  let proofImageDataUrl =
    typeof input.verification?.proofImageDataUrl === "string" && input.verification.proofImageDataUrl.startsWith("data:image/")
      ? input.verification.proofImageDataUrl
      : "";

  if (proofImageDataUrl) {
    const staleGoalImage = staleFromPreviousWeek;
    const oldGoalImage = latestCompletionDate ? isDateKeyOlderThanDays(latestCompletionDate, retentionDays, now) : false;

    if (staleGoalImage || oldGoalImage) {
      proofImageDataUrl = "";
    }
  }

  const peerConfirmers = sharedWith.length > 0 ? sharedWith : normalizeEmailList(input.verification?.peerConfirmers);
  let peerConfirmations = normalizePeerConfirmations(input.verification?.peerConfirmations).filter((confirmation) =>
    peerConfirmers.includes(confirmation.email),
  );

  if (staleFromPreviousWeek && peerConfirmations.length > 0) {
    peerConfirmations = [];
  }

  const verificationState = computeVerificationState({
    modes: verificationModes,
    photoProofImageDataUrl: proofImageDataUrl,
    geolocationLabel,
    peerConfirmers,
    peerConfirmations,
  });

  const originalVerificationModes = mergeVerificationModes(
    resolveVerificationModes(input.verification?.modes, input.verification?.mode),
    sharedWith.length > 0 ? ["peer"] : [],
  );
  const originalProofImageDataUrl =
    typeof input.verification?.proofImageDataUrl === "string" && input.verification.proofImageDataUrl.startsWith("data:image/")
      ? input.verification.proofImageDataUrl
      : "";
  const originalPeerConfirmers = sharedWith.length > 0 ? sharedWith : normalizeEmailList(input.verification?.peerConfirmers);
  const originalPeerConfirmations = normalizePeerConfirmations(input.verification?.peerConfirmations).filter((confirmation) =>
    originalPeerConfirmers.includes(confirmation.email),
  );
  const originalVerificationState = computeVerificationState({
    modes: originalVerificationModes,
    photoProofImageDataUrl: originalProofImageDataUrl,
    geolocationLabel,
    peerConfirmers: originalPeerConfirmers,
    peerConfirmations: originalPeerConfirmations,
  });

  const changed =
    normalizedStatus !== status ||
    (normalizedStatus === "completed") !== done ||
    JSON.stringify(normalizedGoalTasks) !== JSON.stringify(nextGoalTasks) ||
    JSON.stringify(normalizedCompletionDates) !== JSON.stringify(completionDates) ||
    originalProofImageDataUrl !== proofImageDataUrl ||
    JSON.stringify(originalPeerConfirmations) !== JSON.stringify(peerConfirmations) ||
    JSON.stringify(originalVerificationModes) !== JSON.stringify(verificationModes) ||
    originalVerificationState !== verificationState;

  return {
    changed,
    goalTasks: nextGoalTasks,
    status,
    done,
    completionDates,
    verification: {
      mode: verificationModes[0] ?? "none",
      modes: verificationModes,
      state: verificationState,
      proofLabel,
      proofImageDataUrl,
      geolocationLabel,
      peerConfirmers,
      peerConfirmations,
    },
  };
}
