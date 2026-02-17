import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { DEMO_USER } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { getSessionIdentity } from "@/lib/session";

export async function PATCH(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const identity = await getSessionIdentity();

  if (!identity) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await context.params;
  const body = (await request.json()) as { done?: boolean; title?: string };

  const db = await connectToDatabase();

  if (!db) {
    if (identity.email !== DEMO_USER.email) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      task: {
        _id: taskId,
        title: body.title ?? "Updated task",
        done: body.done ?? false,
      },
    });
  }

  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    return NextResponse.json({ ok: false, message: "Invalid task id." }, { status: 400 });
  }

  const updatePayload: { done?: boolean; title?: string } = {};

  if (typeof body.done === "boolean") {
    updatePayload.done = body.done;
  }

  if (typeof body.title === "string" && body.title.trim().length >= 2) {
    updatePayload.title = body.title.trim();
  }

  const task = await TaskModel.findOneAndUpdate({ _id: taskId, ownerEmail: identity.email }, updatePayload, {
    new: true,
  });

  if (!task) {
    return NextResponse.json({ ok: false, message: "Task not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    task: {
      _id: task._id.toString(),
      title: task.title,
      done: task.done,
    },
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
