import { cookies } from "next/headers";
import { DEMO_ADMIN, DEMO_USER, readEmailFromSession, SESSION_COOKIE_NAME, UserRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { getUserModel } from "@/lib/models/User";

export type SessionIdentity = {
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  isFallback: boolean;
};

function getDemoFallbackIdentity(email: string): SessionIdentity | null {
  if (email === DEMO_ADMIN.email) {
    return {
      email: DEMO_ADMIN.email,
      name: DEMO_ADMIN.name,
      role: DEMO_ADMIN.role,
      isActive: true,
      isFallback: true,
    };
  }

  if (email === DEMO_USER.email) {
    return {
      email: DEMO_USER.email,
      name: DEMO_USER.name,
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
    return demoFallback;
  }

  if (!db) {
    return demoFallback;
  }

  let user = null;

  try {
    const userModel = getUserModel(db);
    user = await userModel.findOne({ email: sessionEmail });
  } catch {
    return demoFallback;
  }

  if (!user || !user.isActive) {
    return null;
  }

  return {
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    isFallback: false,
  };
}
