import {
  computeVerificationState,
  mergeVerificationModes,
  normalizeEmailList,
  normalizeGoalCadence,
  normalizeGoalTasks,
  normalizeGoalType,
  normalizePeerConfirmations,
  normalizeScheduledDays,
  resolveTaskStatus,
  resolveVerificationModes,
  type GoalTaskItem,
  type PeerConfirmation,
  type VerificationState,
} from "@/lib/tasks";

type VerificationSource =
  | {
      mode?: unknown;
      modes?: unknown;
      state?: unknown;
      proofLabel?: unknown;
      proofImageDataUrl?: unknown;
      geolocationLabel?: unknown;
      peerConfirmers?: unknown;
      peerConfirmations?: unknown;
    }
  | null
  | undefined;

type TaskRecordSource = {
  _id: string | { toString(): string };
  ownerEmail?: unknown;
  title?: unknown;
  goalType?: unknown;
  goalCadence?: unknown;
  goalTasks?: unknown;
  status?: unknown;
  done?: unknown;
  scheduledDays?: unknown;
  completionDates?: unknown;
  verification?: VerificationSource;
  sharedWith?: unknown;
};

type TaskDocumentMutator = {
  set(path: "goalTasks" | "verification", value: unknown): void;
  status: string;
  done: boolean;
  completionDates: string[];
};

type NormalizeVerificationOptions = {
  forcePeerMode?: boolean;
  state?: VerificationState;
};

export type TaskVerificationRecord = {
  mode: string;
  modes: string[];
  state: VerificationState;
  proofLabel: string;
  proofImageDataUrl: string;
  geolocationLabel: string;
  peerConfirmers: string[];
  peerConfirmations: PeerConfirmation[];
};

export type TaskMaintenanceSnapshot = {
  goalTasks: GoalTaskItem[];
  status: ReturnType<typeof resolveTaskStatus>;
  done: boolean;
  completionDates: string[];
  verification: TaskVerificationRecord;
};

export type TaskProofUpload = {
  title: string;
  proofLabel: string;
  proofImageDataUrl: string;
  completedAt: string;
};

function toTaskId(value: TaskRecordSource["_id"]): string {
  return typeof value === "string" ? value : value.toString();
}

function toTaskTitle(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "Untitled goal";
}

export function createGoalTaskId(seed = ""): string {
  return `goal-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${seed ? `-${seed}` : ""}`;
}

