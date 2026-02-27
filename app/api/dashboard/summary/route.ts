import { NextResponse } from "next/server";
import { DEMO_USER } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { getSessionIdentity } from "@/lib/session";
import { applyTaskMaintenance } from "@/lib/taskMaintenance";
import { computeStreakDays, resolveTaskStatus, toLocalDateKey } from "@/lib/tasks";

function getTodayLabel(): string {
  // Human-friendly date label for dashboard cards.
  return new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function computeFocusScore(): number {
  // Keep demo data dynamic by varying score with current weekday.
  const weekday = new Date().getDay();
  return 74 + weekday * 3;
}

export async function GET() {
  const identity = await getSessionIdentity();

  if (!identity) {
    return NextResponse.json(
      {
        ok: false,
        message: "Unauthorized",
      },
      { status: 401 },
    );
  }

  if (identity.role !== "user") {
    return NextResponse.json(
      {
        ok: false,
        message: "Dashboard goals are user-only.",
      },
      { status: 403 },
    );
  }

  let db = null;

  try {
    db = await connectToDatabase();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Could not connect to database right now.",
      },
      { status: 503 },
    );
  }

  if (!db && identity.email !== DEMO_USER.email) {
    return NextResponse.json(
      {
        ok: false,
        message: "Unauthorized",
      },
      { status: 401 },
    );
  }

  let completedToday = 3;
  let pendingToday = 2;
  let streakDays = 5;

  if (db) {
    const tasks = await TaskModel.find(
      { ownerEmail: identity.email },
      { status: 1, done: 1, scheduledDays: 1, goalCadence: 1, completionDates: 1 },
    )
      .lean()
      .catch(() => null);

    if (!tasks) {
      return NextResponse.json(
        {
          ok: false,
          message: "Could not load summary data right now.",
        },
        { status: 503 },
      );
    }

    const today = toLocalDateKey();
    const completionDateSet = new Set<string>();

    completedToday = 0;
    pendingToday = 0;

    for (const task of tasks) {
      const maintenance = applyTaskMaintenance({
        status: task.status,
        done: task.done,
        scheduledDays: task.scheduledDays,
        goalCadence: task.goalCadence,
        completionDates: task.completionDates,
      });
      const status = resolveTaskStatus(maintenance.status, maintenance.done);
      const completionDates = maintenance.completionDates;

      if (status !== "completed") {
        pendingToday += 1;
      }

      if (completionDates.includes(today)) {
        completedToday += 1;
      }

      for (const dateKey of completionDates) {
        completionDateSet.add(dateKey);
      }
    }

    streakDays = computeStreakDays(completionDateSet);
  }

  return NextResponse.json({
    ok: true,
    summary: {
      dateLabel: getTodayLabel(),
      focusScore: computeFocusScore(),
      streakDays,
      completedToday,
      pendingToday,
    },
  });
}
