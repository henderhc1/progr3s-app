import { NextResponse } from "next/server";
import { DEMO_USER } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { getSessionIdentity } from "@/lib/session";

const demoTasks = [
  { _id: "demo-1", title: "Review roadmap for next sprint", done: false },
  { _id: "demo-2", title: "Ship one frontend polish PR", done: true },
  { _id: "demo-3", title: "Write API notes for auth flow", done: false },
];

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

    return NextResponse.json({ ok: true, tasks: demoTasks });
  }

  const tasks = await TaskModel.find({ ownerEmail: identity.email }).sort({ createdAt: -1 }).lean();

  return NextResponse.json({
    ok: true,
    tasks: tasks.map((task) => ({
      _id: task._id.toString(),
      title: task.title,
      done: task.done,
    })),
  });
}

export async function POST(request: Request) {
  const identity = await getSessionIdentity();

  if (!identity) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { title?: string };
  const title = body.title?.trim() ?? "";

  if (title.length < 2) {
    return NextResponse.json({ ok: false, message: "Task title must be at least 2 characters." }, { status: 400 });
  }

  const db = await connectToDatabase();

  if (!db) {
    if (identity.email !== DEMO_USER.email) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      task: {
        _id: `demo-${Date.now()}`,
        title,
        done: false,
      },
    });
  }

  const task = await TaskModel.create({
    ownerEmail: identity.email,
    title,
    done: false,
  });

  return NextResponse.json({
    ok: true,
    task: {
      _id: task._id.toString(),
      title: task.title,
      done: task.done,
    },
  });
}
