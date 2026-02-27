import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import {
  createSessionValue,
  DEMO_ADMIN,
  DEMO_USER,
  hasConfiguredDemoCredentials,
  normalizeEmail,
  SESSION_COOKIE_NAME,
  UserRole,
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
  | {
      ok: true;
      identifier: NormalizedIdentifier;
      password: string;
    }
  | {
      ok: false;
      message: string;
    };

type DemoAccount = typeof DEMO_USER | typeof DEMO_ADMIN;

function looksLikeEmail(value: string): boolean {
  const atIndex = value.indexOf("@");
  return atIndex > 0 && atIndex < value.length - 1;
}

function normalizeIdentifier(payload: LoginPayload): NormalizedIdentifier {
  const raw = (payload.identifier ?? payload.email ?? payload.username ?? "").trim().toLowerCase();
  const isEmail = looksLikeEmail(raw);

  return {
    raw,
    isEmail,
    email: isEmail ? normalizeEmail(raw) : "",
    username: isEmail ? "" : normalizeUsername(raw),
  };
}

function toDemoUsername(email: string, fallback: string): string {
  const derived = email
    .trim()
    .toLowerCase()
    .split("@")[0]
    ?.replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);

  if (derived && derived.length >= 3) {
    return derived;
  }

  return fallback;
}

function resolveDemoAccount(identifier: NormalizedIdentifier): DemoAccount | null {
  if (identifier.isEmail) {
    if (identifier.email === DEMO_ADMIN.email) {
      return DEMO_ADMIN;
    }

    if (identifier.email === DEMO_USER.email) {
      return DEMO_USER;
    }

    return null;
  }

  const adminUsername = toDemoUsername(DEMO_ADMIN.email, "demo_admin");
  const userUsername = toDemoUsername(DEMO_USER.email, "demo_user");

  if (identifier.username === adminUsername) {
    return DEMO_ADMIN;
  }

  if (identifier.username === userUsername) {
    return DEMO_USER;
  }

  return null;
}

async function readPayload(request: Request): Promise<LoginPayload | null> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    return (await request.json()) as LoginPayload;
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();

    return {
      identifier: formData.get("identifier")?.toString(),
      email: formData.get("email")?.toString(),
      username: formData.get("username")?.toString(),
      password: formData.get("password")?.toString(),
    };
  }

  return null;
}

function validatePayload(payload: LoginPayload): LoginValidationResult {
  const identifier = normalizeIdentifier(payload);
  const password = payload.password?.trim() ?? "";

  if (!identifier.raw || !password) {
    return {
      ok: false,
      message: "Both email/username and password are required.",
    };
  }

  if (!identifier.isEmail && !isValidUsername(identifier.username)) {
    return {
      ok: false,
      message: "Enter a valid email or username (3-24 letters, numbers, or underscores).",
    };
  }

  if (password.length < 8) {
    return {
      ok: false,
      message: "Password must be at least 8 characters.",
    };
  }

  return { ok: true, identifier, password };
}

function isValidDemoCredential(identifier: NormalizedIdentifier, password: string): boolean {
  const account = resolveDemoAccount(identifier);
  return Boolean(account && account.password === password);
}

export async function POST(request: Request) {
  let payload: LoginPayload | null = null;

  try {
    payload = await readPayload(request);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Invalid request body. Send valid JSON or form data.",
      },
      { status: 400 },
    );
  }

  if (!payload) {
    return NextResponse.json(
      {
        ok: false,
        message: "Send JSON or form data with email/username and password.",
      },
      { status: 400 },
    );
  }

  const validation = validatePayload(payload);

  if (!validation.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: validation.message,
      },
      { status: 400 },
    );
  }

  const { identifier, password } = validation;
  const isDemoConfigured = hasConfiguredDemoCredentials();

  let responseUser = {
    email: DEMO_USER.email,
    name: DEMO_USER.name,
    role: DEMO_USER.role as UserRole,
  };

  let db = null;

  try {
    db = await connectToDatabase();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Database connection failed. Please try again soon.",
      },
      { status: 503 },
    );
  }

  if (db) {
    try {
      const userModel = getUserModel(db);
      const query = identifier.isEmail ? { email: identifier.email } : { username: identifier.username };
      let user = await userModel.findOne(query);

      if (!user && isValidDemoCredential(identifier, password)) {
        const demoAccount = resolveDemoAccount(identifier);

        if (demoAccount) {
          user = await userModel.findOne({ email: demoAccount.email });

          if (!user) {
            const passwordHash = await bcrypt.hash(demoAccount.password, 10);
            const username = toDemoUsername(
              demoAccount.email,
              demoAccount.role === "admin" ? "demo_admin" : "demo_user",
            );
            user = await userModel.create({
              email: demoAccount.email,
              name: demoAccount.name,
              username,
              passwordHash,
              role: demoAccount.role,
              isActive: true,
              connections: [],
              connectionRequestsIncoming: [],
              connectionRequestsOutgoing: [],
            });
          }
        }
      }

      if (!user) {
        return NextResponse.json(
          {
            ok: false,
            message: "Invalid email/username or password.",
          },
          { status: 401 },
        );
      }

      const matches = await bcrypt.compare(password, user.passwordHash);

      if (!matches || !user.isActive) {
        return NextResponse.json(
          {
            ok: false,
            message: "Invalid email/username or password.",
          },
          { status: 401 },
        );
      }

      responseUser = {
        email: user.email,
        name: user.name,
        role: user.role,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown login error";
      console.error("[auth/login] Database query flow failed", { identifier: identifier.raw, message });

      return NextResponse.json(
        {
          ok: false,
          message: "Login is temporarily unavailable. Please retry in a moment.",
        },
        { status: 503 },
      );
    }
  } else {
    if (!isDemoConfigured) {
      return NextResponse.json(
        {
          ok: false,
          message: "Demo fallback is not configured. Set DEMO_* variables in .env.local.",
        },
        { status: 503 },
      );
    }

    const demoAccount = resolveDemoAccount(identifier);

    if (!demoAccount || demoAccount.password !== password) {
      return NextResponse.json(
        {
          ok: false,
          message: "Invalid email/username or password for the demo account.",
        },
        { status: 401 },
      );
    }

    responseUser = {
      email: demoAccount.email,
      name: demoAccount.name,
      role: demoAccount.role,
    };
  }

  const response = NextResponse.json({
    ok: true,
    token: "dev_mock_session_token",
    user: responseUser,
  });

  response.cookies.set(SESSION_COOKIE_NAME, createSessionValue(responseUser.email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return response;
}
