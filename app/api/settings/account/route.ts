import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { TaskModel } from "@/lib/models/Task";
import { UserRouteAccess } from "@/lib/session";

type SettingsPayload = {
  currentPassword?: string;
  nextPassword?: string;
};

type UserSnapshot = {
  _id: string | { toString(): string };
  email: string;
  passwordHash: string;
  isActive: boolean;
};

async function requireSettingsAccess() {
  return UserRouteAccess.create({
    forbiddenMessage: "Settings are user-only.",
    databaseRequiredMessage: "Settings actions require MongoDB mode.",
  });
}

async function findCurrentUser(auth: UserRouteAccess) {
  return (await auth.userModel.findOne(
    { email: auth.identity.email, isActive: true },
    { _id: 1, email: 1, passwordHash: 1, isActive: 1 },
  )) as UserSnapshot | null;
}

async function cleanupSharedReferences(userEmail: string) {
  const cleanupResult = await TaskModel.updateMany(
    {
      $or: [
        { sharedWith: userEmail },
        { "verification.peerConfirmers": userEmail },
        { "verification.peerConfirmations.email": userEmail },
        { "goalTasks.peerConfirmations.email": userEmail },
      ],
    },
    {
      $pull: {
        sharedWith: userEmail,
        "verification.peerConfirmers": userEmail,
        "verification.peerConfirmations": { email: userEmail },
        "goalTasks.$[].peerConfirmations": { email: userEmail },
      },
    } as Record<string, unknown>,
  );

  return cleanupResult.modifiedCount ?? 0;
}

async function cleanupNetwork(userModel: UserRouteAccess["userModel"], userEmail: string) {
  const cleanedOthers = await userModel.updateMany(
    { email: { $ne: userEmail } },
    {
      $pull: {
        connections: userEmail,
        connectionRequestsIncoming: userEmail,
        connectionRequestsOutgoing: userEmail,
      },
    } as Record<string, unknown>,
  );

  return cleanedOthers.modifiedCount ?? 0;
}

export async function PATCH(request: Request) {
  const auth = await requireSettingsAccess();

  if (!auth.ok) {
    return auth.response;
  }

  let payload: SettingsPayload | null = null;

  try {
    payload = (await request.json()) as SettingsPayload;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const currentPassword = payload.currentPassword?.trim() ?? "";
  const nextPassword = payload.nextPassword?.trim() ?? "";

  if (!currentPassword || !nextPassword) {
    return NextResponse.json({ ok: false, message: "Current and new password are required." }, { status: 400 });
  }

  if (currentPassword.length > 72) {
    return NextResponse.json({ ok: false, message: "Current password is invalid." }, { status: 400 });
  }

  if (nextPassword.length < 8 || nextPassword.length > 72) {
    return NextResponse.json({ ok: false, message: "New password must be between 8 and 72 characters." }, { status: 400 });
  }

  const user = await findCurrentUser(auth.access);

  if (!user) {
    return NextResponse.json({ ok: false, message: "Account not found." }, { status: 404 });
  }

  const currentMatches = await bcrypt.compare(currentPassword, user.passwordHash);

  if (!currentMatches) {
    return NextResponse.json({ ok: false, message: "Current password is incorrect." }, { status: 401 });
  }

  const nextMatchesCurrent = await bcrypt.compare(nextPassword, user.passwordHash);

  if (nextMatchesCurrent) {
    return NextResponse.json({ ok: false, message: "Choose a different new password." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(nextPassword, 10);
  await auth.access.userModel.updateOne({ _id: user._id }, { $set: { passwordHash } });

  return NextResponse.json({ ok: true, message: "Password updated." });
}

export async function POST() {
  const auth = await requireSettingsAccess();

  if (!auth.ok) {
    return auth.response;
  }

  const user = await findCurrentUser(auth.access);

  if (!user) {
    return NextResponse.json({ ok: false, message: "Account not found." }, { status: 404 });
  }

  const deletedOwnedGoals = await TaskModel.deleteMany({ ownerEmail: user.email });
  const cleanedSharedGoals = await cleanupSharedReferences(user.email);
  const cleanedConnections = await cleanupNetwork(auth.access.userModel, user.email);

  await auth.access.userModel.updateOne(
    { _id: user._id },
    {
      $set: {
        connections: [],
        connectionRequestsIncoming: [],
        connectionRequestsOutgoing: [],
      },
    },
  );

  return NextResponse.json({
    ok: true,
    message: "Account data reset. Your account is still active.",
    stats: {
      deletedOwnedGoals: deletedOwnedGoals.deletedCount ?? 0,
      cleanedSharedGoals,
      cleanedConnections,
    },
  });
}

export async function DELETE() {
  const auth = await requireSettingsAccess();

  if (!auth.ok) {
    return auth.response;
  }

  const user = await findCurrentUser(auth.access);

  if (!user) {
    return NextResponse.json({ ok: false, message: "Account not found." }, { status: 404 });
  }

  const deletedOwnedGoals = await TaskModel.deleteMany({ ownerEmail: user.email });
  const cleanedSharedGoals = await cleanupSharedReferences(user.email);
  const cleanedConnections = await cleanupNetwork(auth.access.userModel, user.email);

  await auth.access.userModel.deleteOne({ _id: user._id });

  const response = NextResponse.json({
    ok: true,
    message: "Account deleted.",
    stats: {
      deletedOwnedGoals: deletedOwnedGoals.deletedCount ?? 0,
      cleanedSharedGoals,
      cleanedConnections,
    },
  });

  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
