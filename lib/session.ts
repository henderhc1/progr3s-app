import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { DEMO_ADMIN, DEMO_USER, readEmailFromSession, SESSION_COOKIE_NAME, UserRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { getUserModel } from "@/lib/models/User";
import { ensureUserHasUsername, toUsernameSeed } from "@/lib/users";

export type SessionIdentity = {
  email: string;
  name: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  isFallback: boolean;
};

type GuardFailure = {
  ok: false;
  response: NextResponse;
};

type GuardSuccess<TAccess> = {
  ok: true;
  access: TAccess;
};

type GuardResult<TAccess> = GuardFailure | GuardSuccess<TAccess>;

type DatabaseGuardOptions = {
  databaseRequiredMessage: string;
  databaseRequiredStatus?: number;
  connectionFailureMessage?: string;
};

type UserGuardOptions = DatabaseGuardOptions & {
  forbiddenMessage: string;
};

abstract class DatabaseRouteAccess {
  protected constructor(
    public readonly identity: SessionIdentity,
    private readonly database: NonNullable<Awaited<ReturnType<typeof connectToDatabase>>>,
  ) {}

  get userModel() {
    return getUserModel(this.database);
  }
}

function isGuardFailure(value: GuardFailure | NonNullable<Awaited<ReturnType<typeof connectToDatabase>>>): value is GuardFailure {
  return typeof value === "object" && value !== null && "ok" in value && value.ok === false;
}

async function connectOrFail({
  databaseRequiredMessage,
  databaseRequiredStatus = 503,
  connectionFailureMessage = "Could not connect to database right now.",
}: DatabaseGuardOptions): Promise<GuardFailure | NonNullable<Awaited<ReturnType<typeof connectToDatabase>>>> {
  try {
    const db = await connectToDatabase();

    if (db) {
      return db;
    }
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, message: connectionFailureMessage }, { status: 503 }),
    };
  }

  return {
    ok: false,
    response: NextResponse.json({ ok: false, message: databaseRequiredMessage }, { status: databaseRequiredStatus }),
  };
}

export class UserRouteAccess extends DatabaseRouteAccess {
  static async create(options: UserGuardOptions): Promise<GuardResult<UserRouteAccess>> {
    const identity = await getSessionIdentity();

    if (!identity) {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }),
      };
    }

    if (identity.role !== "user") {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, message: options.forbiddenMessage }, { status: 403 }),
      };
    }

    const db = await connectOrFail(options);
    return isGuardFailure(db) ? db : { ok: true, access: new UserRouteAccess(identity, db) };
  }
}

export class AdminRouteAccess extends DatabaseRouteAccess {
  static async create(options: DatabaseGuardOptions): Promise<GuardResult<AdminRouteAccess>> {
    const identity = await getSessionIdentity();

    if (!identity || identity.role !== "admin") {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 }),
      };
    }

    const db = await connectOrFail({
      ...options,
      databaseRequiredStatus: options.databaseRequiredStatus ?? 400,
    });

    return isGuardFailure(db) ? db : { ok: true, access: new AdminRouteAccess(identity, db) };
  }
}

function createCookieFallbackIdentity(email: string): SessionIdentity {
  const nameFromEmail = email.split("@")[0]?.trim();
  const usernameSeed = nameFromEmail || email;

  return {
    email,
    name: nameFromEmail ? nameFromEmail.slice(0, 80) : "User",
    username: toUsernameSeed(usernameSeed),
    role: "user",
    isActive: true,
    isFallback: true,
  };
}

function getDemoFallbackIdentity(email: string): SessionIdentity | null {
  if (email === DEMO_ADMIN.email) {
    return {
      email: DEMO_ADMIN.email,
      name: DEMO_ADMIN.name,
      username: toUsernameSeed(DEMO_ADMIN.email.split("@")[0] ?? DEMO_ADMIN.email),
      role: DEMO_ADMIN.role,
      isActive: true,
      isFallback: true,
    };
  }

  if (email === DEMO_USER.email) {
    return {
      email: DEMO_USER.email,
      name: DEMO_USER.name,
      username: toUsernameSeed(DEMO_USER.email.split("@")[0] ?? DEMO_USER.email),
      role: DEMO_USER.role,
      isActive: true,
      isFallback: true,
    };
  }

  return null;
}

export async function getSessionIdentity(): Promise<SessionIdentity | null> {
  const cookieStore = await cookies();
  const rawSession = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const sessionEmail = readEmailFromSession(rawSession);

  if (!sessionEmail) {
    return null;
  }

  const demoFallback = getDemoFallbackIdentity(sessionEmail);
  let db = null;

  try {
    db = await connectToDatabase();
  } catch {
    return demoFallback ?? createCookieFallbackIdentity(sessionEmail);
  }

  if (!db) {
    return demoFallback ?? createCookieFallbackIdentity(sessionEmail);
  }

  let user = null;
  let userModel = null;

  try {
    userModel = getUserModel(db);
    user = await userModel.findOne({ email: sessionEmail });
  } catch {
    return demoFallback ?? createCookieFallbackIdentity(sessionEmail);
  }

  if (!user || !user.isActive) {
    return null;
  }

  const username = await ensureUserHasUsername(userModel, user);

  return {
    email: user.email,
    name: user.name,
    username,
    role: user.role,
    isActive: user.isActive,
    isFallback: false,
  };
}

export async function requireUserPageIdentity() {
  const identity = await getSessionIdentity();

  if (!identity) {
    redirect("/login");
  }

  if (identity.role === "admin") {
    redirect("/admin");
  }

  return identity;
}

export async function requireAdminPageIdentity() {
  const identity = await getSessionIdentity();

  if (!identity) {
    redirect("/login");
  }

  if (identity.role !== "admin") {
    redirect("/dashboard");
  }

  return identity;
}

export async function redirectAuthenticatedUser() {
  const identity = await getSessionIdentity();

  if (identity) {
    redirect(identity.role === "admin" ? "/admin" : "/dashboard");
  }
}
