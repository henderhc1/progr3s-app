import type { Model } from "mongoose";
import type { UserDocument } from "@/lib/models/User";

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

export function normalizeUsername(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase().replace(/^@+/, "");
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export function toUsernameSeed(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  const collapsed = normalizeUsername(raw)
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (collapsed.length >= 3) {
    return collapsed.slice(0, 24);
  }

  return "user";
}

export function normalizeConnectionEmails(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
        .filter((email) => email.includes("@")),
    ),
  );
}

async function findUserByUsername(
  userModel: Model<UserDocument>,
  username: string,
  excludeUserId: string | null,
) {
  return userModel
    .findOne(excludeUserId ? { username, _id: { $ne: excludeUserId } } : { username }, { _id: 1 })
    .lean();
}

export async function createUniqueUsername(
  userModel: Model<UserDocument>,
  preferredValue: unknown,
  excludeUserId: string | null = null,
): Promise<string> {
  const baseSeed = toUsernameSeed(preferredValue);

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const suffix = attempt === 0 ? "" : `${attempt + 1}`;
    const maxBaseLength = 24 - suffix.length;
    const candidate = `${baseSeed.slice(0, Math.max(3, maxBaseLength))}${suffix}`;

    if (!isValidUsername(candidate)) {
      continue;
    }

    const existing = await findUserByUsername(userModel, candidate, excludeUserId);

    if (!existing) {
      return candidate;
    }
  }

  const fallbackSuffix = Date.now().toString(36).slice(-6);
  return `user_${fallbackSuffix}`;
}

export async function ensureUserHasUsername(
  userModel: Model<UserDocument>,
  user: {
    _id: string | { toString(): string };
    username?: string | null;
    name?: string | null;
    email?: string | null;
  },
): Promise<string> {
  const currentUsername = normalizeUsername(user.username);

  if (isValidUsername(currentUsername)) {
    return currentUsername;
  }

  const excludeUserId = typeof user._id === "string" ? user._id : user._id.toString();
  const seed = user.name?.trim() || user.email?.split("@")[0] || "user";
  const username = await createUniqueUsername(userModel, seed, excludeUserId);

  await userModel.updateOne({ _id: user._id }, { $set: { username } }).catch(() => null);

  return username;
}
