import { NextResponse } from "next/server";
import { DEMO_USER } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { getSessionIdentity } from "@/lib/session";
import {
  computeVerificationState,
  GoalType,
  GoalTaskItem,
  mergeVerificationModes,
  normalizeEmailList,
  normalizeGoalTasks,
  normalizeGoalType,
  normalizePeerConfirmations,
  normalizeScheduledDays,
  normalizeTaskStatus,
  normalizeVerificationMode,
  normalizeVerificationModes,
  resolveTaskStatus,
  resolveVerificationModes,
  toLocalDateKey,
} from "@/lib/tasks";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type GoalTaskPayload = {
  id?: string;
  title?: string;
  done?: boolean;
  requiresProof?: boolean;
  proofLabel?: string;
  proofImageDataUrl?: string;
  completedAt?: string;
};

const demoTasks = [
  {
    _id: "demo-1",
    title: "Weekly gym routine",
    goalType: "gym",
    status: "in_progress",
    done: false,
    scheduledDays: [1, 2],
    completionDates: [],
    goalTasks: [
      {
        id: "demo-1-a",
        title: "Workout Monday",
        done: false,
        requiresProof: true,
        proofLabel: "",
        proofImageDataUrl: "",
        completedAt: "",
      },
      {
        id: "demo-1-b",
        title: "Workout Tuesday",
        done: false,
        requiresProof: true,
        proofLabel: "",
        proofImageDataUrl: "",
        completedAt: "",
      },
    ],
    verification: {
      mode: "photo",
      modes: ["photo"],
      state: "pending",
      proofLabel: "",
      proofImageDataUrl: "",
      geolocationLabel: "",
      peerConfirmers: [],
      peerConfirmations: [],
    },
    sharedWith: [],
  },
  {
    _id: "demo-2",
    title: "LeetCode consistency",
    goalType: "programming",
    status: "not_started",
    done: false,
    scheduledDays: [1, 3, 5],
    completionDates: [],
    goalTasks: [
      {
        id: "demo-2-a",
        title: "Solve one LeetCode problem",
        done: false,
        requiresProof: true,
        proofLabel: "",
        proofImageDataUrl: "",
        completedAt: "",
      },
    ],
    verification: {
      mode: "photo",
      modes: ["photo"],
      state: "pending",
      proofLabel: "",
      proofImageDataUrl: "",
      geolocationLabel: "",
      peerConfirmers: [],
      peerConfirmations: [],
    },
    sharedWith: [],
  },
  {
    _id: "demo-3",
    title: "Project planning",
    goalType: "general",
    status: "in_progress",
    done: false,
    scheduledDays: [],
    completionDates: [],
    goalTasks: [
      {
        id: "demo-3-a",
        title: "Define this week milestones",
        done: true,
        requiresProof: false,
        proofLabel: "",
        proofImageDataUrl: "",
        completedAt: toLocalDateKey(),
      },
      {
        id: "demo-3-b",
        title: "Break milestones into daily tasks",
        done: false,
        requiresProof: false,
        proofLabel: "",
        proofImageDataUrl: "",
        completedAt: "",
      },
    ],
    verification: {
      mode: "none",
      modes: [],
      state: "not_required",
      proofLabel: "",
      proofImageDataUrl: "",
      geolocationLabel: "",
      peerConfirmers: [],
      peerConfirmations: [],
    },
    sharedWith: [],
  },
];

type CreateTaskPayload = {
  title?: string;
  status?: string;
  done?: boolean;
  scheduledDays?: unknown;
  verificationMode?: string;
  verificationModes?: unknown;
  verificationProofLabel?: string;
  verificationProofImageDataUrl?: string;
  verificationGeoLabel?: string;
  sharedWith?: unknown;
  peerConfirmers?: unknown;
  goalType?: string;
  goalTasks?: GoalTaskPayload[];
};

function buildGoalTaskId(seed = "") {
  return `goal-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${seed ? `-${seed}` : ""}`;
}

function buildDefaultGoalTasks(goalType: GoalType, scheduledDays: number[]): GoalTaskItem[] {
  if (goalType === "gym") {
    if (scheduledDays.length === 0) {
      return [
        {
          id: buildGoalTaskId("gym"),
          title: "Workout session",
          done: false,
          requiresProof: true,
          proofLabel: "",
          proofImageDataUrl: "",
          completedAt: "",
        },
      ];
    }

    return scheduledDays.map((day) => ({
      id: buildGoalTaskId(`gym-${day}`),
      title: `Workout ${DAY_LABELS[day]}`,
      done: false,
      requiresProof: true,
      proofLabel: "",
      proofImageDataUrl: "",
      completedAt: "",
    }));
  }

  if (goalType === "programming") {
    return [
      {
        id: buildGoalTaskId("code"),
        title: "Solve one coding problem",
        done: false,
        requiresProof: true,
        proofLabel: "",
        proofImageDataUrl: "",
        completedAt: "",
      },
    ];
  }

  return [];
}

