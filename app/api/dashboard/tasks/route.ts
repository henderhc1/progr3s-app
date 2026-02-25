import { NextResponse } from "next/server";
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

function getVerificationStateForMode(mode: VerificationMode): VerificationState {
  return mode === "none" ? "not_required" : "pending";
}

export async function GET() {
  const identity = await getSessionIdentity();

  if (!identity) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
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

  const body = (await request.json()) as CreateTaskPayload;
  const title = body.title?.trim() ?? "";

  if (title.length < 2) {
    return NextResponse.json({ ok: false, message: "Task title must be at least 2 characters." }, { status: 400 });
  }

  if (title.length > 140) {
    return NextResponse.json({ ok: false, message: "Task title must be 140 characters or fewer." }, { status: 400 });
  }

  const fallbackStatus = typeof body.done === "boolean" ? (body.done ? "completed" : "not_started") : "not_started";
  const status = normalizeTaskStatus(body.status, fallbackStatus);
  const scheduledDays = normalizeScheduledDays(body.scheduledDays);
  const verificationMode = normalizeVerificationMode(body.verificationMode);
  const verificationState = getVerificationStateForMode(verificationMode);
  const sharedWith = normalizeEmailList(body.sharedWith);
  const peerConfirmers = normalizeEmailList(body.peerConfirmers);
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
          peerConfirmers,
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
      peerConfirmers,
    },
    sharedWith,
  });

  return NextResponse.json({
    ok: true,
    task: mapTask(task),
  });
}
