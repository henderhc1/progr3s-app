import { NextResponse } from "next/server";
import { DEMO_USER } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { getUserModel } from "@/lib/models/User";
import { sendGoalSharedNotifications } from "@/lib/notifications";
import { applyMaintenanceResultToTask, createGoalTaskId, normalizeTaskRecord } from "@/lib/taskRecord";
import { getSessionIdentity } from "@/lib/session";
import { validateShareRecipients } from "@/lib/sharing";
import { applyTaskMaintenance } from "@/lib/taskMaintenance";
import {
  computeVerificationState,
  GoalType,
  GoalTaskItem,
  mergeVerificationModes,
  normalizeEmailList,
  normalizeGoalCadence,
  normalizeGoalTasks,
  normalizeGoalType,
  normalizeScheduledDays,
  normalizeTaskStatus,
  normalizeVerificationMode,
  normalizeVerificationModes,
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
    goalCadence: "weekly",
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
        peerConfirmations: [],
      },
      {
        id: "demo-1-b",
        title: "Workout Tuesday",
        done: false,
        requiresProof: true,
        proofLabel: "",
        proofImageDataUrl: "",
        completedAt: "",
        peerConfirmations: [],
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
    goalCadence: "weekly",
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
        peerConfirmations: [],
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
    goalCadence: "one_time",
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
        peerConfirmations: [],
      },
      {
        id: "demo-3-b",
        title: "Break milestones into daily tasks",
        done: false,
        requiresProof: false,
        proofLabel: "",
        proofImageDataUrl: "",
        completedAt: "",
        peerConfirmations: [],
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
  goalCadence?: string;
  goalTasks?: GoalTaskPayload[];
};

