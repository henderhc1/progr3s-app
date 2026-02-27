import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getUserModel } from "@/lib/models/User";
import { getSessionIdentity } from "@/lib/session";
import { ensureUserHasUsername, isValidUsername, normalizeConnectionEmails, normalizeUsername } from "@/lib/users";

type NetworkAction = "accept" | "decline" | "cancel";

type NetworkBody = {
  username?: string;
  action?: NetworkAction;
};

type UserSnapshot = {
  _id: string | { toString(): string };
  email: string;
  name: string;
  username?: string;
  connections?: unknown;
  connectionRequestsIncoming?: unknown;
  connectionRequestsOutgoing?: unknown;
};

type PublicUser = {
  email: string;
  name: string;
  username: string;
};

function mapUser(user: Pick<UserSnapshot, "email" | "name" | "username">): PublicUser {
  return {
    email: user.email,
    name: user.name,
    username: normalizeUsername(user.username),
  };
}

function sortUsers(users: PublicUser[]): PublicUser[] {
  return users.sort((a, b) => a.username.localeCompare(b.username));
}

async function resolveUsersByEmail(
  userModel: ReturnType<typeof getUserModel>,
  emails: string[],
): Promise<Map<string, PublicUser>> {
  if (emails.length === 0) {
    return new Map();
  }

  const usersRaw = (await userModel.find(
    { email: { $in: emails }, isActive: true },
    { email: 1, name: 1, username: 1 },
  )) as UserSnapshot[];
  const users = new Map<string, PublicUser>();

  for (const entry of usersRaw) {
    const username = normalizeUsername(entry.username);

    if (isValidUsername(username)) {
      users.set(entry.email, mapUser(entry));
      continue;
    }

    const fixedUsername = await ensureUserHasUsername(userModel, entry);
    users.set(entry.email, {
      email: entry.email,
      name: entry.name,
      username: fixedUsername,
    });
  }

  return users;
}

async function resolveNetwork(userModel: ReturnType<typeof getUserModel>, identityEmail: string) {
  const me = (await userModel.findOne(
    { email: identityEmail, isActive: true },
    {
      email: 1,
      name: 1,
      username: 1,
      connections: 1,
      connectionRequestsIncoming: 1,
      connectionRequestsOutgoing: 1,
    },
  )) as UserSnapshot | null;

  if (!me) {
    return null;
  }

  const selfUsername = await ensureUserHasUsername(userModel, me);
  const connectionEmails = normalizeConnectionEmails(me.connections).filter((email) => email !== me.email);
  const incomingRequestEmails = normalizeConnectionEmails(me.connectionRequestsIncoming).filter((email) => email !== me.email);
  const outgoingRequestEmails = normalizeConnectionEmails(me.connectionRequestsOutgoing).filter((email) => email !== me.email);
  const relatedEmails = Array.from(new Set([...connectionEmails, ...incomingRequestEmails, ...outgoingRequestEmails]));
  const relatedUsers = await resolveUsersByEmail(userModel, relatedEmails);

  const pickUsers = (emails: string[]) =>
    sortUsers(
      emails
        .map((email) => relatedUsers.get(email))
        .filter((entry): entry is PublicUser => Boolean(entry)),
    );

  return {
    self: {
      email: me.email,
      name: me.name,
      username: selfUsername,
    },
    connections: pickUsers(connectionEmails),
    incomingRequests: pickUsers(incomingRequestEmails),
    outgoingRequests: pickUsers(outgoingRequestEmails),
  };
}

async function requireUserAndDb() {
  const identity = await getSessionIdentity();

  if (!identity) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }),
    };
  }

  if (identity.role !== "user") {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: "Dashboard network is user-only." }, { status: 403 }),
    };
  }

  let db = null;

  try {
    db = await connectToDatabase();
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: "Could not connect to database right now." }, { status: 503 }),
    };
  }

  if (!db) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: "Network connections require MongoDB mode." }, { status: 503 }),
    };
  }

  return { ok: true as const, identity, userModel: getUserModel(db) };
}

async function readBody(request: Request): Promise<NetworkBody | null> {
  try {
    return (await request.json()) as NetworkBody;
  } catch {
    return null;
  }
}

