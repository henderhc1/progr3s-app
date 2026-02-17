import { NextResponse } from "next/server";
import { DEMO_USER } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { getSessionIdentity } from "@/lib/session";

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

  const db = await connectToDatabase();

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
    completedToday = await TaskModel.countDocuments({ ownerEmail: identity.email, done: true });
    pendingToday = await TaskModel.countDocuments({ ownerEmail: identity.email, done: false });
    streakDays = Math.max(1, Math.min(30, completedToday));
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
