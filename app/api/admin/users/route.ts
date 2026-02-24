import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { UserModel } from "@/lib/models/User";
import { DEMO_ADMIN, DEMO_USER } from "@/lib/auth";
import { getSessionIdentity } from "@/lib/session";

export async function GET() {
  const identity = await getSessionIdentity();

  if (!identity || identity.role !== "admin") {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  const db = await connectToDatabase();

  if (!db) {
    return NextResponse.json({
      ok: true,
      users: [
        {
          id: "fallback-admin",
          email: DEMO_ADMIN.email,
          name: DEMO_ADMIN.name,
          role: "admin",
          isActive: true,
          taskCount: 3,
          completedCount: 1,
          createdAt: new Date().toISOString(),
        },
        {
          id: "fallback-user",
          email: DEMO_USER.email,
          name: DEMO_USER.name,
          role: "user",
          isActive: true,
          taskCount: 3,
          completedCount: 1,
          createdAt: new Date().toISOString(),
        },
      ],
    });
  }

  const users = await UserModel.find().sort({ createdAt: -1 }).lean();

  const usersWithCounts = await Promise.all(
    users.map(async (user) => {
      const [taskCount, completedCount] = await Promise.all([
        TaskModel.countDocuments({ ownerEmail: user.email }),
        TaskModel.countDocuments({ ownerEmail: user.email, done: true }),
      ]);

      return {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        taskCount,
        completedCount,
        createdAt: user.createdAt?.toISOString?.() ?? new Date().toISOString(),
      };
    }),
  );

  return NextResponse.json({ ok: true, users: usersWithCounts });
}
