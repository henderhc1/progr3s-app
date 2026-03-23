import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { normalizePeerRequestRecord } from "@/lib/taskRecord";
import { getSessionIdentity } from "@/lib/session";
import { applyTaskMaintenance } from "@/lib/taskMaintenance";

export async function GET() {
  const identity = await getSessionIdentity();

  if (!identity) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  if (identity.role !== "user") {
    return NextResponse.json({ ok: false, message: "Dashboard goals are user-only." }, { status: 403 });
  }

  let db = null;

  try {
    db = await connectToDatabase();
  } catch {
    return NextResponse.json({ ok: false, message: "Could not connect to database right now." }, { status: 503 });
  }

  if (!db) {
    return NextResponse.json({ ok: true, requests: [] });
  }

  const requests = await TaskModel.find(
    {
      ownerEmail: { $ne: identity.email },
      sharedWith: identity.email,
    },
    {
      ownerEmail: 1,
      title: 1,
      status: 1,
      done: 1,
      sharedWith: 1,
      goalTasks: 1,
      scheduledDays: 1,
      goalCadence: 1,
      completionDates: 1,
      verification: 1,
      updatedAt: 1,
    },
  )
    .sort({ updatedAt: -1 })
    .lean()
    .catch(() => null);

  if (!requests) {
    return NextResponse.json({ ok: false, message: "Could not load shared goals right now." }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    requests: requests.map((task) => {
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

      return normalizePeerRequestRecord(
        maintenance.changed
          ? {
              ...task,
              status: maintenance.status,
              done: maintenance.done,
              goalTasks: maintenance.goalTasks,
              completionDates: maintenance.completionDates,
              verification: maintenance.verification,
            }
          : task,
        identity.email,
      );
    }),
  });
}
