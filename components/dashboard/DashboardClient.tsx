"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActiveVerificationMode,
  computeVerificationState,
  GoalTaskItem,
  mergeVerificationModes,
  computeStreakDays,
  normalizeEmailList,
  normalizeGoalTasks,
  normalizePeerConfirmations,
  normalizeScheduledDays,
  normalizeTaskStatus,
  normalizeVerificationState,
  resolveVerificationModes,
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
  modes: ActiveVerificationMode[];
  state: VerificationState;
  proofLabel: string;
  proofImageDataUrl: string;
  geolocationLabel: string;
  peerConfirmers: string[];
  peerConfirmations: PeerConfirmation[];
};

type Task = {
  _id: string;
  title: string;
  status: TaskStatus;
  done: boolean;
  goalTasks: GoalTaskItem[];
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
  goalTasks?: unknown;
  scheduledDays?: unknown;
  completionDates?: unknown;
  verification?: {
    mode?: string;
    modes?: unknown;
    state?: string;
    proofLabel?: string;
    proofImageDataUrl?: string;
    geolocationLabel?: string;
    peerConfirmers?: unknown;
    peerConfirmations?: unknown;
  } | null;
  sharedWith?: unknown;
};

type ProofUpload = {
  title: string;
  proofLabel: string;
  proofImageDataUrl: string;
  completedAt: string;
};

type NetworkConnection = {
  email: string;
  name: string;
  username: string;
};

type NetworkApiPayload = {
  ok: boolean;
  message?: string;
  network?: {
    self?: {
      email?: string;
      name?: string;
      username?: string;
    };
    connections?: Array<{
      email?: string;
      name?: string;
      username?: string;
    }>;
  };
};

type PeerRequest = {
  _id: string;
  ownerEmail: string;
  title: string;
  status: TaskStatus;
  verification: {
    mode: VerificationMode;
    modes: ActiveVerificationMode[];
    state: VerificationState;
    geolocationLabel: string;
    peerConfirmers: string[];
    peerConfirmations: PeerConfirmation[];
  };
  proofUploads: ProofUpload[];
  confirmedByCurrentUser: boolean;
};

type PeerRequestApiPayload = {
  _id?: string;
  ownerEmail?: string;
  title?: string;
  status?: string;
  done?: boolean;
  verification?: {
    mode?: string;
    modes?: unknown;
    state?: string;
    geolocationLabel?: string;
    peerConfirmers?: unknown;
    peerConfirmations?: unknown;
  } | null;
  proofUploads?: Array<{
    title?: string;
    proofLabel?: string;
    proofImageDataUrl?: string;
    completedAt?: string;
  }>;
  confirmedByCurrentUser?: boolean;
};

type DashboardClientProps = {
  userName: string;
};

type CalendarCell = {
  key: string;
  dayNumber: number | null;
  dateKey: string | null;
};

