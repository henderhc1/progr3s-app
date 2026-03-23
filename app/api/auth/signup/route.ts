import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createSessionValue, normalizeEmail, SESSION_COOKIE_NAME } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { getUserModel } from "@/lib/models/User";
import { isValidUsername, normalizeUsername } from "@/lib/users";

type SignupPayload = {
  name?: string;
  email?: string;
  username?: string;
  password?: string;
};

type SignupValidationResult =
  | { ok: true; name: string; email: string; username: string; password: string }
  | { ok: false; message: string };

const fail = (status: number, message: string) => NextResponse.json({ ok: false, message }, { status });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function duplicateField(error: unknown): string {
  if (!isRecord(error) || error.code !== 11000) {
    return "";
  }

  const keyPattern = isRecord(error.keyPattern) ? error.keyPattern : null;
  return keyPattern ? Object.keys(keyPattern).find((key) => keyPattern[key] === 1) ?? "email" : "email";
}

async function readPayload(request: Request): Promise<SignupPayload | null> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    return (await request.json()) as SignupPayload;
  }

  if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("multipart/form-data")) {
    return null;
  }

  const formData = await request.formData();
  return Object.fromEntries(["name", "email", "username", "password"].map((key) => [key, formData.get(key)?.toString()]));
}

function validatePayload(payload: SignupPayload): SignupValidationResult {
  const name = payload.name?.trim() ?? "";
  const email = normalizeEmail(payload.email);
  const username = normalizeUsername(payload.username);
  const password = payload.password?.trim() ?? "";

  if (!name || !email || !username || !password) {
    return { ok: false, message: "Name, email, username, and password are required." };
  }

  if (name.length < 2 || name.length > 80) {
    return { ok: false, message: "Name must be between 2 and 80 characters." };
  }

  if (!email.includes("@")) {
    return { ok: false, message: "Enter a valid email address." };
  }

  if (!isValidUsername(username)) {
    return { ok: false, message: "Username must be 3-24 characters and use only letters, numbers, or underscores." };
  }

  if (password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }

  if (password.length > 72) {
    return { ok: false, message: "Password must be 72 characters or fewer." };
  }

  return { ok: true, name, email, username, password };
}

function createSessionResponse(email: string, name: string, role: string) {
  const response = NextResponse.json({ ok: true, user: { email, name, role } });
  response.cookies.set(SESSION_COOKIE_NAME, createSessionValue(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}

export async function POST(request: Request) {
  const payload = await readPayload(request).catch(() => undefined);

  if (payload === undefined) {
    return fail(400, "Invalid request body. Send valid JSON or form data.");
  }

  if (!payload) {
    return fail(400, "Send JSON or form data with name, email, username, and password.");
  }

  const validation = validatePayload(payload);

  if (!validation.ok) {
    return fail(400, validation.message);
  }

  let db = null;

  try {
    db = await connectToDatabase();
  } catch {
    return fail(503, "Database connection failed. Please try again soon.");
  }

  if (!db) {
    return fail(503, "MongoDB is not configured. Set MONGODB_URI before creating accounts.");
  }

  const userModel = getUserModel(db);

  if (await userModel.findOne({ email: validation.email }).lean()) {
    return fail(409, "An account with this email already exists.");
  }

  if (await userModel.findOne({ username: validation.username }, { _id: 1 }).lean()) {
    return fail(409, "That username is already taken.");
  }

  try {
    const user = await userModel.create({
      name: validation.name,
      email: validation.email,
      username: validation.username,
      passwordHash: await bcrypt.hash(validation.password, 10),
      role: "user",
      isActive: true,
      connections: [],
    });

    return createSessionResponse(user.email, user.name, user.role);
  } catch (error) {
    return fail(duplicateField(error) === "username" ? 409 : isRecord(error) && error.code === 11000 ? 409 : 500,
      duplicateField(error) === "username"
        ? "That username is already taken."
        : isRecord(error) && error.code === 11000
          ? "An account with this email already exists."
          : "Unable to create account right now. Please try again.",
    );
  }
}
