"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  computeStreakDays,
  normalizeEmailList,
  normalizeScheduledDays,
  normalizeTaskStatus,
  normalizeVerificationMode,
  normalizeVerificationState,
  resolveTaskStatus,
  TaskFilter,
  TaskStatus,
  toLocalDateKey,
  VerificationMode,
  VerificationState,
} from "@/lib/tasks";

type DashboardSummary = {
  dateLabel: string;
  focusScore: number;
  streakDays: number;
  completedToday: number;
  pendingToday: number;
};

type TaskVerification = {
  mode: VerificationMode;
  state: VerificationState;
  proofLabel: string;
  peerConfirmers: string[];
};

type Task = {
  _id: string;
  title: string;
  status: TaskStatus;
  done: boolean;
  scheduledDays: number[];
  completionDates: string[];
  verification: TaskVerification;
  sharedWith: string[];
};

type TaskApiPayload = {
  _id?: string;
  title?: string;
  status?: string;
  done?: boolean;
  scheduledDays?: unknown;
  completionDates?: unknown;
  verification?: {
    mode?: string;
    state?: string;
    proofLabel?: string;
    peerConfirmers?: unknown;
  };
  sharedWith?: unknown;
};

type DashboardClientProps = {
  userName: string;
  userEmail: string;
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
};

