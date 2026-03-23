import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { TaskModel } from "@/lib/models/Task";
import { DEMO_ADMIN, DEMO_USER, normalizeEmail } from "@/lib/auth";
import { AdminRouteAccess } from "@/lib/session";
import { createUniqueUsername } from "@/lib/users";

const DEFAULT_RESET_PASSWORD = "defaultpass";

type CreateUserPayload = {
  name?: string;
  email?: string;
  role?: "user" | "admin";
  password?: string;
  isActive?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDuplicateKeyError(error: unknown): boolean {
  return isRecord(error) && error.code === 11000;
}

async function requireAdminAccess() {
  return AdminRouteAccess.create({
    databaseRequiredMessage: "Admin edits require MongoDB mode.",
  });
}

export async function GET() {
  const auth = await requireAdminAccess();

  if (!auth.ok) {
    if (auth.response.status !== 400) {
      return auth.response;
    }

    const createdAt = new Date().toISOString();
    return NextResponse.json({
      ok: true,
      users: [
        { id: "fallback-admin", email: DEMO_ADMIN.email, username: "demo_admin", name: DEMO_ADMIN.name, role: "admin", isActive: true, taskCount: 3, completedCount: 1, createdAt },
        { id: "fallback-user", email: DEMO_USER.email, username: "demo_user", name: DEMO_USER.name, role: "user", isActive: true, taskCount: 3, completedCount: 1, createdAt },
      ],
    });
  }

  const users = await auth.access.userModel.find().sort({ createdAt: -1 }).lean();

  const usersWithCounts = await Promise.all(
    users.map(async (user) => {
      const [taskCount, completedCount] = await Promise.all([
        TaskModel.countDocuments({ ownerEmail: user.email }),
        TaskModel.countDocuments({ ownerEmail: user.email, done: true }),
      ]);

      return {
        id: user._id.toString(),
        email: user.email,
        username: typeof user.username === "string" ? user.username : "",
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

export async function POST(request: Request) {
  const auth = await requireAdminAccess();

  if (!auth.ok) {
    return auth.response;
  }

  let body: CreateUserPayload;

  try {
    body = (await request.json()) as CreateUserPayload;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const email = normalizeEmail(body.email);
  const role = body.role === "admin" ? "admin" : "user";
  const passwordRaw = typeof body.password === "string" ? body.password.trim() : "";
  const password = passwordRaw || DEFAULT_RESET_PASSWORD;
  const isActive = typeof body.isActive === "boolean" ? body.isActive : true;

  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ ok: false, message: "Name must be between 2 and 80 characters." }, { status: 400 });
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, message: "Enter a valid email address." }, { status: 400 });
  }

  if (password.length < 8 || password.length > 72) {
    return NextResponse.json(
      { ok: false, message: "Password must be between 8 and 72 characters." },
      { status: 400 },
    );
  }

  const userModel = auth.access.userModel;
  const existingUser = await userModel.findOne({ email }).lean();

  if (existingUser) {
    return NextResponse.json({ ok: false, message: "A user with this email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const username = await createUniqueUsername(userModel, name || email.split("@")[0] || "user");
  let user;

  try {
    user = await userModel.create({
      name,
      email,
      username,
      passwordHash,
      role,
      isActive,
      connections: [],
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return NextResponse.json({ ok: false, message: "A user with this email already exists." }, { status: 409 });
    }

    return NextResponse.json({ ok: false, message: "Could not create user right now." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: `User ${user.email} created.`,
    temporaryPassword: password,
    user: {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    },
  });
}
