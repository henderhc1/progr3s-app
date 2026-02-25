import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { DEMO_USER } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { getSessionIdentity } from "@/lib/session";
import {
  computePeerVerificationState,
  normalizeEmailList,
  normalizePeerConfirmations,
  normalizeScheduledDays,
  normalizeTaskStatus,
  normalizeVerificationMode,
  normalizeVerificationState,
  resolveTaskStatus,
  toLocalDateKey,
} from "@/lib/tasks";

type UpdateTaskPayload = {
  done?: boolean;
  title?: string;
  status?: string;
  scheduledDays?: unknown;
  verificationMode?: string;
  verificationState?: string;
  verificationProofLabel?: string;
  sharedWith?: unknown;
  peerConfirmers?: unknown;
};

function mapTask(task: {
  _id: string | { toString(): string };
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
}) {
  const status = resolveTaskStatus(task.status, task.done);
  const sharedWith = normalizeEmailList(task.sharedWith);
  const verificationMode = sharedWith.length > 0 ? "peer" : normalizeVerificationMode(task.verification?.mode);
  const peerConfirmers = sharedWith.length > 0 ? sharedWith : normalizeEmailList(task.verification?.peerConfirmers);
  const peerConfirmations = normalizePeerConfirmations(task.verification?.peerConfirmations).filter((confirmation) =>
    peerConfirmers.includes(confirmation.email),
  );
  const verificationState =
    verificationMode === "none"
      ? "not_required"
      : verificationMode === "peer"
        ? sharedWith.length > 0
          ? peerConfirmations.length > 0
            ? "verified"
            : "pending"
          : computePeerVerificationState(peerConfirmers, peerConfirmations)
        : normalizeVerificationState(task.verification?.state, "pending");

  return {
    _id: typeof task._id === "string" ? task._id : task._id.toString(),
    title: task.title ?? "Untitled goal",
    status,
    done: status === "completed",
    scheduledDays: normalizeScheduledDays(task.scheduledDays),
    completionDates: Array.isArray(task.completionDates)
      ? task.completionDates.filter((value): value is string => typeof value === "string")
      : [],
    verification: {
      mode: verificationMode,
      state: verificationMode === "none" ? "not_required" : verificationState,
      proofLabel: typeof task.verification?.proofLabel === "string" ? task.verification.proofLabel.trim() : "",
      peerConfirmers,
      peerConfirmations,
    },
    sharedWith,
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
  const body = (await request.json()) as UpdateTaskPayload;

  const db = await connectToDatabase();

  if (!db) {
    if (identity.email !== DEMO_USER.email) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      task: mapTask((() => {
        const sharedWith = normalizeEmailList(body.sharedWith).filter((email) => email !== identity.email);
        const mode = sharedWith.length > 0 ? "peer" : normalizeVerificationMode(body.verificationMode);
        const peerConfirmers = sharedWith.length > 0 ? sharedWith : mode === "peer" ? normalizeEmailList(body.peerConfirmers) : [];
        const rawStatus = normalizeTaskStatus(body.status, body.done ? "completed" : "not_started");
        const status = sharedWith.length > 0 && rawStatus === "completed" ? "not_started" : rawStatus;

        return {
        _id: taskId,
        title: body.title ?? "Updated task",
        status,
        done: status === "completed",
        scheduledDays: normalizeScheduledDays(body.scheduledDays),
        completionDates: status === "completed" ? [toLocalDateKey()] : [],
        verification: {
            mode,
            state:
              mode === "none"
                ? "not_required"
                : mode === "peer"
                  ? sharedWith.length > 0
                    ? "pending"
                    : computePeerVerificationState(peerConfirmers, [])
                  : normalizeVerificationState(body.verificationState, "pending"),
          proofLabel: body.verificationProofLabel?.trim() ?? "",
            peerConfirmers,
            peerConfirmations: [],
        },
        sharedWith,
        };
      })()),
    });
  }

  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    return NextResponse.json({ ok: false, message: "Invalid task id." }, { status: 400 });
  }

  const task = await TaskModel.findOne({ _id: taskId, ownerEmail: identity.email });

  if (!task) {
    return NextResponse.json({ ok: false, message: "Task not found." }, { status: 404 });
  }

  if (typeof body.title === "string") {
    const title = body.title.trim();

    if (title.length < 2 || title.length > 140) {
      return NextResponse.json(
        { ok: false, message: "Task title must be between 2 and 140 characters." },
        { status: 400 },
      );
    }

    task.title = title;
  }

  const currentStatus = resolveTaskStatus(task.status, task.done);
  let nextStatus = currentStatus;

  if (typeof body.status === "string" || typeof body.done === "boolean") {
    const fallbackStatus = typeof body.done === "boolean" ? (body.done ? "completed" : "not_started") : currentStatus;
    nextStatus = normalizeTaskStatus(body.status, fallbackStatus);
  }

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

    if (nextStatus === "completed") {
      const completionDates = Array.isArray(task.completionDates) ? [...task.completionDates] : [];
      const today = toLocalDateKey();

      if (!completionDates.includes(today)) {
        completionDates.push(today);
      }

      task.completionDates = completionDates;
    }
  }

  if (body.scheduledDays !== undefined) {
    task.scheduledDays = normalizeScheduledDays(body.scheduledDays);
  }

  const modeFallback = normalizeVerificationMode(task.verification?.mode);
  const mode =
    nextSharedWith.length > 0
      ? "peer"
      : body.verificationMode
        ? normalizeVerificationMode(body.verificationMode, modeFallback)
        : modeFallback;
  const rawProofLabel = body.verificationProofLabel;
  const proofLabel = typeof rawProofLabel === "string"
    ? rawProofLabel.trim().slice(0, 160)
    : task.verification?.proofLabel?.trim() ?? "";

  let peerConfirmers = normalizeEmailList(task.verification?.peerConfirmers);
  let peerConfirmations = normalizePeerConfirmations(task.verification?.peerConfirmations);

  if (body.peerConfirmers !== undefined) {
    peerConfirmers = normalizeEmailList(body.peerConfirmers);
  }

  if (nextSharedWith.length > 0) {
    peerConfirmers = nextSharedWith;
  }

  if (mode !== "peer") {
    peerConfirmers = [];
    peerConfirmations = [];
  } else {
    peerConfirmations = peerConfirmations.filter((confirmation) => peerConfirmers.includes(confirmation.email));
  }

  if (nextSharedWith.length > 0 && peerConfirmations.length === 0 && resolveTaskStatus(task.status, task.done) === "completed") {
    task.status = "in_progress";
    task.done = false;
  }

  const verificationState =
    mode === "none"
      ? "not_required"
      : mode === "peer"
        ? nextSharedWith.length > 0
          ? peerConfirmations.length > 0
            ? "verified"
            : "pending"
          : computePeerVerificationState(peerConfirmers, peerConfirmations)
        : (() => {
            const fallbackState = proofLabel ? "submitted" : "pending";
            const normalizedState = normalizeVerificationState(body.verificationState ?? task.verification?.state, fallbackState);

            if (!proofLabel && normalizedState === "submitted") {
              return "pending";
            }

            return normalizedState;
          })();

  task.set("verification", {
    mode,
    state: verificationState,
    proofLabel,
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

  await task.save();

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
  const db = await connectToDatabase();

  if (!db) {
    if (identity.email !== DEMO_USER.email) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  }

  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    return NextResponse.json({ ok: false, message: "Invalid task id." }, { status: 400 });
  }

  await TaskModel.findOneAndDelete({ _id: taskId, ownerEmail: identity.email });
  return NextResponse.json({ ok: true });
}
