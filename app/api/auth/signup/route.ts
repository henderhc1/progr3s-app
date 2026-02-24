import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createSessionValue, normalizeEmail, SESSION_COOKIE_NAME } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { UserModel } from "@/lib/models/User";

type SignupPayload = {
  name?: string;
  email?: string;
  password?: string;
};

type SignupValidationResult =
  | {
      ok: true;
      name: string;
      email: string;
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
      password: formData.get("password")?.toString(),
    };
  }

  return null;
}

function validatePayload(payload: SignupPayload): SignupValidationResult {
  const name = payload.name?.trim() ?? "";
  const email = normalizeEmail(payload.email);
  const password = payload.password?.trim() ?? "";

  if (!name || !email || !password) {
    return {
      ok: false,
      message: "Name, email, and password are required.",
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
    password,
  };
}

export async function POST(request: Request) {
  const payload = await readPayload(request);

  if (!payload) {
    return NextResponse.json(
      {
        ok: false,
        message: "Send JSON or form data with name, email, and password.",
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

  const db = await connectToDatabase();

  if (!db) {
    return NextResponse.json(
      {
        ok: false,
        message: "MongoDB is not configured. Set MONGODB_URI before creating accounts.",
      },
      { status: 503 },
    );
  }

  const existingUser = await UserModel.findOne({ email: validation.email }).lean();

  if (existingUser) {
    return NextResponse.json(
      {
        ok: false,
        message: "An account with this email already exists.",
      },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(validation.password, 10);

  let user;

  try {
    user = await UserModel.create({
      name: validation.name,
      email: validation.email,
      passwordHash,
      role: "user",
      isActive: true,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
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