export async function GET() {
  const auth = await requireUserAndDb();

  if (!auth.ok) {
    return auth.response;
  }

  const network = await resolveNetwork(auth.userModel, auth.identity.email);

  if (!network) {
    return NextResponse.json({ ok: false, message: "Account not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, network });
}

export async function POST(request: Request) {
  const auth = await requireUserAndDb();

  if (!auth.ok) {
    return auth.response;
  }

  const body = await readBody(request);

  if (!body) {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const targetUsername = normalizeUsername(body.username);

  if (!isValidUsername(targetUsername)) {
    return NextResponse.json(
      { ok: false, message: "Username must be 3-24 characters and use only letters, numbers, or underscores." },
      { status: 400 },
    );
  }

  const me = (await auth.userModel.findOne(
    { email: auth.identity.email, isActive: true },
    {
      _id: 1,
      email: 1,
      name: 1,
      username: 1,
      connections: 1,
      connectionRequestsIncoming: 1,
      connectionRequestsOutgoing: 1,
    },
  )) as UserSnapshot | null;

  if (!me) {
    return NextResponse.json({ ok: false, message: "Account not found." }, { status: 404 });
  }

  const selfUsername = await ensureUserHasUsername(auth.userModel, me);

  if (targetUsername === selfUsername) {
    return NextResponse.json({ ok: false, message: "You cannot connect with yourself." }, { status: 400 });
  }

  const target = (await auth.userModel.findOne(
    { username: targetUsername, isActive: true },
    {
      _id: 1,
      email: 1,
      name: 1,
      username: 1,
      connections: 1,
      connectionRequestsIncoming: 1,
      connectionRequestsOutgoing: 1,
    },
  )) as UserSnapshot | null;

  if (!target) {
    return NextResponse.json({ ok: false, message: "User not found for that username." }, { status: 404 });
  }

  if (target.email === me.email) {
    return NextResponse.json({ ok: false, message: "You cannot connect with yourself." }, { status: 400 });
  }

  const meConnections = normalizeConnectionEmails(me.connections);
  const meIncoming = normalizeConnectionEmails(me.connectionRequestsIncoming);
  const meOutgoing = normalizeConnectionEmails(me.connectionRequestsOutgoing);
  const alreadyConnected = meConnections.includes(target.email);
  const hasIncomingRequest = meIncoming.includes(target.email);
  const hasOutgoingRequest = meOutgoing.includes(target.email);
  let message = `Connection request sent to @${targetUsername}.`;

  if (alreadyConnected) {
    message = `You are already connected with @${targetUsername}.`;
  } else if (hasIncomingRequest) {
    await Promise.all([
      auth.userModel.updateOne(
        { _id: me._id },
        {
          $addToSet: { connections: target.email },
          $pull: { connectionRequestsIncoming: target.email, connectionRequestsOutgoing: target.email },
        },
      ),
      auth.userModel.updateOne(
        { _id: target._id },
        {
          $addToSet: { connections: me.email },
          $pull: { connectionRequestsIncoming: me.email, connectionRequestsOutgoing: me.email },
        },
      ),
    ]);
    message = `Connected with @${targetUsername}.`;
  } else if (hasOutgoingRequest) {
    message = `Connection request already sent to @${targetUsername}.`;
  } else {
    await Promise.all([
      auth.userModel.updateOne({ _id: me._id }, { $addToSet: { connectionRequestsOutgoing: target.email } }),
      auth.userModel.updateOne({ _id: target._id }, { $addToSet: { connectionRequestsIncoming: me.email } }),
    ]);
  }

  const network = await resolveNetwork(auth.userModel, auth.identity.email);

  if (!network) {
    return NextResponse.json({ ok: false, message: "Could not load network after update." }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    message,
    network,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireUserAndDb();

  if (!auth.ok) {
    return auth.response;
  }

  const body = await readBody(request);

  if (!body) {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const targetUsername = normalizeUsername(body.username);
  const action = body.action;

  if (!isValidUsername(targetUsername)) {
    return NextResponse.json({ ok: false, message: "Provide a valid username." }, { status: 400 });
  }

  if (action !== "accept" && action !== "decline" && action !== "cancel") {
    return NextResponse.json({ ok: false, message: "Provide a valid network action." }, { status: 400 });
  }

  const me = (await auth.userModel.findOne(
    { email: auth.identity.email, isActive: true },
    {
      _id: 1,
      email: 1,
      username: 1,
      connectionRequestsIncoming: 1,
      connectionRequestsOutgoing: 1,
      connections: 1,
    },
  )) as UserSnapshot | null;

  if (!me) {
    return NextResponse.json({ ok: false, message: "Account not found." }, { status: 404 });
  }

  const target = (await auth.userModel.findOne(
    { username: targetUsername, isActive: true },
    {
      _id: 1,
      email: 1,
      username: 1,
      connectionRequestsIncoming: 1,
      connectionRequestsOutgoing: 1,
      connections: 1,
    },
  )) as UserSnapshot | null;

  if (!target) {
    return NextResponse.json({ ok: false, message: "User not found for that username." }, { status: 404 });
  }

  const meIncoming = normalizeConnectionEmails(me.connectionRequestsIncoming);
  const meOutgoing = normalizeConnectionEmails(me.connectionRequestsOutgoing);
  let message = "Network request updated.";

  if (action === "accept") {
    if (!meIncoming.includes(target.email)) {
      return NextResponse.json({ ok: false, message: "No incoming request from that user." }, { status: 400 });
    }

    await Promise.all([
      auth.userModel.updateOne(
        { _id: me._id },
        {
          $addToSet: { connections: target.email },
          $pull: { connectionRequestsIncoming: target.email, connectionRequestsOutgoing: target.email },
        },
      ),
      auth.userModel.updateOne(
        { _id: target._id },
        {
          $addToSet: { connections: me.email },
          $pull: { connectionRequestsIncoming: me.email, connectionRequestsOutgoing: me.email },
        },
      ),
    ]);
    message = `Accepted @${targetUsername}.`;
  }

  if (action === "decline") {
    if (!meIncoming.includes(target.email)) {
      return NextResponse.json({ ok: false, message: "No incoming request from that user." }, { status: 400 });
    }

    await Promise.all([
      auth.userModel.updateOne(
        { _id: me._id },
        { $pull: { connectionRequestsIncoming: target.email, connectionRequestsOutgoing: target.email } },
      ),
      auth.userModel.updateOne(
        { _id: target._id },
        { $pull: { connectionRequestsIncoming: me.email, connectionRequestsOutgoing: me.email } },
      ),
    ]);
    message = `Declined @${targetUsername}.`;
  }

  if (action === "cancel") {
    if (!meOutgoing.includes(target.email)) {
      return NextResponse.json({ ok: false, message: "No outgoing request to that user." }, { status: 400 });
    }

    await Promise.all([
      auth.userModel.updateOne({ _id: me._id }, { $pull: { connectionRequestsOutgoing: target.email } }),
      auth.userModel.updateOne({ _id: target._id }, { $pull: { connectionRequestsIncoming: me.email } }),
    ]);
    message = `Canceled request to @${targetUsername}.`;
  }

  const network = await resolveNetwork(auth.userModel, auth.identity.email);

  if (!network) {
    return NextResponse.json({ ok: false, message: "Could not load network after update." }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    message,
    network,
  });
}

export async function DELETE(request: Request) {
  const auth = await requireUserAndDb();

  if (!auth.ok) {
    return auth.response;
  }

  const body = await readBody(request);

  if (!body) {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const targetUsername = normalizeUsername(body.username);

  if (!isValidUsername(targetUsername)) {
    return NextResponse.json({ ok: false, message: "Provide a valid username." }, { status: 400 });
  }

  const me = (await auth.userModel.findOne(
    { email: auth.identity.email, isActive: true },
    { _id: 1, email: 1, username: 1 },
  )) as UserSnapshot | null;

  if (!me) {
    return NextResponse.json({ ok: false, message: "Account not found." }, { status: 404 });
  }

  const target = (await auth.userModel.findOne(
    { username: targetUsername, isActive: true },
    { _id: 1, email: 1, username: 1 },
  )) as UserSnapshot | null;

  if (!target) {
    return NextResponse.json({ ok: false, message: "User not found for that username." }, { status: 404 });
  }

  await Promise.all([
    auth.userModel.updateOne(
      { _id: me._id },
      {
        $pull: {
          connections: target.email,
          connectionRequestsIncoming: target.email,
          connectionRequestsOutgoing: target.email,
        },
      },
    ),
    auth.userModel.updateOne(
      { _id: target._id },
      {
        $pull: {
          connections: me.email,
          connectionRequestsIncoming: me.email,
          connectionRequestsOutgoing: me.email,
        },
      },
    ),
  ]);

  const network = await resolveNetwork(auth.userModel, auth.identity.email);

  if (!network) {
    return NextResponse.json({ ok: false, message: "Could not load network after disconnecting." }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    message: `Disconnected from @${targetUsername}.`,
    network,
  });
}
