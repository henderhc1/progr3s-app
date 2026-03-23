import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import {
  createSessionValue,
  DEMO_ADMIN,
  DEMO_USER,
  hasConfiguredDemoCredentials,
  normalizeEmail,
  SESSION_COOKIE_NAME,
  type UserRole,
} from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { getUserModel } from "@/lib/models/User";
import { isValidUsername, normalizeUsername } from "@/lib/users";

type LoginPayload = {
  identifier?: string;
  email?: string;
  username?: string;
  password?: string;
};

type NormalizedIdentifier = {
  raw: string;
  email: string;
  username: string;
  isEmail: boolean;
};

type LoginValidationResult =
  | { ok: true; identifier: NormalizedIdentifier; password: string }
  | { ok: false; message: string };

type DemoAccount = (typeof demoAccounts)[number];
type SessionUser = { email: string; name: string; role: UserRole };

const MAX_PASSWORD_LENGTH = 72;
const INVALID_CREDENTIALS_MESSAGE = "Invalid email/username or password.";

const fail = (status: number, message: string) => NextResponse.json({ ok: false, message }, { status });

const toDemoUsername = (email: string, fallback: string) => {
  const username = email
    .trim()
    .toLowerCase()
    .split("@")[0]
    ?.replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);

  return username && username.length >= 3 ? username : fallback;
};

const demoAccounts = [
  { ...DEMO_ADMIN, username: toDemoUsername(DEMO_ADMIN.email, "demo_admin") },
  { ...DEMO_USER, username: toDemoUsername(DEMO_USER.email, "demo_user") },
] as const;

function normalizeIdentifier(payload: LoginPayload): NormalizedIdentifier {
  const raw = (payload.identifier ?? payload.email ?? payload.username ?? "").trim().toLowerCase();
  const isEmail = raw.includes("@") && !raw.startsWith("@") && !raw.endsWith("@");
  return { raw, isEmail, email: isEmail ? normalizeEmail(raw) : "", username: isEmail ? "" : normalizeUsername(raw) };
}

function resolveDemoAccount(identifier: NormalizedIdentifier): DemoAccount | null {
  return (
    demoAccounts.find((account) =>
      identifier.isEmail ? account.email === identifier.email : account.username === identifier.username,
    ) ?? null
  );
}

async function readPayload(request: Request): Promise<LoginPayload | null> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    return (await request.json()) as LoginPayload;
  }

  if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("multipart/form-data")) {
    return null;
  }

  const formData = await request.formData();
  return Object.fromEntries(["identifier", "email", "username", "password"].map((key) => [key, formData.get(key)?.toString()]));
}

function validatePayload(payload: LoginPayload): LoginValidationResult {
  const identifier = normalizeIdentifier(payload);
  const password = payload.password?.trim() ?? "";

  if (!identifier.raw || !password) {
    return { ok: false, message: "Both email/username and password are required." };
  }

  if (!identifier.isEmail && !isValidUsername(identifier.username)) {
    return { ok: false, message: "Enter a valid email or username (3-24 letters, numbers, or underscores)." };
  }

  if (password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, message: "Password must be 72 characters or fewer." };
  }

  return { ok: true, identifier, password };
}

function createSessionResponse(user: SessionUser) {
  const response = NextResponse.json({ ok: true, token: "dev_mock_session_token", user });
  response.cookies.set(SESSION_COOKIE_NAME, createSessionValue(user.email), {
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
    return fail(400, "Send JSON or form data with email/username and password.");
  }

  const validation = validatePayload(payload);

  if (!validation.ok) {
    return fail(400, validation.message);
  }

  const { identifier, password } = validation;
  const demoAccount = resolveDemoAccount(identifier);
  const validDemoCredential = demoAccount?.password === password;

  let db = null;

  try {
    db = await connectToDatabase();
  } catch {
    return fail(503, "Database connection failed. Please try again soon.");
  }

  if (!db) {
    if (!hasConfiguredDemoCredentials()) {
      return fail(503, "Demo fallback is not configured. Set DEMO_* variables in .env.local.");
    }

    return validDemoCredential
      ? createSessionResponse({ email: demoAccount.email, name: demoAccount.name, role: demoAccount.role })
      : fail(401, "Invalid email/username or password for the demo account.");
  }

  try {
    const userModel = getUserModel(db);
    const query = identifier.isEmail ? { email: identifier.email } : { username: identifier.username };
    let user = await userModel.findOne(query);

    if (!user && validDemoCredential) {
      user =
        (await userModel.findOne({ email: demoAccount.email })) ??
        (await userModel.create({
          email: demoAccount.email,
          name: demoAccount.name,
          username: demoAccount.username,
          passwordHash: await bcrypt.hash(demoAccount.password, 10),
          role: demoAccount.role,
          isActive: true,
          connections: [],
          connectionRequestsIncoming: [],
          connectionRequestsOutgoing: [],
        }));
    }

    if (!user || typeof user.passwordHash !== "string" || user.passwordHash.length < 20) {
      return fail(401, INVALID_CREDENTIALS_MESSAGE);
    }

    if (!(await bcrypt.compare(password, user.passwordHash)) || !user.isActive) {
      return fail(401, INVALID_CREDENTIALS_MESSAGE);
    }

    return createSessionResponse({ email: user.email, name: user.name, role: user.role });
  } catch (error) {
    console.error("[auth/login] Database query flow failed", {
      identifier: identifier.raw,
      message: error instanceof Error ? error.message : "Unknown login error",
    });
    return fail(503, "Login is temporarily unavailable. Please retry in a moment.");
  }
}
