import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { applyMaintenanceResultToTask, normalizeSharedTaskRecord, toStoredVerification } from "@/lib/taskRecord";
import { getSessionIdentity } from "@/lib/session";
import { applyTaskMaintenance } from "@/lib/taskMaintenance";
import {
  computeVerificationState,
  mergeVerificationModes,
  normalizeEmailList,
  normalizeGoalTasks,
  normalizePeerConfirmations,
  resolveTaskStatus,
  resolveVerificationModes,
  toLocalDateKey,
} from "@/lib/tasks";

function resolveSharedGoalStatus(
  currentStatus: ReturnType<typeof resolveTaskStatus>,
  goalTasks: ReturnType<typeof normalizeGoalTasks>,
  verificationState: "not_required" | "pending" | "submitted" | "verified",
) {
  if (goalTasks.length === 0) {
    if (verificationState === "verified") {
      return "completed" as const;
    }

    return currentStatus === "completed" ? "in_progress" as const : currentStatus;
  }

  const completedGoalTaskCount = goalTasks.filter((goalTask) => goalTask.done).length;

  if (completedGoalTaskCount === 0) {
    return "not_started" as const;
  }

  if (completedGoalTaskCount === goalTasks.length) {
    return verificationState === "verified" ? "completed" as const : "in_progress" as const;
  }

  return "in_progress" as const;
}

async function resolveSharedTask(taskId: string, identityEmail: string) {
  return TaskModel.findOne({
    _id: taskId,
    ownerEmail: { $ne: identityEmail },
    sharedWith: identityEmail,
  });
}

export async function POST(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  const identity = await getSessionIdentity();

  if (!identity) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  if (identity.role !== "user") {
    return NextResponse.json({ ok: false, message: "Dashboard goals are user-only." }, { status: 403 });
  }

  const { taskId } = await context.params;

  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    return NextResponse.json({ ok: false, message: "Invalid task id." }, { status: 400 });
  }

  let db = null;

  try {
    db = await connectToDatabase();
  } catch {
    return NextResponse.json({ ok: false, message: "Could not connect to database right now." }, { status: 503 });
  }

  if (!db) {
    return NextResponse.json({ ok: false, message: "Share approvals require MongoDB mode." }, { status: 503 });
  }

  const task = await resolveSharedTask(taskId, identity.email).catch(() => null);

  if (!task) {
    return NextResponse.json({ ok: false, message: "Shared goal not found." }, { status: 404 });
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

  const sharedWith = normalizeEmailList(task.sharedWith).filter((email) => email !== task.ownerEmail);
  const peerConfirmations = normalizePeerConfirmations(task.verification?.peerConfirmations).filter((confirmation) =>
    sharedWith.includes(confirmation.email),
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
    ["peer"],
  );

  if (!peerConfirmations.some((confirmation) => confirmation.email === identity.email)) {
    peerConfirmations.push({
      email: identity.email,
      confirmedAt: new Date().toISOString(),
    });
  }

  const verificationState = computeVerificationState({
    modes: verificationModes,
    photoProofImageDataUrl: proofImageDataUrl,
    geolocationLabel,
    peerConfirmers: sharedWith,
    peerConfirmations,
  });
  const shouldPurgeProofImages = verificationState === "verified";
  const nextProofImageDataUrl = shouldPurgeProofImages ? "" : proofImageDataUrl;
  const nextGoalTasks = shouldPurgeProofImages
    ? normalizeGoalTasks(task.goalTasks).map((goalTask) =>
        goalTask.proofImageDataUrl
          ? {
              ...goalTask,
              proofImageDataUrl: "",
            }
          : goalTask,
      )
    : normalizeGoalTasks(task.goalTasks);

  task.set(
    "verification",
    toStoredVerification({
      mode: verificationModes[0] ?? "none",
      modes: verificationModes,
      state: verificationState,
      proofLabel,
      proofImageDataUrl: nextProofImageDataUrl,
      geolocationLabel,
      peerConfirmers: sharedWith,
      peerConfirmations,
    }),
  );
  task.set("goalTasks", nextGoalTasks);

  const currentStatus = resolveTaskStatus(task.status, task.done);
  const goalTasks = normalizeGoalTasks(task.goalTasks);
  const nextStatus = resolveSharedGoalStatus(currentStatus, goalTasks, verificationState);
  task.status = nextStatus;
  task.done = nextStatus === "completed";

  const today = toLocalDateKey();
  const completionDates = Array.isArray(task.completionDates)
    ? task.completionDates.filter((dateKey): dateKey is string => typeof dateKey === "string" && dateKey !== today)
    : [];

  if (nextStatus === "completed") {
    completionDates.push(today);
  }

  task.completionDates = Array.from(new Set(completionDates)).sort((a, b) => a.localeCompare(b));

  const saveResult = await task.save().catch(() => null);

  if (!saveResult) {
    return NextResponse.json({ ok: false, message: "Could not update shared goal right now." }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    task: normalizeSharedTaskRecord(task, identity.email),
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

  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    return NextResponse.json({ ok: false, message: "Invalid task id." }, { status: 400 });
  }

  let db = null;

  try {
    db = await connectToDatabase();
  } catch {
    return NextResponse.json({ ok: false, message: "Could not connect to database right now." }, { status: 503 });
  }

  if (!db) {
    return NextResponse.json({ ok: false, message: "Share approvals require MongoDB mode." }, { status: 503 });
  }

  const task = await resolveSharedTask(taskId, identity.email).catch(() => null);

  if (!task) {
    return NextResponse.json({ ok: false, message: "Shared goal not found." }, { status: 404 });
  }

  const sharedWith = normalizeEmailList(task.sharedWith).filter((email) => email !== task.ownerEmail);
  const peerConfirmations = normalizePeerConfirmations(task.verification?.peerConfirmations)
    .filter((confirmation) => sharedWith.includes(confirmation.email))
    .filter((confirmation) => confirmation.email !== identity.email);
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
    ["peer"],
  );
  const verificationState = computeVerificationState({
    modes: verificationModes,
    photoProofImageDataUrl: proofImageDataUrl,
    geolocationLabel,
    peerConfirmers: sharedWith,
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
      peerConfirmers: sharedWith,
      peerConfirmations,
    }),
  );

  const currentStatus = resolveTaskStatus(task.status, task.done);
  const goalTasks = normalizeGoalTasks(task.goalTasks);
  const nextStatus = resolveSharedGoalStatus(currentStatus, goalTasks, verificationState);
  task.status = nextStatus;
  task.done = nextStatus === "completed";

  const today = toLocalDateKey();
  const completionDates = Array.isArray(task.completionDates)
    ? task.completionDates.filter((dateKey): dateKey is string => typeof dateKey === "string" && dateKey !== today)
    : [];

  if (nextStatus === "completed") {
    completionDates.push(today);
  }

  task.completionDates = Array.from(new Set(completionDates)).sort((a, b) => a.localeCompare(b));

  const saveResult = await task.save().catch(() => null);

  if (!saveResult) {
    return NextResponse.json({ ok: false, message: "Could not update shared goal right now." }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    task: normalizeSharedTaskRecord(task, identity.email),
  });
}