export function collectCompletionDates(baseDates: unknown, goalTasks: GoalTaskItem[]): string[] {
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

export function normalizeTaskVerification(
  verification: VerificationSource,
  sharedWith: string[],
  { forcePeerMode = false, state }: NormalizeVerificationOptions = {},
): TaskVerificationRecord {
  const peerConfirmers = sharedWith.length > 0 ? sharedWith : normalizeEmailList(verification?.peerConfirmers);
  const peerConfirmations = normalizePeerConfirmations(verification?.peerConfirmations).filter((confirmation) =>
    peerConfirmers.includes(confirmation.email),
  );
  const rawProofLabel = typeof verification?.proofLabel === "string" ? verification.proofLabel.trim() : "";
  const rawGeolocationLabel = typeof verification?.geolocationLabel === "string" ? verification.geolocationLabel.trim() : "";
  const geolocationLabel = rawGeolocationLabel || (rawProofLabel.startsWith("geo:") ? rawProofLabel : "");
  const proofLabel = geolocationLabel && rawProofLabel === geolocationLabel ? "" : rawProofLabel;
  const proofImageDataUrl =
    typeof verification?.proofImageDataUrl === "string" && verification.proofImageDataUrl.startsWith("data:image/")
      ? verification.proofImageDataUrl
      : "";
  const modes = mergeVerificationModes(
    resolveVerificationModes(verification?.modes, verification?.mode),
    forcePeerMode || sharedWith.length > 0 ? ["peer"] : [],
  );
  const verificationState =
    state ??
    computeVerificationState({
      modes,
      photoProofImageDataUrl: proofImageDataUrl,
      geolocationLabel,
      peerConfirmers,
      peerConfirmations,
    });

  return {
    mode: modes[0] ?? "none",
    modes,
    state: verificationState,
    proofLabel,
    proofImageDataUrl,
    geolocationLabel,
    peerConfirmers,
    peerConfirmations,
  };
}

export function normalizeTaskRecord(task: TaskRecordSource) {
  const goalTasks = normalizeGoalTasks(task.goalTasks);
  const status = resolveTaskStatus(task.status, task.done);
  const sharedWith = normalizeEmailList(task.sharedWith);

  return {
    _id: toTaskId(task._id),
    ownerEmail: typeof task.ownerEmail === "string" ? task.ownerEmail : "",
    title: toTaskTitle(task.title),
    goalType: normalizeGoalType(task.goalType),
    goalCadence: normalizeGoalCadence(task.goalCadence),
    goalTasks,
    status,
    done: status === "completed",
    scheduledDays: normalizeScheduledDays(task.scheduledDays),
    completionDates: collectCompletionDates(task.completionDates, goalTasks),
    verification: normalizeTaskVerification(task.verification, sharedWith),
    sharedWith,
  };
}

export function normalizeSharedTaskRecord(task: TaskRecordSource, identityEmail: string) {
  const ownerEmail = typeof task.ownerEmail === "string" ? task.ownerEmail : "";
  const sharedWith = normalizeEmailList(task.sharedWith).filter((email) => email !== ownerEmail);
  const verification = normalizeTaskVerification(task.verification, sharedWith, { forcePeerMode: true });

  return {
    _id: toTaskId(task._id),
    ownerEmail,
    title: toTaskTitle(task.title),
    status: resolveTaskStatus(task.status, task.done),
    sharedWith,
    verification,
    confirmedByCurrentUser: verification.peerConfirmations.some((confirmation) => confirmation.email === identityEmail),
  };
}

export function collectProofUploads(goalTasks: GoalTaskItem[], verification: Pick<TaskVerificationRecord, "proofLabel" | "proofImageDataUrl">) {
  const proofUploads = goalTasks
    .filter((goalTask) => !!goalTask.proofImageDataUrl)
    .map((goalTask) => ({
      title: goalTask.title,
      proofLabel: goalTask.proofLabel,
      proofImageDataUrl: goalTask.proofImageDataUrl,
      completedAt: goalTask.completedAt,
    }));

  if (verification.proofImageDataUrl) {
    proofUploads.unshift({
      title: "Goal proof upload",
      proofLabel: verification.proofLabel,
      proofImageDataUrl: verification.proofImageDataUrl,
      completedAt: "",
    });
  }

  return proofUploads;
}

export function normalizePeerRequestRecord(task: TaskRecordSource, identityEmail: string) {
  const sharedTask = normalizeSharedTaskRecord(task, identityEmail);
  const verification = {
    ...sharedTask.verification,
    state: sharedTask.verification.peerConfirmations.length > 0 ? "verified" : "pending",
  } satisfies TaskVerificationRecord;

  return {
    _id: sharedTask._id,
    ownerEmail: sharedTask.ownerEmail,
    title: sharedTask.title,
    status: sharedTask.status,
    verification: {
      mode: verification.mode,
      modes: verification.modes,
      state: verification.state,
      geolocationLabel: verification.geolocationLabel,
      peerConfirmers: verification.peerConfirmers,
      peerConfirmations: verification.peerConfirmations,
    },
    proofUploads: collectProofUploads(normalizeGoalTasks(task.goalTasks), verification),
    confirmedByCurrentUser: sharedTask.confirmedByCurrentUser,
  };
}

export function toStoredPeerConfirmations(peerConfirmations: PeerConfirmation[]) {
  return peerConfirmations.map((confirmation) => ({
    email: confirmation.email,
    confirmedAt: new Date(confirmation.confirmedAt),
  }));
}

export function toStoredVerification(verification: TaskVerificationRecord) {
  return {
    ...verification,
    peerConfirmations: toStoredPeerConfirmations(verification.peerConfirmations),
  };
}

export function applyMaintenanceResultToTask(
  task: TaskDocumentMutator,
  maintenance: TaskMaintenanceSnapshot,
): void {
  task.set("goalTasks", maintenance.goalTasks);
  task.status = maintenance.status;
  task.done = maintenance.done;
  task.completionDates = maintenance.completionDates;
  task.set("verification", toStoredVerification(maintenance.verification));
}
