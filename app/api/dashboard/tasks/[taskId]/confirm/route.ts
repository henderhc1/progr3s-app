import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { getSessionIdentity } from "@/lib/session";
import { normalizeEmailList, normalizePeerConfirmations, resolveTaskStatus, toLocalDateKey } from "@/lib/tasks";

function mapConfirmationTask(
  task: {
    _id: string | { toString(): string };
    ownerEmail?: string;
    title?: string;
    status?: string;
    done?: boolean;
    sharedWith?: unknown;
    verification?: {
      mode?: string;
      state?: string;
      peerConfirmers?: unknown;
      peerConfirmations?: unknown;
    } | null;
  },
  identityEmail: string,
) {
  const sharedWith = normalizeEmailList(task.sharedWith).filter((email) => email !== task.ownerEmail);
  const peerConfirmations = normalizePeerConfirmations(task.verification?.peerConfirmations).filter((confirmation) =>
    sharedWith.includes(confirmation.email),
  );

  return {
    _id: typeof task._id === "string" ? task._id : task._id.toString(),
    ownerEmail: task.ownerEmail ?? "",
    title: task.title ?? "Untitled goal",
    status: resolveTaskStatus(task.status, task.done),
    sharedWith,
    verification: {
      mode: "peer",
      state: peerConfirmations.length > 0 ? "verified" : "pending",
      peerConfirmers: sharedWith,
      peerConfirmations,
    },
    confirmedByCurrentUser: peerConfirmations.some((confirmation) => confirmation.email === identityEmail),
  };
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

  const db = await connectToDatabase();

  if (!db) {
    return NextResponse.json({ ok: false, message: "Share approvals require MongoDB mode." }, { status: 503 });
  }

  const task = await resolveSharedTask(taskId, identity.email);

  if (!task) {
    return NextResponse.json({ ok: false, message: "Shared goal not found." }, { status: 404 });
  }

  const sharedWith = normalizeEmailList(task.sharedWith).filter((email) => email !== task.ownerEmail);
  const peerConfirmations = normalizePeerConfirmations(task.verification?.peerConfirmations).filter((confirmation) =>
    sharedWith.includes(confirmation.email),
  );

  if (!peerConfirmations.some((confirmation) => confirmation.email === identity.email)) {
    peerConfirmations.push({
      email: identity.email,
      confirmedAt: new Date().toISOString(),
    });
  }

  const hasApproval = peerConfirmations.length > 0;

  task.set("verification", {
    mode: "peer",
    state: hasApproval ? "verified" : "pending",
    proofLabel: task.verification?.proofLabel?.trim() ?? "",
    peerConfirmers: sharedWith,
    peerConfirmations: peerConfirmations.map((confirmation) => ({
      email: confirmation.email,
      confirmedAt: new Date(confirmation.confirmedAt),
    })),
  });

  if (hasApproval) {
    task.status = "completed";
    task.done = true;

    const completionDates = Array.isArray(task.completionDates) ? [...task.completionDates] : [];
    const today = toLocalDateKey();

    if (!completionDates.includes(today)) {
      completionDates.push(today);
    }

    task.completionDates = completionDates;
  }

  await task.save();

  return NextResponse.json({
    ok: true,
    task: mapConfirmationTask(task, identity.email),
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

  const db = await connectToDatabase();

  if (!db) {
    return NextResponse.json({ ok: false, message: "Share approvals require MongoDB mode." }, { status: 503 });
  }

  const task = await resolveSharedTask(taskId, identity.email);

  if (!task) {
    return NextResponse.json({ ok: false, message: "Shared goal not found." }, { status: 404 });
  }

  const sharedWith = normalizeEmailList(task.sharedWith).filter((email) => email !== task.ownerEmail);
  const peerConfirmations = normalizePeerConfirmations(task.verification?.peerConfirmations)
    .filter((confirmation) => sharedWith.includes(confirmation.email))
    .filter((confirmation) => confirmation.email !== identity.email);

  task.set("verification", {
    mode: "peer",
    state: peerConfirmations.length > 0 ? "verified" : "pending",
    proofLabel: task.verification?.proofLabel?.trim() ?? "",
    peerConfirmers: sharedWith,
    peerConfirmations: peerConfirmations.map((confirmation) => ({
      email: confirmation.email,
      confirmedAt: new Date(confirmation.confirmedAt),
    })),
  });

  await task.save();

  return NextResponse.json({
    ok: true,
    task: mapConfirmationTask(task, identity.email),
  });
}
