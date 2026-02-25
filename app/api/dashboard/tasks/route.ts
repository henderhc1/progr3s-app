import { NextResponse } from "next/server";
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
  VerificationMode,
  VerificationState,
} from "@/lib/tasks";

const demoTasks = [
  {
    _id: "demo-1",
    title: "Review roadmap for next sprint",
    status: "not_started",
    done: false,
    scheduledDays: [1, 3, 5],
    completionDates: [],
    verification: { mode: "none", state: "not_required", proofLabel: "", peerConfirmers: [] },
    sharedWith: [],
  },
  {
    _id: "demo-2",
    title: "Ship one frontend polish PR",
    status: "completed",
    done: true,
    scheduledDays: [2, 4],
    completionDates: [toLocalDateKey()],
    verification: { mode: "photo", state: "submitted", proofLabel: "demo-proof.jpg", peerConfirmers: [] },
    sharedWith: ["teammate@progr3s.dev"],
  },
  {
    _id: "demo-3",
    title: "Write API notes for auth flow",
    status: "in_progress",
    done: false,
    scheduledDays: [1, 2, 3],
    completionDates: [],
    verification: { mode: "peer", state: "pending", proofLabel: "", peerConfirmers: ["admin@progr3s.dev"] },
    sharedWith: [],
  },
];

type CreateTaskPayload = {
  title?: string;
  status?: string;
  done?: boolean;
  scheduledDays?: unknown;
  verificationMode?: string;
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

function getVerificationStateForMode(mode: VerificationMode, peerConfirmers: string[]): VerificationState {
  if (mode === "none") {
    return "not_required";
  }

  if (mode === "peer") {
    return computePeerVerificationState(peerConfirmers, []);
  }

  return "pending";
}

export async function GET() {
  const identity = await getSessionIdentity();

  if (!identity) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  if (identity.role !== "user") {
    return NextResponse.json({ ok: false, message: "Dashboard goals are user-only." }, { status: 403 });
  }

  const db = await connectToDatabase();

  if (!db) {
    if (identity.email !== DEMO_USER.email) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ ok: true, tasks: demoTasks.map(mapTask) });
  }

  const tasks = await TaskModel.find({ ownerEmail: identity.email }).sort({ createdAt: -1 }).lean();

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

  const body = (await request.json()) as CreateTaskPayload;
  const title = body.title?.trim() ?? "";

  if (title.length < 2) {
    return NextResponse.json({ ok: false, message: "Task title must be at least 2 characters." }, { status: 400 });
  }

  if (title.length > 140) {
    return NextResponse.json({ ok: false, message: "Task title must be 140 characters or fewer." }, { status: 400 });
  }

  const fallbackStatus = typeof body.done === "boolean" ? (body.done ? "completed" : "not_started") : "not_started";
  let status = normalizeTaskStatus(body.status, fallbackStatus);
  const scheduledDays = normalizeScheduledDays(body.scheduledDays);
  const sharedWith = normalizeEmailList(body.sharedWith).filter((email) => email !== identity.email);
  const verificationMode = sharedWith.length > 0 ? "peer" : normalizeVerificationMode(body.verificationMode);
  const peerConfirmers = normalizeEmailList(body.peerConfirmers);
  const effectivePeerConfirmers = sharedWith.length > 0 ? sharedWith : verificationMode === "peer" ? peerConfirmers : [];
  const verificationState =
    sharedWith.length > 0 ? "pending" : getVerificationStateForMode(verificationMode, effectivePeerConfirmers);

  if (sharedWith.length > 0 && status === "completed") {
    status = "not_started";
  }

  const completionDates = status === "completed" ? [toLocalDateKey()] : [];

  const db = await connectToDatabase();

  if (!db) {
    if (identity.email !== DEMO_USER.email) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      task: mapTask({
        _id: `demo-${Date.now()}`,
        title,
        status,
        done: status === "completed",
        scheduledDays,
        completionDates,
        verification: {
          mode: verificationMode,
          state: verificationState,
          proofLabel: "",
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
    status,
    done: status === "completed",
    scheduledDays,
    completionDates,
    verification: {
      mode: verificationMode,
      state: verificationState,
      proofLabel: "",
      peerConfirmers: effectivePeerConfirmers,
      peerConfirmations: [],
    },
    sharedWith,
  });

  return NextResponse.json({
    ok: true,
    task: mapTask(task),
  });
}
