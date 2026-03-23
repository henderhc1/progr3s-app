import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { DEMO_USER } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { getUserModel } from "@/lib/models/User";
import { sendGoalSharedNotifications } from "@/lib/notifications";
import {
  applyMaintenanceResultToTask,
  collectCompletionDates,
  createGoalTaskId,
  normalizeTaskRecord,
  toStoredVerification,
} from "@/lib/taskRecord";
import { getSessionIdentity } from "@/lib/session";
import { validateShareRecipients } from "@/lib/sharing";
import { applyTaskMaintenance } from "@/lib/taskMaintenance";
import {
  computeVerificationState,
  GoalTaskItem,
  mergeVerificationModes,
  normalizeEmailList,
  normalizeGoalCadence,
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
  goalCadence?: string;
  addGoalTask?: AddGoalTaskPayload;
  updateGoalTask?: GoalTaskUpdatePayload;
  removeGoalTaskId?: string;
  verificationMode?: string;
  verificationModes?: unknown;
  verificationState?: string;
  verificationProofLabel?: string;
  verificationProofImageDataUrl?: string;
  verificationGeoLabel?: string;
  clearProofImages?: boolean;
  sharedWith?: unknown;
  peerConfirmers?: unknown;
};

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
    const demoGoalCadence = normalizeGoalCadence(body.goalCadence);
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
      task: normalizeTaskRecord({
        _id: taskId,
        title: body.title ?? "Updated goal",
        goalType: demoGoalType,
        goalCadence: demoGoalCadence,
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

  const maintenance = applyTaskMaintenance({
    status: task.status,
    done: task.done,
    scheduledDays: task.scheduledDays,
    goalCadence: task.goalCadence,
    completionDates: task.completionDates,
    goalTasks: task.goalTasks,
    verification: task.verification,
    sharedWith: task.sharedWith,
  });

  if (maintenance.changed) {
    applyMaintenanceResultToTask(task, maintenance);
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

  if (typeof body.goalCadence === "string") {
    task.goalCadence = normalizeGoalCadence(body.goalCadence, normalizeGoalCadence(task.goalCadence));
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
        id: createGoalTaskId(),
        title,
        done: false,
        requiresProof,
        proofLabel: "",
        proofImageDataUrl: "",
        completedAt: "",
        peerConfirmations: [],
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

  const shouldClearProofImages = body.clearProofImages === true;

  if (shouldClearProofImages) {
    goalTasks = goalTasks.map((goalTask) =>
      goalTask.proofImageDataUrl
        ? {
            ...goalTask,
            proofImageDataUrl: "",
          }
        : goalTask,
    );
  }

  task.set("goalTasks", goalTasks);

  const currentStatus = resolveTaskStatus(task.status, task.done);
  let nextStatus = currentStatus;

  if (typeof body.status === "string" || typeof body.done === "boolean") {
    const fallbackStatus = typeof body.done === "boolean" ? (body.done ? "completed" : "not_started") : currentStatus;
    nextStatus = normalizeTaskStatus(body.status, fallbackStatus);
  }

  const currentSharedWith = normalizeEmailList(task.sharedWith).filter((email) => email !== identity.email);
  let nextSharedWith =
    body.sharedWith !== undefined
      ? normalizeEmailList(body.sharedWith).filter((email) => email !== identity.email)
      : currentSharedWith;
  let shareRecipients: Array<{ email: string; name: string; username: string }> = [];
  let ownerNameForNotification = identity.name;

  if (body.sharedWith !== undefined) {
    const shareValidation = await validateShareRecipients({
      userModel: getUserModel(db),
      ownerEmail: identity.email,
      requestedSharedWith: nextSharedWith,
    });

    if (!shareValidation.ok) {
      return NextResponse.json({ ok: false, message: shareValidation.message }, { status: shareValidation.status });
    }

    nextSharedWith = shareValidation.sharedWith;
    shareRecipients = shareValidation.recipients;
    ownerNameForNotification = shareValidation.ownerName;
  }

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
    shouldClearProofImages
      ? ""
      : typeof rawProofImageDataUrl === "string"
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

  task.set(
    "verification",
    toStoredVerification({
      mode: verificationModes[0] ?? "none",
      modes: verificationModes,
      state: verificationState,
      proofLabel,
      proofImageDataUrl,
      geolocationLabel,
      peerConfirmers,
      peerConfirmations,
    }),
  );

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

  const newlySharedRecipients = shareRecipients.filter((recipient) => !currentSharedWith.includes(recipient.email));

  if (newlySharedRecipients.length > 0) {
    void sendGoalSharedNotifications({
      ownerName: ownerNameForNotification,
      ownerEmail: identity.email,
      goalTitle: task.title,
      recipients: newlySharedRecipients,
    });
  }

  return NextResponse.json({
    ok: true,
    task: normalizeTaskRecord(task),
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