function buildDefaultGoalTasks(goalType: GoalType, scheduledDays: number[]): GoalTaskItem[] {
  if (goalType === "gym") {
    if (scheduledDays.length === 0) {
      return [
        {
          id: createGoalTaskId("gym"),
          title: "Workout session",
          done: false,
          requiresProof: true,
          proofLabel: "",
          proofImageDataUrl: "",
          completedAt: "",
          peerConfirmations: [],
        },
      ];
    }

    return scheduledDays.map((day) => ({
      id: createGoalTaskId(`gym-${day}`),
      title: `Workout ${DAY_LABELS[day]}`,
      done: false,
      requiresProof: true,
      proofLabel: "",
      proofImageDataUrl: "",
      completedAt: "",
      peerConfirmations: [],
    }));
  }

  if (goalType === "programming") {
    return [
      {
        id: createGoalTaskId("code"),
        title: "Solve one coding problem",
        done: false,
        requiresProof: true,
        proofLabel: "",
        proofImageDataUrl: "",
        completedAt: "",
        peerConfirmations: [],
      },
    ];
  }

  return [];
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

    return NextResponse.json({ ok: true, tasks: demoTasks.map(normalizeTaskRecord) });
  }

  const tasks = await TaskModel.find({ ownerEmail: identity.email })
    .sort({ createdAt: -1 })
    .catch(() => null);

  if (!tasks) {
    return NextResponse.json({ ok: false, message: "Could not load goals right now." }, { status: 503 });
  }

  for (const task of tasks) {
    const maintenance = applyTaskMaintenance({
      status: task.status,
      done: task.done,
      scheduledDays: task.scheduledDays,
      completionDates: task.completionDates,
      goalCadence: task.goalCadence,
      goalTasks: task.goalTasks,
      verification: task.verification,
      sharedWith: task.sharedWith,
    });

    if (!maintenance.changed) {
      continue;
    }

    applyMaintenanceResultToTask(task, maintenance);

    const saveResult = await task.save().catch(() => null);

    if (!saveResult) {
      return NextResponse.json({ ok: false, message: "Could not refresh weekly goal data right now." }, { status: 503 });
    }
  }

  return NextResponse.json({
    ok: true,
    tasks: tasks.map(normalizeTaskRecord),
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
  let sharedWith = normalizeEmailList(body.sharedWith).filter((email) => email !== identity.email);
  const requestedVerificationModes =
    body.verificationModes !== undefined
      ? normalizeVerificationModes(body.verificationModes)
      : (() => {
          const legacyMode = normalizeVerificationMode(body.verificationMode);
          return legacyMode === "none" ? [] : [legacyMode];
        })();
  let verificationModes = mergeVerificationModes(
    requestedVerificationModes,
    sharedWith.length > 0 ? ["peer"] : [],
  );
  const peerConfirmers = normalizeEmailList(body.peerConfirmers);
  let effectivePeerConfirmers = sharedWith.length > 0 ? sharedWith : verificationModes.includes("peer") ? peerConfirmers : [];
  const rawProofLabel = typeof body.verificationProofLabel === "string" ? body.verificationProofLabel.trim().slice(0, 160) : "";
  const rawGeolocationLabel =
    typeof body.verificationGeoLabel === "string" ? body.verificationGeoLabel.trim().slice(0, 160) : "";
  const geolocationLabel = rawGeolocationLabel || (rawProofLabel.startsWith("geo:") ? rawProofLabel : "");
  const proofLabel = geolocationLabel && rawProofLabel === geolocationLabel ? "" : rawProofLabel;
  const proofImageDataUrl =
    typeof body.verificationProofImageDataUrl === "string" && body.verificationProofImageDataUrl.trim().startsWith("data:image/")
      ? body.verificationProofImageDataUrl.trim().slice(0, 2_500_000)
      : "";
  let verificationState = computeVerificationState({
    modes: verificationModes,
    photoProofImageDataUrl: proofImageDataUrl,
    geolocationLabel,
    peerConfirmers: effectivePeerConfirmers,
    peerConfirmations: [],
  });
  const goalType = normalizeGoalType(body.goalType);
  const goalCadence = normalizeGoalCadence(body.goalCadence);
  const providedGoalTasks = normalizeGoalTasks(body.goalTasks);
  const goalTasks = providedGoalTasks.length > 0 ? providedGoalTasks : buildDefaultGoalTasks(goalType, scheduledDays);

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
  let shareRecipients: Array<{ email: string; name: string; username: string }> = [];
  let ownerNameForNotification = identity.name;

  try {
    db = await connectToDatabase();
  } catch {
    return NextResponse.json({ ok: false, message: "Could not connect to database right now." }, { status: 503 });
  }

  if (!db) {
    if (sharedWith.length > 0) {
      return NextResponse.json(
        { ok: false, message: "Sharing requires MongoDB mode and connected users in your network." },
        { status: 400 },
      );
    }

    if (identity.email !== DEMO_USER.email) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      task: normalizeTaskRecord({
        _id: `demo-${Date.now()}`,
        title,
        goalType,
        goalCadence,
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

  const userModel = getUserModel(db);
  const shareValidation = await validateShareRecipients({
    userModel,
    ownerEmail: identity.email,
    requestedSharedWith: sharedWith,
  });

  if (!shareValidation.ok) {
    return NextResponse.json({ ok: false, message: shareValidation.message }, { status: shareValidation.status });
  }

  sharedWith = shareValidation.sharedWith;
  shareRecipients = shareValidation.recipients;
  ownerNameForNotification = shareValidation.ownerName;
  verificationModes = mergeVerificationModes(
    requestedVerificationModes,
    sharedWith.length > 0 ? ["peer"] : [],
  );
  effectivePeerConfirmers = sharedWith.length > 0 ? sharedWith : verificationModes.includes("peer") ? peerConfirmers : [];
  verificationState = computeVerificationState({
    modes: verificationModes,
    photoProofImageDataUrl: proofImageDataUrl,
    geolocationLabel,
    peerConfirmers: effectivePeerConfirmers,
    peerConfirmations: [],
  });

  const task = await TaskModel.create({
    ownerEmail: identity.email,
    title,
    goalType,
    goalCadence,
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

  if (shareRecipients.length > 0) {
    void sendGoalSharedNotifications({
      ownerName: ownerNameForNotification,
      ownerEmail: identity.email,
      goalTitle: title,
      recipients: shareRecipients,
    });
  }

  return NextResponse.json({
    ok: true,
    task: normalizeTaskRecord(task),
  });
}
