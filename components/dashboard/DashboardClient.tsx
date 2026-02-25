"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  computeStreakDays,
  normalizeEmailList,
  normalizePeerConfirmations,
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

type PeerConfirmation = {
  email: string;
  confirmedAt: string;
};

type TaskVerification = {
  mode: VerificationMode;
  state: VerificationState;
  proofLabel: string;
  peerConfirmers: string[];
  peerConfirmations: PeerConfirmation[];
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
    peerConfirmations?: unknown;
  } | null;
  sharedWith?: unknown;
};

type PeerRequest = {
  _id: string;
  ownerEmail: string;
  title: string;
  status: TaskStatus;
  verification: {
    state: VerificationState;
    peerConfirmers: string[];
    peerConfirmations: PeerConfirmation[];
  };
  confirmedByCurrentUser: boolean;
};

type PeerRequestApiPayload = {
  _id?: string;
  ownerEmail?: string;
  title?: string;
  status?: string;
  done?: boolean;
  verification?: {
    state?: string;
    peerConfirmers?: unknown;
    peerConfirmations?: unknown;
  } | null;
  confirmedByCurrentUser?: boolean;
};

type DashboardClientProps = {
  userName: string;
  userEmail: string;
};

type CalendarCell = {
  key: string;
  dayNumber: number | null;
  dateKey: string | null;
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
      peerConfirmations: [],
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
      peerConfirmations: [],
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
      peerConfirmations: [],
    },
    sharedWith: [],
  },
];

function normalizeTask(payload: TaskApiPayload): Task {
  const status = resolveTaskStatus(payload.status, payload.done);
  const verificationMode = normalizeVerificationMode(payload.verification?.mode);
  const peerConfirmers = normalizeEmailList(payload.verification?.peerConfirmers);
  const peerConfirmations = normalizePeerConfirmations(payload.verification?.peerConfirmations).filter((confirmation) =>
    peerConfirmers.includes(confirmation.email),
  );
  const verificationState =
    verificationMode === "none"
      ? "not_required"
      : verificationMode === "peer"
        ? peerConfirmers.length === 0
          ? "not_required"
          : peerConfirmations.length >= peerConfirmers.length
            ? "verified"
            : peerConfirmations.length > 0
              ? "submitted"
              : "pending"
        : normalizeVerificationState(payload.verification?.state, "pending");

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
      state: verificationState,
      proofLabel: payload.verification?.proofLabel?.trim() ?? "",
      peerConfirmers,
      peerConfirmations,
    },
    sharedWith: normalizeEmailList(payload.sharedWith),
  };
}

function normalizePeerRequest(payload: PeerRequestApiPayload): PeerRequest {
  const status = resolveTaskStatus(payload.status, payload.done);
  const peerConfirmers = normalizeEmailList(payload.verification?.peerConfirmers);
  const peerConfirmations = normalizePeerConfirmations(payload.verification?.peerConfirmations).filter((confirmation) =>
    peerConfirmers.includes(confirmation.email),
  );

  return {
    _id: payload._id ?? `peer-${Date.now()}`,
    ownerEmail: payload.ownerEmail?.trim().toLowerCase() ?? "unknown",
    title: payload.title?.trim() || "Untitled goal",
    status,
    verification: {
      state: normalizeVerificationState(payload.verification?.state, "pending"),
      peerConfirmers,
      peerConfirmations,
    },
    confirmedByCurrentUser: payload.confirmedByCurrentUser === true,
  };
}

function nextDaySelection(current: number[], day: number): number[] {
  return current.includes(day)
    ? current.filter((value) => value !== day)
    : [...current, day].sort((a, b) => a - b);
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildCalendarCells(cursor: Date): CalendarCell[] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingEmpty = firstDay.getDay();
  const totalCells = Math.ceil((leadingEmpty + daysInMonth) / 7) * 7;
  const cells: CalendarCell[] = [];

  for (let index = 0; index < totalCells; index += 1) {
    const dayNumber = index - leadingEmpty + 1;

    if (dayNumber < 1 || dayNumber > daysInMonth) {
      cells.push({
        key: `blank-${year}-${month}-${index}`,
        dayNumber: null,
        dateKey: null,
      });
      continue;
    }

    const dateKey = toLocalDateKey(new Date(year, month, dayNumber));

    cells.push({
      key: `day-${year}-${month}-${dayNumber}`,
      dayNumber,
      dateKey,
    });
  }

  return cells;
}

