import { cookies } from "next/headers";
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
