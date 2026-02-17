import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { UserModel } from "@/lib/models/User";
import { getSessionIdentity } from "@/lib/session";

type UpdatePayload = {
  name?: string;
  role?: "user" | "admin";
  isActive?: boolean;
};

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const identity = await getSessionIdentity();

  if (!identity || identity.role !== "admin") {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  const db = await connectToDatabase();

  if (!db) {
    return NextResponse.json({ ok: false, message: "Admin edits require MongoDB mode." }, { status: 400 });
  }

  const { userId } = await context.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return NextResponse.json({ ok: false, message: "Invalid user id." }, { status: 400 });
  }

  const body = (await request.json()) as UpdatePayload;
  const updatePayload: UpdatePayload = {};

  if (typeof body.name === "string" && body.name.trim().length >= 2) {
    updatePayload.name = body.name.trim();
  }

  if (body.role === "admin" || body.role === "user") {
    updatePayload.role = body.role;
  }

  if (typeof body.isActive === "boolean") {
    updatePayload.isActive = body.isActive;
  }

  const user = await UserModel.findByIdAndUpdate(userId, updatePayload, { new: true });

  if (!user) {
    return NextResponse.json({ ok: false, message: "User not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    },
  });
}