const FILTER_OPTIONS: Array<{ value: TaskFilter; label: string }> = [
  { value: "active", label: "Active" },
  { value: "all", label: "All" },
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

const VERIFICATION_OPTIONS: Array<{ value: VerificationMode; label: string }> = [
  { value: "none", label: "No verification" },
  { value: "photo", label: "Photo proof (test)" },
  { value: "geolocation", label: "Geolocation (test)" },
  { value: "peer", label: "Peer confirmation" },
];

const DAYS: Array<{ value: number; short: string }> = [
  { value: 0, short: "Sun" },
  { value: 1, short: "Mon" },
  { value: 2, short: "Tue" },
  { value: 3, short: "Wed" },
  { value: 4, short: "Thu" },
  { value: 5, short: "Fri" },
  { value: 6, short: "Sat" },
];

const starterTasks: Task[] = [
  {
    _id: "starter-1",
    title: "Review roadmap for next sprint",
    status: "not_started",
    done: false,
    scheduledDays: [1, 3, 5],
    completionDates: [],
    verification: {
      mode: "none",
      state: "not_required",
      proofLabel: "",
      peerConfirmers: [],
    },
    sharedWith: [],
  },
  {
    _id: "starter-2",
    title: "Ship one frontend polish PR",
    status: "completed",
    done: true,
    scheduledDays: [2, 4],
    completionDates: [toLocalDateKey()],
    verification: {
      mode: "photo",
      state: "submitted",
      proofLabel: "starter-proof.jpg",
      peerConfirmers: [],
    },
    sharedWith: ["teammate@progr3s.dev"],
  },
  {
    _id: "starter-3",
    title: "Write API notes for auth flow",
    status: "in_progress",
    done: false,
    scheduledDays: [1, 2, 3],
    completionDates: [],
    verification: {
      mode: "peer",
      state: "pending",
      proofLabel: "",
      peerConfirmers: ["admin@progr3s.dev"],
    },
    sharedWith: [],
  },
];

function normalizeTask(payload: TaskApiPayload): Task {
  const status = resolveTaskStatus(payload.status, payload.done);
  const verificationMode = normalizeVerificationMode(payload.verification?.mode);
  const verificationState = normalizeVerificationState(
    payload.verification?.state,
    verificationMode === "none" ? "not_required" : "pending",
  );

  return {
    _id: payload._id ?? `fallback-${Date.now()}`,
    title: payload.title?.trim() || "Untitled goal",
    status,
    done: status === "completed",
    scheduledDays: normalizeScheduledDays(payload.scheduledDays),
    completionDates: Array.isArray(payload.completionDates)
      ? payload.completionDates.filter((value): value is string => typeof value === "string")
      : [],
    verification: {
      mode: verificationMode,
      state: verificationMode === "none" ? "not_required" : verificationState,
      proofLabel: payload.verification?.proofLabel?.trim() ?? "",
      peerConfirmers: normalizeEmailList(payload.verification?.peerConfirmers),
    },
    sharedWith: normalizeEmailList(payload.sharedWith),
  };
}

function nextDaySelection(current: number[], day: number): number[] {
  return current.includes(day)
    ? current.filter((value) => value !== day)
    : [...current, day].sort((a, b) => a - b);
}

export function DashboardClient({ userName, userEmail }: DashboardClientProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draftTask, setDraftTask] = useState("");
  const [draftStatus, setDraftStatus] = useState<TaskStatus>("not_started");
  const [draftDays, setDraftDays] = useState<number[]>([]);
  const [feedback, setFeedback] = useState("Welcome. Build your first goal box.");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [filter, setFilter] = useState<TaskFilter>("active");
  const [showCompletedFolder, setShowCompletedFolder] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);

  const loadSummary = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/summary");
      const data = (await response.json()) as { ok: boolean; summary?: DashboardSummary; message?: string };

      if (!response.ok || !data.ok || !data.summary) {
        setFeedback(data.message ?? "Could not load dashboard summary.");
        return;
      }

      setSummary(data.summary);
    } catch {
      setFeedback("Network issue while loading dashboard summary.");
    } finally {
      setIsLoadingSummary(false);
    }
  }, []);

  useEffect(() => {
    async function loadTasks() {
      try {
        const response = await fetch("/api/dashboard/tasks");
        const data = (await response.json()) as { ok: boolean; tasks?: TaskApiPayload[]; message?: string };

        if (!response.ok || !data.ok || !data.tasks) {
          setFeedback(data.message ?? "Could not load goals.");
          setTasks(starterTasks);
          return;
        }

        setTasks(data.tasks.map(normalizeTask));
      } catch {
        setFeedback("Network issue while loading goals.");
        setTasks(starterTasks);
      } finally {
        setIsLoadingTasks(false);
      }
    }

    void loadTasks();
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const completedCount = useMemo(() => tasks.filter((task) => task.status === "completed").length, [tasks]);
  const progressPercent = useMemo(() => {
    if (tasks.length === 0) {
      return 0;
    }

    return Math.round((completedCount / tasks.length) * 100);
  }, [completedCount, tasks.length]);

  const completionDateSet = useMemo(() => {
    const set = new Set<string>();

    for (const task of tasks) {
      for (const dateKey of task.completionDates) {
        set.add(dateKey);
      }
    }

    return set;
  }, [tasks]);

  const streakFromTasks = useMemo(() => computeStreakDays(completionDateSet), [completionDateSet]);

  const visibleTasks = useMemo(() => {
    if (filter === "active") {
      return tasks.filter((task) => task.status !== "completed");
    }

    if (filter === "all") {
      return tasks;
    }

    return tasks.filter((task) => task.status === filter);
  }, [filter, tasks]);

  const completedTasks = useMemo(() => tasks.filter((task) => task.status === "completed"), [tasks]);

  async function addTask() {
    const title = draftTask.trim();

    if (title.length < 2) {
      setFeedback("Goal title must be at least 2 characters.");
      return;
    }

    try {
      const response = await fetch("/api/dashboard/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          status: draftStatus,
          scheduledDays: draftDays,
        }),
      });

      const data = (await response.json()) as { ok: boolean; task?: TaskApiPayload; message?: string };

      if (!response.ok || !data.ok || !data.task) {
        setFeedback(data.message ?? "Could not add goal.");
        return;
      }

      setTasks((current) => [normalizeTask(data.task!), ...current]);
      setDraftTask("");
      setDraftStatus("not_started");
      setDraftDays([]);
      setFeedback("Goal added.");
      void loadSummary();
    } catch {
      setFeedback("Network issue while adding goal.");
    }
  }

  async function patchTask(
    taskId: string,
    payload: Record<string, unknown>,
    successMessage: string,
    refreshSummary = false,
  ) {
    try {
      const response = await fetch(`/api/dashboard/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { ok: boolean; task?: TaskApiPayload; message?: string };

      if (!response.ok || !data.ok || !data.task) {
        setFeedback(data.message ?? "Could not update goal.");
        return;
      }

      setTasks((current) => current.map((task) => (task._id === taskId ? normalizeTask(data.task!) : task)));
      setFeedback(successMessage);

      if (refreshSummary) {
        void loadSummary();
      }
    } catch {
      setFeedback("Network issue while updating goal.");
    }
  }

  async function deleteTask(taskId: string) {
    try {
      const response = await fetch(`/api/dashboard/tasks/${taskId}`, { method: "DELETE" });
      const data = (await response.json()) as { ok: boolean; message?: string };

      if (!response.ok || !data.ok) {
        setFeedback(data.message ?? "Could not delete goal.");
        return;
      }

      setTasks((current) => current.filter((task) => task._id !== taskId));
      setFeedback("Goal deleted.");
      void loadSummary();
    } catch {
      setFeedback("Network issue while deleting goal.");
    }
  }

  function captureGeolocationProof(taskId: string) {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setFeedback("Geolocation is not available in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const label = `geo:${position.coords.latitude.toFixed(4)},${position.coords.longitude.toFixed(4)}`;
        void patchTask(taskId, { verificationProofLabel: label, verificationState: "submitted" }, "Geolocation captured.");
      },
      () => setFeedback("Could not capture geolocation proof."),
      { timeout: 10000 },
    );
  }

  function promptShare(task: Task) {
    const current = task.sharedWith.join(", ");
    const next = window.prompt("Share with emails (comma-separated):", current);

    if (next === null) {
      return;
    }

    void patchTask(task._id, { sharedWith: next }, "Sharing list updated.");
  }

  function promptPeerConfirmers(task: Task) {
    const current = task.verification.peerConfirmers.join(", ");
    const next = window.prompt("Peer confirmer emails (comma-separated):", current);

    if (next === null) {
      return;
    }

    void patchTask(task._id, { peerConfirmers: next }, "Peer confirmer list updated.");
  }

  return (
    <section className="dashboard-grid">
      <article className="shell-card dashboard-card dashboard-card--welcome">
        <p className="eyebrow">Workspace</p>
        <h1>{userName}</h1>
        <p className="lead">
          Signed in as <strong>{userEmail}</strong>. Create multiple goal boxes and track status, schedule, and proof.
        </p>
        <p className="dashboard-feedback">{feedback}</p>
      </article>

      <article className="shell-card dashboard-card">
        <h2>Goal Boxes</h2>

        <div className="dashboard-task-input">
          <input
            value={draftTask}
            onChange={(event) => setDraftTask(event.target.value)}
            placeholder="Add a goal..."
          />
          <select value={draftStatus} onChange={(event) => setDraftStatus(normalizeTaskStatus(event.target.value))}>
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
          <button type="button" className="btn btn--primary" onClick={addTask}>
            Add
          </button>
        </div>

        <div className="day-chip-row">
          {DAYS.map((day) => (
            <button
              key={`draft-day-${day.value}`}
              type="button"
              className={draftDays.includes(day.value) ? "day-chip is-active" : "day-chip"}
              onClick={() => setDraftDays((current) => nextDaySelection(current, day.value))}
            >
              {day.short}
            </button>
          ))}
        </div>

        <div className="progress-meter" aria-label="Goal completion progress">
          <div className="progress-meter__label">
            <span>Goal completion</span>
            <strong>{progressPercent}%</strong>
          </div>
          <div className="progress-meter__track">
            <div className="progress-meter__bar" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <div className="goal-filters">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={filter === option.value ? "goal-filter is-active" : "goal-filter"}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {isLoadingTasks && <p className="lead">Loading goals...</p>}

        {!isLoadingTasks && (
          <>
            <ul className="task-list">
              {visibleTasks
                .filter((task) => filter !== "all" || task.status !== "completed")
                .map((task) => (
                  <li key={task._id} className={`task-item task-item--${task.status.replace("_", "-")}`}>
                    <div className="task-item__header">
                      <strong>{task.title}</strong>
                      <span className={`task-status task-status--${task.status.replace("_", "-")}`}>
                        {STATUS_LABELS[task.status]}
                      </span>
                    </div>

                    <div className="task-item__controls">
                      <select
                        value={task.status}
                        onChange={(event) =>
                          void patchTask(
                            task._id,
                            { status: normalizeTaskStatus(event.target.value, task.status) },
                            "Goal status updated.",
                            true,
                          )
                        }
                      >
                        <option value="not_started">Not Started</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                      </select>

                      <button type="button" className="btn btn--ghost" onClick={() => deleteTask(task._id)}>
                        Delete
                      </button>
                    </div>

                    <div className="day-chip-row">
                      {DAYS.map((day) => (
                        <button
                          key={`${task._id}-${day.value}`}
                          type="button"
                          className={task.scheduledDays.includes(day.value) ? "day-chip is-active" : "day-chip"}
                          onClick={() =>
                            void patchTask(
                              task._id,
                              { scheduledDays: nextDaySelection(task.scheduledDays, day.value) },
                              "Workdays updated.",
                            )
                          }
                        >
                          {day.short}
                        </button>
                      ))}
                    </div>

                    <div className="task-item__controls">
                      <select
                        value={task.verification.mode}
                        onChange={(event) =>
                          void patchTask(
                            task._id,
                            { verificationMode: normalizeVerificationMode(event.target.value, task.verification.mode) },
                            "Verification mode updated.",
                          )
                        }
                      >
                        {VERIFICATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>

                      <button type="button" className="btn btn--ghost" onClick={() => promptShare(task)}>
                        Share
                      </button>

                      {task.verification.mode === "peer" && (
                        <button type="button" className="btn btn--ghost" onClick={() => promptPeerConfirmers(task)}>
                          Set Peers
                        </button>
                      )}

                      {task.verification.mode === "geolocation" && (
                        <button type="button" className="btn btn--ghost" onClick={() => captureGeolocationProof(task._id)}>
                          Capture Geo
                        </button>
                      )}
                    </div>

                    {task.verification.mode === "photo" && (
                      <label className="proof-upload">
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(event) =>
                            void patchTask(
                              task._id,
                              {
                                verificationProofLabel: event.currentTarget.files?.[0]?.name ?? "",
                                verificationState: "submitted",
                              },
                              "Photo proof submitted.",
                            )
                          }
                        />
                        Attach photo proof (test)
                      </label>
                    )}

                    {task.verification.proofLabel && <p className="goal-proof">Proof: {task.verification.proofLabel}</p>}
                  </li>
                ))}
            </ul>

            {completedTasks.length > 0 && filter !== "all" && filter !== "completed" && (
              <button
                type="button"
                className="completed-folder__toggle"
                onClick={() => setShowCompletedFolder((current) => !current)}
              >
                {showCompletedFolder ? "Hide Completed Folder" : `Show Completed Folder (${completedTasks.length})`}
              </button>
            )}

            {(showCompletedFolder || filter === "all" || filter === "completed") && completedTasks.length > 0 && (
              <div className="completed-folder">
                <h3>Completed Folder</h3>
                <ul className="task-list">
                  {completedTasks.map((task) => (
                    <li key={`completed-${task._id}`} className="task-item task-item--completed">
                      <div className="task-item__header">
                        <strong>{task.title}</strong>
                        <span className="task-status task-status--completed">Completed</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </article>

      <article className="shell-card dashboard-card">
        <h2>Completion Calendar</h2>
        <p className="lead">Days are marked when at least one task was completed.</p>
        <p className="dashboard-feedback">
          Streak from task history: <strong>{streakFromTasks} day(s)</strong>
        </p>
        <div className="calendar-grid">
          {DAYS.map((day) => (
            <div key={`calendar-head-${day.value}`} className="calendar-grid__head">
              {day.short}
            </div>
          ))}
          {Array.from({ length: 31 }).map((_, index) => {
            const dayNumber = index + 1;
            const dateKey = toLocalDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), dayNumber));
            const isMarked = completionDateSet.has(dateKey);

            return (
              <div key={`calendar-cell-${dayNumber}`} className={isMarked ? "calendar-cell is-marked" : "calendar-cell"}>
                <span>{dayNumber}</span>
                {isMarked && <i />}
              </div>
            );
          })}
        </div>
      </article>

      <article className="shell-card dashboard-card">
        <h2>Backend Summary</h2>
        {isLoadingSummary && <p className="lead">Loading summary...</p>}

        {!isLoadingSummary && summary && (
          <ul className="summary-list">
            <li>
              <span>Date</span>
              <strong>{summary.dateLabel}</strong>
            </li>
            <li>
              <span>Focus score</span>
              <strong>{summary.focusScore}</strong>
            </li>
            <li>
              <span>Streak days</span>
              <strong>{summary.streakDays}</strong>
            </li>
            <li>
              <span>Completed today</span>
              <strong>{summary.completedToday}</strong>
            </li>
            <li>
              <span>Pending today</span>
              <strong>{summary.pendingToday}</strong>
            </li>
          </ul>
        )}
      </article>
    </section>
  );
}