function alignStatusWithGoalTasks(status: ReturnType<typeof resolveTaskStatus>, goalTasks: GoalTaskItem[]) {
  if (goalTasks.length === 0) {
    return status;
  }

  const doneCount = goalTasks.filter((task) => task.done).length;

  if (doneCount === goalTasks.length) {
    return "completed" as const;
  }

  if (doneCount === 0) {
    return "not_started" as const;
  }

  if (doneCount > 0) {
    return "in_progress" as const;
  }

  return status;
}

function collectCompletionDates(baseDates: unknown, goalTasks: GoalTaskItem[]) {
  const dateSet = new Set<string>();

  if (Array.isArray(baseDates)) {
    for (const value of baseDates) {
      if (typeof value === "string") {
        dateSet.add(value);
      }
    }
  }

  for (const task of goalTasks) {
    if (task.completedAt) {
      dateSet.add(task.completedAt);
    }
  }

  return Array.from(dateSet).sort((a, b) => a.localeCompare(b));
}

function mapTask(task: {
  _id: string | { toString(): string };
  title?: string;
  goalType?: string;
  goalTasks?: unknown;
  status?: string;
  done?: boolean;
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
}) {
  const goalType = normalizeGoalType(task.goalType);
  const goalTasks = normalizeGoalTasks(task.goalTasks);
  const status = alignStatusWithGoalTasks(resolveTaskStatus(task.status, task.done), goalTasks);
  const sharedWith = normalizeEmailList(task.sharedWith);
  const peerConfirmers = sharedWith.length > 0 ? sharedWith : normalizeEmailList(task.verification?.peerConfirmers);
  const peerConfirmations = normalizePeerConfirmations(task.verification?.peerConfirmations).filter((confirmation) =>
    peerConfirmers.includes(confirmation.email),
  );
  const rawProofLabel = typeof task.verification?.proofLabel === "string" ? task.verification.proofLabel.trim() : "";
  const rawGeolocationLabel =
    typeof task.verification?.geolocationLabel === "string" ? task.verification.geolocationLabel.trim() : "";
  const geolocationLabel = rawGeolocationLabel || (rawProofLabel.startsWith("geo:") ? rawProofLabel : "");
  const proofLabel = geolocationLabel && rawProofLabel === geolocationLabel ? "" : rawProofLabel;
  const proofImageDataUrl =
    typeof task.verification?.proofImageDataUrl === "string" && task.verification.proofImageDataUrl.startsWith("data:image/")
      ? task.verification.proofImageDataUrl
      : "";
  const verificationModes = mergeVerificationModes(
    resolveVerificationModes(task.verification?.modes, task.verification?.mode),
    sharedWith.length > 0 ? ["peer"] : [],
  );
  const verificationState = computeVerificationState({
    modes: verificationModes,
    photoProofImageDataUrl: proofImageDataUrl,
    geolocationLabel,
    peerConfirmers,
    peerConfirmations,
  });

  return {
    _id: typeof task._id === "string" ? task._id : task._id.toString(),
    title: task.title ?? "Untitled goal",
    goalType,
    goalTasks,
    status,
    done: status === "completed",
    scheduledDays: normalizeScheduledDays(task.scheduledDays),
    completionDates: collectCompletionDates(task.completionDates, goalTasks),
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

export async function GET() {
  const identity = await getSessionIdentity();

  if (!identity) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  if (identity.role !== "user") {
    return NextResponse.json({ ok: false, message: "Dashboard goals are user-only." }, { status: 403 });
  }

  let db = null;

  try {
    db = await connectToDatabase();
  } catch {
    return NextResponse.json({ ok: false, message: "Could not connect to database right now." }, { status: 503 });
  }

  if (!db) {
    if (identity.email !== DEMO_USER.email) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ ok: true, tasks: demoTasks.map(mapTask) });
  }

  const tasks = await TaskModel.find({ ownerEmail: identity.email })
    .sort({ createdAt: -1 })
    .lean()
    .catch(() => null);

  if (!tasks) {
    return NextResponse.json({ ok: false, message: "Could not load goals right now." }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    tasks: tasks.map(mapTask),
  });
}