export function DashboardClient({ userName, userEmail }: DashboardClientProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [peerRequests, setPeerRequests] = useState<PeerRequest[]>([]);
  const [draftTask, setDraftTask] = useState("");
  const [draftStatus, setDraftStatus] = useState<TaskStatus>("not_started");
  const [draftDays, setDraftDays] = useState<number[]>([]);
  const [feedback, setFeedback] = useState("Welcome. Build your first goal box.");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [filter, setFilter] = useState<TaskFilter>("active");
  const [showCompletedFolder, setShowCompletedFolder] = useState(false);
  const [calendarCursor, setCalendarCursor] = useState(() => monthStart(new Date()));
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [isLoadingPeerRequests, setIsLoadingPeerRequests] = useState(true);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<Record<string, boolean>>({});
  const [pendingPeerRequestIds, setPendingPeerRequestIds] = useState<Record<string, boolean>>({});

  function setTaskPending(taskId: string, isPending: boolean) {
    setPendingTaskIds((current) => {
      if (isPending) {
        if (current[taskId]) {
          return current;
        }

        return { ...current, [taskId]: true };
      }

      if (!current[taskId]) {
        return current;
      }

      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }

  function setPeerRequestPending(taskId: string, isPending: boolean) {
    setPendingPeerRequestIds((current) => {
      if (isPending) {
        if (current[taskId]) {
          return current;
        }

        return { ...current, [taskId]: true };
      }

      if (!current[taskId]) {
        return current;
      }

      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }

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

  const loadTasks = useCallback(async () => {
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
  }, []);

  const loadPeerRequests = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/peer-confirmations");
      const data = (await response.json()) as { ok: boolean; requests?: PeerRequestApiPayload[]; message?: string };

      if (!response.ok || !data.ok || !Array.isArray(data.requests)) {
        setPeerRequests([]);
        return;
      }

      setPeerRequests(data.requests.map(normalizePeerRequest));
    } catch {
      setPeerRequests([]);
    } finally {
      setIsLoadingPeerRequests(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadPeerRequests();
  }, [loadPeerRequests]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void loadTasks();
      void loadPeerRequests();
      router.refresh();
    }, 20000);

    return () => window.clearInterval(intervalId);
  }, [loadPeerRequests, loadTasks, router]);

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
  const mainTasks = useMemo(() => {
    if (filter === "completed") {
      return [];
    }

    return visibleTasks.filter((task) => task.status !== "completed");
  }, [filter, visibleTasks]);
  const shouldShowCompletedFolder = completedTasks.length > 0 && (showCompletedFolder || filter === "all" || filter === "completed");
  const monthLabel = useMemo(
    () =>
      calendarCursor.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
    [calendarCursor],
  );
  const calendarCells = useMemo(() => buildCalendarCells(calendarCursor), [calendarCursor]);

  async function addTask() {
    if (isAddingTask) {
      return;
    }

    const title = draftTask.trim();

    if (title.length < 2) {
      setFeedback("Goal title must be at least 2 characters.");
      return;
    }

    setIsAddingTask(true);

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
    } finally {
      setIsAddingTask(false);
    }
  }

  async function patchTask(
    taskId: string,
    payload: Record<string, unknown>,
    successMessage: string,
    refreshSummary = false,
    refreshPeerRequests = false,
    refreshPage = false,
  ) {
    if (pendingTaskIds[taskId]) {
      return;
    }

    setTaskPending(taskId, true);

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

      if (refreshPeerRequests) {
        void loadPeerRequests();
      }

      if (refreshPage) {
        router.refresh();
      }
    } catch {
      setFeedback("Network issue while updating goal.");
    } finally {
      setTaskPending(taskId, false);
    }
  }

  function shiftCalendarMonth(direction: -1 | 1) {
    setCalendarCursor((current) => monthStart(new Date(current.getFullYear(), current.getMonth() + direction, 1)));
  }

  async function deleteTask(taskId: string) {
    if (pendingTaskIds[taskId]) {
      return;
    }

    setTaskPending(taskId, true);

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
      void loadPeerRequests();
    } catch {
      setFeedback("Network issue while deleting goal.");
    } finally {
      setTaskPending(taskId, false);
    }
  }

  async function togglePeerConfirmation(taskId: string, shouldConfirm: boolean) {
    if (!shouldConfirm || pendingPeerRequestIds[taskId]) {
      return;
    }

    setPeerRequestPending(taskId, true);

    try {
      const response = await fetch(`/api/dashboard/tasks/${taskId}/confirm`, {
        method: "POST",
      });
      const data = (await response.json()) as { ok: boolean; message?: string };

      if (!response.ok || !data.ok) {
        setFeedback(data.message ?? "Could not update peer confirmation.");
        return;
      }

      setFeedback("Shared goal approved.");
      void loadPeerRequests();
      void loadTasks();
      void loadSummary();
      router.refresh();
    } catch {
      setFeedback("Network issue while updating peer confirmation.");
    } finally {
      setPeerRequestPending(taskId, false);
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

    void patchTask(task._id, { sharedWith: next }, "Sharing list updated.", false, true, true);
  }

  function removeSharedRecipient(task: Task, recipientEmail: string) {
    const remainingRecipients = task.sharedWith.filter((email) => email !== recipientEmail);
    void patchTask(
      task._id,
      { sharedWith: remainingRecipients },
      "Shared recipient removed from goal.",
      false,
      true,
      true,
    );
  }

  return (
    <section className="dashboard-grid">
      <article className="shell-card dashboard-card dashboard-card--welcome">
        <p className="eyebrow">Workspace</p>
        <h1>{userName}</h1>
        <p className="lead">
          Signed in as <strong>{userEmail}</strong>. Track your own goals and verify goals for peers from one dashboard.
        </p>
        <p className="dashboard-feedback">{feedback}</p>
      </article>

      <article className="shell-card dashboard-card">
        <h2>Your Goals</h2>

        <div className="dashboard-task-input">
          <input
            value={draftTask}
            disabled={isAddingTask}
            onChange={(event) => setDraftTask(event.target.value)}
            placeholder="Add a goal..."
          />
          <select
            value={draftStatus}
            disabled={isAddingTask}
            onChange={(event) => setDraftStatus(normalizeTaskStatus(event.target.value))}
          >
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
          <button type="button" className="btn btn--primary" onClick={addTask} disabled={isAddingTask}>
            {isAddingTask ? "Adding..." : "Add"}
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
              {mainTasks.map((task) => (
                  <li
                    key={task._id}
                    className={`task-item task-item--${task.status.replace("_", "-")}${pendingTaskIds[task._id] ? " is-pending" : ""}`}
                  >
                    <div className="task-item__header">
                      <strong>{task.title}</strong>
                      <span className={`task-status task-status--${task.status.replace("_", "-")}`}>
                        {STATUS_LABELS[task.status]}
                      </span>
                    </div>

                    <div className="task-item__controls">
                      <select
                        value={task.status}
                        disabled={pendingTaskIds[task._id]}
                        onChange={(event) => {
                          const nextStatus = normalizeTaskStatus(event.target.value, task.status);

                          if (task.sharedWith.length > 0 && nextStatus === "completed" && task.status !== "completed") {
                            setFeedback("Shared goals are completed by recipient approval.");
                            return;
                          }

                          if (nextStatus === "completed") {
                            setShowCompletedFolder(true);
                          }

                          void patchTask(task._id, { status: nextStatus }, "Goal status updated.", true, true);
                        }}
                      >
                        <option value="not_started">Not Started</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed" disabled={task.sharedWith.length > 0 && task.status !== "completed"}>
                          Completed
                        </option>
                      </select>

                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={pendingTaskIds[task._id]}
                        onClick={() => deleteTask(task._id)}
                      >
                        Delete
                      </button>
                    </div>

                    <div className="day-chip-row">
                      {DAYS.map((day) => (
                        <button
                          key={`${task._id}-${day.value}`}
                          type="button"
                          className={task.scheduledDays.includes(day.value) ? "day-chip is-active" : "day-chip"}
                          disabled={pendingTaskIds[task._id]}
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
                        disabled={pendingTaskIds[task._id]}
                        onChange={(event) => {
                          const nextMode = normalizeVerificationMode(event.target.value, task.verification.mode);

                          if (task.sharedWith.length > 0 && nextMode !== "peer") {
                            void patchTask(
                              task._id,
                              { verificationMode: nextMode, sharedWith: [] },
                              "Verification mode changed. Sharing removed.",
                              false,
                              true,
                            );
                            return;
                          }

                          void patchTask(task._id, { verificationMode: nextMode }, "Verification mode updated.");
                        }}
                      >
                        {VERIFICATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={pendingTaskIds[task._id]}
                        onClick={() => promptShare(task)}
                      >
                        Share
                      </button>

                      {task.verification.mode === "geolocation" && (
                        <button
                          type="button"
                          className="btn btn--ghost"
                          disabled={pendingTaskIds[task._id]}
                          onClick={() => captureGeolocationProof(task._id)}
                        >
                          Capture Geo
                        </button>
                      )}
                    </div>

                    {task.sharedWith.length > 0 && (
                      <div className="peer-management">
                        <p className="goal-proof">Sharing with: {task.sharedWith.join(", ")}</p>
                        <p className="goal-proof">
                          Switch verification away from Peer confirmation to stop sharing and remove recipients.
                        </p>
                        <p className="goal-proof">
                          Shared approvals: {task.verification.peerConfirmations.length}. Completion comes from shared-user approval.
                        </p>
                        <div className="peer-chip-row">
                          {task.sharedWith.map((recipientEmail) => {
                            const hasConfirmed = task.verification.peerConfirmations.some(
                              (confirmation) => confirmation.email === recipientEmail,
                            );

                            return (
                              <span
                                key={`${task._id}-${recipientEmail}`}
                                className={hasConfirmed ? "peer-chip is-verified" : "peer-chip"}
                              >
                                {recipientEmail}
                                <button
                                  type="button"
                                  disabled={pendingTaskIds[task._id]}
                                  onClick={() => removeSharedRecipient(task, recipientEmail)}
                                  aria-label={`Remove ${recipientEmail}`}
                                >
                                  x
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {task.verification.mode === "photo" && (
                      <label className="proof-upload">
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          disabled={pendingTaskIds[task._id]}
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

            {filter === "completed" && <p className="goal-proof">Completed goals are shown in the completed folder below.</p>}

            {completedTasks.length > 0 && filter !== "all" && filter !== "completed" && (
              <button
                type="button"
                className="completed-folder__toggle"
                onClick={() => setShowCompletedFolder((current) => !current)}
              >
                {showCompletedFolder ? "Hide Completed Folder" : `Show Completed Folder (${completedTasks.length})`}
              </button>
            )}

            {shouldShowCompletedFolder && (
              <div className="completed-folder">
                <h3>Completed Folder</h3>
                <ul className="task-list">
                  {completedTasks.map((task) => (
                    <li key={`completed-${task._id}`} className="task-item task-item--completed">
                      <div className="task-item__header">
                        <strong>{task.title}</strong>
                        <span className="task-status task-status--completed">Completed</span>
                      </div>
                      <div className="task-item__controls">
                        <button
                          type="button"
                          className="btn btn--ghost"
                          disabled={pendingTaskIds[task._id]}
                          onClick={() => deleteTask(task._id)}
                        >
                          Delete
                        </button>
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
        <h2>Shared With You</h2>
        <p className="lead">Goals from other users that were shared with your email for approval.</p>

        {isLoadingPeerRequests && <p className="lead">Loading peer verification queue...</p>}

        {!isLoadingPeerRequests && peerRequests.length === 0 && <p className="lead">No shared goals pending your approval.</p>}

        {!isLoadingPeerRequests && peerRequests.length > 0 && (
          <ul className="peer-request-list">
            {peerRequests.map((request) => (
              <li key={request._id} className="peer-request-item">
                <div className="task-item__header">
                  <strong>{request.title}</strong>
                  <span className={`task-status task-status--${request.status.replace("_", "-")}`}>
                    {STATUS_LABELS[request.status]}
                  </span>
                </div>

                <p className="goal-proof">Owner: {request.ownerEmail}</p>
                <p className="goal-proof">Shared with: {request.verification.peerConfirmers.join(", ")}</p>
                <p className="goal-proof">
                  Confirmations: {request.verification.peerConfirmations.length}/{request.verification.peerConfirmers.length}
                </p>

                <div className="task-item__controls">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={request.confirmedByCurrentUser || pendingPeerRequestIds[request._id]}
                    onClick={() => void togglePeerConfirmation(request._id, !request.confirmedByCurrentUser)}
                  >
                    {request.confirmedByCurrentUser
                      ? "Approved"
                      : pendingPeerRequestIds[request._id]
                        ? "Approving..."
                        : "Approve Shared Goal"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="shell-card dashboard-card">
        <h2>Completion Calendar</h2>
        <p className="lead">Days are marked when at least one task was completed.</p>
        <p className="dashboard-feedback">
          Streak from task history: <strong>{streakFromTasks} day(s)</strong>
        </p>
        <div className="calendar-nav">
          <button type="button" className="btn btn--ghost" onClick={() => shiftCalendarMonth(-1)}>
            Prev
          </button>
          <strong>{monthLabel}</strong>
          <button type="button" className="btn btn--ghost" onClick={() => shiftCalendarMonth(1)}>
            Next
          </button>
        </div>
        <div className="calendar-grid">
          {DAYS.map((day) => (
            <div key={`calendar-head-${day.value}`} className="calendar-grid__head">
              {day.short}
            </div>
          ))}
          {calendarCells.map((cell) => {
            if (!cell.dateKey || !cell.dayNumber) {
              return <div key={cell.key} className="calendar-cell is-empty" aria-hidden="true" />;
            }

            const isMarked = completionDateSet.has(cell.dateKey);

            return (
              <div key={cell.key} className={isMarked ? "calendar-cell is-marked" : "calendar-cell"}>
                <span>{cell.dayNumber}</span>
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
