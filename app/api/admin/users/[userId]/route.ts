import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { getUserModel } from "@/lib/models/User";
import { getSessionIdentity } from "@/lib/session";

const DEFAULT_RESET_PASSWORD = "defaultpass";

type UpdatePayload = {
  name?: string;
  role?: "user" | "admin";
  isActive?: boolean;
  resetPassword?: boolean;
  nextPassword?: string;
};

type UserUpdateData = {
  name?: string;
  role?: "user" | "admin";
  isActive?: boolean;
  passwordHash?: string;
};

async function requireAdminAndDb() {
  const identity = await getSessionIdentity();

  if (!identity || identity.role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 }),
    };
  }

  let db = null;

  try {
    db = await connectToDatabase();
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: "Could not connect to database right now." }, { status: 503 }),
    };
  }

  if (!db) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: "Admin edits require MongoDB mode." }, { status: 400 }),
    };
  }

  return { ok: true as const, identity, db };
}

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdminAndDb();

  if (!auth.ok) {
    return auth.response;
  }

  const { userId } = await context.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return NextResponse.json({ ok: false, message: "Invalid user id." }, { status: 400 });
  }

  let body: UpdatePayload;

  try {
    body = (await request.json()) as UpdatePayload;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const userModel = getUserModel(auth.db);
  const targetUser = await userModel.findById(userId, { email: 1 }).lean();

  if (!targetUser) {
    return NextResponse.json({ ok: false, message: "User not found." }, { status: 404 });
  }

  const isSelfUpdate = targetUser.email === auth.identity.email;

  if (isSelfUpdate && body.role === "user") {
    return NextResponse.json(
      { ok: false, message: "You cannot remove your own admin role." },
      { status: 400 },
    );
  }

  if (isSelfUpdate && body.isActive === false) {
    return NextResponse.json(
      { ok: false, message: "You cannot deactivate your own admin account." },
      { status: 400 },
    );
  }

  const updatePayload: UserUpdateData = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();

    if (name.length > 0 && (name.length < 2 || name.length > 80)) {
      return NextResponse.json({ ok: false, message: "Name must be between 2 and 80 characters." }, { status: 400 });
    }

    if (name.length >= 2) {
      updatePayload.name = name;
    }
  }

  if (body.role === "admin" || body.role === "user") {
    updatePayload.role = body.role;
  }

  if (typeof body.isActive === "boolean") {
    updatePayload.isActive = body.isActive;
  }

  let temporaryPassword: string | null = null;

  if (body.resetPassword === true) {
    const nextPasswordRaw = typeof body.nextPassword === "string" ? body.nextPassword.trim() : "";
    const nextPassword = nextPasswordRaw || DEFAULT_RESET_PASSWORD;

    if (nextPassword.length < 8 || nextPassword.length > 72) {
      return NextResponse.json(
        { ok: false, message: "Password must be between 8 and 72 characters." },
        { status: 400 },
      );
    }

    updatePayload.passwordHash = await bcrypt.hash(nextPassword, 10);
    temporaryPassword = nextPassword;
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ ok: false, message: "No valid updates were provided." }, { status: 400 });
  }

  const user = await userModel.findByIdAndUpdate(userId, updatePayload, { new: true });

  if (!user) {
    return NextResponse.json({ ok: false, message: "User not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    message: temporaryPassword
      ? `Password reset for ${user.email}.`
      : `User updated for ${user.email}.`,
    temporaryPassword,
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    },
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdminAndDb();

  if (!auth.ok) {
    return auth.response;
  }

  const { userId } = await context.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return NextResponse.json({ ok: false, message: "Invalid user id." }, { status: 400 });
  }

  const userModel = getUserModel(auth.db);
  const user = await userModel.findById(userId).lean();

  if (!user) {
    return NextResponse.json({ ok: false, message: "User not found." }, { status: 404 });
  }

  if (user.email === auth.identity.email) {
    return NextResponse.json({ ok: false, message: "You cannot delete your own admin account." }, { status: 400 });
  }

  const taskDeletion = await TaskModel.deleteMany({ ownerEmail: user.email });
  await userModel.findByIdAndDelete(userId);

  return NextResponse.json({
    ok: true,
    message: `User ${user.email} deleted.`,
    deletedTaskCount: taskDeletion.deletedCount ?? 0,
  });
}
