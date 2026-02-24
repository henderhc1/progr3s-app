import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
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
import { UserModel } from "@/lib/models/User";

type LoginPayload = {
  email?: string;
  password?: string;
};

type LoginValidationResult = {
  ok: boolean;
  message?: string;
};

async function readPayload(request: Request): Promise<LoginPayload | null> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  // Support JSON payloads from fetch/AJAX clients.
  if (contentType.includes("application/json")) {
    return (await request.json()) as LoginPayload;
  }

  // Support standard HTML form posts as fallback.
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();

    return {
      email: formData.get("email")?.toString(),
      password: formData.get("password")?.toString(),
    };
  }

  return null;
}

function validatePayload(payload: LoginPayload): LoginValidationResult {
  const email = normalizeEmail(payload.email);
  const password = payload.password?.trim();

  // Basic required-field guard for a clean error message.
  if (!email || !password) {
    return {
      ok: false,
      message: "Both email and password are required.",
    };
  }

  // Keep minimum password length explicit and easy to modify.
  if (password.length < 8) {
    return {
      ok: false,
      message: "Password must be at least 8 characters.",
    };
  }

  return { ok: true };
}

function isValidDemoCredential(payload: LoginPayload): boolean {
  // Trim/lowercase email to avoid failures from accidental casing/spacing.
  const email = normalizeEmail(payload.email);
  // Trim password to avoid copy/paste spacing issues.
  const password = payload.password?.trim();

  return (
    (email === DEMO_USER.email && password === DEMO_USER.password) ||
    (email === DEMO_ADMIN.email && password === DEMO_ADMIN.password)
  );
}

export async function POST(request: Request) {
  // Read the body in a format-agnostic way (JSON or form).
  const payload = await readPayload(request);

  if (!payload) {
    return NextResponse.json(
      {
        ok: false,
        message: "Send JSON or form data with email and password.",
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

  const email = normalizeEmail(payload.email);
  const password = payload.password?.trim() ?? "";
  const isDemoConfigured = hasConfiguredDemoCredentials();

  let responseUser = {
    email: DEMO_USER.email,
    name: DEMO_USER.name,
    role: DEMO_USER.role as UserRole,
  };

  const db = await connectToDatabase();

  if (db) {
    // Mongo mode: verify real user records and seed demo users only if needed.
    let user = await UserModel.findOne({ email });

    if (!user && isValidDemoCredential(payload)) {
      const isAdminLogin = email === DEMO_ADMIN.email;
      const passwordHash = await bcrypt.hash(isAdminLogin ? DEMO_ADMIN.password : DEMO_USER.password, 10);
      user = await UserModel.create({
        email: isAdminLogin ? DEMO_ADMIN.email : DEMO_USER.email,
        name: isAdminLogin ? DEMO_ADMIN.name : DEMO_USER.name,
        passwordHash,
        role: isAdminLogin ? DEMO_ADMIN.role : DEMO_USER.role,
        isActive: true,
      });
    }

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          message: "Invalid email or password.",
        },
        { status: 401 },
      );
    }

    const matches = await bcrypt.compare(password, user.passwordHash);

    if (!matches || !user.isActive) {
      return NextResponse.json(
        {
          ok: false,
          message: "Invalid email or password.",
        },
        { status: 401 },
      );
    }

    responseUser = {
      email: user.email,
      name: user.name,
      role: user.role,
    };
  } else if (!isDemoConfigured) {
    return NextResponse.json(
      {
        ok: false,
        message: "Demo fallback is not configured. Set DEMO_* variables in .env.local.",
      },
      { status: 503 },
    );
  } else if (!isValidDemoCredential(payload)) {
    // Fallback mode when MONGODB_URI is not configured.
    return NextResponse.json(
      {
        ok: false,
        message: "Invalid email or password for the demo account.",
      },
      { status: 401 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    token: "dev_mock_session_token",
    user: responseUser,
  });

  // Cookie session keeps dashboard access simple for this MVP.
  response.cookies.set(SESSION_COOKIE_NAME, createSessionValue(responseUser.email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return response;
}
