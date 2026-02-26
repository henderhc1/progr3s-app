import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { getUserModel } from "@/lib/models/User";
import { DEMO_ADMIN, DEMO_USER, normalizeEmail } from "@/lib/auth";
import { getSessionIdentity } from "@/lib/session";

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

export async function GET() {
  const identity = await getSessionIdentity();

  if (!identity || identity.role !== "admin") {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  let db = null;

  try {
    db = await connectToDatabase();
  } catch {
    return NextResponse.json({ ok: false, message: "Could not connect to database right now." }, { status: 503 });
  }

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

  const userModel = getUserModel(db);
  const users = await userModel.find().sort({ createdAt: -1 }).lean();

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

export async function POST(request: Request) {
  const identity = await getSessionIdentity();

  if (!identity || identity.role !== "admin") {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  let db = null;

  try {
    db = await connectToDatabase();
  } catch {
    return NextResponse.json({ ok: false, message: "Could not connect to database right now." }, { status: 503 });
  }

  if (!db) {
    return NextResponse.json({ ok: false, message: "Admin edits require MongoDB mode." }, { status: 400 });
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

  const userModel = getUserModel(db);
  const existingUser = await userModel.findOne({ email }).lean();

  if (existingUser) {
    return NextResponse.json({ ok: false, message: "A user with this email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let user;

  try {
    user = await userModel.create({
      name,
      email,
      passwordHash,
      role,
      isActive,
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
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    },
  });
}
