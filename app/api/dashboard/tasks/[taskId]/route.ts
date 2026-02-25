import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { DEMO_USER } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { getSessionIdentity } from "@/lib/session";
import {
  normalizeEmailList,
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
  } | null;
  sharedWith?: unknown;
}) {
  const status = resolveTaskStatus(task.status, task.done);
  const verificationMode = normalizeVerificationMode(task.verification?.mode);
  const verificationState = normalizeVerificationState(
    task.verification?.state,
    verificationMode === "none" ? "not_required" : "pending",
  );

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
      peerConfirmers: normalizeEmailList(task.verification?.peerConfirmers),
    },
    sharedWith: normalizeEmailList(task.sharedWith),
  };
}

export async function PATCH(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const identity = await getSessionIdentity();

  if (!identity) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
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
      task: mapTask({
        _id: taskId,
        title: body.title ?? "Updated task",
        status: normalizeTaskStatus(body.status, body.done ? "completed" : "not_started"),
        done: body.done ?? false,
        scheduledDays: normalizeScheduledDays(body.scheduledDays),
        completionDates: body.done ? [toLocalDateKey()] : [],
        verification: {
          mode: normalizeVerificationMode(body.verificationMode),
          state: normalizeVerificationState(body.verificationState),
          proofLabel: body.verificationProofLabel?.trim() ?? "",
          peerConfirmers: normalizeEmailList(body.peerConfirmers),
        },
        sharedWith: normalizeEmailList(body.sharedWith),
      }),
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
  const mode = body.verificationMode ? normalizeVerificationMode(body.verificationMode, modeFallback) : modeFallback;

  task.verification = {
    mode,
    state:
      mode === "none"
        ? "not_required"
        : normalizeVerificationState(
            body.verificationState ?? task.verification?.state,
            task.verification?.state === "not_required" ? "pending" : "pending",
          ),
    proofLabel: task.verification?.proofLabel?.trim() ?? "",
    peerConfirmers: normalizeEmailList(task.verification?.peerConfirmers),
  };

  if (typeof body.verificationProofLabel === "string") {
    const proofLabel = body.verificationProofLabel.trim().slice(0, 160);
    task.verification.proofLabel = proofLabel;

    if (proofLabel && task.verification.mode !== "none" && task.verification.state === "pending") {
      task.verification.state = "submitted";
    }
  }

  if (body.peerConfirmers !== undefined) {
    task.verification.peerConfirmers = normalizeEmailList(body.peerConfirmers);
  }

  if (body.sharedWith !== undefined) {
    task.sharedWith = normalizeEmailList(body.sharedWith);
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
