import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { DEMO_USER } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { getSessionIdentity } from "@/lib/session";
import {
  computeVerificationState,
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

type GoalTaskUpdatePayload = {
  goalTaskId?: string;
  title?: string;
  done?: boolean;
  requiresProof?: boolean;
  proofLabel?: string;
  proofImageDataUrl?: string;
  clearProof?: boolean;
};

type AddGoalTaskPayload = {
  title?: string;
  requiresProof?: boolean;
};

type UpdateTaskPayload = {
  done?: boolean;
  title?: string;
  status?: string;
  scheduledDays?: unknown;
  goalType?: string;
  addGoalTask?: AddGoalTaskPayload;
  updateGoalTask?: GoalTaskUpdatePayload;
  removeGoalTaskId?: string;
  verificationMode?: string;
  verificationModes?: unknown;
  verificationState?: string;
  verificationProofLabel?: string;
  verificationProofImageDataUrl?: string;
  verificationGeoLabel?: string;
  sharedWith?: unknown;
  peerConfirmers?: unknown;
};

function buildGoalTaskId(seed = "") {
  return `goal-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${seed ? `-${seed}` : ""}`;
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

function applyGoalTaskUpdate(goalTasks: GoalTaskItem[], payload: GoalTaskUpdatePayload) {
  const goalTaskId = payload.goalTaskId?.trim() ?? "";

  if (!goalTaskId) {
    return {
      ok: false,
      message: "Goal task id is required.",
      goalTasks,
    };
  }

  const index = goalTasks.findIndex((task) => task.id === goalTaskId);

  if (index < 0) {
    return {
      ok: false,
      message: "Goal task not found.",
      goalTasks,
    };
  }

  const nextTask = { ...goalTasks[index] };

  if (typeof payload.title === "string") {
    const title = payload.title.trim();

    if (title.length < 2 || title.length > 120) {
      return {
        ok: false,
        message: "Goal task title must be between 2 and 120 characters.",
        goalTasks,
      };
    }

    nextTask.title = title;
  }

  if (typeof payload.requiresProof === "boolean") {
    nextTask.requiresProof = payload.requiresProof;
  }

  if (typeof payload.proofLabel === "string") {
    nextTask.proofLabel = payload.proofLabel.trim().slice(0, 160);
  }

  if (payload.clearProof) {
    nextTask.proofLabel = "";
    nextTask.proofImageDataUrl = "";
  }

  if (typeof payload.proofImageDataUrl === "string") {
    const image = payload.proofImageDataUrl.trim();

    if (!image.startsWith("data:image/")) {
      return {
        ok: false,
        message: "Proof image must be a valid image upload.",
        goalTasks,
      };
    }

    if (image.length > 2_500_000) {
      return {
        ok: false,
        message: "Proof image is too large. Please keep uploads under 2MB.",
        goalTasks,
      };
    }

    nextTask.proofImageDataUrl = image;
  }

  if (typeof payload.done === "boolean") {
    if (payload.done && nextTask.requiresProof && !nextTask.proofImageDataUrl) {
      return {
        ok: false,
        message: "Proof image is required before completing this task.",
        goalTasks,
      };
    }

    nextTask.done = payload.done;

    if (payload.done) {
      nextTask.completedAt = toLocalDateKey();
    } else {
      nextTask.completedAt = "";
    }
  }

  const nextGoalTasks = [...goalTasks];
  nextGoalTasks[index] = nextTask;

  return {
    ok: true,
    goalTasks: nextGoalTasks,
  };
}

export async function PATCH(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const identity = await getSessionIdentity();

  if (!identity) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  if (identity.role !== "user") {
    return NextResponse.json({ ok: false, message: "Dashboard goals are user-only." }, { status: 403 });
  }

  const { taskId } = await context.params;
  let body: UpdateTaskPayload;

  try {
    body = (await request.json()) as UpdateTaskPayload;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Invalid request body. Send valid JSON.",
      },
      { status: 400 },
    );
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

    const demoGoalType = normalizeGoalType(body.goalType);
    const demoGoalTasks = normalizeGoalTasks([]);
    const demoRequestedModes =
      body.verificationModes !== undefined
        ? normalizeVerificationModes(body.verificationModes)
        : (() => {
            const legacyMode = normalizeVerificationMode(body.verificationMode);
            return legacyMode === "none" ? [] : [legacyMode];
          })();
    const demoSharedWith = normalizeEmailList(body.sharedWith);
    const demoVerificationModes = mergeVerificationModes(
      demoRequestedModes,
      demoSharedWith.length > 0 ? ["peer"] : [],
    );
    const demoRawProofLabel = typeof body.verificationProofLabel === "string" ? body.verificationProofLabel.trim().slice(0, 160) : "";
    const demoRawGeolocationLabel =
      typeof body.verificationGeoLabel === "string" ? body.verificationGeoLabel.trim().slice(0, 160) : "";
    const demoGeolocationLabel = demoRawGeolocationLabel || (demoRawProofLabel.startsWith("geo:") ? demoRawProofLabel : "");
    const demoProofLabel = demoGeolocationLabel && demoRawProofLabel === demoGeolocationLabel ? "" : demoRawProofLabel;
    const demoProofImageDataUrl =
      typeof body.verificationProofImageDataUrl === "string" && body.verificationProofImageDataUrl.startsWith("data:image/")
        ? body.verificationProofImageDataUrl
        : "";
    const demoPeerConfirmers =
      demoSharedWith.length > 0 ? demoSharedWith : demoVerificationModes.includes("peer") ? normalizeEmailList(body.peerConfirmers) : [];
    const demoVerificationState = computeVerificationState({
      modes: demoVerificationModes,
      photoProofImageDataUrl: demoProofImageDataUrl,
      geolocationLabel: demoGeolocationLabel,
      peerConfirmers: demoPeerConfirmers,
      peerConfirmations: [],
    });

    return NextResponse.json({
      ok: true,
      task: mapTask({
        _id: taskId,
        title: body.title ?? "Updated goal",
        goalType: demoGoalType,
        goalTasks: demoGoalTasks,
        status: normalizeTaskStatus(body.status, body.done ? "completed" : "not_started"),
        done: body.done ?? false,
        scheduledDays: normalizeScheduledDays(body.scheduledDays),
        completionDates: body.done ? [toLocalDateKey()] : [],
        verification: {
          mode: demoVerificationModes[0] ?? "none",
          modes: demoVerificationModes,
          state: demoVerificationState,
          proofLabel: demoProofLabel,
          proofImageDataUrl: demoProofImageDataUrl,
          geolocationLabel: demoGeolocationLabel,
          peerConfirmers: demoPeerConfirmers,
          peerConfirmations: [],
        },
        sharedWith: demoSharedWith,
      }),
    });
  }

  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    return NextResponse.json({ ok: false, message: "Invalid task id." }, { status: 400 });
  }

  const task = await TaskModel.findOne({ _id: taskId, ownerEmail: identity.email }).catch(() => null);

  if (!task) {
    return NextResponse.json({ ok: false, message: "Goal not found." }, { status: 404 });
  }

  if (typeof body.title === "string") {
    const title = body.title.trim();

    if (title.length < 2 || title.length > 140) {
      return NextResponse.json({ ok: false, message: "Goal title must be between 2 and 140 characters." }, { status: 400 });
    }

    task.title = title;
  }

  if (typeof body.goalType === "string") {
    task.goalType = normalizeGoalType(body.goalType, normalizeGoalType(task.goalType));
  }

  let goalTasks = normalizeGoalTasks(task.goalTasks);

  if (body.addGoalTask) {
    const title = body.addGoalTask.title?.trim() ?? "";

    if (title.length < 2 || title.length > 120) {
      return NextResponse.json(
        { ok: false, message: "Goal task title must be between 2 and 120 characters." },
        { status: 400 },
      );
    }

    const taskGoalType = normalizeGoalType(task.goalType);
    const requiresProof =
      typeof body.addGoalTask.requiresProof === "boolean"
        ? body.addGoalTask.requiresProof
        : taskGoalType === "gym" || taskGoalType === "programming";

    goalTasks = [
      {
        id: buildGoalTaskId(),
        title,
        done: false,
        requiresProof,
        proofLabel: "",
        proofImageDataUrl: "",
        completedAt: "",
      },
      ...goalTasks,
    ];
  }

  if (body.updateGoalTask) {
    const goalTaskUpdateResult = applyGoalTaskUpdate(goalTasks, body.updateGoalTask);

    if (!goalTaskUpdateResult.ok) {
      return NextResponse.json({ ok: false, message: goalTaskUpdateResult.message }, { status: 400 });
    }

    goalTasks = goalTaskUpdateResult.goalTasks;
  }

  if (typeof body.removeGoalTaskId === "string") {
    const removeGoalTaskId = body.removeGoalTaskId.trim();

    if (!removeGoalTaskId) {
      return NextResponse.json({ ok: false, message: "Goal task id is required." }, { status: 400 });
    }

    const nextGoalTasks = goalTasks.filter((goalTask) => goalTask.id !== removeGoalTaskId);

    if (nextGoalTasks.length === goalTasks.length) {
      return NextResponse.json({ ok: false, message: "Goal task not found." }, { status: 404 });
    }

    goalTasks = nextGoalTasks;
  }

  task.set("goalTasks", goalTasks);

  const currentStatus = resolveTaskStatus(task.status, task.done);
  let nextStatus = currentStatus;

  if (typeof body.status === "string" || typeof body.done === "boolean") {
    const fallbackStatus = typeof body.done === "boolean" ? (body.done ? "completed" : "not_started") : currentStatus;
    nextStatus = normalizeTaskStatus(body.status, fallbackStatus);
  }

  nextStatus = alignStatusWithGoalTasks(nextStatus, goalTasks);

  const currentSharedWith = normalizeEmailList(task.sharedWith).filter((email) => email !== identity.email);
  const nextSharedWith =
    body.sharedWith !== undefined
      ? normalizeEmailList(body.sharedWith).filter((email) => email !== identity.email)
      : currentSharedWith;

  if (currentStatus !== "completed" && nextStatus === "completed" && nextSharedWith.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "Shared goals are completed by recipient approval.",
      },
      { status: 400 },
    );
  }

  if (nextStatus !== currentStatus) {
    task.status = nextStatus;
    task.done = nextStatus === "completed";
  }

  if (body.scheduledDays !== undefined) {
    task.scheduledDays = normalizeScheduledDays(body.scheduledDays);
  }

  const modeFallback = resolveVerificationModes(task.verification?.modes, task.verification?.mode);
  const hasExplicitVerificationMode = body.verificationMode !== undefined;
  const hasExplicitVerificationModes = body.verificationModes !== undefined;
  const hasExplicitPeerConfirmers = body.peerConfirmers !== undefined;
  const clearedSharing = body.sharedWith !== undefined && nextSharedWith.length === 0;
  let verificationModes = modeFallback;

  if (hasExplicitVerificationModes) {
    verificationModes = normalizeVerificationModes(body.verificationModes);
  } else if (hasExplicitVerificationMode) {
    const legacyMode = normalizeVerificationMode(body.verificationMode, verificationModes[0] ?? "none");
    verificationModes = legacyMode === "none" ? [] : [legacyMode];
  }

  if (nextSharedWith.length > 0) {
    verificationModes = mergeVerificationModes(verificationModes, ["peer"]);
  } else if (clearedSharing && !hasExplicitVerificationModes && !hasExplicitVerificationMode && !hasExplicitPeerConfirmers) {
    verificationModes = verificationModes.filter((mode) => mode !== "peer");
  }

  const existingProofLabelRaw = typeof task.verification?.proofLabel === "string" ? task.verification.proofLabel.trim() : "";
  const existingGeolocationLabelRaw =
    typeof task.verification?.geolocationLabel === "string" ? task.verification.geolocationLabel.trim() : "";
  const existingGeolocationLabel =
    existingGeolocationLabelRaw || (existingProofLabelRaw.startsWith("geo:") ? existingProofLabelRaw : "");
  const existingProofLabel =
    existingGeolocationLabel && existingProofLabelRaw === existingGeolocationLabel ? "" : existingProofLabelRaw;

  const rawProofLabel = body.verificationProofLabel;
  const nextProofLabelRaw =
    typeof rawProofLabel === "string" ? rawProofLabel.trim().slice(0, 160) : null;
  const rawGeolocationLabel = body.verificationGeoLabel;
  const nextGeolocationLabelRaw =
    typeof rawGeolocationLabel === "string" ? rawGeolocationLabel.trim().slice(0, 160) : null;
  const geolocationLabel =
    nextGeolocationLabelRaw !== null
      ? nextGeolocationLabelRaw
      : nextProofLabelRaw && nextProofLabelRaw.startsWith("geo:")
        ? nextProofLabelRaw
        : existingGeolocationLabel;
  const proofLabel =
    nextProofLabelRaw === null
      ? existingProofLabel
      : nextProofLabelRaw.startsWith("geo:")
        ? ""
        : nextProofLabelRaw;
  const rawProofImageDataUrl = body.verificationProofImageDataUrl;
  const proofImageDataUrl =
    typeof rawProofImageDataUrl === "string"
      ? rawProofImageDataUrl.trim().startsWith("data:image/")
        ? rawProofImageDataUrl.trim().slice(0, 2_500_000)
        : ""
      : typeof task.verification?.proofImageDataUrl === "string" &&
          task.verification.proofImageDataUrl.startsWith("data:image/")
        ? task.verification.proofImageDataUrl
        : "";

  let peerConfirmers = normalizeEmailList(task.verification?.peerConfirmers);
  let peerConfirmations = normalizePeerConfirmations(task.verification?.peerConfirmations);

  if (hasExplicitPeerConfirmers) {
    peerConfirmers = normalizeEmailList(body.peerConfirmers);
  }

  if (nextSharedWith.length > 0) {
    peerConfirmers = nextSharedWith;
  } else if (body.sharedWith !== undefined && !hasExplicitPeerConfirmers) {
    peerConfirmers = [];
  }

  if (!verificationModes.includes("peer")) {
    peerConfirmers = [];
    peerConfirmations = [];
  } else {
    peerConfirmations = peerConfirmations.filter((confirmation) => peerConfirmers.includes(confirmation.email));
  }

  if (nextSharedWith.length > 0 && peerConfirmations.length === 0 && resolveTaskStatus(task.status, task.done) === "completed") {
    task.status = "in_progress";
    task.done = false;
  }

  const verificationState = computeVerificationState({
    modes: verificationModes,
    photoProofImageDataUrl: proofImageDataUrl,
    geolocationLabel,
    peerConfirmers,
    peerConfirmations,
  });

  task.set("verification", {
    mode: verificationModes[0] ?? "none",
    modes: verificationModes,
    state: verificationState,
    proofLabel,
    proofImageDataUrl,
    geolocationLabel,
    peerConfirmers,
    peerConfirmations: peerConfirmations.map((confirmation) => ({
      email: confirmation.email,
      confirmedAt: new Date(confirmation.confirmedAt),
    })),
  });

  if (body.sharedWith !== undefined) {
    task.sharedWith = nextSharedWith;
  } else {
    task.sharedWith = currentSharedWith;
  }

  task.completionDates = collectCompletionDates(task.completionDates, goalTasks);

  if (task.status === "completed") {
    const completionDates = Array.isArray(task.completionDates) ? [...task.completionDates] : [];
    const today = toLocalDateKey();

    if (!completionDates.includes(today)) {
      completionDates.push(today);
      completionDates.sort((a, b) => a.localeCompare(b));
    }

    task.completionDates = completionDates;
  }

  const saveResult = await task.save().catch(() => null);

  if (!saveResult) {
    return NextResponse.json({ ok: false, message: "Could not update goal right now." }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    task: mapTask(task),
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  const identity = await getSessionIdentity();

  if (!identity) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  if (identity.role !== "user") {
    return NextResponse.json({ ok: false, message: "Dashboard goals are user-only." }, { status: 403 });
  }

  const { taskId } = await context.params;
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

    return NextResponse.json({ ok: true });
  }

  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    return NextResponse.json({ ok: false, message: "Invalid task id." }, { status: 400 });
  }

  await TaskModel.findOneAndDelete({ _id: taskId, ownerEmail: identity.email }).catch(() => null);
  return NextResponse.json({ ok: true });
}