type CalendarDayActivity = {
  key: string;
  goalTitle: string;
  detail: string;
  proofText: string;
  verificationLabel: string;
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

const VERIFICATION_OPTIONS: Array<{ value: ActiveVerificationMode; label: string }> = [
  { value: "photo", label: "Photo proof" },
  { value: "geolocation", label: "Geolocation" },
  { value: "peer", label: "Peer approval" },
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

const EMPTY_TASKS: Task[] = [];

function normalizeTask(payload: TaskApiPayload): Task {
  const status = resolveTaskStatus(payload.status, payload.done);
  const sharedWith = normalizeEmailList(payload.sharedWith);
  const peerConfirmers = sharedWith.length > 0 ? sharedWith : normalizeEmailList(payload.verification?.peerConfirmers);
  const peerConfirmations = normalizePeerConfirmations(payload.verification?.peerConfirmations).filter((confirmation) =>
    peerConfirmers.includes(confirmation.email),
  );
  const rawProofLabel = payload.verification?.proofLabel?.trim() ?? "";
  const rawGeolocationLabel =
    typeof payload.verification?.geolocationLabel === "string" ? payload.verification.geolocationLabel.trim() : "";
  const geolocationLabel = rawGeolocationLabel || (rawProofLabel.startsWith("geo:") ? rawProofLabel : "");
  const proofLabel = geolocationLabel && rawProofLabel === geolocationLabel ? "" : rawProofLabel;
  const proofImageDataUrl =
    typeof payload.verification?.proofImageDataUrl === "string" &&
    payload.verification.proofImageDataUrl.startsWith("data:image/")
      ? payload.verification.proofImageDataUrl
      : "";
  const verificationModes = mergeVerificationModes(
    resolveVerificationModes(payload.verification?.modes, payload.verification?.mode),
    sharedWith.length > 0 ? ["peer"] : [],
  );
  const verificationState =
    payload.verification?.state && typeof payload.verification.state === "string"
      ? normalizeVerificationState(
          payload.verification.state,
          computeVerificationState({
            modes: verificationModes,
            photoProofImageDataUrl: proofImageDataUrl,
            geolocationLabel,
            peerConfirmers,
            peerConfirmations,
          }),
        )
      : computeVerificationState({
          modes: verificationModes,
          photoProofImageDataUrl: proofImageDataUrl,
          geolocationLabel,
          peerConfirmers,
          peerConfirmations,
        });

  return {
    _id: payload._id ?? `fallback-${Date.now()}`,
    title: payload.title?.trim() || "Untitled goal",
    status,
    done: status === "completed",
    goalTasks: normalizeGoalTasks(payload.goalTasks),
    scheduledDays: normalizeScheduledDays(payload.scheduledDays),
    completionDates: Array.isArray(payload.completionDates)
      ? payload.completionDates.filter((value): value is string => typeof value === "string")
      : [],
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
    sharedWith,
  };
}

function normalizePeerRequest(payload: PeerRequestApiPayload): PeerRequest {
  const status = resolveTaskStatus(payload.status, payload.done);
  const peerConfirmers = normalizeEmailList(payload.verification?.peerConfirmers);
  const peerConfirmations = normalizePeerConfirmations(payload.verification?.peerConfirmations).filter((confirmation) =>
    peerConfirmers.includes(confirmation.email),
  );
  const geolocationLabel =
    typeof payload.verification?.geolocationLabel === "string" ? payload.verification.geolocationLabel.trim() : "";
  const verificationModes = mergeVerificationModes(
    resolveVerificationModes(payload.verification?.modes, payload.verification?.mode),
    ["peer"],
  );
  const proofUploads = Array.isArray(payload.proofUploads)
    ? payload.proofUploads
        .filter(
          (upload): upload is NonNullable<PeerRequestApiPayload["proofUploads"]>[number] =>
            typeof upload === "object" && upload !== null,
        )
        .map((upload) => ({
          title: typeof upload.title === "string" ? upload.title.trim() : "Proof",
          proofLabel: typeof upload.proofLabel === "string" ? upload.proofLabel.trim() : "",
          proofImageDataUrl:
            typeof upload.proofImageDataUrl === "string" && upload.proofImageDataUrl.startsWith("data:image/")
              ? upload.proofImageDataUrl
              : "",
          completedAt: typeof upload.completedAt === "string" ? upload.completedAt.trim() : "",
        }))
        .filter((upload) => !!upload.proofImageDataUrl)
    : [];

  return {
    _id: payload._id ?? `peer-${Date.now()}`,
    ownerEmail: payload.ownerEmail?.trim().toLowerCase() ?? "unknown",
    title: payload.title?.trim() || "Untitled goal",
    status,
    verification: {
      mode: verificationModes[0] ?? "none",
      modes: verificationModes,
      state: normalizeVerificationState(payload.verification?.state, "pending"),
      geolocationLabel,
      peerConfirmers,
      peerConfirmations,
    },
    proofUploads,
    confirmedByCurrentUser: payload.confirmedByCurrentUser === true,
  };
}

function normalizeNetworkConnection(
  payload: { email?: string; name?: string; username?: string } | null | undefined,
): NetworkConnection | null {
  if (!payload) {
    return null;
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const username = typeof payload.username === "string" ? payload.username.trim().toLowerCase().replace(/^@+/, "") : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";

  if (!email || !email.includes("@")) {
    return null;
  }

  if (!username || !/^[a-z0-9_]{3,24}$/.test(username)) {
    return null;
  }

  return {
    email,
    name: name || email,
    username,
  };
}

function normalizeNetworkPayload(payload: NetworkApiPayload["network"]) {
  const connectionMap = new Map<string, NetworkConnection>();

  if (Array.isArray(payload?.connections)) {
    for (const entry of payload.connections) {
      const normalized = normalizeNetworkConnection(entry);

      if (!normalized) {
        continue;
      }

      connectionMap.set(normalized.email, normalized);
    }
  }

  return {
    connections: Array.from(connectionMap.values()).sort((a, b) => a.username.localeCompare(b.username)),
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Could not read file."));
    };

    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

export function DashboardClient({ userName }: DashboardClientProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [peerRequests, setPeerRequests] = useState<PeerRequest[]>([]);
  const [networkConnections, setNetworkConnections] = useState<NetworkConnection[]>([]);
  const [shareConnectionByTaskId, setShareConnectionByTaskId] = useState<Record<string, string>>({});
  const [draftTask, setDraftTask] = useState("");
  const [draftStatus, setDraftStatus] = useState<TaskStatus>("not_started");
  const [draftDays, setDraftDays] = useState<number[]>([]);
  const [feedback, setFeedback] = useState("Welcome. Build your first goal box.");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [filter, setFilter] = useState<TaskFilter>("active");
  const [showCompletedFolder, setShowCompletedFolder] = useState(false);
  const [calendarCursor, setCalendarCursor] = useState(() => monthStart(new Date()));
  const [selectedCalendarDateKey, setSelectedCalendarDateKey] = useState<string | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [isLoadingPeerRequests, setIsLoadingPeerRequests] = useState(true);
  const [isLoadingNetwork, setIsLoadingNetwork] = useState(true);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<Record<string, boolean>>({});
  const [pendingPeerRequestIds, setPendingPeerRequestIds] = useState<Record<string, boolean>>({});
  const [subtaskDraftByTaskId, setSubtaskDraftByTaskId] = useState<Record<string, string>>({});
  const authRedirectingRef = useRef(false);

  const handleAuthFailure = useCallback(
    (status: number, message?: string): boolean => {
      if (status !== 401 && status !== 403) {
        return false;
      }

      if (authRedirectingRef.current) {
        return true;
      }

      authRedirectingRef.current = true;

      if (status === 403) {
        setFeedback(message ?? "This account cannot access goals. Redirecting to admin.");
        setTimeout(() => {
          router.push("/admin");
          router.refresh();
        }, 200);
        return true;
      }

      setFeedback(message ?? "Session expired. Redirecting to login.");
      setTimeout(() => {
        router.push("/login");
        router.refresh();
      }, 200);
      return true;
    },
    [router],
  );

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
      const response = await fetch("/api/dashboard/summary", { credentials: "include" });
      const data = (await response.json()) as { ok: boolean; summary?: DashboardSummary; message?: string };

      if (handleAuthFailure(response.status, data.message)) {
        return;
      }

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
  }, [handleAuthFailure]);

  const loadTasks = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/tasks", { credentials: "include" });
      const data = (await response.json()) as { ok: boolean; tasks?: TaskApiPayload[]; message?: string };

      if (handleAuthFailure(response.status, data.message)) {
        return;
      }

      if (!response.ok || !data.ok || !data.tasks) {
        setFeedback(data.message ?? "Could not load goals.");
        setTasks(EMPTY_TASKS);
        return;
      }

      setTasks(data.tasks.map(normalizeTask));
    } catch {
      setFeedback("Network issue while loading goals.");
      setTasks(EMPTY_TASKS);
    } finally {
      setIsLoadingTasks(false);
    }
  }, [handleAuthFailure]);

  const loadPeerRequests = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/peer-confirmations", { credentials: "include" });
      const data = (await response.json()) as { ok: boolean; requests?: PeerRequestApiPayload[]; message?: string };

      if (handleAuthFailure(response.status, data.message)) {
        return;
      }

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
  }, [handleAuthFailure]);

  const loadNetwork = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/network", { credentials: "include" });
      const data = (await response.json()) as NetworkApiPayload;

      if (handleAuthFailure(response.status, data.message)) {
        return;
      }

      if (!response.ok || !data.ok || !data.network) {
        setNetworkConnections([]);
        return;
      }

      const normalized = normalizeNetworkPayload(data.network);
      setNetworkConnections(normalized.connections);
    } catch {
      setNetworkConnections([]);
    } finally {
      setIsLoadingNetwork(false);
    }
  }, [handleAuthFailure]);

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
    void loadNetwork();
  }, [loadNetwork]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void loadTasks();
      void loadPeerRequests();
      void loadSummary();
      void loadNetwork();
    }, 20000);

    return () => window.clearInterval(intervalId);
  }, [loadNetwork, loadPeerRequests, loadSummary, loadTasks]);

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
  const verificationSummary = useMemo(() => {
    let photoRequired = 0;
    let photoSubmitted = 0;
    let geoRequired = 0;
    let geoSubmitted = 0;
    let peerRequired = 0;
    let peerVerified = 0;
    let sharedRecipientCount = 0;

    for (const task of tasks) {
      if (task.verification.modes.includes("photo")) {
        photoRequired += 1;

        if (task.verification.proofImageDataUrl) {
          photoSubmitted += 1;
        }
      }

      if (task.verification.modes.includes("geolocation")) {
        geoRequired += 1;

        if (task.verification.geolocationLabel) {
          geoSubmitted += 1;
        }
      }

      if (task.verification.modes.includes("peer")) {
        peerRequired += 1;

        if (task.verification.peerConfirmations.length > 0) {
          peerVerified += 1;
        }
      }

      sharedRecipientCount += task.sharedWith.length;
    }

    return {
      photoRequired,
      photoSubmitted,
      geoRequired,
      geoSubmitted,
      peerRequired,
      peerVerified,
      sharedRecipientCount,
    };
  }, [tasks]);
  const networkEmailByUsername = useMemo(
    () => new Map(networkConnections.map((entry) => [entry.username, entry.email])),
    [networkConnections],
  );
  const networkUsernameByEmail = useMemo(
    () => new Map(networkConnections.map((entry) => [entry.email, entry.username])),
    [networkConnections],
  );

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
  const calendarActivitiesByDate = useMemo(() => {
    const map: Record<string, CalendarDayActivity[]> = {};

    for (const task of tasks) {
      const goalProofText = task.verification.geolocationLabel || task.verification.proofLabel || "";
      const verificationLabel =
        task.sharedWith.length > 0
          ? `${task.verification.peerConfirmations.length}/${task.sharedWith.length} peer approvals`
          : "Self confirmed";

      for (const dateKey of task.completionDates) {
        const activitiesForDate = map[dateKey] ?? [];
        const subtasksForDate = task.goalTasks.filter((goalTask) => goalTask.completedAt === dateKey);

        if (subtasksForDate.length > 0) {
          for (const goalTask of subtasksForDate) {
            activitiesForDate.push({
              key: `${task._id}-${goalTask.id}-${dateKey}`,
              goalTitle: task.title,
              detail: goalTask.title,
              proofText: goalTask.proofLabel || goalProofText || "No text proof saved",
              verificationLabel,
            });
          }
        } else {
          activitiesForDate.push({
            key: `${task._id}-${dateKey}`,
            goalTitle: task.title,
            detail: "Goal completed",
            proofText: goalProofText || "No text proof saved",
            verificationLabel,
          });
        }

        map[dateKey] = activitiesForDate;
      }
    }

    return map;
  }, [tasks]);
  const selectedCalendarActivities = useMemo(() => {
    if (!selectedCalendarDateKey) {
      return [];
    }

    return calendarActivitiesByDate[selectedCalendarDateKey] ?? [];
  }, [calendarActivitiesByDate, selectedCalendarDateKey]);
  const selectedCalendarDateLabel = useMemo(() => {
    if (!selectedCalendarDateKey) {
      return "";
    }

    const parsed = new Date(`${selectedCalendarDateKey}T00:00:00`);

    if (Number.isNaN(parsed.getTime())) {
      return selectedCalendarDateKey;
    }

    return parsed.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [selectedCalendarDateKey]);

  useEffect(() => {
    setSubtaskDraftByTaskId((current) => {
      const validTaskIds = new Set(tasks.map((task) => task._id));
      const next = Object.fromEntries(Object.entries(current).filter(([taskId]) => validTaskIds.has(taskId)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [tasks]);

  useEffect(() => {
    if (!selectedCalendarDateKey) {
      return;
    }

    if (!completionDateSet.has(selectedCalendarDateKey)) {
      setSelectedCalendarDateKey(null);
    }
  }, [completionDateSet, selectedCalendarDateKey]);

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
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          status: draftStatus,
          scheduledDays: draftDays,
        }),
      });

      const data = (await response.json()) as { ok: boolean; task?: TaskApiPayload; message?: string };

      if (handleAuthFailure(response.status, data.message)) {
        return;
      }

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
  ): Promise<boolean> {
    if (pendingTaskIds[taskId]) {
      return false;
    }

    setTaskPending(taskId, true);

    try {
      const response = await fetch(`/api/dashboard/tasks/${taskId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { ok: boolean; task?: TaskApiPayload; message?: string };

      if (handleAuthFailure(response.status, data.message)) {
        return false;
      }

      if (!response.ok || !data.ok || !data.task) {
        setFeedback(data.message ?? "Could not update goal.");
        return false;
      }

      setTasks((current) => current.map((task) => (task._id === taskId ? normalizeTask(data.task!) : task)));
      setFeedback(successMessage);

      if (refreshSummary) {
        void loadSummary();
      }

      if (refreshPeerRequests) {
        void loadPeerRequests();
      }

      return true;
    } catch {
      setFeedback("Network issue while updating goal.");
      return false;
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
      const response = await fetch(`/api/dashboard/tasks/${taskId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await response.json()) as { ok: boolean; message?: string };

      if (handleAuthFailure(response.status, data.message)) {
        return;
      }

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
        credentials: "include",
      });
      const data = (await response.json()) as { ok: boolean; message?: string };

      if (handleAuthFailure(response.status, data.message)) {
        return;
      }

      if (!response.ok || !data.ok) {
        setFeedback(data.message ?? "Could not update peer confirmation.");
        return;
      }

      setFeedback("Shared goal approved.");
      void loadPeerRequests();
      void loadTasks();
      void loadSummary();
    } catch {
      setFeedback("Network issue while updating peer confirmation.");
    } finally {
      setPeerRequestPending(taskId, false);
    }
  }

  function captureGeolocationProof(taskId: string) {
    if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.geolocation) {
      setFeedback("Geolocation is not available in this browser.");
      return;
    }

    if (!window.isSecureContext) {
      setFeedback(
        "Geolocation needs HTTPS on iPhone Safari. Use a secure URL or use the Schedule & Verification section.",
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const label = `geo:${position.coords.latitude.toFixed(4)},${position.coords.longitude.toFixed(4)}`;
        void patchTask(taskId, { verificationGeoLabel: label }, "Geolocation captured.");
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setFeedback(
            "Location permission was denied. On iPhone: Settings > Safari > Location > Allow, then retry.",
          );
          return;
        }

        if (error.code === error.POSITION_UNAVAILABLE) {
          setFeedback("Location is unavailable right now. Move to a clearer signal area or save a text location note.");
          return;
        }

        if (error.code === error.TIMEOUT) {
          setFeedback("Location request timed out. Retry or save a text location note.");
          return;
        }

        setFeedback("Could not capture geolocation proof. You can still save a text location note.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      },
    );
  }

  function toggleVerificationMode(task: Task, mode: ActiveVerificationMode) {
    const nextModes = task.verification.modes.includes(mode)
      ? task.verification.modes.filter((value) => value !== mode)
      : mergeVerificationModes(task.verification.modes, [mode]);
    const payload: Record<string, unknown> = { verificationModes: nextModes };
    let successMessage = `${mode} verification updated.`;

    if (mode === "peer" && !nextModes.includes("peer") && task.sharedWith.length > 0) {
      payload.sharedWith = [];
      successMessage = "Peer verification disabled and sharing removed.";
    }

    void patchTask(task._id, payload, successMessage, false, true);
  }

  function formatRecipientLabel(recipientEmail: string) {
    const username = networkUsernameByEmail.get(recipientEmail);
    return username ? `@${username}` : recipientEmail;
  }

  function setShareConnection(taskId: string, username: string) {
    setShareConnectionByTaskId((current) => ({ ...current, [taskId]: username }));
  }

  async function shareWithConnection(task: Task) {
    const username = (shareConnectionByTaskId[task._id] ?? "").trim().toLowerCase();

    if (!username) {
      setFeedback("Pick a connection to share this goal.");
      return;
    }

    const recipientEmail = networkEmailByUsername.get(username);

    if (!recipientEmail) {
      setFeedback("Connection not found. Refresh and try again.");
      return;
    }

    if (task.sharedWith.includes(recipientEmail)) {
      setFeedback(`Already shared with @${username}.`);
      return;
    }

    const didUpdate = await patchTask(
      task._id,
      {
        sharedWith: [...task.sharedWith, recipientEmail],
        verificationModes: mergeVerificationModes(task.verification.modes, ["peer"]),
      },
      `Shared with @${username}.`,
      false,
      true,
    );

    if (didUpdate) {
      setShareConnection(task._id, "");
    }
  }

  function removeSharedRecipient(task: Task, recipientEmail: string) {
    const remainingRecipients = task.sharedWith.filter((email) => email !== recipientEmail);
    const payload: Record<string, unknown> = { sharedWith: remainingRecipients };

    if (remainingRecipients.length === 0 && task.verification.modes.includes("peer")) {
      payload.verificationModes = task.verification.modes.filter((mode) => mode !== "peer");
    }

    void patchTask(
      task._id,
      payload,
      "Shared recipient removed from goal.",
      false,
      true,
    );
  }

  function setSubtaskDraft(taskId: string, value: string) {
    setSubtaskDraftByTaskId((current) => ({ ...current, [taskId]: value }));
  }

  async function addGoalSubtask(task: Task) {
    const title = (subtaskDraftByTaskId[task._id] ?? "").trim();

    if (title.length < 2 || title.length > 120) {
      setFeedback("Subtask title must be between 2 and 120 characters.");
      return;
    }

    const didUpdate = await patchTask(
      task._id,
      { addGoalTask: { title } },
      "Subtask added.",
      true,
      true,
    );

    if (didUpdate) {
      setSubtaskDraft(task._id, "");
    }
  }

  function toggleGoalSubtaskCompletion(task: Task, goalTask: GoalTaskItem) {
    void patchTask(
      task._id,
      {
        updateGoalTask: {
          goalTaskId: goalTask.id,
          done: !goalTask.done,
        },
      },
      goalTask.done ? "Subtask reopened." : "Subtask completed.",
      true,
      true,
    );
  }

  function removeGoalSubtask(task: Task, goalTaskId: string) {
    void patchTask(task._id, { removeGoalTaskId: goalTaskId }, "Subtask removed.", true, true);
  }

  async function uploadGoalTaskProof(task: Task, goalTask: GoalTaskItem, file: File) {
    if (!file.type.startsWith("image/")) {
      setFeedback("Only image files can be uploaded as proof.");
      return;
    }

    if (file.size > 1_500_000) {
      setFeedback("Proof image is too large. Use a file under 1.5MB.");
      return;
    }

    try {
      const proofImageDataUrl = await readFileAsDataUrl(file);
      await patchTask(
        task._id,
        {
          updateGoalTask: {
            goalTaskId: goalTask.id,
            proofLabel: file.name,
            proofImageDataUrl,
          },
        },
        "Subtask proof uploaded.",
        false,
        true,
      );
    } catch {
      setFeedback("Could not process subtask proof image.");
    }
  }

  function reopenCompletedGoal(task: Task) {
    const completedSubtask = task.goalTasks.find((goalTask) => goalTask.done);

    if (completedSubtask) {
      void patchTask(
        task._id,
        {
          updateGoalTask: {
            goalTaskId: completedSubtask.id,
            done: false,
          },
        },
        "Goal moved back to in progress.",
        true,
        true,
      );
      return;
    }

    void patchTask(task._id, { status: "in_progress" }, "Goal moved back to in progress.", true, true);
  }

  return (
    <section className="dashboard-grid">
      <article className="shell-card dashboard-card dashboard-card--welcome dashboard-card--welcome-animated">
        <p className="eyebrow workspace-eyebrow">Workspace {"\u2728"}</p>
        <h1 className="workspace-title">{userName}</h1>
        <p className="app-motto app-motto--workspace">Plan it. Prove it. Keep the streak alive.</p>
        <p className="dashboard-feedback">{feedback}</p>
      </article>

      <article className="shell-card dashboard-card dashboard-card--composer">
        <h2>Add Goal</h2>
        <p className="dashboard-card__hint">Create a goal first, then manage its details in the goals section.</p>

        <div className="dashboard-task-input">
          <label className="dashboard-task-input__field dashboard-task-input__field--title" htmlFor="composer-goal-title">
            <span>Goal</span>
            <input
              id="composer-goal-title"
              value={draftTask}
              disabled={isAddingTask}
              onChange={(event) => setDraftTask(event.target.value)}
              placeholder="Add a goal..."
            />
          </label>
          <label className="dashboard-task-input__field" htmlFor="composer-goal-status">
            <span>Status</span>
            <select
              id="composer-goal-status"
              value={draftStatus}
              disabled={isAddingTask}
              onChange={(event) => setDraftStatus(normalizeTaskStatus(event.target.value))}
            >
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <button type="button" className="btn btn--primary dashboard-task-input__add-btn" onClick={addTask} disabled={isAddingTask}>
            {isAddingTask ? "Adding..." : "Add"}
          </button>
        </div>

        <details className="task-advanced task-advanced--composer">
          <summary>Set schedule for this goal (optional)</summary>
          <div className="task-advanced__body">
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
          </div>
        </details>
      </article>

      <article className="shell-card dashboard-card dashboard-card--goals">
        <h2>Your Goals {"\uD83C\uDFAF"}</h2>
        <p className="dashboard-card__hint">Goals are collapsed by default. Click a goal to open its full details.</p>

        <div className="progress-meter" aria-label="Goal completion progress">
          <div className="progress-meter__label">
            <span>Goal completion</span>
            <strong>{progressPercent}%</strong>
          </div>
          <div className="progress-meter__track">
            <div className="progress-meter__bar" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <div className="goal-filter-panel">
          <label htmlFor="goal-filter">Filter by status</label>
          <select
            id="goal-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value as TaskFilter)}
            aria-label="Filter goals"
          >
            {FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {isLoadingTasks && <p className="lead">Loading goals...</p>}

        {!isLoadingTasks && (
          <>
            <ul className="task-list">
              {mainTasks.map((task) => {
                const totalGoalTaskCount = task.goalTasks.length;
                const completedGoalTaskCount = task.goalTasks.filter((goalTask) => goalTask.done).length;
                const goalTaskProgressPercent =
                  totalGoalTaskCount > 0
                    ? Math.round((completedGoalTaskCount / totalGoalTaskCount) * 100)
                    : task.status === "completed"
                      ? 100
                      : 0;
                const scheduledDaysLabel =
                  task.scheduledDays.length === 0
                    ? "Any day"
                    : `${task.scheduledDays.length} day${task.scheduledDays.length === 1 ? "" : "s"} scheduled`;
                const verificationModesLabel =
                  task.verification.modes.length === 0
                    ? "No verification"
                    : `${task.verification.modes.length} verification mode${task.verification.modes.length === 1 ? "" : "s"}`;
                const nextSubtask = task.goalTasks.find((goalTask) => !goalTask.done) ?? task.goalTasks[0];
                const collapsedSubtaskLabel = nextSubtask ? nextSubtask.title : "No subtasks yet";
                const hasAnyProofImage =
                  Boolean(task.verification.proofImageDataUrl) ||
                  task.goalTasks.some((goalTask) => Boolean(goalTask.proofImageDataUrl));
                const shareableConnections = networkConnections.filter(
                  (connection) => !task.sharedWith.includes(connection.email),
                );

                return (
                  <li
                    key={task._id}
                    className={`task-item task-item--${task.status.replace("_", "-")}${pendingTaskIds[task._id] ? " is-pending" : ""}`}
                  >
                    <details className="task-item__collapse">
                      <summary className="task-item__summary">
                        <strong>{task.title}</strong>
                        <span>{collapsedSubtaskLabel}</span>
                      </summary>
                      <div className="task-item__expanded">
                          <div className="task-item__header">
                            <strong>{task.title}</strong>
                            <div className="task-item__header-actions">
                              <span className={`task-status task-status--${task.status.replace("_", "-")}`}>
                                {STATUS_LABELS[task.status]}
                              </span>
                            </div>
                          </div>

                    <div className="goal-progress" aria-label={`${task.title} goal-task completion`}>
                      <div className="progress-meter__label">
                        <span>Goal-task progress</span>
                        <strong>
                          {completedGoalTaskCount}/{totalGoalTaskCount} ({goalTaskProgressPercent}%)
                        </strong>
                      </div>
                      <div className="progress-meter__track">
                        <div className="progress-meter__bar" style={{ width: `${goalTaskProgressPercent}%` }} />
                      </div>
                    </div>

                    <div className="task-meta-row">
                      <span className="task-badge task-badge--info">{scheduledDaysLabel}</span>
                      <span className="task-badge task-badge--warn">{verificationModesLabel}</span>
                      {task.sharedWith.length > 0 && (
                        <span className="task-badge task-badge--success">
                          {task.verification.peerConfirmations.length}/{task.sharedWith.length} approvals
                        </span>
                      )}
                    </div>

                    <div className="subtask-panel">
                      <div className="subtask-add-row">
                        <input
                          value={subtaskDraftByTaskId[task._id] ?? ""}
                          disabled={pendingTaskIds[task._id]}
                          onChange={(event) => setSubtaskDraft(task._id, event.target.value)}
                          placeholder="Add a subtask..."
                        />
                        <button
                          type="button"
                          className="btn btn--ghost btn--soft"
                          disabled={pendingTaskIds[task._id]}
                          onClick={() => void addGoalSubtask(task)}
                        >
                          + Subtask
                        </button>
                      </div>

                      {task.goalTasks.length === 0 && (
                        <p className="goal-proof">Add subtasks to break this goal into clear steps.</p>
                      )}

                      {task.goalTasks.length > 0 && (
                        <ul className="subtask-list">
                          {task.goalTasks.map((goalTask) => (
                            <li key={`${task._id}-${goalTask.id}`} className="subtask-item">
                              <div className="subtask-item__main">
                                <button
                                  type="button"
                                  className="btn btn--ghost btn--soft"
                                  disabled={pendingTaskIds[task._id]}
                                  onClick={() => toggleGoalSubtaskCompletion(task, goalTask)}
                                >
                                  {goalTask.done ? "Undo" : "Done"}
                                </button>
                                <span className={goalTask.done ? "subtask-title is-done" : "subtask-title"}>{goalTask.title}</span>
                                {goalTask.requiresProof && <span className="subtask-proof-badge">Proof required</span>}
                                <button
                                  type="button"
                                  className="btn btn--danger-soft btn--soft"
                                  disabled={pendingTaskIds[task._id]}
                                  onClick={() => removeGoalSubtask(task, goalTask.id)}
                                >
                                  Remove
                                </button>
                              </div>

                              {goalTask.requiresProof && (
                                <div className="subtask-item__proof">
                                  <label className="proof-upload">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      capture="environment"
                                      disabled={pendingTaskIds[task._id]}
                                      onChange={(event) => {
                                        const file = event.currentTarget.files?.[0];

                                        if (!file) {
                                          return;
                                        }

                                        void uploadGoalTaskProof(task, goalTask, file);
                                        event.currentTarget.value = "";
                                      }}
                                    />
                                    Upload subtask proof
                                  </label>
                                  {goalTask.proofLabel && <p className="goal-proof">Subtask proof: {goalTask.proofLabel}</p>}
                                  {goalTask.proofImageDataUrl && (
                                    <a
                                      href={goalTask.proofImageDataUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="shared-proof-card"
                                    >
                                      <Image
                                        src={goalTask.proofImageDataUrl}
                                        alt={`${goalTask.title} proof`}
                                        width={220}
                                        height={160}
                                        unoptimized
                                      />
                                      <span>Open subtask proof</span>
                                    </a>
                                  )}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="task-item__controls">
                      <label className="task-status-field">
                        <span>Status</span>
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
                      </label>
                    </div>

                    <div className="task-item__controls task-item__controls--danger">
                      <button
                        type="button"
                        className="btn btn--danger-soft btn--soft"
                        disabled={pendingTaskIds[task._id]}
                        onClick={() => deleteTask(task._id)}
                      >
                        Delete goal
                      </button>
                    </div>

                    <details className="task-advanced">
                      <summary>Schedule & Verification</summary>
                      <div className="task-advanced__body">
                        <div className="task-section">
                          <p className="task-section__label">Schedule</p>
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
                        </div>

                        <div className="task-section">
                          <p className="task-section__label">Verification Type</p>
                          <div className="day-chip-row">
                            {VERIFICATION_OPTIONS.map((option) => (
                              <button
                                key={`${task._id}-verify-${option.value}`}
                                type="button"
                                className={task.verification.modes.includes(option.value) ? "day-chip is-active" : "day-chip"}
                                disabled={pendingTaskIds[task._id]}
                                onClick={() => toggleVerificationMode(task, option.value)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>

                          <div className="task-item__controls">
                            {task.verification.modes.includes("geolocation") && (
                              <button
                                type="button"
                                className="btn btn--ghost btn--soft"
                                disabled={pendingTaskIds[task._id]}
                                onClick={() => captureGeolocationProof(task._id)}
                              >
                                Capture Geo
                              </button>
                            )}

                            {hasAnyProofImage && (
                              <button
                                type="button"
                                className="btn btn--danger-soft btn--soft"
                                disabled={pendingTaskIds[task._id]}
                                onClick={() =>
                                  void patchTask(
                                    task._id,
                                    { clearProofImages: true },
                                    "Stored proof images deleted. Text notes and completion history kept.",
                                    false,
                                    true,
                                  )
                                }
                              >
                                Delete Proof Images
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="peer-management">
                          <p className="goal-proof">
                            {task.sharedWith.length > 0
                              ? `Approvals: ${task.verification.peerConfirmations.length}/${task.sharedWith.length}`
                              : "No shared recipients yet."}
                          </p>
                          <div className="task-item__controls share-picker">
                            <select
                              value={shareConnectionByTaskId[task._id] ?? ""}
                              disabled={pendingTaskIds[task._id] || isLoadingNetwork || shareableConnections.length === 0}
                              onChange={(event) => setShareConnection(task._id, event.target.value)}
                            >
                              <option value="">Pick connection</option>
                              {shareableConnections.map((connection) => (
                                <option key={`${task._id}-connection-${connection.email}`} value={connection.username}>
                                  @{connection.username}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="btn btn--ghost btn--soft"
                              disabled={
                                pendingTaskIds[task._id] ||
                                isLoadingNetwork ||
                                !shareConnectionByTaskId[task._id] ||
                                shareableConnections.length === 0
                              }
                              onClick={() => void shareWithConnection(task)}
                            >
                              Share
                            </button>
                          </div>

                          {isLoadingNetwork && <p className="goal-proof">Loading connections...</p>}
                          {!isLoadingNetwork && networkConnections.length === 0 && (
                            <p className="goal-proof">No connections yet. Add users from the Connections tab first.</p>
                          )}
                          {!isLoadingNetwork && networkConnections.length > 0 && shareableConnections.length === 0 && (
                            <p className="goal-proof">All your connections are already shared on this goal.</p>
                          )}

                          {task.sharedWith.length > 0 && (
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
                                    {formatRecipientLabel(recipientEmail)}
                                    <button
                                      type="button"
                                      disabled={pendingTaskIds[task._id]}
                                      onClick={() => removeSharedRecipient(task, recipientEmail)}
                                      aria-label={`Remove ${formatRecipientLabel(recipientEmail)}`}
                                    >
                                      x
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {task.verification.modes.includes("photo") && (
                          <label className="proof-upload">
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              disabled={pendingTaskIds[task._id]}
                              onChange={(event) => {
                                const file = event.currentTarget.files?.[0];

                                if (!file) {
                                  return;
                                }

                                if (!file.type.startsWith("image/")) {
                                  setFeedback("Only image files can be uploaded as proof.");
                                  event.currentTarget.value = "";
                                  return;
                                }

                                if (file.size > 1_500_000) {
                                  setFeedback("Proof image is too large. Use a file under 1.5MB.");
                                  event.currentTarget.value = "";
                                  return;
                                }

                                void (async () => {
                                  try {
                                    const proofImageDataUrl = await readFileAsDataUrl(file);

                                    await patchTask(
                                      task._id,
                                      {
                                        verificationProofLabel: file.name,
                                        verificationProofImageDataUrl: proofImageDataUrl,
                                      },
                                      "Photo proof submitted.",
                                      false,
                                      true,
                                    );
                                  } catch {
                                    setFeedback("Could not process proof image.");
                                  } finally {
                                    event.currentTarget.value = "";
                                  }
                                })();
                              }}
                            />
                            Upload photo proof
                          </label>
                        )}

                        {task.verification.proofLabel && <p className="goal-proof">Proof: {task.verification.proofLabel}</p>}
                        {task.verification.geolocationLabel && (
                          <p className="goal-proof">Location proof: {task.verification.geolocationLabel}</p>
                        )}
                        {task.verification.proofImageDataUrl && (
                          <a
                            href={task.verification.proofImageDataUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="shared-proof-card"
                          >
                            <Image
                              src={task.verification.proofImageDataUrl}
                              alt={`${task.title} proof`}
                              width={240}
                              height={176}
                              unoptimized
                            />
                            <span>Open proof image</span>
                          </a>
                        )}
                      </div>
                    </details>
                      </div>
                    </details>
                  </li>
                );
              })}
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
                <h3>Completed Folder {"\uD83D\uDCC1"}</h3>
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
                          className="btn btn--ghost btn--soft"
                          disabled={pendingTaskIds[task._id]}
                          onClick={() => reopenCompletedGoal(task)}
                        >
                          Reopen
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger-soft btn--soft"
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

      <article className="shell-card dashboard-card dashboard-card--peer">
        <h2>Shared With You {"\uD83E\uDD1D"}</h2>
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
                  Verification enabled:{" "}
                  {request.verification.modes.length > 0 ? request.verification.modes.join(", ") : "none"}
                </p>
                <p className="goal-proof">
                  Confirmations: {request.verification.peerConfirmations.length}/{request.verification.peerConfirmers.length}
                </p>
                {request.verification.geolocationLabel && (
                  <p className="goal-proof">Location proof: {request.verification.geolocationLabel}</p>
                )}
                {request.proofUploads.length > 0 && (
                  <div className="shared-proof-grid">
                    {request.proofUploads.map((upload) => (
                      <a
                        key={`${request._id}-${upload.proofImageDataUrl.slice(0, 48)}`}
                        href={upload.proofImageDataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shared-proof-card"
                      >
                        <Image
                          src={upload.proofImageDataUrl}
                          alt={`${upload.title} proof`}
                          width={240}
                          height={176}
                          unoptimized
                        />
                        <span>{upload.proofLabel || upload.title}</span>
                        {upload.completedAt && <small>{upload.completedAt}</small>}
                      </a>
                    ))}
                  </div>
                )}
                {request.proofUploads.length === 0 && (
                  <p className="goal-proof">No proof uploads attached yet.</p>
                )}

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
                        : "Approve \u2705"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="shell-card dashboard-card">
        <h2>Completion Calendar {"\uD83D\uDCC5"}</h2>
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

            if (!isMarked) {
              return (
                <div key={cell.key} className="calendar-cell">
                  <span>{cell.dayNumber}</span>
                </div>
              );
            }

            const dayActivityCount = calendarActivitiesByDate[cell.dateKey]?.length ?? 0;
            const isSelectedDay = selectedCalendarDateKey === cell.dateKey;

            return (
              <button
                key={cell.key}
                type="button"
                className={isSelectedDay ? "calendar-cell is-marked is-selected" : "calendar-cell is-marked"}
                onClick={() =>
                  setSelectedCalendarDateKey((current) => (current === cell.dateKey ? null : cell.dateKey))
                }
              >
                <span>{cell.dayNumber}</span>
                <span className="calendar-cell__meta">
                  <i />
                  <small>{dayActivityCount}</small>
                </span>
              </button>
            );
          })}
        </div>
        <div className="calendar-day-log">
          {!selectedCalendarDateKey && (
            <p className="goal-proof">Select a marked day to review completed and confirmed goals.</p>
          )}

          {selectedCalendarDateKey && (
            <>
              <h3>{selectedCalendarDateLabel}</h3>
              {selectedCalendarActivities.length === 0 && (
                <p className="goal-proof">No detailed activity notes found for this day.</p>
              )}
              {selectedCalendarActivities.length > 0 && (
                <ul className="calendar-day-log__list">
                  {selectedCalendarActivities.map((activity) => (
                    <li key={activity.key}>
                      <strong>{activity.goalTitle}</strong>
                      <span>{activity.detail}</span>
                      <small>{activity.verificationLabel}</small>
                      <small>Proof note: {activity.proofText}</small>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </article>

      <article className="shell-card dashboard-card">
        <h2>Verification Signals {"\uD83E\uDDEA"}</h2>
        <p className="lead">Quick view of proof readiness across your current goals.</p>
        <ul className="summary-list">
          <li>
            <span>Photo proof</span>
            <strong>
              {verificationSummary.photoSubmitted}/{verificationSummary.photoRequired}
            </strong>
          </li>
          <li>
            <span>Geolocation proof</span>
            <strong>
              {verificationSummary.geoSubmitted}/{verificationSummary.geoRequired}
            </strong>
          </li>
          <li>
            <span>Peer approvals</span>
            <strong>
              {verificationSummary.peerVerified}/{verificationSummary.peerRequired}
            </strong>
          </li>
          <li>
            <span>Shared recipients</span>
            <strong>{verificationSummary.sharedRecipientCount}</strong>
          </li>
        </ul>
      </article>

      <article className="shell-card dashboard-card dashboard-card--summary">
        <h2>Backend Summary {"\uD83E\uDDFE"}</h2>
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
