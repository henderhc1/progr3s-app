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
  | {
      ok: true;
      name: string;
      email: string;
      username: string;
      password: string;
    }
  | {
      ok: false;
      message: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDuplicateKeyError(error: unknown): boolean {
  return isRecord(error) && error.code === 11000;
}

async function readPayload(request: Request): Promise<SignupPayload | null> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    return (await request.json()) as SignupPayload;
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();

    return {
      name: formData.get("name")?.toString(),
      email: formData.get("email")?.toString(),
      username: formData.get("username")?.toString(),
      password: formData.get("password")?.toString(),
    };
  }

  return null;
}

function validatePayload(payload: SignupPayload): SignupValidationResult {
  const name = payload.name?.trim() ?? "";
  const email = normalizeEmail(payload.email);
  const username = normalizeUsername(payload.username);
  const password = payload.password?.trim() ?? "";

  if (!name || !email || !username || !password) {
    return {
      ok: false,
      message: "Name, email, username, and password are required.",
    };
  }

  if (name.length < 2 || name.length > 80) {
    return {
      ok: false,
      message: "Name must be between 2 and 80 characters.",
    };
  }

  if (!email.includes("@")) {
    return {
      ok: false,
      message: "Enter a valid email address.",
    };
  }

  if (!isValidUsername(username)) {
    return {
      ok: false,
      message: "Username must be 3-24 characters and use only letters, numbers, or underscores.",
    };
  }

  if (password.length < 8) {
    return {
      ok: false,
      message: "Password must be at least 8 characters.",
    };
  }

  if (password.length > 72) {
    return {
      ok: false,
      message: "Password must be 72 characters or fewer.",
    };
  }

  return {
    ok: true,
    name,
    email,
    username,
    password,
  };
}

export async function POST(request: Request) {
  let payload: SignupPayload | null = null;

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
        message: "Send JSON or form data with name, email, username, and password.",
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

  if (!db) {
    return NextResponse.json(
      {
        ok: false,
        message: "MongoDB is not configured. Set MONGODB_URI before creating accounts.",
      },
      { status: 503 },
    );
  }

  const userModel = getUserModel(db);
  const existingUser = await userModel.findOne({ email: validation.email }).lean();

  if (existingUser) {
    return NextResponse.json(
      {
        ok: false,
        message: "An account with this email already exists.",
      },
      { status: 409 },
    );
  }

  const existingUsername = await userModel.findOne({ username: validation.username }, { _id: 1 }).lean();

  if (existingUsername) {
    return NextResponse.json(
      {
        ok: false,
        message: "That username is already taken.",
      },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(validation.password, 10);

  let user;

  try {
    user = await userModel.create({
      name: validation.name,
      email: validation.email,
      username: validation.username,
      passwordHash,
      role: "user",
      isActive: true,
      connections: [],
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const keyPatternValue = isRecord(error) ? error.keyPattern : null;
      const keyPattern = isRecord(keyPatternValue)
        ? Object.keys(keyPatternValue).find((key) => keyPatternValue[key] === 1)
        : "";

      if (keyPattern === "username") {
        return NextResponse.json(
          {
            ok: false,
            message: "That username is already taken.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          ok: false,
          message: "An account with this email already exists.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        message: "Unable to create account right now. Please try again.",
      },
      { status: 500 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    user: {
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });

  response.cookies.set(SESSION_COOKIE_NAME, createSessionValue(user.email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return response;
}
