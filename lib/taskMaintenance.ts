import {
  collectCompletionDates,
  normalizeTaskVerification,
  type TaskMaintenanceSnapshot,
  type TaskVerificationRecord,
} from "@/lib/taskRecord";
import {
  computeVerificationState,
  normalizeEmailList,
  normalizeGoalCadence,
  normalizeGoalTasks,
  resolveTaskStatus,
} from "@/lib/tasks";

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

export type TaskMaintenanceResult = TaskMaintenanceSnapshot & {
  changed: boolean;
};

function parseDateKey(dateKey: string): Date | null {
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    return null;
  }

  const [year, month, day] = dateKey.split("-").map((part) => Number.parseInt(part ?? "", 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfLocalWeek(reference: Date): Date {
  const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

class TaskMaintenanceEngine {
  private readonly now = new Date();
  private readonly weekStart = startOfLocalWeek(this.now);
  private readonly status = resolveTaskStatus(this.input.status, this.input.done);
  private readonly sharedWith = normalizeEmailList(this.input.sharedWith);
  private readonly goalTasks = normalizeGoalTasks(this.input.goalTasks);
  private readonly completionDates = collectCompletionDates(this.input.completionDates, this.goalTasks);
  private readonly latestCompletionDate = this.completionDates[this.completionDates.length - 1] ?? "";
  private readonly weeklyTracked = normalizeGoalCadence(this.input.goalCadence) === "weekly";
  private readonly staleFromPreviousWeek =
    this.weeklyTracked && !!this.latestCompletionDate && !this.isInCurrentWeek(this.latestCompletionDate);
  private readonly originalVerificationSnapshot = normalizeTaskVerification(this.input.verification, this.sharedWith);

  constructor(
    private readonly input: TaskMaintenanceInput,
    private readonly retentionDays: number,
  ) {}

  run(): TaskMaintenanceResult {
    const goalTasks = this.goalTasks.map((goalTask) => {
      const nextGoalTask = { ...goalTask };

      if (this.staleFromPreviousWeek && nextGoalTask.done) {
        nextGoalTask.done = false;
      }

      if (
        nextGoalTask.proofImageDataUrl &&
        ((this.weeklyTracked && nextGoalTask.completedAt && !this.isInCurrentWeek(nextGoalTask.completedAt)) ||
          (nextGoalTask.completedAt && this.isOlderThanRetention(nextGoalTask.completedAt)))
      ) {
        nextGoalTask.proofImageDataUrl = "";
      }

      return nextGoalTask;
    });

    let status = this.status;
    let done = status === "completed";

    if (this.staleFromPreviousWeek && (this.status === "completed" || this.goalTasks.some((goalTask) => goalTask.done))) {
      status = "not_started";
      done = false;
    }

    const completionDates = collectCompletionDates(this.input.completionDates, goalTasks);
    const verification = this.refreshVerification();
    const changed =
      this.status !== status ||
      (this.status === "completed") !== done ||
      JSON.stringify(this.goalTasks) !== JSON.stringify(goalTasks) ||
      JSON.stringify(this.completionDates) !== JSON.stringify(completionDates) ||
      JSON.stringify(this.originalVerificationSnapshot) !== JSON.stringify(verification);

    return { changed, goalTasks, status, done, completionDates, verification };
  }

  private refreshVerification(): TaskVerificationRecord {
    const verification = {
      ...this.originalVerificationSnapshot,
      peerConfirmations: [...this.originalVerificationSnapshot.peerConfirmations],
    };

    if (
      verification.proofImageDataUrl &&
      (this.staleFromPreviousWeek || (!!this.latestCompletionDate && this.isOlderThanRetention(this.latestCompletionDate)))
    ) {
      verification.proofImageDataUrl = "";
    }

    if (this.staleFromPreviousWeek && verification.peerConfirmations.length > 0) {
      verification.peerConfirmations = [];
    }

    verification.state = computeVerificationState({
      modes: verification.modes as Parameters<typeof computeVerificationState>[0]["modes"],
      photoProofImageDataUrl: verification.proofImageDataUrl,
      geolocationLabel: verification.geolocationLabel,
      peerConfirmers: verification.peerConfirmers,
      peerConfirmations: verification.peerConfirmations,
    });

    return verification;
  }

  private isInCurrentWeek(dateKey: string): boolean {
    const parsed = parseDateKey(dateKey);

    if (!parsed) {
      return false;
    }

    const end = new Date(this.weekStart);
    end.setDate(end.getDate() + 7);
    return parsed >= this.weekStart && parsed < end;
  }

  private isOlderThanRetention(dateKey: string): boolean {
    const parsed = parseDateKey(dateKey);

    if (!parsed) {
      return false;
    }

    const todayStart = new Date(this.now.getFullYear(), this.now.getMonth(), this.now.getDate());
    return todayStart.getTime() - parsed.getTime() > this.retentionDays * DAY_MS;
  }
}

export function applyTaskMaintenance(input: TaskMaintenanceInput, retentionDays = 7): TaskMaintenanceResult {
  return new TaskMaintenanceEngine(input, retentionDays).run();
}