export async function POST(request: Request) {
  const identity = await getSessionIdentity();

  if (!identity) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  if (identity.role !== "user") {
    return NextResponse.json({ ok: false, message: "Dashboard goals are user-only." }, { status: 403 });
  }

  let body: CreateTaskPayload;

  try {
    body = (await request.json()) as CreateTaskPayload;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Invalid request body. Send valid JSON.",
      },
      { status: 400 },
    );
  }

  const title = body.title?.trim() ?? "";

  if (title.length < 2) {
    return NextResponse.json({ ok: false, message: "Goal title must be at least 2 characters." }, { status: 400 });
  }

  if (title.length > 140) {
    return NextResponse.json({ ok: false, message: "Goal title must be 140 characters or fewer." }, { status: 400 });
  }

  const fallbackStatus = typeof body.done === "boolean" ? (body.done ? "completed" : "not_started") : "not_started";
  let status = normalizeTaskStatus(body.status, fallbackStatus);
  const scheduledDays = normalizeScheduledDays(body.scheduledDays);
  const sharedWith = normalizeEmailList(body.sharedWith).filter((email) => email !== identity.email);
  const requestedVerificationModes =
    body.verificationModes !== undefined
      ? normalizeVerificationModes(body.verificationModes)
      : (() => {
          const legacyMode = normalizeVerificationMode(body.verificationMode);
          return legacyMode === "none" ? [] : [legacyMode];
        })();
  const verificationModes = mergeVerificationModes(
    requestedVerificationModes,
    sharedWith.length > 0 ? ["peer"] : [],
  );
  const peerConfirmers = normalizeEmailList(body.peerConfirmers);
  const effectivePeerConfirmers = sharedWith.length > 0 ? sharedWith : verificationModes.includes("peer") ? peerConfirmers : [];
  const rawProofLabel = typeof body.verificationProofLabel === "string" ? body.verificationProofLabel.trim().slice(0, 160) : "";
  const rawGeolocationLabel =
    typeof body.verificationGeoLabel === "string" ? body.verificationGeoLabel.trim().slice(0, 160) : "";
  const geolocationLabel = rawGeolocationLabel || (rawProofLabel.startsWith("geo:") ? rawProofLabel : "");
  const proofLabel = geolocationLabel && rawProofLabel === geolocationLabel ? "" : rawProofLabel;
  const proofImageDataUrl =
    typeof body.verificationProofImageDataUrl === "string" && body.verificationProofImageDataUrl.trim().startsWith("data:image/")
      ? body.verificationProofImageDataUrl.trim().slice(0, 2_500_000)
      : "";
  const verificationState = computeVerificationState({
    modes: verificationModes,
    photoProofImageDataUrl: proofImageDataUrl,
    geolocationLabel,
    peerConfirmers: effectivePeerConfirmers,
    peerConfirmations: [],
  });
  const goalType = normalizeGoalType(body.goalType);
  const providedGoalTasks = normalizeGoalTasks(body.goalTasks);
  const goalTasks = providedGoalTasks.length > 0 ? providedGoalTasks : buildDefaultGoalTasks(goalType, scheduledDays);

  status = alignStatusWithGoalTasks(status, goalTasks);

  if (sharedWith.length > 0 && status === "completed") {
    status = "not_started";
  }

  const completionDateSet = new Set<string>();

  if (status === "completed") {
    completionDateSet.add(toLocalDateKey());
  }

  for (const task of goalTasks) {
    if (task.completedAt) {
      completionDateSet.add(task.completedAt);
    }
  }

  const completionDates = Array.from(completionDateSet).sort((a, b) => a.localeCompare(b));

  let db = null;

  try {
    db = await connectToDatabase();
  } catch {
    return NextResponse.json({ ok: false, message: "Could not connect to database right now." }, { status: 503 });
  }

  if (!db) {
    if (identity.email !== DEMO_USER.email) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      task: mapTask({
        _id: `demo-${Date.now()}`,
        title,
        goalType,
        goalTasks,
        status,
        done: status === "completed",
        scheduledDays,
        completionDates,
        verification: {
          mode: verificationModes[0] ?? "none",
          modes: verificationModes,
          state: verificationState,
          proofLabel,
          proofImageDataUrl,
          geolocationLabel,
          peerConfirmers: effectivePeerConfirmers,
          peerConfirmations: [],
        },
        sharedWith,
      }),
    });
  }

  const task = await TaskModel.create({
    ownerEmail: identity.email,
    title,
    goalType,
    goalTasks,
    status,
    done: status === "completed",
    scheduledDays,
    completionDates,
    verification: {
      mode: verificationModes[0] ?? "none",
      modes: verificationModes,
      state: verificationState,
      proofLabel,
      proofImageDataUrl,
      geolocationLabel,
      peerConfirmers: effectivePeerConfirmers,
      peerConfirmations: [],
    },
    sharedWith,
  }).catch(() => null);

  if (!task) {
    return NextResponse.json({ ok: false, message: "Could not create goal right now." }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    task: mapTask(task),
  });
}
